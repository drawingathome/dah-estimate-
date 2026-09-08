/* ══════════════════════════════════════════════════
   DAH 대시보드 — 일정(캘린더) 기능
   월별 달력 그리드, 일정 목록, 실측/시공/상담 일정 집계.
   ══════════════════════════════════════════════════ */

var calCurrentYear = new Date().getFullYear();
var calCurrentMonth = new Date().getMonth();

var calSelectedDate = null;

// 주소 문자열에서 앞 2개 토큰만 지역명으로 추출 (예: "서울 서초구 사평대로53길 64" -> "서울 서초구")
function getRegionFromAddr(addr) {
  if (!addr) return '';
  var parts = addr.trim().split(/\s+/);
  return parts.slice(0, 2).join(' ');
}

function getCalEvents(customers, year, month) {
  var monStr = year + '-' + pad2(month+1);
  var events = [];
  customers.forEach(function(c) {
    var region = getRegionFromAddr(c.addr);
    // 실측일 - 메인 표시
    if ((c.measureDate||'').slice(0,7) === monStr)
      events.push({date:c.measureDate, name:c.clientName, space:c.space||'—', region:region, type:'실측', stage:c.stage, price:c.price||0, cust:c});
    // 시공일 - 메인 표시
    if ((c.installDate||'').slice(0,7) === monStr)
      events.push({date:c.installDate, name:c.clientName, space:c.space||'—', region:region, type:'시공', stage:c.stage, price:c.price||0, cust:c});
    // 상담일 - dotOnly (점만, 달력 격자에서만 표시. 하단 목록에는 표시 안 함)
    if ((c.date||'').slice(0,7) === monStr)
      events.push({date:c.date, name:c.clientName, space:c.space||'—', region:region, type:'상담', stage:c.stage, price:c.price||0, cust:c, dotOnly:true});
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
  var monMeasure = customers.filter(function(c){ return (c.measureDate||'').slice(0,7)===monStr; }).length;
  var monRev = getMonthRevenue(customers, monStr);
  var monInstall = customers.filter(function(c){ return (c.installDate||'').slice(0,7)===monStr; }).length;
  var sumBar = document.getElementById('cal-summary-bar');
  if (sumBar) {
    sumBar.innerHTML = [
      {label:'매출', value: Math.round(monRev/10000).toLocaleString()+'만원', color:'var(--dark)'},
      {label:'실측', value: monMeasure+'건', color:'#2F6690'},
      {label:'시공', value: monInstall+'건', color:'var(--terra)'}
    ].map(function(item, i) {
      return '<div style="flex:1;text-align:center;' + (i>0?'':'') + '">' +
        '<div style="font-size:11px;color:var(--sub);letter-spacing:0.5px;margin-bottom:3px">' + item.label + '</div>' +
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
  var TYPE_DOT_COLOR = {상담:'var(--dark)', 실측:'#A67C52', 시공:'var(--terra)'};
  var TYPE_TEXT_COLOR = {상담:'var(--dark)', 실측:'#A67C52', 시공:'var(--terra)'};
  var TYPE_BG_COLOR = {실측:'#F3EFF8', 시공:'#FFF3EE', 상담:'#F5F5F5'};

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
        // 2026-08-05: background:var(--dark)+'22' 처럼 CSS변수 뒤에 투명도
        // 숫자를 그냥 이어붙이면 무효한 CSS라 배경이 아예 안 먹혔음(실측만
        // 하드코딩된 헥스값(#A67C52)이라 우연히 정상 작동, 상담/시공은 안 됨)
        // — 하단 목록에 이미 있던 정확한 배경색 맵으로 통일
        evLabel.style.cssText =
          'width:100%;font-size:12px;font-weight:700;line-height:1.3;' +
          'padding:1px 3px;border-radius:var(--r-btn);margin-top:1px;' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
          'background:' + (TYPE_BG_COLOR[item.type]||'#F5F2EE') + ';' +
          'color:' + (TYPE_TEXT_COLOR[item.type]||'var(--dark)');
        evLabel.textContent = item.type + ' ' + item.name;
        cell.appendChild(evLabel);
      });
      if (mainItems.length > 2) {
        var moreEl = document.createElement('div');
        moreEl.style.cssText = 'font-size:11px;color:var(--sub);margin-top:1px;text-align:center;cursor:pointer;font-weight:600';
        moreEl.textContent = '+' + (mainItems.length - 2);
        cell.appendChild(moreEl);
      }
      // 상담은 작은 점으로만
      if (dotItems.length > 0) {
        var dotsWrap = document.createElement('div');
        dotsWrap.style.cssText = 'display:flex;gap:2px;justify-content:center;margin-top:2px;flex-wrap:wrap';
        dotItems.slice(0,3).forEach(function(){
          var dot = document.createElement('div');
          dot.style.cssText = 'width:4px;height:4px;border-radius:50%;background:var(--sub);flex-shrink:0';
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
    
    // 2026-08-29(선혜님 지시 - "이어서 보자"로 발견): 여기서 작년12월~
    // 내년1월까지 14번 getCalEvents를 호출해 만들던 allAll 변수와, 바로
    // 아래의 all 변수 둘 다 어디서도 안 쓰이고 버려지고 있었음(순수 계산
    // 낭비) - 둘 다 제거.
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
  var TYPE_FONT_COLOR = {실측:'#A67C52', 시공:'var(--terra)', 상담:'var(--sub)'};

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
      '<div class="cal-ev-name" style="font-size:'+(isMain?'15px':'13px')+';font-weight:'+(isMain?'700':'500')+';display:flex;align-items:center;gap:5px">' +
        (typeof renderStaffBadge === 'function' ? renderStaffBadge(ev.cust && ev.cust.staffName, isMain?16:14) : '') +
        '<span>' + escHtml(ev.name || '') + '</span>' +
      '</div>' +
      '<div class="cal-ev-sub">' + escHtml(ev.region || '주소 미입력') + '</div>';

    var right = document.createElement('div');
    right.style.cssText = 'text-align:right;flex-shrink:0';
    var badge = document.createElement('div');
    badge.className = 'cal-ev-badge';
    badge.style.cssText += ';background:' + (TYPE_BG_COLOR[ev.type]||'#F5F2EE') + ';color:' + (TYPE_FONT_COLOR[ev.type]||'var(--dark)') + ';font-size:'+(isMain?'12px':'11px');
    badge.textContent = ev.type;
    right.appendChild(badge);
    if (isMain && ev.price > 0) {
      var priceEl = document.createElement('div');
      priceEl.style.cssText = 'font-size:12px;font-weight:700;color:var(--dark);margin-top:var(--sp-1)';
      priceEl.textContent = Math.round(ev.price/10000).toLocaleString() + '만원';
      right.appendChild(priceEl);
    }
    // 실측/시공 일정 옆에 선금·잔금 입금 상태를 같이 표시 (2026-07-20 추가)
    // — 예전엔 일정과 결제 여부를 따로따로 봐야 했어서 한눈에 확인이 안 됐음.
    if (isMain && ev.cust) {
      var dep = Number(ev.cust.depositAmount) || 0;
      var bal = Number(ev.cust.balanceAmount) || 0;
      if (dep > 0 || bal > 0) {
        var payWrap = document.createElement('div');
        payWrap.style.cssText = 'font-size:11px;margin-top:2px;display:flex;gap:4px;justify-content:flex-end';
        var checkSvg = '<svg width="11" height="11" viewBox="0 0 20 20" style="vertical-align:-1px;margin-left:2px"><circle cx="10" cy="10" r="10" fill="#2F6690"/><path d="M6 10l3 3 5-6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        if (dep > 0) payWrap.appendChild((function(){ var s=document.createElement('span'); s.style.cssText='color:#2F6690'; s.innerHTML='선금' + checkSvg; return s; })());
        if (bal > 0) payWrap.appendChild((function(){ var s=document.createElement('span'); s.style.cssText='color:#2F6690'; s.innerHTML='잔금' + checkSvg; return s; })());
        right.appendChild(payWrap);
      }
    }

    row.appendChild(dateCol);
    row.appendChild(bar);
    row.appendChild(info);
    row.appendChild(right);
    (function(name, id){ row.addEventListener('click', function(){ openDetail(name, id); }); })(ev.name, ev.cust && ev.cust.id);
    listEl.appendChild(row);
  });
}

// 2026-09-04(선혜님 지시 - "달력 부분 만들어줘"): 네이티브 <input type="date">는
// 브라우저(특히 iOS 사파리)가 직접 그리는 시스템 UI라, 날짜 셀을 탭하는
// 순간 곧바로 확정되고 창이 닫혀버리는 걸 JS로 막을 방법이 없었음(관련
// 문제는 confirmRow 확인/취소 버튼으로 우회했지만, "달력 자체가 계속
// 열려있는 채로 여러 날짜를 훑어보고 싶다"는 진짜 요청은 해결 못 함).
// 앱이 완전히 직접 그리는 작은 캘린더 팝업 - 날짜를 눌러도 선택 표시만
// 바뀔 뿐 팝업이 안 닫히고, "확인"을 눌러야 최종 반영됨.
function openCustomDatePicker(anchorEl, initialValue, onConfirm) {
  var existing = document.getElementById('custom-date-picker-popup');
  if (existing) existing.remove();

  var today = new Date();
  var initDate = initialValue ? new Date(initialValue + 'T00:00:00') : today;
  var viewYear = initDate.getFullYear();
  var viewMonth = initDate.getMonth(); // 0-11
  var selected = initialValue || null; // 'YYYY-MM-DD' 아직 확정 안 된 임시 선택값

  var popup = div('position:fixed;z-index:100000;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.15);padding:12px;width:260px', []);
  popup.id = 'custom-date-picker-popup';

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function toDateStr(y, m, d) { return y + '-' + pad2(m + 1) + '-' + pad2(d); }

  function render() {
    popup.innerHTML = '';
    var header = div('display:flex;align-items:center;justify-content:space-between;margin-bottom:8px', []);
    var prevBtn = el('button', {type:'button', text:'‹', style:'width:28px;height:28px;border:none;background:var(--ivory1);border-radius:6px;font-size:15px;cursor:pointer;color:var(--dark)'});
    var label = el('div', {style:'font-size:13px;font-weight:700;color:var(--dark)', text: viewYear + '년 ' + (viewMonth + 1) + '월'});
    var nextBtn = el('button', {type:'button', text:'›', style:'width:28px;height:28px;border:none;background:var(--ivory1);border-radius:6px;font-size:15px;cursor:pointer;color:var(--dark)'});
    prevBtn.addEventListener('click', function(){ viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } render(); });
    nextBtn.addEventListener('click', function(){ viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } render(); });
    header.appendChild(prevBtn); header.appendChild(label); header.appendChild(nextBtn);
    popup.appendChild(header);

    var weekRow = div('display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px', []);
    ['일','월','화','수','목','금','토'].forEach(function(w, i){
      weekRow.appendChild(el('div', {style:'text-align:center;font-size:10px;color:'+(i===0?'#C0392B':i===6?'#2F6690':'var(--sub)'), text:w}));
    });
    popup.appendChild(weekRow);

    var grid = div('display:grid;grid-template-columns:repeat(7,1fr);gap:2px', []);
    var firstDay = new Date(viewYear, viewMonth, 1).getDay();
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var todayStr2 = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());
    for (var i = 0; i < firstDay; i++) grid.appendChild(div('', []));
    for (var d = 1; d <= daysInMonth; d++) {
      var dStr = toDateStr(viewYear, viewMonth, d);
      var isSelected = dStr === selected;
      var isToday = dStr === todayStr2;
      var dayOfWeek = new Date(viewYear, viewMonth, d).getDay();
      var color = isSelected ? '#fff' : (dayOfWeek === 0 ? '#C0392B' : dayOfWeek === 6 ? '#2F6690' : 'var(--dark)');
      var btn = el('button', {type:'button', text:String(d), style:'height:30px;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;color:'+color+';background:'+(isSelected?'var(--dark)':isToday?'var(--ivory1)':'transparent')+(isToday&&!isSelected?';border:1px solid var(--sub)':'')});
      (function(dStrClosure){
        btn.addEventListener('click', function(){ selected = dStrClosure; render(); });
      })(dStr);
      grid.appendChild(btn);
    }
    popup.appendChild(grid);

    var actions = div('display:flex;gap:6px;margin-top:10px', []);
    var clearBtn = el('button', {type:'button', text:'날짜 지우기', style:'flex:1;padding:8px;font-size:11px;color:var(--sub);background:var(--ivory1);border:none;border-radius:6px;cursor:pointer;font-family:inherit'});
    var confirmBtn = el('button', {type:'button', text:'확인', style:'flex:1;padding:8px;font-size:12px;font-weight:700;color:#fff;background:var(--dark);border:none;border-radius:6px;cursor:pointer;font-family:inherit'});
    clearBtn.addEventListener('click', function(){ selected = null; render(); });
    confirmBtn.addEventListener('click', function(){ popup.remove(); document.removeEventListener('mousedown', outsideHandler); onConfirm(selected); });
    actions.appendChild(clearBtn); actions.appendChild(confirmBtn);
    popup.appendChild(actions);
  }
  render();

  document.body.appendChild(popup);
  var rect = anchorEl.getBoundingClientRect();
  var top = rect.bottom + 6;
  var left = rect.left;
  var popupWidth = 260;
  if (left + popupWidth > window.innerWidth - 8) left = window.innerWidth - popupWidth - 8;
  if (left < 8) left = 8;
  if (top + 320 > window.innerHeight) top = Math.max(8, rect.top - 320 - 6);
  popup.style.top = top + 'px';
  popup.style.left = left + 'px';

  function outsideHandler(e) {
    if (!popup.contains(e.target) && e.target !== anchorEl) {
      popup.remove();
      document.removeEventListener('mousedown', outsideHandler);
    }
  }
  setTimeout(function(){ document.addEventListener('mousedown', outsideHandler); }, 0);
}
