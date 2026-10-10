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
// 계약 이전 3단계는 shared-common-utils.js의 DAH_PRE_CONTRACT_STAGES 한 곳에만 있음(2026-09-29 코드정리)
var PRE_CONTRACT_STAGES = DAH_PRE_CONTRACT_STAGES;

function splitCustomerPayments(c) {
  // 2026-09-21(선혜님 - "위 내용 코드 정리해줘 버그가 많을꺼 같은데" 요청
  // 으로 전수 점검 중 발견): 결제를 견적서 단위로 전환(e2c5e63)한 뒤,
  // 매출(목표 달성률) 계산의 핵심인 이 함수가 여전히 customers 레벨
  // c.depositAmount/balanceAmount만 보고 있었음 - 견적서가 여러 건인
  // 고객은 각 견적서에 저장된 실제 결제가 매출 집계에 전혀 안 잡히는
  // 심각한 회귀가 될 뻔했음(getAllEstPays로 이 고객의 모든 견적서 결제를
  // 각각 가져와 견적서별로 독립적으로 배분). 이관 데이터처럼
  // performanceRevenue가 별도로 명시된 경우(대개 견적서 자체가 없는
  // 예전 방식 고객)는 기존처럼 그 값을 그대로 존중.
  var perfOverride = Number(c.performanceRevenue) || 0;
  var allPays = getAllEstPays(c);
  var parts = [];
  var anyPaid = false;
  allPays.forEach(function(estPay){
    var dep = estPay.depositAmount;
    var depDate = estPay.depositDate;
    var bal = estPay.balanceAmount;
    var balDate = estPay.balanceDate;
    var totalPaid = dep + bal;
    if (totalPaid <= 0) return;
    anyPaid = true;
    // 2026-08-04: 성과매출 배분 비율의 분모가 잘못됐던 버그 수정 — 예전엔
    // totalPaid(지금까지 실제 입금된 금액)로 나눠서, 계약금만 들어온 시점엔
    // totalPaid가 곧 계약금 자체와 같아지므로 비율이 항상 100%로 계산됨(아직
    // 잔금도 안 들어왔는데 성과매출 전액이 잡히는 문제). 이 견적서 자체의
    // 금액(estPay.price)을 분모로 써야 "계약금 비율만큼만" 정확히 배분됨.
    var totalPrice = estPay.price || totalPaid || 1;
    var perf = perfOverride || totalPrice;
    // 2026-10-09(선혜님 - 이영욱: 제품 변경으로 총액 982,000원인데 선금 1,200,000원이 먼저 들어와
    // 환불 예정인 사례): 받은 돈이 총액을 넘어도 성과매출은 총액(perf)을 절대 넘지 않게 상한을 둠.
    // 입금(revenue)은 실제 들어온 현금이라 그대로 두고, 성과매출 배분 비율만 100%로 제한.
    var depShare = Math.min(dep, totalPrice);
    var balShare = Math.min(bal, Math.max(0, totalPrice - depShare));
    // 2026-10-10(선혜님 - 입금일이 비어 있는 이관 고객 64명: "등록일 달로 잡기"): 받은 금액은 있는데 입금일이 없으면
    // 예전엔 어느 달 매출에도 안 잡혔음(약 1.36억). 입금일이 없을 때만 고객 등록일(c.date)로 대신 배정함.
    if (!depDate && dep > 0 && c.date) depDate = c.date;
    if (!balDate && bal > 0 && c.date) balDate = c.date;
    if (dep > 0 && depDate) parts.push({ date: depDate, revenue: dep, perf: perf * (depShare / totalPrice) });
    if (bal > 0 && balDate) parts.push({ date: balDate, revenue: bal, perf: perf * (balShare / totalPrice) });
  });
  if (!anyPaid && c.date && isLegacyNoPaymentRecord(c)) {
    // 입금 기록이 아직 없는 "예전 방식 고객"만 계약일 기준 전체금액으로 폴백
    // (2026-08-04 조건 추가) — 예전엔 이 폴백이 모든 고객에게 걸려서, 신규로
    // 만든 고객도 실제 입금 기록 없이 "계약금 단계"로 상태만 바꾸면 그 순간
    // 전체 견적금액이 매출로 잡혀버리는 심각한 문제가 있었음(실제 입금 여부와
    // 무관하게 매출이 표시됨). 이관 데이터(memo로 식별) 또는 등록일로부터
    // 7일 넘게 지났는데도 입금기록이 없는 예전 방식 고객만 하위호환 허용.
    parts.push({ date: c.date, revenue: Number(c.price) || 0, perf: perfOverride || Number(c.price) || 0 });
  }
  return parts;
}

/* ══════════════════════════════════════════════════
   월 마감 (2026-10-10, 선혜님 - "성과매출은 지난달 숫자가 안 바뀌어야 한다")
   매출은 저장된 값이 아니라 고객 데이터로 매번 다시 계산돼서, 지난 달 고객을 고치면 마감한 실적도 같이 바뀌고
   "등록 후 7일 지난 고객" 같은 오늘 날짜 기준 규칙 때문에 시간이 지나도 숫자가 달라질 수 있었음.
   마스터가 "마감"을 누르면 그 달의 입금/성과매출/담당자별 값을 monthly_close 표에 저장하고, 이후에는 그 값을 씀.
   마스터만 읽고 쓸 수 있음(RLS). 직원 화면은 마감값이 없어 예전처럼 본인 담당 고객으로 계산.
   ══════════════════════════════════════════════════ */
window._monthClose = window._monthClose || {};
function curMonthKeyLocal() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
// 이번 달(진행 중)은 마감 대상이 아님 - 지난 달 이전만 저장값을 돌려줌
function getClosedMonth(monthKey) {
  var cl = window._monthClose && window._monthClose[monthKey];
  if (!cl) return null;
  if (String(monthKey) >= curMonthKeyLocal()) return null;
  return cl;
}
function loadMonthClose(callback) {
  if (!(currentUser && currentUser.role === 'master') || typeof sbXHR !== 'function') { if (callback) callback(); return; }
  sbXHR('GET', 'monthly_close?select=*', null, function(err, rows) {
    if (!err && Array.isArray(rows)) {
      var map = {};
      rows.forEach(function(r) { map[r.month] = r; });
      window._monthClose = map;
    }
    if (callback) callback();
  });
}
// 지금 데이터로 그 달을 다시 계산한 값(마감값을 무시) - 마감할 때 저장하고, 마감 뒤 차이를 보여주는 데 씀
function computeMonthSnapshot(customers, monthKey) {
  var live = customers.filter(function(c){ return !isSoftDeleted(c); });
  var byStaff = getMonthStaffPerformance(live, monthKey, true);
  var contracts = 0; Object.keys(byStaff).forEach(function(k){ contracts += byStaff[k].count || 0; });
  return {
    month: monthKey,
    revenue: getMonthRevenue(live, monthKey, true),
    perf_revenue: getMonthPerformanceRevenue(live, monthKey, true),
    contract_count: contracts,
    by_staff: byStaff
  };
}
function closeMonthNow(monthKey, callback) {
  if (!(currentUser && currentUser.role === 'master')) return;
  var snap = computeMonthSnapshot(loadCustomers(), monthKey);
  var existing = window._monthClose[monthKey];
  var msg = monthKey + ' 마감값을 저장할까요?\n\n성과매출 ' + Math.round(snap.perf_revenue).toLocaleString() + '원\n입금 합계 ' + Math.round(snap.revenue).toLocaleString() + '원\n\n저장하면 이후 고객 정보를 고쳐도 이 달 숫자는 바뀌지 않습니다.' + (existing ? '\n(이미 마감된 달입니다. 지금 계산값으로 다시 저장합니다.)' : '');
  if (!confirm(msg)) return;
  var body = { month: monthKey, revenue: snap.revenue, perf_revenue: snap.perf_revenue, contract_count: snap.contract_count, by_staff: snap.by_staff };
  var done = function(err, rows) {
    if (err || !rows || !rows[0]) { showToast('마감 저장에 실패했어요. 잠시 후 다시 시도해 주세요.'); if (callback) callback(false); return; }
    window._monthClose[monthKey] = rows[0];
    showToast(monthKey + ' 마감이 저장됐어요');
    if (typeof renderChart === 'function') renderChart();
    renderMonthClosePanel();
    if (callback) callback(true);
  };
  if (existing) sbXHR('PATCH', 'monthly_close?month=eq.' + encodeURIComponent(monthKey), Object.assign({ closed_at: new Date().toISOString() }, body), done);
  else sbXHR('POST', 'monthly_close', body, done);
}
// 매출 탭 맨 아래 "월 마감" 카드(마스터 전용): 최근 6개월(이번 달 제외)의 마감 여부와 현재 계산값
function renderMonthClosePanel() {
  var host = document.getElementById('chart-card-monthclose');
  if (!host) return;
  if (!(currentUser && currentUser.role === 'master')) { host.style.display = 'none'; return; }
  host.style.display = '';
  var list = document.getElementById('chart-monthclose'); if (!list) return;
  list.innerHTML = '';
  var customers = loadCustomers();
  var d = new Date();
  for (var i = 1; i <= 6; i++) {
    var md = new Date(d.getFullYear(), d.getMonth() - i, 1);
    var key = md.getFullYear() + '-' + String(md.getMonth() + 1).padStart(2, '0');
    (function(key) {
      var live = computeMonthSnapshot(customers, key);
      var cl = window._monthClose[key];
      var row = document.createElement('div'); row.className = 'month-close-row';
      row.setAttribute('style', 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px');
      var left = document.createElement('div');
      var title = document.createElement('div'); title.style.fontWeight = '700';
      title.textContent = key + (cl ? '  🔒 마감됨' : '  미마감');
      var sub = document.createElement('div'); sub.style.cssText = 'font-size:11px;color:var(--sub);margin-top:2px';
      if (cl) {
        var diff = Math.round(live.perf_revenue - Number(cl.perf_revenue));
        sub.textContent = '성과매출 ' + Math.round(Number(cl.perf_revenue)).toLocaleString() + '원' + (Math.abs(diff) >= 1 ? ' · 마감 뒤 데이터 변화로 현재 계산은 ' + (diff > 0 ? '+' : '') + diff.toLocaleString() + '원 차이' : ' · 현재 계산과 일치');
        if (Math.abs(diff) >= 1) sub.style.color = '#B3261E';
      } else {
        sub.textContent = '현재 계산 성과매출 ' + Math.round(live.perf_revenue).toLocaleString() + '원';
      }
      left.appendChild(title); left.appendChild(sub);
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'month-close-btn'; btn.setAttribute('data-month', key);
      btn.textContent = cl ? '다시 마감' : '마감하기';
      btn.setAttribute('style', 'min-height:36px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;border:1px solid var(--border);background:' + (cl ? '#fff;color:var(--dark)' : 'var(--dark);color:#fff'));
      btn.onclick = function() { closeMonthNow(key); };
      row.appendChild(left); row.appendChild(btn); list.appendChild(row);
    })(key);
  }
}

// 특정 월(monthKey='YYYY-MM')의 실제 매출(입금액) 합계
function getMonthRevenue(customers, monthKey, ignoreClosed) {
  // 2026-10-10(선혜님 - 지난달 매출이 나중에 고객 수정으로 바뀌면 안 됨): 마감된 달은 저장된 값을 그대로 씀.
  var _cl = ignoreClosed ? null : getClosedMonth(monthKey);
  if (_cl) return Number(_cl.revenue) || 0;
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
function getMonthPerformanceRevenue(customers, monthKey, ignoreClosed) {
  var _cl = ignoreClosed ? null : getClosedMonth(monthKey);
  if (_cl) return Number(_cl.perf_revenue) || 0;
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
function getMonthStaffPerformance(customers, monthKey, ignoreClosed) {
  var _cl = ignoreClosed ? null : getClosedMonth(monthKey);
  if (_cl && _cl.by_staff && typeof _cl.by_staff === 'object') return JSON.parse(JSON.stringify(_cl.by_staff));
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
  if (typeof renderChartStaffRank === 'function') renderChartStaffRank(customers, dateFilterRange);
  if (typeof renderMonthClosePanel === 'function') renderMonthClosePanel();
}

// 2026-10-09(선혜님 요청 - "담당자별 실적 비교 화면"): 담당자를 나란히 비교하는 숫자 계산(화면과 분리한 순수 함수).
// 매출 기준은 위 splitCustomerPayments 한 곳만 씀(제품비용만, 실제 결제비율만큼만 인식) - 홈 화면 "담당자별 성과"와 같은 숫자.
// range = {start:Date, end:Date}(기간 버튼), 없으면 이번달 1일~오늘. 미수금은 기간과 무관한 "현재" 값.
function getStaffComparison(customers, range) {
  var now = new Date();
  var start = range ? range.start : new Date(now.getFullYear(), now.getMonth(), 1);
  var end = range ? range.end : now;
  var by = {};
  function slot(c) {
    var s = c.staffName || '미지정';
    if (!by[s]) by[s] = { perf: 0, rev: 0, consults: 0, contracts: 0, unpaid: 0 };
    return by[s];
  }
  customers.forEach(function(c) {
    var o = slot(c);
    if (c.date) {
      var cd = new Date(c.date);
      if (cd >= start && cd <= end) o.consults++;
    }
    if (PRE_CONTRACT_STAGES.indexOf(c.stage) >= 0) return;
    // 2026-10-10(선혜님 - "전환율 기준은 무조건 입금 금액 기준, 계약금 받은 달로"): 계약 건수는 상담 등록일이 아니라
    // 첫 입금(계약금)을 받은 날이 기간 안에 있는 고객 수로 센다.
    var firstPay = null;
    splitCustomerPayments(c).forEach(function(p) {
      if (!p.date) return;
      var pd = new Date(p.date);
      if (!firstPay || pd < firstPay) firstPay = pd;
      if (pd >= start && pd <= end) { o.rev += p.revenue; o.perf += p.perf; }
    });
    if (firstPay && firstPay >= start && firstPay <= end) o.contracts++;
    if (typeof getUnpaidAmount === 'function') o.unpaid += getUnpaidAmount(c);
  });
  Object.keys(by).forEach(function(k) {
    var o = by[k];
    o.conv = o.consults > 0 ? Math.round(o.contracts / o.consults * 100) : null; // 계약=계약금 받은 달 기준, 상담=상담 등록한 달 기준
    // 아무 활동도 없는 담당자(전부 0)는 비교표에서 뺌
    if (!o.perf && !o.rev && !o.consults && !o.contracts && !o.unpaid) delete by[k];
  });
  return by;
}

function renderChartStaffRank(customers, range) {
  var wrap = document.getElementById('chart-staffrank');
  if (!wrap) return;
  wrap.innerHTML = '';
  var titleEl = document.getElementById('chart-staffrank-title');
  var labels = {this_month:'이번달', last_month:'지난달', '3months':'최근 3개월', '6months':'최근 6개월'};
  var periodName = (range && typeof _currentDateFilter !== 'undefined' && labels[_currentDateFilter]) ? labels[_currentDateFilter] : '이번달';
  if (titleEl) titleEl.textContent = periodName + ' 담당자별 실적 비교';
  var by = getStaffComparison(customers, range);
  var names = Object.keys(by).sort(function(a, b) { return by[b].perf - by[a].perf; });
  if (names.length === 0) {
    wrap.innerHTML = '<div style="font-size:11px;color:var(--sub);text-align:center;padding:16px 0">' + escHtml(periodName) + ' 실적 데이터가 없습니다</div>';
    return;
  }
  var won = function(n) { return Math.round(n).toLocaleString() + '원'; };
  var rows = [
    { label: '성과매출', get: function(o){ return o.perf; }, show: won, best: 'max' },
    { label: '입금액', get: function(o){ return o.rev; }, show: won, best: 'max' },
    { label: '상담→계약(입금 기준)', get: function(o){ return o.conv === null ? -1 : o.conv; }, show: function(o){ return o.consults + '건 → ' + o.contracts + '건' + (o.conv === null ? '' : ' (' + o.conv + '%)'); }, best: 'max', whole: true },
    { label: '현재 미수금', get: function(o){ return o.unpaid; }, show: won, best: 'min' }
  ];
  var cols = 'grid-template-columns:72px repeat(' + names.length + ',1fr)';
  var html = '<div style="display:grid;' + cols + ';gap:0;align-items:center;font-size:11px">';
  html += '<div></div>' + names.map(function(n) {
    return '<div style="text-align:center;padding:6px 2px;border-bottom:1px solid var(--border)">' +
      (typeof renderStaffBadge === 'function' ? renderStaffBadge(n, 24) : '') +
      '<div style="font-weight:700;color:var(--dark);margin-top:3px">' + escHtml(n) + '</div></div>';
  }).join('');
  rows.forEach(function(r) {
    var vals = names.map(function(n) { return r.get(by[n]); });
    var bestVal = r.best === 'max' ? Math.max.apply(null, vals) : Math.min.apply(null, vals);
    var allSame = vals.every(function(v) { return v === vals[0]; });
    html += '<div style="padding:9px 0;border-bottom:1px solid var(--border);color:var(--sub)">' + r.label + '</div>';
    names.forEach(function(n, i) {
      var isBest = names.length > 1 && !allSame && vals[i] === bestVal && (r.best === 'min' || bestVal > 0);
      html += '<div style="padding:9px 2px;border-bottom:1px solid var(--border);text-align:center;font-weight:700;color:' + (isBest ? 'var(--terra)' : 'var(--dark)') + '">' + escHtml(r.whole ? r.show(by[n]) : r.show(vals[i])) + '</div>';
    });
  });
  html += '</div><div style="font-size:10px;color:var(--light);margin-top:8px;line-height:1.5">성과매출은 제품비용만, 실제 결제한 비율만큼만 반영해요. 미수금은 기간과 상관없이 지금 기준이에요. 주황색은 해당 항목에서 가장 좋은 쪽이에요.</div>';
  wrap.innerHTML = html;
}


/* (getMonthRevenue는 파일 상단 "매출 계산 공용 함수" 섹션에 이미 통합되어 정의됨) */

// 선금+잔금 기준 월별 건수 (계약 기준)
function getMonthContractCount(customers, monthKey) {
  return customers.filter(function(c) {
    if (PRE_CONTRACT_STAGES.indexOf(c.stage) >= 0) return false;
    return (c.date||'').slice(0,7) === monthKey;
  }).length;
}
