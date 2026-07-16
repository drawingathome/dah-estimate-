/* ══════════════════════════════════════════════════
   DAH 대시보드 — 일정(캘린더) 기능
   월별 달력 그리드, 일정 목록, 실측/시공/상담 일정 집계.
   ══════════════════════════════════════════════════ */

var calCurrentYear = new Date().getFullYear();
var calCurrentMonth = new Date().getMonth();
var calSelectedDate = null;

function getCalEvents(customers, year, month) {
  var monStr = year + '-' + pad2(month+1);
  var events = [];
  customers.forEach(function(c) {
    // 실측일 - 메인 표시
    if ((c.measureDate||'').slice(0,7) === monStr)
      events.push({date:c.measureDate, name:c.clientName, space:c.space||'—', type:'실측', stage:c.stage, price:c.price||0, cust:c});
    // 시공일 - 메인 표시
    if ((c.installDate||'').slice(0,7) === monStr)
      events.push({date:c.installDate, name:c.clientName, space:c.space||'—', type:'시공', stage:c.stage, price:c.price||0, cust:c});
    // 상담일 - dotOnly (점만, 목록에선 표시)
    if ((c.date||'').slice(0,7) === monStr)
      events.push({date:c.date, name:c.clientName, space:c.space||'—', type:'상담', stage:c.stage, price:c.price||0, cust:c, dotOnly:true});
  });
  events.sort(function(a,b){ return a.date < b.date ? -1 : 1; });
  return events;
}

function renderCal() {
  var allCal = loadCustomers().filter(function(c){ return !isSoftDeleted(c); });
  var customers = (currentUser && currentUser.role === 'staff') ? allCal.filter(function(c) { return (c.staffName||'마스터') === currentUser.name; }) : allCal;
  var yr = calCurrentYear, mo = calCurrentMonth;
  var today = todayStr();
  var DOW = ['일','월','화','수','목','금','토'];

  // 월 요약바
  var monStr = yr + '-' + pad2(mo+1);
  var monC = customers.filter(function(c){ return (c.date||'').slice(0,7)===monStr && c.stage!=='상담'; });
  var monRev = getMonthRevenue(customers, monStr);
  var monInstall = customers.filter(function(c){ return (c.installDate||'').slice(0,7)===monStr; }).length;
  var sumBar = document.getElementById('cal-summary-bar');
  if (sumBar) {
    sumBar.innerHTML = [
      {label:'매출', value: Math.round(monRev/10000).toLocaleString()+'만원', color:'#282828'},
      {label:'계약', value: monC.length+'건', color:'#2E7D6B'},
      {label:'시공', value: monInstall+'건', color:'#F06E2D'}
    ].map(function(item, i) {
      return '<div style="flex:1;text-align:center;' + (i>0?'':'') + '">' +
        '<div style="font-size:11px;color:#9A9490;letter-spacing:0.5px;margin-bottom:3px">' + item.label + '</div>' +
        '<div style="font-size:11px;font-weight:800;color:' + item.color + ';letter-spacing:-0.5px">' + item.value + '</div>' +
        '</div>';
    }).join('');
  }

  
  var lbl = document.getElementById('cal-month-label');
  if (lbl) lbl.textContent = yr + '년 ' + (mo+1) + '월';

  
  var events = getCalEvents(customers, yr, mo);
  // evMap: 날짜별 {types:[], items:[{type,name}]} 구조로 개선
  var evMap = {};
  events.forEach(function(ev) {
    if (!evMap[ev.date]) evMap[ev.date] = {types:[], items:[]};
    if (evMap[ev.date].types.indexOf(ev.type) < 0) evMap[ev.date].types.push(ev.type);
    evMap[ev.date].items.push({type:ev.type, name:ev.name, price:ev.price||0});
  });

  
  var grid = document.getElementById('cal-grid');
  if (!grid) return;
  grid.innerHTML = '';

  var firstDay = new Date(yr, mo, 1).getDay(); 
  var daysInMonth = new Date(yr, mo+1, 0).getDate();
  var daysInPrev = new Date(yr, mo, 0).getDate();
  var totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  // 이벤트 타입 색상
  var TYPE_DOT_COLOR = {상담:'#282828', 실측:'#A67C52', 시공:'#F06E2D'};
  var TYPE_TEXT_COLOR = {상담:'#282828', 실측:'#A67C52', 시공:'#F06E2D'};

  for (var i = 0; i < totalCells; i++) {
    var cell = document.createElement('div');
    cell.className = 'cal-day-cell';
    var dayNum, dateStr, isOther = false;
    if (i < firstDay) {
      dayNum = daysInPrev - firstDay + i + 1;
      isOther = true;
      dateStr = yr + '-' + pad2(mo === 0 ? 12 : mo) + '-' + pad2(dayNum);
    } else if (i >= firstDay + daysInMonth) {
      dayNum = i - firstDay - daysInMonth + 1;
      isOther = true;
      dateStr = yr + '-' + pad2(mo === 11 ? 1 : mo+2) + '-' + pad2(dayNum);
    } else {
      dayNum = i - firstDay + 1;
      dateStr = yr + '-' + pad2(mo+1) + '-' + pad2(dayNum);
    }
    if (isOther) cell.classList.add('other-month');
    if (dateStr === today && !isOther) cell.classList.add('today');
    if (dateStr === calSelectedDate) cell.classList.add('selected');

    var numEl = document.createElement('div');
    numEl.className = 'cal-day-num';
    numEl.textContent = dayNum;
    cell.appendChild(numEl);

    // 이벤트 표시 - 실측/시공은 텍스트, 상담은 점만
    if (!isOther && evMap[dateStr]) {
      var evData = evMap[dateStr];
      // 실측/시공 먼저 텍스트로
      var mainItems = evData.items.filter(function(item){ return !item.dotOnly; });
      var dotItems  = evData.items.filter(function(item){ return item.dotOnly; });

      mainItems.slice(0,2).forEach(function(item) {
        var evLabel = document.createElement('div');
        evLabel.style.cssText =
          'width:100%;font-size:12px;font-weight:700;line-height:1.3;' +
          'padding:1px 3px;border-radius:var(--r-btn);margin-top:1px;' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
          'background:' + (TYPE_DOT_COLOR[item.type]||'#282828') + '22;' +
          'color:' + (TYPE_TEXT_COLOR[item.type]||'#282828');
        evLabel.textContent = item.type + ' ' + item.name;
        cell.appendChild(evLabel);
      });
      if (mainItems.length > 2) {
        var moreEl = document.createElement('div');
        moreEl.style.cssText = 'font-size:11px;color:#9A9490;margin-top:1px;text-align:center';
        moreEl.textContent = '+' + (mainItems.length - 2);
        cell.appendChild(moreEl);
      }
      // 상담은 작은 점으로만
      if (dotItems.length > 0) {
        var dotsWrap = document.createElement('div');
        dotsWrap.style.cssText = 'display:flex;gap:2px;justify-content:center;margin-top:2px;flex-wrap:wrap';
        dotItems.slice(0,3).forEach(function(){
          var dot = document.createElement('div');
          dot.style.cssText = 'width:4px;height:4px;border-radius:50%;background:#9A9490;flex-shrink:0';
          dotsWrap.appendChild(dot);
        });
        cell.appendChild(dotsWrap);
      }
    }

    (function(ds, isOth) {
      cell.addEventListener('click', function() {
        if (isOth) return;
        calSelectedDate = ds;
        renderCal();
        renderCalList(customers, ds);
      });
    })(dateStr, isOther);

    grid.appendChild(cell);
  }

  
  if (calSelectedDate) {
    renderCalList(customers, calSelectedDate);
  } else {
    renderCalList(customers, null); 
  }
}

function renderCalList(customers, selectedDate) {
  var yr = calCurrentYear, mo = calCurrentMonth;
  var listEl = document.getElementById('cal-list');
  var lblEl = document.getElementById('cal-list-label');
  if (!listEl) return;
  listEl.innerHTML = '';

  var events;
  if (selectedDate) {
    
    var all = getCalEvents(customers, yr, mo);
    
    var allAll = getCalEvents(customers, yr-1, 11).concat(getCalEvents(customers, yr, 0), getCalEvents(customers, yr, 1),
      getCalEvents(customers, yr, 2), getCalEvents(customers, yr, 3), getCalEvents(customers, yr, 4),
      getCalEvents(customers, yr, 5), getCalEvents(customers, yr, 6), getCalEvents(customers, yr, 7),
      getCalEvents(customers, yr, 8), getCalEvents(customers, yr, 9), getCalEvents(customers, yr, 10),
      getCalEvents(customers, yr, 11), getCalEvents(customers, yr+1, 0));
    events = getCalEvents(customers, yr, mo).filter(function(ev){ return ev.date === selectedDate; });
    var d = new Date(selectedDate);
    var DOW2 = ['일','월','화','수','목','금','토'];
    if (lblEl) lblEl.textContent = (d.getMonth()+1) + '월 ' + d.getDate() + '일 (' + DOW2[d.getDay()] + ') 일정';
  } else {
    events = getCalEvents(customers, yr, mo);
    if (lblEl) lblEl.textContent = (mo+1) + '월 전체 일정';
  }

  if (events.length === 0) {
    var empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:16px 0;font-size:11px;color:var(--sub)';
    empty.textContent = selectedDate ? '이 날 일정이 없습니다' : '이번 달 일정이 없습니다';
    listEl.appendChild(empty); return;
  }

  var DOW3 = ['일','월','화','수','목','금','토'];
  var TYPE_BG_COLOR = {실측:'#F3EFF8', 시공:'#FFF3EE', 상담:'#F5F5F5'};
  var TYPE_FONT_COLOR = {실측:'#A67C52', 시공:'#F06E2D', 상담:'#9A9490'};

  events.forEach(function(ev) {
    var isMain = ev.type !== '상담'; // 실측/시공이 메인
    var d = new Date(ev.date);
    var row = document.createElement('div');
    row.className = 'cal-ev-row';
    if (!isMain) row.style.opacity = '0.7'; // 상담은 흐리게

    var dateCol = document.createElement('div');
    dateCol.className = 'cal-ev-date';
    dateCol.innerHTML =
      '<span class="cal-ev-day" style="font-size:'+(isMain?'15px':'13px')+';font-weight:'+(isMain?'800':'600')+'">' + d.getDate() + '</span>' +
      '<span class="cal-ev-dow">' + DOW3[d.getDay()] + '</span>';

    var bar = document.createElement('div');
    bar.className = 'cal-ev-type type-' + ev.type;

    var info = document.createElement('div');
    info.className = 'cal-ev-info';
    info.innerHTML =
      '<div class="cal-ev-name" style="font-size:'+(isMain?'15px':'13px')+';font-weight:'+(isMain?'700':'500')+'">' + ev.name + '</div>' +
      '<div class="cal-ev-sub">' + ev.space + '</div>';

    var right = document.createElement('div');
    right.style.cssText = 'text-align:right;flex-shrink:0';
    var badge = document.createElement('div');
    badge.className = 'cal-ev-badge';
    badge.style.cssText += ';background:' + (TYPE_BG_COLOR[ev.type]||'#F5F2EE') + ';color:' + (TYPE_FONT_COLOR[ev.type]||'#282828') + ';font-size:'+(isMain?'12px':'11px');
    badge.textContent = ev.type;
    right.appendChild(badge);
    if (isMain && ev.price > 0) {
      var priceEl = document.createElement('div');
      priceEl.style.cssText = 'font-size:12px;font-weight:700;color:#282828;margin-top:4px';
      priceEl.textContent = Math.round(ev.price/10000).toLocaleString() + '만원';
      right.appendChild(priceEl);
    }

    row.appendChild(dateCol);
    row.appendChild(bar);
    row.appendChild(info);
    row.appendChild(right);
    (function(name, id){ row.addEventListener('click', function(){ openDetail(name, id); }); })(ev.name, ev.cust && ev.cust.id);
    listEl.appendChild(row);
  });
}
