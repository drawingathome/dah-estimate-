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

// 2026-08-05: 9단계 체계 - 계약(선금결제) 이전 3단계는 매출/전환 계산에서 제외
var PRE_CONTRACT_STAGES = ['방문예약','상담','가견적'];

function splitCustomerPayments(c) {
  var pd = (function(){
    try { return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}'); } catch(e) { return {}; }
  })();
  var dep = Number(c.depositAmount) || Number(pd.depositAmount) || 0;
  var depDate = c.depositDate || pd.depositDate || '';
  var bal = Number(c.balanceAmount) || Number(pd.balanceAmount) || 0;
  var balDate = c.balanceDate || pd.balanceDate || '';
  // 2026-08-28(선혜님 확인 — "선금 넣고 실측준비중이면 이 선금이 매출에
  // 안 잡히는거야??" → "후자지!" = 확정견적 여부와 무관하게, 실제 입금된
  // 순간부터 매출로 잡혀야 함): 예전엔 c.performanceRevenue(확정견적일
  // 때만 채워짐 - 2026-08-04 도입)에만 의존해서, 선금결제/실측준비중처럼
  // 확정견적 이전 단계에서 실제로 입금을 받았어도 매출(목표달성률)에
  // 전혀 안 잡히고 있었음. 이 함수를 호출하는 쪽(getMonthRevenue 등)이
  // 이미 PRE_CONTRACT_STAGES(방문예약/상담/가견적)는 걸러내고 있으므로,
  // 여기까지 온 고객은 이미 선금결제 이상 단계 - c.price(매출계산
  // 기준금액, 이제 가견적 단계부터도 항상 최신 견적금액으로 동기화됨)를
  // 우선 사용해서 확정 여부와 무관하게 실제 견적금액 기준으로 반영되게 함.
  // performanceRevenue가 별도로 명시돼있으면(과거 이관 데이터 등) 그 값을
  // 그대로 존중.
  var perf = Number(c.performanceRevenue) || Number(c.price) || 0;
  var totalPaid = dep + bal;
  // 2026-08-04: 성과매출 배분 비율의 분모가 잘못됐던 버그 수정 — 예전엔
  // totalPaid(지금까지 실제 입금된 금액)로 나눠서, 계약금만 들어온 시점엔
  // totalPaid가 곧 계약금 자체와 같아지므로 비율이 항상 100%로 계산됨(아직
  // 잔금도 안 들어왔는데 성과매출 전액이 잡히는 문제). 전체 계약금액(price)을
  // 분모로 써야 "계약금 비율만큼만" 정확히 배분됨.
  var totalPrice = Number(c.price) || totalPaid || 1;
  var parts = [];
  if (totalPaid > 0) {
    if (dep > 0 && depDate) parts.push({ date: depDate, revenue: dep, perf: perf * (dep / totalPrice) });
    if (bal > 0 && balDate) parts.push({ date: balDate, revenue: bal, perf: perf * (bal / totalPrice) });
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
    if (PRE_CONTRACT_STAGES.indexOf(c.stage) >= 0) return;
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
    if (PRE_CONTRACT_STAGES.indexOf(c.stage) >= 0) return;
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
    if (PRE_CONTRACT_STAGES.indexOf(c.stage) >= 0) return;
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

// 2026-08-28(선혜님 지시 - "3번만 지우고 나머지는 살려보자"로 확인): buildRevenueChartData
// /drawBarChart는 매출탭 차트의 예전(SVG 기반) 시도였는데, 현재는 renderChart()
// (아래, #chart-bars를 직접 채우는 방식)로 완전히 대체되어 어디서도 안 불리고
// 있었음 - 이미 있는 기능과 중복이라 되살리지 않고 제거함.
var currentChartPeriod = 'monthly';


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
      if (PRE_CONTRACT_STAGES.indexOf(c.stage) >= 0) return;
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
  // 2026-08-06: Y축 라벨("100만원" 등)이 SVG 왼쪽 경계에 잘려서 "ㅏ원"처럼
  // 보이던 버그 — text-anchor:end 라벨이 텍스트 폭만큼 왼쪽으로 확장되는데
  // 왼쪽 여백(PAD)이 16px뿐이라 여러 자리 숫자는 항상 잘렸음. 40px로 확대.
  var W = barsEl.clientWidth || 340, H = 120, PAD = 52, TOP_PAD = 10;
  var chartW = W - PAD*2, chartH = H - 28 - TOP_PAD;
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
    lbl.setAttribute('x',PAD-8); lbl.setAttribute('y',y+4);
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
      if (PRE_CONTRACT_STAGES.indexOf(c.stage) >= 0) return;
      splitCustomerPayments(c).forEach(function(part) {
        if (!part.date) return;
        var pd = new Date(part.date);
        if (pd >= dateFilterRange.start && pd <= dateFilterRange.end) { curRev += part.revenue; curPerf += part.perf; }
      });
    });
    curCon = rangeCustomers.filter(function(c){return PRE_CONTRACT_STAGES.indexOf(c.stage) < 0;}).length;
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
    if (PRE_CONTRACT_STAGES.indexOf(c.stage) >= 0) return;
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
  curCon = currentCustomers.filter(function(c){return PRE_CONTRACT_STAGES.indexOf(c.stage) < 0;}).length;
  curCons = currentCustomers.length;
  }
  var conv = curCons > 0 ? Math.round(curCon/curCons*100) : 0;

  [['전체 매출',fmt(curRev),'var(--dark)'],['성과매출',fmt(curPerf),'var(--dark)'],['상담 건수',curCons+'건','var(--dark)'],['계약 건수',curCon+'건','var(--dark)'],['전환율',conv+'%','var(--dark)']].forEach(function(row) {
    sumEl.appendChild(div('display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)', [span('font-size:11px;color:var(--dark)', row[0]), span('font-size:12px;font-weight:700;color:'+row[2], row[1])]));
  });

  // 2026-08-06 신규: PC에서 매출 탭 오른쪽 여백을 채우기 위해 담당자별 매출
  // 순위 카드 추가 (디자인 개선 1단계 — 화면 재사용성 목적)
  if (typeof renderChartStaffRank === 'function') renderChartStaffRank(customers);
}

function renderChartStaffRank(customers) {
  var wrap = document.getElementById('chart-staffrank');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (typeof getMonthStaffPerformance !== 'function') return;
  var byStaff = getMonthStaffPerformance(customers, thisMonthStr().slice(0,7));
  var names = Object.keys(byStaff).sort(function(a,b){ return byStaff[b].rev - byStaff[a].rev; });
  if (names.length === 0) {
    wrap.appendChild(div('font-size:11px;color:var(--sub);text-align:center;padding:16px 0', ['이번달 매출 데이터가 없습니다']));
    return;
  }
  names.forEach(function(name, i) {
    var row = div('display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)', [
      span('font-size:12px;font-weight:700;color:var(--dark)', (i+1)+'. '+name),
      span('font-size:12px;font-weight:700;color:var(--terra)', fmt(byStaff[name].rev) + ' (' + byStaff[name].count + '건)')
    ]);
    wrap.appendChild(row);
  });
}


/* (getMonthRevenue는 파일 상단 "매출 계산 공용 함수" 섹션에 이미 통합되어 정의됨) */

// 선금+잔금 기준 월별 건수 (계약 기준)
function getMonthContractCount(customers, monthKey) {
  return customers.filter(function(c) {
    if (PRE_CONTRACT_STAGES.indexOf(c.stage) >= 0) return false;
    return (c.date||'').slice(0,7) === monthKey;
  }).length;
}
