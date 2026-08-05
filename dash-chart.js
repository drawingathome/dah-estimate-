/* ══════════════════════════════════════════════════
   DAH 대시보드 — 매출 차트 기능
   홈화면 미니차트, 매출탭 상세차트(일/주/월/년별) 관련 함수 모음.
   ══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   DAH 대시보드 — 매출 계산 공용 함수 (2026-07-20 통일)
   ──────────────────────────────────────────────────
   배경: 매출 계산 방식이 화면마다 3가지로 제각각이었음
   (일정화면=선금·잔금 정확분리 / 매출화면=등록일+전체금액 /
   홈화면=선금일만+잔금누락). 아래 splitCustomerPayments()를
   모든 화면이 공통으로 쓰도록 통일함.

   규칙: 선금이 입금된 달엔 선금액만, 잔금이 입금된 달엔 잔금액만
   반영. 성과매출(직원 인센티브 기준)도 선금:잔금 입금액 비율로
   나눠서 각각의 입금월에 반영. 아직 입금 기록이 없는(예전) 고객은
   계약일 기준으로 폴백(하위호환).
   ══════════════════════════════════════════════════ */
function isLegacyNoPaymentRecord(c) {
  if (/플러그|Pluuug/.test(c.memo || '')) return true;
  if (!c.date) return false;
  var daysSince = Math.floor((new Date() - new Date(c.date)) / 86400000);
  return daysSince >= 7; // 등록일로부터 일주일 넘게 지났는데 입금기록이 없으면 예전 방식 데이터로 간주
}

function splitCustomerPayments(c) {
  var pd = (function(){
    try { return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}'); } catch(e) { return {}; }
  })();
  var dep = Number(c.depositAmount) || Number(pd.depositAmount) || 0;
  var depDate = c.depositDate || pd.depositDate || '';
  var bal = Number(c.balanceAmount) || Number(pd.balanceAmount) || 0;
  var balDate = c.balanceDate || pd.balanceDate || '';
  var perf = Number(c.performanceRevenue) || 0;
  var totalPaid = dep + bal;
  var parts = [];
  if (totalPaid > 0) {
    if (dep > 0 && depDate) parts.push({ date: depDate, revenue: dep, perf: perf * (dep / totalPaid) });
    if (bal > 0 && balDate) parts.push({ date: balDate, revenue: bal, perf: perf * (bal / totalPaid) });
  } else if (c.date && isLegacyNoPaymentRecord(c)) {
    // 입금 기록이 아직 없는 "예전 방식 고객"만 계약일 기준 전체금액으로 폴백
    // (2026-08-04 조건 추가) — 예전엔 이 폴백이 모든 고객에게 걸려서, 신규로
    // 만든 고객도 실제 입금 기록 없이 "계약금 단계"로 상태만 바꾸면 그 순간
    // 전체 견적금액이 매출로 잡혀버리는 심각한 문제가 있었음(실제 입금 여부와
    // 무관하게 매출이 표시됨). 이관 데이터(memo로 식별) 또는 등록일로부터
    // 7일 넘게 지났는데도 입금기록이 없는 예전 방식 고객만 하위호환 허용.
    parts.push({ date: c.date, revenue: Number(c.price) || 0, perf: perf });
  }
  return parts;
}

// 특정 월(monthKey='YYYY-MM')의 실제 매출(입금액) 합계
function getMonthRevenue(customers, monthKey) {
  var total = 0;
  customers.forEach(function(c) {
    if (c.stage === '상담') return;
    splitCustomerPayments(c).forEach(function(p) {
      if ((p.date || '').slice(0, 7) === monthKey) total += p.revenue;
    });
  });
  return total;
}

// 특정 월의 성과매출(인센티브 기준) 합계 — 선금:잔금 비율로 분배됨
function getMonthPerformanceRevenue(customers, monthKey) {
  var total = 0;
  customers.forEach(function(c) {
    if (c.stage === '상담') return;
    splitCustomerPayments(c).forEach(function(p) {
      if ((p.date || '').slice(0, 7) === monthKey) total += p.perf;
    });
  });
  return total;
}

// 특정 월의 담당자별 성과매출 — {담당자명: {count, rev}}
function getMonthStaffPerformance(customers, monthKey) {
  var byStaff = {};
  customers.forEach(function(c) {
    if (c.stage === '상담') return;
    var s = c.staffName || '미지정';
    var counted = false;
    splitCustomerPayments(c).forEach(function(p) {
      if ((p.date || '').slice(0, 7) === monthKey) {
        if (!byStaff[s]) byStaff[s] = { count: 0, rev: 0 };
        byStaff[s].rev += p.perf;
        if (!counted) { byStaff[s].count++; counted = true; }
      }
    });
  });
  return byStaff;
}

function buildRevenueChartData(customers, period) {
  var now = new Date();
  var data = [];
  
  if (period === 'monthly') {
    // 12개월
    for (var i = 11; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var label = (d.getMonth() + 1) + '월';
      var value = customers.filter(function(c) {
        var cd = new Date(c.depositDate || c.createdAt || '');
        return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
      }).reduce(function(sum, c) { return sum + (Number(c.depositAmount) || 0) + (Number(c.balanceAmount) || 0); }, 0);
      data.push({ label: label, value: value, active: i === 0 });
    }
  } else if (period === 'weekly') {
    // 최근 8주
    for (var i = 7; i >= 0; i--) {
      var weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (i * 7));
      var weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      var label = (weekStart.getMonth()+1) + '/' + weekStart.getDate();
      var value = customers.filter(function(c) {
        var cd = new Date(c.depositDate || c.createdAt || '');
        return cd >= weekStart && cd <= weekEnd;
      }).reduce(function(sum, c) { return sum + (Number(c.depositAmount) || 0) + (Number(c.balanceAmount) || 0); }, 0);
      data.push({ label: label, value: value, active: i === 0 });
    }
  }
  return data;
}


var currentChartPeriod = 'monthly';


/* ── SVG 차트 헬퍼 ── */
function drawBarChart(containerId, data, options) {
  var container = document.getElementById(containerId);
  if (!container) return;
  options = options || {};
  var W = container.offsetWidth || 320;
  var H = options.height || 120;
  var pad = {top:20, right:10, bottom:24, left:10};
  var maxVal = Math.max.apply(null, data.map(function(d){ return d.value; })) || 1;
  var barW = Math.max(4, (W - pad.left - pad.right) / data.length - 4);
  
  var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">';
  
  data.forEach(function(d, i) {
    var x = pad.left + i * ((W - pad.left - pad.right) / data.length) + 2;
    var barH = Math.max(2, (d.value / maxVal) * (H - pad.top - pad.bottom));
    var y = H - pad.bottom - barH;
    var color = d.active ? 'var(--terra)' : 'var(--border)';
    
    svg += '<g class="chart-bar-group">';
    svg += '<rect class="chart-bar-rect" x="' + x + '" y="' + y + '" width="' + barW + '" height="' + barH + '" rx="2" fill="' + color + '"/>';
    if (d.value > 0) {
      var valText = d.value >= 10000 ? Math.round(d.value/10000) + '만' : d.value;
      svg += '<text class="chart-value" x="' + (x + barW/2) + '" y="' + (y - 4) + '" text-anchor="middle">' + valText + '</text>';
    }
    svg += '<text class="chart-label" x="' + (x + barW/2) + '" y="' + (H - 6) + '" text-anchor="middle">' + (d.label || '') + '</text>';
    svg += '</g>';
  });
  
  svg += '</svg>';
  container.innerHTML = svg;
}

function renderChart(period) {
  if (period) currentChartPeriod = period;
  var allChart = loadCustomers().filter(function(c){ return !isSoftDeleted(c); });
  var customers = (currentUser && currentUser.role === 'staff') ? allChart.filter(function(c) { return (c.staffName||'마스터') === currentUser.name; }) : allChart;
  var now = new Date();
  var barsEl = document.getElementById('chart-bars'); barsEl.innerHTML = '';
  barsEl.style.padding = '4px 16px 0';
  barsEl.style.boxSizing = 'border-box';
  if(periodLabel) periodLabel.style.padding = '12px 16px 8px';
  var sumEl = document.getElementById('chart-summary'); sumEl.innerHTML = '';
  sumEl.style.padding = '0 4px';
  var periodLabel = document.getElementById('chart-period-label');
  var summaryLabel = document.getElementById('chart-summary-label');

  
  document.querySelectorAll('.chart-tab').forEach(function(b) {
    var isOn = b.getAttribute('data-period') === currentChartPeriod;
    b.classList.toggle('on', isOn);
    b.style.color = '';
    b.style.borderBottom = '';
    b.style.fontWeight = '';
  });

  var periods = [], currentKey = '', labels = [];

  if (currentChartPeriod === 'daily') {
    
    periodLabel.textContent = '일별 매출 (최근 7일)';
    summaryLabel.textContent = '오늘 요약';
    for (var i = 6; i >= 0; i--) {
      var d = new Date(now); d.setDate(d.getDate() - i);
      var key = d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
      periods.push({key: key, label: (d.getMonth()+1)+'/'+d.getDate()});
    }
    currentKey = todayStr();
  } else if (currentChartPeriod === 'weekly') {
    
    periodLabel.textContent = '주별 매출 (최근 6주)';
    summaryLabel.textContent = '이번 주 요약';
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now); d.setDate(d.getDate() - (i * 7));
      var weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay());
      var weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
      var key = weekStart.getFullYear()+'-'+pad2(weekStart.getMonth()+1)+'-'+pad2(weekStart.getDate());
      periods.push({key: key, endKey: weekEnd.getFullYear()+'-'+pad2(weekEnd.getMonth()+1)+'-'+pad2(weekEnd.getDate()), label: (weekStart.getMonth()+1)+'/'+weekStart.getDate()});
    }
    var thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - now.getDay());
    currentKey = thisWeekStart.getFullYear()+'-'+pad2(thisWeekStart.getMonth()+1)+'-'+pad2(thisWeekStart.getDate());
  } else if (currentChartPeriod === 'monthly') {
    
    periodLabel.textContent = '월별 매출 (최근 6개월)';
    summaryLabel.textContent = '이번 달 요약';
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      periods.push({key: d.getFullYear()+'-'+pad2(d.getMonth()+1), label:(d.getMonth()+1)+'월'});
    }
    currentKey = thisMonthStr();
  } else if (currentChartPeriod === 'yearly') {
    
    periodLabel.textContent = '연별 매출 (최근 3년)';
    summaryLabel.textContent = '올해 요약';
    for (var i = 2; i >= 0; i--) {
      var y = now.getFullYear() - i;
      periods.push({key: String(y), label: y+'년'});
    }
    currentKey = String(now.getFullYear());
  }

  
  var revenues = periods.map(function(p) {
    var total = 0;
    customers.forEach(function(c) {
      if (c.stage === '상담') return;
      splitCustomerPayments(c).forEach(function(part) {
        var d = part.date;
        if (!d) return;
        var match = false;
        if (currentChartPeriod === 'daily') match = (d === p.key);
        else if (currentChartPeriod === 'weekly') match = (d >= p.key && d <= p.endKey);
        else if (currentChartPeriod === 'monthly') match = (d.slice(0,7) === p.key);
        else if (currentChartPeriod === 'yearly') match = (d.slice(0,4) === p.key);
        if (match) total += part.revenue;
      });
    });
    return total;
  });

  var maxRev = Math.max.apply(null, revenues) || 1;
  var W = barsEl.clientWidth || 340, H = 120, PAD = 16;
  var chartW = W - PAD*2, chartH = H - 28;
  var n = periods.length;
  
  var pts = periods.map(function(p,i){
    var x = PAD + (i/(n-1||1))*chartW;
    var y = H - 28 - Math.round(revenues[i]/maxRev*chartH);
    return {x:x, y:y, rev:revenues[i], label:p.label, isCurrent:p.key===currentKey};
  });
  var pathD = pts.map(function(p,i){ return (i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1); }).join(' ');
  var areaD = pathD+' L'+pts[pts.length-1].x.toFixed(1)+' '+(H-28)+' L'+pts[0].x.toFixed(1)+' '+(H-28)+' Z';
  var svgNS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(svgNS,'svg');
  svg.setAttribute('width','100%'); svg.setAttribute('height',H+'px');
  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  
  [0.25,0.5,0.75,1].forEach(function(r){
    var y = H-28-Math.round(r*chartH);
    var line = document.createElementNS(svgNS,'line');
    line.setAttribute('x1',PAD); line.setAttribute('x2',W-PAD);
    line.setAttribute('y1',y); line.setAttribute('y2',y);
    line.setAttribute('stroke','var(--border)'); line.setAttribute('stroke-width','1');
    svg.appendChild(line);
    var lbl = document.createElementNS(svgNS,'text');
    lbl.setAttribute('x',PAD-4); lbl.setAttribute('y',y+4);
    lbl.setAttribute('text-anchor','end'); lbl.setAttribute('font-size','11');
    lbl.setAttribute('fill','var(--light)');
    lbl.textContent = Math.round(maxRev*r/10000)+'만원';
    svg.appendChild(lbl);
  });
  
  var area = document.createElementNS(svgNS,'path');
  area.setAttribute('d',areaD);
  area.setAttribute('fill','rgba(40,40,40,0.06)');
  svg.appendChild(area);
  
  var path = document.createElementNS(svgNS,'path');
  path.setAttribute('d',pathD);
  path.setAttribute('fill','none'); path.setAttribute('stroke','var(--dark)');
  path.setAttribute('stroke-width','2'); path.setAttribute('stroke-linejoin','round');
  svg.appendChild(path);
  
  pts.forEach(function(p){
    var circle = document.createElementNS(svgNS,'circle');
    circle.setAttribute('cx',p.x); circle.setAttribute('cy',p.y);
    circle.setAttribute('r', p.isCurrent?5:3);
    circle.setAttribute('fill', p.isCurrent?'var(--dark)':'#fff');
    circle.setAttribute('stroke','var(--dark)'); circle.setAttribute('stroke-width','2');
    svg.appendChild(circle);
    
    if(p.isCurrent && p.rev>0){
      var val = document.createElementNS(svgNS,'text');
      val.setAttribute('x',p.x); val.setAttribute('y',p.y-10);
      val.setAttribute('text-anchor','middle'); val.setAttribute('font-size','11');
      val.setAttribute('font-weight','700'); val.setAttribute('fill','var(--dark)');
      val.textContent = Math.round(p.rev/10000)+'만';
      svg.appendChild(val);
    }
    
    var lbl2 = document.createElementNS(svgNS,'text');
    lbl2.setAttribute('x',p.x); lbl2.setAttribute('y',H-8);
    lbl2.setAttribute('text-anchor','middle'); lbl2.setAttribute('font-size','11');
    lbl2.setAttribute('fill', p.isCurrent?'var(--dark)':'var(--light)');
    lbl2.setAttribute('font-weight', p.isCurrent?'700':'400');
    lbl2.textContent = p.label;
    svg.appendChild(lbl2);
  });
  barsEl.appendChild(svg);

  
  var curRev = 0, curPerf = 0, curCon = 0, curCons = 0;
  // 2026-08-04: 상단 "전체/이번달/지난달/3개월/6개월" 버튼을 실제 요약 계산에
  // 연결 — 예전엔 클릭은 되고 스타일도 바뀌는데 실제 데이터는 항상 "일/주/월/연"
  // 탭 기준(오늘/이번주 등)으로만 나와서, 눌러도 아무 변화가 없던 죽은 버튼이었음.
  var dateFilterRange = (typeof getDateFilterRange === 'function') ? getDateFilterRange() : null;
  if (dateFilterRange) {
    var rangeCustomers = customers.filter(function(c) {
      if (!c.date) return false;
      var d = new Date(c.date);
      return d >= dateFilterRange.start && d <= dateFilterRange.end;
    });
    customers.forEach(function(c) {
      if (c.stage === '상담') return;
      splitCustomerPayments(c).forEach(function(part) {
        if (!part.date) return;
        var pd = new Date(part.date);
        if (pd >= dateFilterRange.start && pd <= dateFilterRange.end) { curRev += part.revenue; curPerf += part.perf; }
      });
    });
    curCon = rangeCustomers.filter(function(c){return c.stage!=='상담';}).length;
    curCons = rangeCustomers.length;
    var filterLabels = {this_month:'이번달', last_month:'지난달', '3months':'최근 3개월', '6months':'최근 6개월'};
    if (summaryLabel && filterLabels[_currentDateFilter]) summaryLabel.textContent = filterLabels[_currentDateFilter] + ' 요약';
  } else {
  var currentCustomers = customers.filter(function(c) {
    if (!c.date) return false;
    var _cd = c.date || (c.createdAt||'').slice(0,10);
    if (currentChartPeriod === 'daily') return _cd === currentKey;
    if (currentChartPeriod === 'weekly') { var p = periods[periods.length-1]; return _cd >= p.key && _cd <= p.endKey; }
    if (currentChartPeriod === 'monthly') return _cd.slice(0,7) === currentKey;
    if (currentChartPeriod === 'yearly') return _cd.slice(0,4) === currentKey;
  });
  customers.forEach(function(c) {
    if (c.stage === '상담') return;
    splitCustomerPayments(c).forEach(function(part) {
      var d = part.date;
      if (!d) return;
      var match = false;
      if (currentChartPeriod === 'daily') match = (d === currentKey);
      else if (currentChartPeriod === 'weekly') { var pw = periods[periods.length-1]; match = (d >= pw.key && d <= pw.endKey); }
      else if (currentChartPeriod === 'monthly') match = (d.slice(0,7) === currentKey);
      else if (currentChartPeriod === 'yearly') match = (d.slice(0,4) === currentKey);
      if (match) { curRev += part.revenue; curPerf += part.perf; }
    });
  });
  curCon = currentCustomers.filter(function(c){return c.stage!=='상담';}).length;
  curCons = currentCustomers.length;
  }
  var conv = curCons > 0 ? Math.round(curCon/curCons*100) : 0;

  [['전체 매출',fmt(curRev),'var(--dark)'],['성과매출',fmt(curPerf),'var(--dark)'],['상담 건수',curCons+'건','var(--dark)'],['계약 건수',curCon+'건','var(--dark)'],['전환율',conv+'%','var(--dark)']].forEach(function(row) {
    sumEl.appendChild(div('display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)', [span('font-size:11px;color:var(--dark)', row[0]), span('font-size:12px;font-weight:700;color:'+row[2], row[1])]));
  });
}


/* (getMonthRevenue는 파일 상단 "매출 계산 공용 함수" 섹션에 이미 통합되어 정의됨) */

// 선금+잔금 기준 월별 건수 (계약 기준)
function getMonthContractCount(customers, monthKey) {
  return customers.filter(function(c) {
    if (c.stage === '상담') return false;
    return (c.date||'').slice(0,7) === monthKey;
  }).length;
}
