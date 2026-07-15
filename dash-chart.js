/* ══════════════════════════════════════════════════
   DAH 대시보드 — 매출 차트 기능
   홈화면 미니차트, 매출탭 상세차트(일/주/월/년별) 관련 함수 모음.
   ══════════════════════════════════════════════════ */

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


var currentChartPeriod = 'daily';


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
    var color = d.active ? '#F06E2D' : '#EEE6DC';
    
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
    return customers.filter(function(c) {
      var cDate = c.date || (c.createdAt||'').slice(0,10);
      if (!cDate) return false;
      if (c.stage === '상담' || !c.price || c.price <= 0) return false;
      var useDate = cDate;
      if (currentChartPeriod === 'daily') return useDate === p.key;
      if (currentChartPeriod === 'weekly') return useDate >= p.key && useDate <= p.endKey;
      if (currentChartPeriod === 'monthly') return useDate.slice(0,7) === p.key;
      if (currentChartPeriod === 'yearly') return useDate.slice(0,4) === p.key;
    }).reduce(function(s,c) { return s+(Number(c.price)||0); }, 0);
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
    line.setAttribute('stroke','#EEE6DC'); line.setAttribute('stroke-width','1');
    svg.appendChild(line);
    var lbl = document.createElementNS(svgNS,'text');
    lbl.setAttribute('x',PAD-4); lbl.setAttribute('y',y+4);
    lbl.setAttribute('text-anchor','end'); lbl.setAttribute('font-size','9');
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
  path.setAttribute('fill','none'); path.setAttribute('stroke','#282828');
  path.setAttribute('stroke-width','2'); path.setAttribute('stroke-linejoin','round');
  svg.appendChild(path);
  
  pts.forEach(function(p){
    var circle = document.createElementNS(svgNS,'circle');
    circle.setAttribute('cx',p.x); circle.setAttribute('cy',p.y);
    circle.setAttribute('r', p.isCurrent?5:3);
    circle.setAttribute('fill', p.isCurrent?'#282828':'#fff');
    circle.setAttribute('stroke','#282828'); circle.setAttribute('stroke-width','2');
    svg.appendChild(circle);
    
    if(p.isCurrent && p.rev>0){
      var val = document.createElementNS(svgNS,'text');
      val.setAttribute('x',p.x); val.setAttribute('y',p.y-10);
      val.setAttribute('text-anchor','middle'); val.setAttribute('font-size','11');
      val.setAttribute('font-weight','700'); val.setAttribute('fill','#282828');
      val.textContent = Math.round(p.rev/10000)+'만';
      svg.appendChild(val);
    }
    
    var lbl2 = document.createElementNS(svgNS,'text');
    lbl2.setAttribute('x',p.x); lbl2.setAttribute('y',H-8);
    lbl2.setAttribute('text-anchor','middle'); lbl2.setAttribute('font-size','10');
    lbl2.setAttribute('fill', p.isCurrent?'#282828':'var(--light)');
    lbl2.setAttribute('font-weight', p.isCurrent?'700':'400');
    lbl2.textContent = p.label;
    svg.appendChild(lbl2);
  });
  barsEl.appendChild(svg);

  
  var currentCustomers = customers.filter(function(c) {
    if (!c.date) return false;
    var _cd = c.date || (c.createdAt||'').slice(0,10);
    if (currentChartPeriod === 'daily') return _cd === currentKey;
    if (currentChartPeriod === 'weekly') { var p = periods[periods.length-1]; return _cd >= p.key && _cd <= p.endKey; }
    if (currentChartPeriod === 'monthly') return _cd.slice(0,7) === currentKey;
    if (currentChartPeriod === 'yearly') return _cd.slice(0,4) === currentKey;
  });
  var curRev = currentCustomers.filter(function(c){return c.stage!=='상담';}).reduce(function(s,c){return s+(Number(c.price)||0);},0);
  var curPerf = currentCustomers.filter(function(c){return c.stage!=='상담';}).reduce(function(s,c){return s+(Number(c.performanceRevenue)||0);},0);
  var curCon = currentCustomers.filter(function(c){return c.stage!=='상담';}).length;
  var curCons = currentCustomers.length;
  var conv = curCons > 0 ? Math.round(curCon/curCons*100) : 0;

  [['전체 매출',fmt(curRev),'#282828'],['성과매출',fmt(curPerf),'#282828'],['상담 건수',curCons+'건','#282828'],['계약 건수',curCon+'건','#282828'],['전환율',conv+'%','#282828']].forEach(function(row) {
    sumEl.appendChild(div('display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #EEE6DC', [span('font-size:11px;color:#282828', row[0]), span('font-size:12px;font-weight:700;color:'+row[2], row[1])]));
  });
}


function getMonthRevenue(customers, monthKey) {
  var total = 0;
  customers.forEach(function(c) {
    if (c.stage === '상담') return;
    var pd = (function(){
      try { return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}'); } catch(e) { return {}; }
    })();
    var dep = Number(c.depositAmount) || Number(pd.depositAmount) || 0;
    var depDate = c.depositDate || pd.depositDate || '';
    var bal = Number(c.balanceAmount) || Number(pd.balanceAmount) || 0;
    var balDate = c.balanceDate || pd.balanceDate || '';

    // 선금/잔금 모두 없으면 계약일 기준으로 전체 금액
    if (!dep && !bal) {
      if ((c.date||'').slice(0,7) === monthKey) total += Number(c.price)||0;
      return;
    }
    // 선금이 해당 월이면 선금 금액 포함
    if (dep > 0 && depDate.slice(0,7) === monthKey) total += dep;
    // 잔금이 해당 월이면 잔금 금액 포함
    if (bal > 0 && balDate.slice(0,7) === monthKey) total += bal;
  });
  return total;
}

// 선금+잔금 기준 월별 건수 (계약 기준)
function getMonthContractCount(customers, monthKey) {
  return customers.filter(function(c) {
    if (c.stage === '상담') return false;
    return (c.date||'').slice(0,7) === monthKey;
  }).length;
}
