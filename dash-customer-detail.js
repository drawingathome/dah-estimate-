/* ══════════════════════════════════════════════════
   DAH 대시보드 — 고객상세 모달 기능
   고객 상세보기, 단계변경, 결제(선금/잔금) 관리, 알림톡 발송,
   고객 추가/수정, 견적서 이력 표시.
   ══════════════════════════════════════════════════ */

var STAGES = ['상담','계약금','실측','잔금','시공','완료'];
var STAGES_ALL = ['상담','계약금','실측','잔금','시공','완료','취소','노쇼'];

var STAGE_ALIM = {
  상담:   ['t01_reservation','t02_reminder','t03_estimate','t04_followup'],
  계약금: ['t03_estimate','t31_deposit','t05_measure_confirm'],
  실측:   ['t05_measure_confirm','t06_measure_dday','t07_final_estimate','t71_balance_request'],
  잔금:   ['t71_balance_request','t08_balance_remind','t09_order_confirm'],
  시공:   ['t09_order_confirm','t10_install_confirm','t11_install_dday'],
  완료:   ['t12_after_install','t13_cancel','t14_noshow']
};
var ALIM_META = {
  t01_reservation:    {label:'1. 예약확인',           desc:'수동 · 예약 즉시',         tag:'수동', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n상담 예약이 확인됐습니다. 편하신 시간에 뵙겠습니다!'},
  t02_reminder:       {label:'2. 방문 1일 전 리마인더',desc:'자동 · 방문일 D-1',        tag:'자동', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n내일 방문 예정이신 것 리마인드 드려요. 편하게 뵙겠습니다!'},
  t03_estimate:       {label:'3. 가견적서 발송',       desc:'수동 · 상담 당일',         tag:'수동', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n상담 내용을 바탕으로 가견적서를 보내드립니다. 확인 부탁드려요!'},
  t31_deposit:        {label:'3-1. 계약금 결제 요청',  desc:'수동 · 가견적서 발송 후',  tag:'수동', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n계약 진행을 위해 계약금(견적금액의 50%) 결제를 부탁드려요. 입금 확인되면 실측 일정을 잡아드리겠습니다.'},
  t04_followup:       {label:'4. 팔로업',             desc:'알림 · 상담 2일 후',        tag:'알림', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n상담 후 궁금하신 점은 없으셨나요? 편하게 말씀해 주세요!'},
  t05_measure_confirm:{label:'5. 실측 일정 확정',      desc:'수동 · 계약금 납부 후',    tag:'수동', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n계약금 확인됐습니다. 실측 방문 일정을 조율하고 싶어요. 편하신 날짜와 시간을 알려주세요!'},
  t06_measure_dday:   {label:'6. 실측 하루 전 안내',   desc:'알림 · 실측일 D-1',        tag:'알림', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n내일 실측 방문 예정입니다. 편하게 뵙겠습니다!'},
  t07_final_estimate: {label:'7. 확정견적서 발송',     desc:'수동 · 실측 완료 후',      tag:'수동', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n실측한 사이즈 기준으로 확정견적서를 보내드립니다. 확인 부탁드려요!'},
  t71_balance_request:{label:'7-1. 잔금 결제 요청',    desc:'수동 · 확정견적서 확인 후',tag:'수동', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n잔금 결제를 부탁드려요. 완납 확인되면 시공 일정이 확정됩니다. 감사합니다!'},
  t08_balance_remind: {label:'8. 잔금 리마인드',       desc:'알림 · 미납 2일 후',       tag:'알림', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n잔금 결제가 아직 확인되지 않아 안내드려요. 편하실 때 확인 부탁드립니다!'},
  t09_order_confirm:  {label:'9. 발주 확정+제작 안내', desc:'수동 · 잔금 완납 후',      tag:'수동', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n잔금 완납 확인됐습니다. 제작을 시작합니다. 완료되면 시공 일정을 안내드릴게요!'},
  t10_install_confirm:{label:'10. 시공 일정 확정',     desc:'수동 · 제작 완료 후',      tag:'수동', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n제작이 완료됐습니다. 시공 일정을 조율하고 싶어요. 편하신 날짜를 알려주세요!'},
  t11_install_dday:   {label:'11. 시공 전날 안내',     desc:'알림 · 시공일 D-1',        tag:'알림', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n내일 시공 방문 예정입니다. 편하게 뵙겠습니다!'},
  t12_after_install:  {label:'12. 시공 후 안부',       desc:'자동 · 시공일 D+3',        tag:'자동', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n시공은 만족스러우셨나요? 불편하신 점 있으시면 언제든 말씀해 주세요!'},
  t13_cancel:         {label:'13. 취소 안내',          desc:'선택 · 취소 시',           tag:'선택', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n요청하신 대로 취소 처리됐습니다. 다음에 또 좋은 인연으로 뵙겠습니다!'},
  t14_noshow:         {label:'14. 노쇼 재예약 안내',   desc:'선택 · 노쇼 처리 후',      tag:'선택', template:'안녕하세요, {name}님 🙂\n드로잉엣홈입니다.\n지난 방문 일정에 연락이 닿지 않아 안내드려요. 편하실 때 다시 예약 부탁드립니다!'}
};

var STAGE_COLORS = {상담:'var(--dark)',계약금:'var(--terra)',실측:'#A67C52',잔금:'#2E7D6B',시공:'#C0392B',완료:'var(--light)'};
var STAGE_BG = {상담:'#EEF2F7',계약금:'#FFF3EE',실측:'#F3EFF8',잔금:'#EEF5F2',시공:'#FDECEA',완료:'#F5F2EE'};
var STAGE_NUM = {상담:1,계약금:2,실측:3,잔금:4,시공:5,완료:6};
var STAGE_ACTIVE = {상담:true,계약금:true,실측:true,잔금:true,시공:true,완료:false};
var currentDetailName = null;
var currentDetailId = null; // 동명이인 구분용 — 상세를 열 때의 정확한 레코드 id를 기억해둠

// 현재 열려있는 상세화면이 가리키는 정확한 고객 레코드를 찾음.
// currentDetailId가 있으면 id로 정확히(동명이인 안전), 없는 예전 데이터만 이름으로 폴백.
function findCurrentDetailCustomer(arr) {
  if (currentDetailId) {
    var byId = arr.find(function(c) { return c.id === currentDetailId; });
    if (byId) return byId;
  }
  return arr.find(function(c) { return c.clientName === currentDetailName; });
}

function sendAlimtalk(key) {
  var arr = loadCustomers();
  var c = findCurrentDetailCustomer(arr);
  if (!c) return;
  var meta = ALIM_META[key]; if (!meta) return;
  var initialMsg = (meta.template || '').replace(/\{name\}/g, c.clientName || '');
  _openAlimtalkPreview(meta, key, c, initialMsg);
}

// 알림톡 발송 전 미리보기+수정 모달 — "제목만 보고 바로 발송확인" 대신 실제 내용을 보여주고 고칠 수 있게 함
function _openAlimtalkPreview(meta, key, c, initialMsg) {
  var existing = document.getElementById('alimtalk-preview-overlay');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = 'alimtalk-preview-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99998;display:flex;align-items:center;justify-content:center';
  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:20px;width:360px;max-width:90vw;max-height:85vh;overflow-y:auto';
  box.innerHTML =
    '<div style="font-size:12px;font-weight:700;color:var(--sub);letter-spacing:0.08em;margin-bottom:4px">' + escHtml(meta.tag) + ' · ' + escHtml(meta.desc) + '</div>' +
    '<div style="font-size:15px;font-weight:700;color:var(--dark);margin-bottom:12px">' + escHtml(meta.label) + '</div>' +
    '<textarea id="alimtalk-msg-textarea" style="width:100%;min-height:140px;padding:10px;border:1.5px solid var(--border);border-radius:10px;font-size:12px;font-family:inherit;box-sizing:border-box;resize:vertical;outline:none"></textarea>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button id="alimtalk-cancel-btn" style="flex:1;padding:11px;background:#fff;border:1px solid var(--border);border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;color:var(--dark)">취소</button>' +
      '<button id="alimtalk-send-btn" style="flex:2;padding:11px;background:var(--dark);color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer">발송</button>' +
    '</div>';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  var textarea = document.getElementById('alimtalk-msg-textarea');
  textarea.value = initialMsg;
  textarea.focus();
  document.getElementById('alimtalk-cancel-btn').addEventListener('click', function(){ overlay.remove(); });
  document.getElementById('alimtalk-send-btn').addEventListener('click', function(){
    var finalMsg = textarea.value;
    overlay.remove();
    try {
      var logs = JSON.parse(localStorage.getItem('dah_kakao_log')||'[]');
      var now = new Date();
      logs.unshift({
        name: c.clientName,
        type: key,
        label: meta.label,
        date: (now.getMonth()+1)+'월 '+now.getDate()+'일',
        time: now.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}),
        method: meta.tag,
        message: finalMsg
      });
      localStorage.setItem('dah_kakao_log', JSON.stringify(logs.slice(0,200)));
    } catch(e){}
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(finalMsg).then(function(){ showToast('['+meta.label+'] 메시지가 복사됐어요 — 카카오톡에 붙여넣기 하세요'); });
      }
    } catch(e){}
    closeDetail(); openDetail(c.clientName, c.id);
  });
}

var DETAIL_TABS = ['info', 'pay', 'alim', 'order', 'est'];
function switchDetailTab(tab) {
  var panels = { info:'detail-body', pay:'detail-pay-body', alim:'detail-alim-body', order:'detail-order-body', est:'detail-est-body' };
  var tabBtns = { info:'dtab-info', pay:'dtab-pay', alim:'dtab-alim', order:'dtab-order', est:'dtab-est' };
  var anyMissing = DETAIL_TABS.some(function(t){ return !document.getElementById(panels[t]); });
  if (anyMissing) return;
  DETAIL_TABS.forEach(function(t) {
    var panel = document.getElementById(panels[t]);
    var btn = document.getElementById(tabBtns[t]);
    var isActive = (t === tab);
    panel.style.display = isActive ? '' : 'none';
    if (btn) {
      btn.style.borderBottom = isActive ? '2px solid var(--dark)' : '2px solid transparent';
      btn.style.color = isActive ? 'var(--dark)' : 'var(--light)';
      btn.style.fontWeight = isActive ? '700' : '600';
    }
  });
  if (tab === 'est') renderDetailEstTab();
}

function renderDetailEstTab() {
  var estEl = document.getElementById('detail-est-body');
  if (!estEl || !currentDetailName) return;
  estEl.innerHTML = '';

  var all = [];
  try { all = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e) {}
  var ests = all.filter(function(e){ return e.clientName === currentDetailName; });
  // 날짜 최신순 정렬
  ests.sort(function(a,b){ return (b.savedAt||b.date||'') > (a.savedAt||a.date||'') ? 1 : -1; });

  var cntEl = document.getElementById('dtab-est-cnt');
  if (cntEl) cntEl.textContent = ests.length > 0 ? ests.length+'건' : '';

  if (ests.length === 0) {
    estEl.innerHTML = '<div class="empty-state"><span class="empty-state-emoji">📋</span>' +
      '<div class="empty-state-title">저장된 견적서가 없습니다</div>' +
      '<div class="empty-state-desc">견적서 앱에서 작성 후 저장하면 여기에 표시됩니다</div>' +
      '<button onclick="openEstimate(\''+currentDetailName+'\')" style="margin-top:14px;padding:10px 20px;background:var(--dark);color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer">+ 견적서 작성하기</button></div>';
    return;
  }

  var CONTRACT_KO    = {pending:'가견적', contracted:'✅ 계약됨', rejected:'미계약'};
  var CONTRACT_BG    = {pending:'#F5F2EE', contracted:'#EEF5F2', rejected:'#FDECEA'};
  var CONTRACT_COLOR = {pending:'var(--sub)', contracted:'#2E7D6B', rejected:'#C0392B'};
  var STATUS_KO      = {ga:'가견적서', final:'최종견적서'};

  // 재구매 여부 - 계약된 견적이 2개 이상이면 재구매
  var contractedCount = ests.filter(function(e){ return e.contractStatus === 'contracted'; }).length;
  if (contractedCount > 1) {
    var rebuyBanner = div('background:#FFF3EE;border:1px solid var(--terra);border-radius:12px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:8px', [
      el('span', {style:'font-size:11px', text:'🔄'}),
      el('span', {style:'font-size:12px;font-weight:700;color:var(--terra)', text:'재구매 고객 — 계약 '+contractedCount+'회'})
    ]);
    estEl.appendChild(rebuyBanner);
  }

  ests.forEach(function(e, i) {
    var cs = e.contractStatus || 'pending';
    var isFinal = e.status === 'final';
    var isContracted = cs === 'contracted';

    var card = div(
      'border:1px solid '+(isContracted?'#B0D4B0':'var(--border)')+';border-radius:12px;padding:14px;margin-bottom:10px;' +
      'background:'+(isContracted?'#FAFFF9':'#fff'),
      []
    );

    // 순번 표시 (최신순)
    var orderBadge = el('span', {style:'font-size:11px;color:var(--sub)', text: (i+1)+'번째 견적'});

    // 상단: 번호 + 유형 + 계약상태 + 확정여부
    var topItems = [
      orderBadge,
      el('span', {style:'font-size:11px;font-weight:800;color:var(--dark)', text: e.no||'—'}),
      el('span', {style:'font-size:12px;font-weight:700;padding:2px 6px;border-radius:6px;background:'+(isFinal?'var(--dark)':'#F5F2EE')+';color:'+(isFinal?'#fff':'var(--sub)'), text: STATUS_KO[e.status]||'가견적서'})
    ];
    if (e.confirmedAt) {
      topItems.push(el('span', {style:'font-size:11px;font-weight:700;color:#fff;background:var(--dark);padding:2px 8px;border-radius:20px', text:'✓ 확정'}));
    }
    topItems.push(el('span', {style:'margin-left:auto;font-size:12px;font-weight:700;padding:3px 9px;border-radius:6px;background:'+CONTRACT_BG[cs]+';color:'+CONTRACT_COLOR[cs], text: CONTRACT_KO[cs]}));
    var top = div('display:flex;align-items:center;gap:6px;margin-bottom:10px', topItems);

    // 금액 크게
    var priceRow = div('margin-bottom:8px', [
      el('div', {style:'font-size:22px;font-weight:900;color:var(--dark);letter-spacing:-1px', text: (Number(e.price)||0).toLocaleString()+'원'}),
    ]);

    // 상세 정보 그리드
    var infoGrid = div('display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px', []);
    var infoItems = [
      {label:'공간', value: e.space||'—'},
      {label:'원단', value: e.fabric||'—'},
      {label:'실측일', value: e.date||'—'},
      {label:'시공일', value: e.installDate||'—'},
    ];
    infoItems.forEach(function(item){
      infoGrid.appendChild(div('background:#F5F2EE;border-radius:12px;padding:8px 10px', [
        el('div', {style:'font-size:11px;color:var(--sub);margin-bottom:2px', text:item.label}),
        el('div', {style:'font-size:12px;font-weight:700;color:var(--dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis', text:item.value})
      ]));
    });

    // 저장일
    var savedDate = e.savedAt ? e.savedAt.slice(0,10) : (e.date||'');
    var dateRow = el('div', {style:'font-size:11px;color:var(--sub);margin-bottom:10px', text:'저장일: ' + savedDate});

    // 액션 버튼
    var actions = div('display:flex;gap:6px', []);
    var kakaoBtn = btn('flex:1;padding:9px 0;background:#FAE100;color:#3C1E1E;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer', '📋 카카오 복사', function(){
      var text = '[드로잉엣홈] ' + (e.clientName||'') + '님 견적서\n' +
        '견적번호: ' + (e.no||'—') + '\n' +
        '금액: ' + (Number(e.price)||0).toLocaleString() + '원\n' +
        '공간: ' + (e.space||'—') + '\n' +
        '원단: ' + (e.fabric||'—');
      navigator.clipboard.writeText(text)
        .then(function(){ showToast('카카오톡에 붙여넣기 하세요 🙂'); })
        .catch(function(){ showToast('복사됐습니다'); });
    });
    var openBtn = btn('flex:1;padding:9px 0;background:var(--dark);color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer', '📄 견적서 앱', function(){
      openEstimate(currentDetailName);
    });
    actions.appendChild(kakaoBtn);
    actions.appendChild(openBtn);

    card.appendChild(top);
    card.appendChild(priceRow);
    card.appendChild(infoGrid);
    card.appendChild(dateRow);
    card.appendChild(actions);
    estEl.appendChild(card);
  });

  // 새 견적 버튼
  var newEstBtn = btn('width:100%;padding:12px;background:#F5F2EE;color:var(--dark);border:1px solid var(--border);border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:4px',
    '+ 새 견적서 작성', function(){ openEstimate(currentDetailName); });
  estEl.appendChild(newEstBtn);
}

function openDetail(name, id, forceTab) {
  var customers = loadCustomers();
  var c = id ? customers.find(function(x) { return x.id === id; }) : customers.find(function(x) { return x.clientName === name; });
  if (!c) return;
  currentDetailName = c.clientName;
  currentDetailId = c.id || null;
  if (typeof logEvent === 'function') logEvent('detail_open', { stage: c.stage, tab: forceTab || 'info' });
  var isMaster = currentUser && currentUser.role === 'master';

  // 이름
  var _dn=document.getElementById('detail-name'); if(_dn) _dn.textContent = c.clientName;

  // 아바타 (이름 첫 글자)
  var _dav=document.getElementById('detail-avatar');
  if (_dav) _dav.textContent = (c.clientName||'?').charAt(0);

  // 주소 (헤더에 항상 고정 표시)
  var _da=document.getElementById('detail-addr');
  if (_da) {
    if (c.addr) { _da.textContent = c.addr; _da.style.display = 'block'; }
    else { _da.textContent = ''; _da.style.display = 'none'; }
  }

  // 단계 배지 (이름과 한 줄에)
  var _dsb = document.getElementById('detail-stage-badge');
  if (_dsb) { _dsb.textContent = c.stage; }

  // 요약 row: 재구매 + 경과일 (조용한 보조정보로)
  var summaryRow = document.getElementById('detail-summary-row');
  if(!summaryRow) return;
  summaryRow.innerHTML = '';
  if (c.visitCount > 1) {
    var reBadge = document.createElement('span');
    reBadge.textContent = '재구매 '+c.visitCount+'회';
    reBadge.style.cssText = 'font-size:11px;font-weight:700;color:var(--terra)';
    summaryRow.appendChild(reBadge);
  }
  if (c.date) {
    var diff = daysDiff(c.date);
    if (c.visitCount > 1) { var dot = document.createElement('span'); dot.textContent = '·'; dot.style.color = 'var(--border)'; summaryRow.appendChild(dot); }
    var diffBadge = document.createElement('span');
    diffBadge.textContent = diff === 0 ? '오늘 상담' : diff > 0 ? diff+'일 경과' : Math.abs(diff)+'일 후';
    summaryRow.appendChild(diffBadge);
  }

  // 현재 견적 요약 (가장 최근 저장된 견적서 기준) — 이름/주소 다음으로 항상 눈에 보이는 자리
  var curEstBox = document.getElementById('detail-current-est');
  var allEstsForCur = [];
  try { allEstsForCur = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e) {}
  var myEsts = allEstsForCur.filter(function(e){ return e.clientName === c.clientName; });
  myEsts.sort(function(a,b){ return (b.savedAt||b.date||'') > (a.savedAt||a.date||'') ? 1 : -1; });
  var latestEst = myEsts[0];
  if (curEstBox) {
    if (latestEst) {
      var amt = (Number(latestEst.price)||0).toLocaleString()+'원';
      var itemLabel = latestEst.itemCount ? ('총 '+latestEst.itemCount+'개 품목') : '';
      curEstBox.innerHTML =
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
          '<span style="width:6px;height:6px;border-radius:50%;background:var(--terra);display:inline-block"></span>' +
          '<span style="font-size:11px;font-weight:600;color:#B85A2E;letter-spacing:0.3px">진행중인 견적' + (itemLabel ? ' · '+itemLabel : '') + '</span>' +
        '</div>' +
        '<div style="font-size:22px;font-weight:700;color:var(--dark);letter-spacing:-0.5px">' + amt + '</div>';
      curEstBox.style.display = 'block';
    } else {
      curEstBox.innerHTML =
        '<div style="font-size:12px;color:var(--sub)">아직 저장된 견적서가 없어요</div>';
      curEstBox.style.display = 'block';
    }
  }

  // 핵심 정보 (연락처/담당자 — 아이콘형 인라인, 박스 없이)
  var infoBar = document.getElementById('detail-info-bar');
  infoBar.innerHTML = '';
  var phoneHtml = c.phone
    ? '<a href="tel:' + c.phone.replace(/[^0-9]/g,'') + '" style="color:var(--dark);text-decoration:none;font-weight:500">' + c.phone + '</a>'
    : '<span style="color:var(--sub)">연락처 없음</span>';
  infoBar.innerHTML =
    '<span>' + phoneHtml + '</span>' +
    '<span style="color:var(--border)">|</span>' +
    '<span>' + (c.staffName || '마스터') + '</span>';

  var body = document.getElementById('detail-body');
  body.innerHTML = '';
  var payBody = document.getElementById('detail-pay-body'); if (payBody) payBody.innerHTML = '';
  var alimBody = document.getElementById('detail-alim-body'); if (alimBody) alimBody.innerHTML = '';
  var orderBody = document.getElementById('detail-order-body'); if (orderBody) orderBody.innerHTML = '';
  // 탭 초기화
  var estBodyEl = document.getElementById('detail-est-body');
  if (estBodyEl) { estBodyEl.innerHTML = ''; }
  var autoTab = forceTab;
  if (!autoTab) {
    if ((c.stage === '계약금' && !c.depositAmount) || (c.stage === '잔금' && !c.balanceAmount)) {
      autoTab = 'pay'; // 입금 대기 중이면 결제탭부터
    } else {
      var os = c.orderStatus || {};
      var orderNotStarted = !os.fabric && !os.production && !os.blind && !os.material && !os.install;
      if (['계약금','실측','잔금','시공'].indexOf(c.stage) >= 0 && orderNotStarted) autoTab = 'order'; // 발주 전혀 안됐으면 발주탭부터
    }
  }
  switchDetailTab(autoTab || 'info');
  // 견적 건수 배지
  var all = []; try { all = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e) {}
  var estCnt = all.filter(function(e){ return e.clientName === c.clientName; }).length;
  var cntEl = document.getElementById('dtab-est-cnt');
  if (cntEl) cntEl.textContent = estCnt > 0 ? estCnt+'건' : '';

  
  var stageNum = STAGE_NUM[c.stage] || 1;
  var stageSec = div('margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)', []);

  // 되돌릴 대상이 없는 상태(완료/취소/노쇼)에서는 케밥 메뉴 자체를 숨김
  var canCancelOrNoshow = ['완료', '취소', '노쇼'].indexOf(c.stage) === -1;

  var kebabWrap = div('position:relative', []);
  if (canCancelOrNoshow) {
    var kebabBtn = btn('font-size:15px;color:var(--sub);background:none;border:none;padding:5px 8px;cursor:pointer;line-height:1', '⋮', function(e){
      var menu = document.getElementById('stage-kebab-menu');
      if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    var kebabMenu = div('display:none;position:absolute;top:28px;right:0;background:#fff;border:1px solid var(--border);border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.1);z-index:20;min-width:120px;overflow:hidden', []);
    kebabMenu.id = 'stage-kebab-menu';
    var cancelBtn = btn('display:block;width:100%;padding:10px 14px;border:none;background:#fff;font-size:12px;color:var(--dark);font-family:inherit;cursor:pointer;text-align:left','취소 처리', function(){
      if(confirm(c.clientName+'님을 취소 처리할까요? 자동 발송이 중단됩니다.')) {
        changeStage('취소'); closeDetail();
      }
    });
    var noshowBtn = btn('display:block;width:100%;padding:10px 14px;border:none;background:#fff;font-size:12px;color:var(--dark);font-family:inherit;cursor:pointer;text-align:left;border-top:1px solid var(--border)','노쇼 처리', function(){
      if(confirm(c.clientName+'님을 노쇼 처리할까요?')) {
        changeStage('노쇼'); closeDetail();
      }
    });
    kebabMenu.appendChild(cancelBtn);
    kebabMenu.appendChild(noshowBtn);
    kebabWrap.appendChild(kebabBtn);
    kebabWrap.appendChild(kebabMenu);
  }

  var stageTop = div('display:flex;justify-content:space-between;align-items:center;margin-bottom:10px', [
    div('display:flex;align-items:center;gap:8px', [
      el('span', {style:'display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:var(--dark);color:#fff;font-size:12px;font-weight:700;flex-shrink:0', text:stageNum}),
      el('span', {style:'font-size:12px;font-weight:700;color:var(--dark);letter-spacing:-0.3px', text:c.stage + ' 단계'})
    ]),
    div('display:flex;align-items:center;gap:2px', [
      isMaster ? btn('font-size:11px;color:var(--dark);background:var(--ivory1);border:1px solid var(--border);padding:5px 10px;cursor:pointer;font-family:inherit;border-radius:10px', '수정', function(){ closeDetail(); openAdd(c.clientName); }) : el('span',{}),
      kebabWrap
    ])
  ]);
  stageSec.appendChild(stageTop);

  
  var progressBar = div('display:flex;gap:3px;margin-bottom:10px', []);
  STAGES.forEach(function(s) {
    var done = STAGE_NUM[s] <= STAGE_NUM[c.stage];
    var cur  = s === c.stage;
    var seg  = div(
      'flex:1;height:3px;border-radius:2px;background:'+(done?'var(--dark)':'var(--border)'),[]
    );
    progressBar.appendChild(seg);
  });
  stageSec.appendChild(progressBar);

  
  // 다음 단계 계산 (완료/취소/노쇼는 다음 단계 없음)
  var curIdx = STAGES.indexOf(c.stage);
  var nextStage = (curIdx >= 0 && curIdx < STAGES.length - 1) ? STAGES[curIdx + 1] : null;

  var stageActionRow = div('display:flex;gap:8px;align-items:center', []);
  if (nextStage) {
    stageActionRow.appendChild(btn(
      'flex:1;padding:11px;border:none;background:var(--dark);color:#fff;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;border-radius:10px',
      nextStage + '으로 진행 →', function(){ changeStage(nextStage); }
    ));
  }
  var toggleStageBtn = btn(
    'padding:11px 14px;border:none;background:var(--ivory1);color:#8A8378;font-size:12px;font-family:inherit;cursor:pointer;border-radius:10px;white-space:nowrap',
    '다른 단계', function(){
      var wrap = document.getElementById('stage-manual-select');
      if (wrap) wrap.style.display = wrap.style.display === 'none' ? '' : 'none';
    }
  );
  stageActionRow.appendChild(toggleStageBtn);
  stageSec.appendChild(stageActionRow);

  // 평소엔 접혀있고, "다른 단계로" 눌렀을 때만 펼쳐지는 전체 단계 선택
  var stageBar = div('display:flex;flex-wrap:wrap;gap:6px', []);
  stageBar.id = 'stage-manual-select';
  stageBar.style.display = 'none';
  stageBar.style.marginTop = '8px';
  STAGES.forEach(function(s) {
    var on = s === c.stage;
    var num = STAGE_NUM[s] || 1;
    var pill = btn(
      'padding:5px 11px;border:1px solid '+(on?'var(--dark)':'var(--border)')+';'+
      'background:'+(on?'var(--dark)':'#fff')+';color:'+(on?'#fff':'#6B6B6B')+';'+
      'font-size:11px;font-weight:'+(on?'700':'400')+';font-family:inherit;cursor:pointer;border-radius:10px',
      num+'. '+s, function(){ changeStage(s); }
    );
    stageBar.appendChild(pill);
  });

  
  stageSec.appendChild(stageBar);
  body.appendChild(stageSec);

  
  var todoKeys = STAGE_ALIM[c.stage] || [];
  var manualKeys = todoKeys.filter(function(k){ return ALIM_META[k] && ALIM_META[k].tag === '수동'; });
  if (manualKeys.length > 0) {
    var todoSec = div('margin-bottom:14px;padding:12px;background:var(--ivory1);border:1.5px solid var(--dark);border-radius:12px', []);
    todoSec.appendChild(el('div', {style:'font-size:12px;font-weight:700;color:var(--dark);letter-spacing:1.5px;margin-bottom:8px', text:'지금 해야 할 일'}));
    // 가장 급한 것 1개만 크게 보여주고, 나머지는 "N건 더 남음" 뒤에 접어둠(눌러야만 펼쳐짐)
    var firstKey = manualKeys[0];
    var firstMeta = ALIM_META[firstKey];
    var primaryBtn = btn('width:100%;padding:11px;background:var(--dark);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-bottom:6px', firstMeta.label + ' 발송하기', function(){ sendAlimtalk(firstKey); });
    todoSec.appendChild(primaryBtn);
    if (manualKeys.length > 1) {
      var moreRow = div('display:flex;align-items:center;justify-content:space-between', [
        el('span', {style:'font-size:11px;color:var(--sub)', text:(manualKeys.length-1)+'건 더 남음'}),
        btn('font-size:11px;color:var(--dark);background:none;border:1px solid var(--border);padding:4px 10px;border-radius:10px;cursor:pointer;font-family:inherit', '전체 보기', function(){
          var wrap = document.getElementById('todo-rest');
          if (wrap) wrap.style.display = wrap.style.display === 'none' ? '' : 'none';
        })
      ]);
      todoSec.appendChild(moreRow);
      var restWrap = div('display:none;margin-top:8px', []);
      restWrap.id = 'todo-rest';
      manualKeys.slice(1).forEach(function(key) {
        var meta = ALIM_META[key]; if(!meta) return;
        var row = div('display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:5px', [
          div('', [
            el('span', {style:'font-size:12px;font-weight:700;color:var(--dark);display:block', text:meta.label}),
            el('span', {style:'font-size:11px;color:var(--sub)', text:meta.desc})
          ]),
          el('span', {style:'font-size:12px;font-weight:600;color:var(--dark);background:#fff;border:1px solid var(--dark);padding:5px 12px;border-radius:12px;flex-shrink:0', text:'발송'})
        ]);
        (function(k){ row.addEventListener('click', function(){ sendAlimtalk(k); }); })(key);
        restWrap.appendChild(row);
      });
      todoSec.appendChild(restWrap);
    }
    body.appendChild(todoSec);
  }

  renderPaySection(c, payBody);

  
  renderAlimSection(c, alimBody);

  // 고객 정보 섹션
  var infoSec = div('margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)', []);
  infoSec.appendChild(el('div', {style:'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px', text:'고객 정보'}));

  // 연락처/주소는 헤더에 항상 고정 표시되므로 여기선 생략 (중복 방지).
  // 단, 전화 클릭 기능은 정보바의 연락처 칸에서 그대로 사용 가능.

  // 메모
  if (c.memo) {
    var memoBlock = div('background:#FFFBF5;border:1px solid #FFE5CC;border-radius:12px;padding:10px 14px;margin-bottom:8px', [
      el('div', {style:'font-size:11px;color:var(--terra);letter-spacing:0.8px;margin-bottom:3px', text:'메모'}),
      el('div', {style:'font-size:11px;color:var(--dark);line-height:1.6', text:c.memo})
    ]);
    infoSec.appendChild(memoBlock);
  }

  // 날짜 3개 가로 배열 — 실측예정/시공예정은 클릭하면 바로 날짜를 고쳐 저장할 수 있음
  // (기존엔 전체 "수정" 모달을 열어야만 했음 — 선혜님 피드백으로 원클릭 편집 추가)
  var dateGrid = div('display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px', []);
  var dateFields = [
    {label:'상담일', value:c.date||'—', key:null},
    {label:'실측 예정', value:c.measureDate||'—', key:'measureDate'},
    {label:'시공 예정', value:c.installDate||'—', key:'installDate'}
  ];
  dateFields.forEach(function(item){
    var box = div('background:var(--ivory1);border:1px solid var(--border);border-radius:12px;padding:10px 8px;text-align:center;position:relative'+(item.key?';cursor:pointer':''),[
      el('div',{style:'font-size:11px;color:var(--sub);letter-spacing:0.8px;margin-bottom:4px',text:item.label}),
      el('div',{style:'font-size:12px;font-weight:700;color:'+(item.value==='—'?'var(--light)':'var(--dark)'),text:item.value})
    ]);
    if (item.key) {
      box.addEventListener('click', function(){
        if (box.querySelector('input')) return; // 이미 편집중이면 무시
        var valueDiv = box.children[1];
        var originalText = valueDiv.textContent;
        valueDiv.textContent = '';
        var dateInp = el('input', {type:'date', style:'width:100%;border:none;background:transparent;font-size:12px;font-weight:700;color:var(--dark);text-align:center;font-family:inherit;outline:none'});
        if (c[item.key]) dateInp.value = c[item.key];
        valueDiv.appendChild(dateInp);
        dateInp.focus();
        try { dateInp.showPicker(); } catch(e) {}
        function commit(){
          var newVal = dateInp.value;
          var arr = loadCustomers();
          var target = findCurrentDetailCustomer(arr);
          if (target) {
            target[item.key] = newVal;
            saveCustomers(arr);
            saveCustomerToDb(target, null);
          }
          valueDiv.textContent = newVal || '—';
          valueDiv.style.color = newVal ? 'var(--dark)' : 'var(--light)';
          showToast(item.label + '이 저장됐습니다');
        }
        dateInp.addEventListener('change', commit);
        dateInp.addEventListener('blur', function(){ if(!dateInp.value) { valueDiv.textContent = originalText; } });
      });
    }
    dateGrid.appendChild(box);
  });
  infoSec.appendChild(dateGrid);
  body.appendChild(infoSec);

  renderEstimateHistory(body, c.clientName);

  
  body.appendChild(btn('width:100%;padding:12px;background:var(--ivory1);color:var(--dark);border:1px solid var(--border);font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;border-radius:10px;margin-bottom:6px', '견적서 앱에서 열기', function(){ openEstimate(currentDetailName); }));
  renderOrderSection(c, orderBody);

  var bottomBtns = [btn('flex:2;padding:11px;background:var(--dark);color:#fff;border:none;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;border-radius:12px;letter-spacing:0.2px', '닫기', closeDetail)];
  if (isMaster) {
    if (isSoftDeleted(c)) {
      bottomBtns.unshift(btn('flex:1;padding:11px;background:#fff;border:1px solid var(--dark);font-size:11px;font-family:inherit;cursor:pointer;color:var(--dark);font-weight:700;border-radius:12px', '↩ 복구', function(){ restoreCustomer(c.clientName, c.id); }));
    } else {
      bottomBtns.unshift(btn('flex:1;padding:11px;background:#fff;border:1px solid var(--border);font-size:11px;font-family:inherit;cursor:pointer;color:var(--dark);border-radius:12px', '삭제', deleteCustomer));
    }
  }
  body.appendChild(div('display:flex;gap:8px', bottomBtns));

  document.getElementById('detail-overlay').className = 'overlay open';
  renderKakaoLog();
}

function closeDetail() { document.getElementById('detail-overlay').className = 'overlay'; currentDetailName = null; currentDetailId = null; }

function changeStage(stage) {
  var arr = loadCustomers();
  var target = findCurrentDetailCustomer(arr);
  if (!target) return;
  if (currentUser && currentUser.role === 'staff') {
    if ((target.staffName||'마스터') !== currentUser.name) { alert('본인 담당 고객만 단계를 변경할 수 있습니다.'); return; }
  }
  if (stage === '완료') { if (!confirm(currentDetailName + ' 고객을 "시공 완료"로 변경할까요?')) return; }
  var fromStage = target.stage;
  target.stage = stage;
  saveCustomers(arr);
  saveCustomerToDb(target, null);
  if (typeof logEvent === 'function') logEvent('stage_change', { from: fromStage, to: stage });
  renderHome(true); openDetail(currentDetailName, target.id);
  showToast('"' + stage + '"으로 변경됐습니다');
}

function deleteCustomer() {
  if (!confirm((currentDetailName||'고객') + '을(를) 삭제할까요? (완전히 지워지지 않고 보관 처리되며, 필요하면 나중에 복구할 수 있어요)')) return;
  var arr = loadCustomers();
  var target = findCurrentDetailCustomer(arr);
  deleteCustomerFromDb(target || currentDetailName, null);
  if (target) target.is_archived = true;
  saveCustomers(arr);
  closeDetail(); renderHome(true);
}

function restoreCustomer(clientName, id) {
  if (!confirm((clientName||'고객') + ' 정보를 복구할까요?')) return;
  var arr = loadCustomers();
  var target = id ? arr.find(function(c) { return c.id === id; }) : arr.find(function(c) { return c.clientName === clientName; });
  restoreCustomerFromDb(target || clientName, null);
  if (target) target.is_archived = false;
  saveCustomers(arr);
  showToast(clientName + ' 정보가 복구됐습니다');
  closeDetail();
  if (typeof renderSearch === 'function') renderSearch();
}

var editingCustomerName = null;
var editingCustomerId = null; // 동명이인 구분용
/** @param {string} [editName] 편집 시 기존 고객명 */
function openAdd(editName) {
  editingCustomerName = editName || null;
  editingCustomerId = editName ? currentDetailId : null; // 상세화면에서 열렸다면 그 정확한 id를 이어받음
  document.getElementById('add-modal-title').textContent = editName ? '고객 정보 수정' : '고객 추가';
  if (editName) {
    
    document.getElementById('add-modal-title').textContent = '고객 정보 수정';
    var arr = loadCustomers(); var c = editingCustomerId ? arr.find(function(x) { return x.id === editingCustomerId; }) : arr.find(function(x) { return x.clientName === editName; });
    if (c) { document.getElementById('add-name').value = c.clientName; document.getElementById('add-phone').value = c.phone || ''; document.getElementById('add-addr').value = c.addr || ''; document.getElementById('add-space').value = c.space || ''; document.getElementById('add-stage').value = c.stage || '상담'; document.getElementById('add-date').value = c.date || todayStr(); document.getElementById('add-memo').value = c.memo || ''; document.getElementById('add-measure').value = c.measureDate || ''; document.getElementById('add-install').value = c.installDate || ''; }
  } else { document.getElementById('add-name').value = ''; document.getElementById('add-phone').value = ''; document.getElementById('add-addr').value = ''; document.getElementById('add-space').value = ''; document.getElementById('add-stage').value = '상담'; document.getElementById('add-date').value = todayStr(); document.getElementById('add-memo').value = ''; document.getElementById('add-measure').value = ''; document.getElementById('add-install').value = ''; }
  var defaultStaff = editName ? (function() { var arr = loadCustomers(); var c = editingCustomerId ? arr.find(function(x) { return x.id === editingCustomerId; }) : arr.find(function(x) { return x.clientName === editName; }); return c ? (c.staffName || '마스터') : '마스터'; })() : (currentUser ? currentUser.name : '마스터');
  var isStaffUser = currentUser && currentUser.role === 'staff';
  
  var staffWrap = document.getElementById('staff-btn-wrap');
  if (staffWrap) {
    staffWrap.innerHTML = '';
    var staffList2 = ['마스터'].concat(getStaffList());
    staffList2.forEach(function(sn) {
      var isActive = sn === defaultStaff;
      var sb = document.createElement('button');
      sb.setAttribute('data-staff', sn);
      sb.className = 'staff-btn';
      sb.textContent = sn;
      sb.style.cssText = 'padding:6px 12px;border-radius:10px;border:1px solid '+(isActive?'var(--terra)':'var(--border)')+';font-size:11px;font-weight:'+(isActive?'700':'500')+';font-family:inherit;cursor:pointer;background:'+(isActive?'var(--terra)':'#fff')+';color:'+(isActive?'#fff':'var(--sub)');
      staffWrap.appendChild(sb);
    });
  }
  document.querySelectorAll('.staff-btn').forEach(function(b) {
    var isActive = b.getAttribute('data-staff') === defaultStaff;
    b.classList.toggle('active', isActive); b.style.background = isActive ? 'var(--terra)' : '#fff'; b.style.color = isActive ? '#fff' : '#8E8078'; b.style.borderRadius = 'var(--r-btn)'; b.style.border = '1.5px solid ' + (isActive ? 'var(--terra)' : 'var(--border)'); b.style.fontWeight = isActive ? '700' : '400';
    if (isStaffUser) { b.style.pointerEvents = 'none'; b.style.opacity = isActive ? '1' : '0.3'; } else { b.style.pointerEvents = ''; b.style.opacity = ''; }
  });
  var _ov = document.getElementById('add-overlay');

  // 최근 사용 주소 자동완성 — 카카오 주소검색(팝업 열기->검색->선택 3단계)을
  // 반복 지역(같은 아파트 단지 등) 고객에 한해 원클릭으로 줄여줌
  var recentWrap = document.getElementById('add-addr-recent');
  if (recentWrap) {
    recentWrap.innerHTML = '';
    var allC = loadCustomers();
    var seen = {};
    var recentAddrs = [];
    allC.slice().reverse().forEach(function(cust) {
      var a = (cust.addr || '').trim();
      if (a && !seen[a]) { seen[a] = true; recentAddrs.push(a); }
    });
    recentAddrs = recentAddrs.slice(0, 5);
    if (recentAddrs.length > 0) {
      recentWrap.style.display = 'flex';
      recentAddrs.forEach(function(a) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.textContent = a.length > 16 ? a.slice(0, 16) + '…' : a;
        chip.title = a;
        chip.style.cssText = 'font-size:11px;color:var(--dark);background:var(--ivory1);border:1px solid var(--border);border-radius:var(--r-btn);padding:5px 10px;cursor:pointer;font-family:inherit;white-space:nowrap';
        chip.addEventListener('click', function() {
          var addrInput = document.getElementById('add-addr');
          addrInput.value = a;
          addrInput.dispatchEvent(new Event('change'));
        });
        recentWrap.appendChild(chip);
      });
    } else {
      recentWrap.style.display = 'none';
    }
  }

  _ov.className = 'overlay open';
  _ov.style.display = 'flex';
  _ov.style.position = 'fixed';
  _ov.style.top = '0';
  _ov.style.left = '0';
  _ov.style.width = '100%';
  _ov.style.height = '100%';
  _ov.style.zIndex = '99999';
  _ov.style.background = 'rgba(0,0,0,0.55)';
  _ov.style.alignItems = 'flex-end';
  _ov.style.justifyContent = 'center';
}
function closeAdd() {
  var _ov = document.getElementById('add-overlay');
  _ov.className = 'overlay';
  _ov.style.display = 'none';
}

function saveCustomer() {
  var name = document.getElementById('add-name').value.trim();
  var phone = document.getElementById('add-phone').value.trim();
  if (!name || !phone) { alert('이름과 연락처는 필수입니다.'); return; }
  var arr = loadCustomers();
  if (editingCustomerName) {
    var matched = false;
    arr = arr.map(function(c) {
      // editingCustomerId가 있으면 정확히 그 레코드만, 없으면(예전 id없는 데이터) 이름 매칭 중 첫 건만 수정
      var isTarget = editingCustomerId ? (c.id === editingCustomerId) : (!matched && c.clientName === editingCustomerName);
      if (isTarget) {
        matched = true;
        var staffName2; if (currentUser && currentUser.role === 'staff') { staffName2 = currentUser.name; } else { var asb2 = document.querySelector('.staff-btn.active'); staffName2 = asb2 ? asb2.getAttribute('data-staff') : (c.staffName||'마스터'); }
        return Object.assign({}, c, { clientName:name, phone:phone, addr:document.getElementById('add-addr').value.trim(), space:document.getElementById('add-space').value.trim(), staffName:staffName2, stage:document.getElementById('add-stage').value, date:document.getElementById('add-date').value, measureDate:document.getElementById('add-measure').value, installDate:document.getElementById('add-install').value, memo:document.getElementById('add-memo').value.trim() });
      } return c;
    });
    saveCustomers(arr);
    var savedTarget = editingCustomerId ? arr.find(function(c){ return c.id === editingCustomerId; }) : arr.find(function(c){ return c.clientName === name; });
    if (savedTarget) saveCustomerToDb(savedTarget, null);
    closeAdd(); renderHome(true); openDetail(name, savedTarget && savedTarget.id); showToast('고객 정보가 수정됐습니다');
  } else {
    // 재구매 판단은 이름만으로 하지 않고 전화번호까지 같아야 "같은 사람"으로 봄.
    // 이름만 같고 전화번호가 다르면 동명이인일 가능성이 높으므로, 기존 사람을
    // 덮어쓰지 않고 명확히 안내한 뒤 완전히 별도의 새 레코드로 등록함.
    var samePersonExisting = arr.find(function(c) { return c.clientName === name && (c.phone||'').replace(/\D/g,'') === (phone||'').replace(/\D/g,''); });
    var sameNameDiffPhone = !samePersonExisting && arr.find(function(c) { return c.clientName === name; });
    if (samePersonExisting) {
      if (!confirm('"' + name + '"(' + phone + ') 고객이 이미 있습니다.\n재구매 고객으로 업데이트할까요?')) return;
    } else if (sameNameDiffPhone) {
      if (!confirm('"' + name + '" 이름의 다른 고객이 이미 있습니다(연락처: ' + (sameNameDiffPhone.phone||'미입력') + ').\n동명이인으로 보이는데, 별도의 새 고객으로 등록할까요?')) return;
    }
    var existing = samePersonExisting;
    var visitCount = existing ? (existing.visitCount||1)+1 : 1;
    if (existing) arr = arr.filter(function(c) { return !(c.clientName === name && (c.phone||'').replace(/\D/g,'') === (phone||'').replace(/\D/g,'')); });
    var staffName; if (currentUser && currentUser.role === 'staff') { staffName = currentUser.name; } else { var asb = document.querySelector('.staff-btn.active'); staffName = asb ? asb.getAttribute('data-staff') : '마스터'; }
    var newCustomer = { clientName:name, phone:phone, addr:document.getElementById('add-addr').value.trim(), space:document.getElementById('add-space').value.trim(), price:0, performanceRevenue:0, staffName:staffName, stage:document.getElementById('add-stage').value, date:document.getElementById('add-date').value, measureDate:document.getElementById('add-measure').value, installDate:document.getElementById('add-install').value, memo:document.getElementById('add-memo').value.trim(), visitCount:visitCount, createdAt:new Date().toISOString(), branch:'반포점' };
    arr.unshift(newCustomer); saveCustomers(arr);
    saveCustomerToDb(newCustomer, function(err, data) { if(!err && data && data[0]) { newCustomer.id = data[0].id; saveCustomers(arr); } });
    closeAdd(); renderHome(true); openDetail(name, newCustomer.id);
    showToast('고객이 추가됐습니다');
  }
}

function openEstimate(name) {
  if (name) { try { var arr = loadCustomers(); var c = arr.find(function(x) { return x.clientName === name; }); if (c) localStorage.setItem('dah_open_customer', JSON.stringify({
          name: c.clientName,
          phone: c.phone,
          addr: c.addr,
          staff: c.staffName || '',
          type: c.visitCount > 1 ? '재구매' : (c.stage === 'AS' ? 'AS' : '신규'),
          stage: c.stage || '상담',
          memo: c.memo || ''
        })); } catch(e) {} }
  window.location.href = 'dah-estimate.html';
}

var KAKAO_LABELS = {followup:'팔로업', contract:'계약금 안내', measure:'실측 안내', balance:'잔금 안내'};
function copyKakao(type) {
  var arr = loadCustomers(); var c = findCurrentDetailCustomer(arr);
  if (!c) return; var n = c.clientName;
  var msgs = {
    followup: '안녕하세요, ' + n + '님 🙂\n드로잉엣홈입니다.\n상담 후 궁금하신 점은 없으셨나요?\n편하게 말씀해 주세요!',
    contract: '안녕하세요, ' + n + '님 🙂\n드로잉엣홈입니다.\n계약금(50%)이 확인되면 실측 일정을 잡아드리겠습니다.',
    measure: '안녕하세요, ' + n + '님 🙂\n드로잉엣홈입니다.\n실측 방문 일정을 조율하고 싶습니다.\n편하신 날짜와 시간을 알려주세요!',
    balance: '안녕하세요, ' + n + '님 🙂\n드로잉엣홈입니다.\n잔금 납부가 완료되면 시공 일정이 확정됩니다. 감사합니다!'
  };
  var msg = msgs[type] || '';
  if (!confirm('발송할 메시지:\n\n' + msg + '\n\n복사하시겠습니까?')) return;
  try { var logs = JSON.parse(localStorage.getItem('dah_kakao_log') || '[]'); logs.unshift({ name: n, type: KAKAO_LABELS[type]||type, date: todayStr(), time: new Date().toLocaleTimeString() }); localStorage.setItem('dah_kakao_log', JSON.stringify(logs.slice(0,100))); } catch(e) {}
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(msg).then(function() { showToast('복사됐습니다 — 카카오톡에 붙여넣기 하세요'); renderKakaoLog(); }); } else { var ta = document.createElement('textarea'); ta.value = msg; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast('복사됐습니다 — 카카오톡에 붙여넣기 하세요'); renderKakaoLog(); } } catch(e) { showToast('복사 실패'); }
}

function renderKakaoLog() {
  var logEl = document.getElementById('kakao-log'); if (!logEl) return;
  try {
    var logs = JSON.parse(localStorage.getItem('dah_kakao_log') || '[]').filter(function(l) { return l.name === currentDetailName; });
    if (logs.length === 0) { logEl.textContent = '발송 이력 없음'; return; }
    logEl.innerHTML = '';
    logs.slice(0,3).forEach(function(l) {
      var methodBadge = l.method === '알림톡' ? ' [알림톡]' : ' [복사]';
      logEl.appendChild(div('font-size:11px;color:var(--dark);padding:3px 0;border-bottom:1px solid var(--border)', [span('', l.date + ' ' + l.time + ' — ' + l.type + methodBadge)]));
    });
  } catch(e) {}
}


var CONTRACT_LABELS = {pending:'가견적', contracted:'✅ 계약됨', rejected:'미계약'};
var STATUS_LABELS = {ga:'가견적서', final:'최종견적서'};

function renderEstimateHistory(container, clientName) {
  var estSec = el('div', {style:'margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)'});
  var hd = el('div', {style:'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px'});
  var lbl = el('div', {style:'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1px;text-transform:uppercase', text:'견적서'});
  hd.appendChild(lbl);
  estSec.appendChild(hd);

  var estimates = [];
  try {
    var all = JSON.parse(localStorage.getItem('dah_saved')||'[]');
    estimates = all.filter(function(e){ return e.clientName === clientName; });
  } catch(ex) {}

  if (estimates.length === 0) {
    var emptyEl = el('div', {style:'font-size:11px;color:var(--sub);padding:10px 0;text-align:center', text:'저장된 견적서 없음'});
    estSec.appendChild(emptyEl);
    container.appendChild(estSec);
    return;
  }

  estimates.forEach(function(e, ei) {
    var cs = e.contractStatus || 'pending';
    var isLast = ei === estimates.length - 1;
    var card = el('div', {style:
      'border:1px solid var(--border);border-radius:12px;padding:12px 14px;' +
      'margin-bottom:' + (isLast?'0':'8px') + ';background:#fff'
    });

    
    var top = el('div', {style:'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px'});
    var noEl = el('div', {style:'display:flex;align-items:center;gap:6px'});
    var noSpan = el('span', {style:'font-size:12px;font-weight:700;color:var(--dark)', text:e.no||'—'});
    var typeSpan = el('span', {style:
      'font-size:11px;color:#6B6B6B;border:1px solid var(--border);' +
      'padding:1px 6px;border-radius:var(--r-btn)',
      text: STATUS_LABELS[e.status]||'가견적서'
    });
    noEl.appendChild(noSpan); noEl.appendChild(typeSpan);
    if (e.confirmedAt) {
      var confirmedSpan = el('span', {style:'font-size:11px;font-weight:700;color:#fff;background:var(--dark);padding:1px 8px;border-radius:20px', text:'✓ 확정'});
      noEl.appendChild(confirmedSpan);
    }

    
    var contractBadge = el('button', {style:
      'font-size:12px;font-weight:700;border:none;cursor:pointer;' +
      'padding:3px 10px;border-radius:6px;font-family:inherit;' +
      'background:' + (cs==='contracted'?'var(--dark)':'var(--ivory1)') + ';' +
      'color:' + (cs==='contracted'?'#fff':'#6B6B6B'),
      text: CONTRACT_LABELS[cs]||'가견적'
    });
    var csArr = ['pending','contracted','rejected'];
    (function(entry, badge){
      badge.addEventListener('click', function(ev){
        ev.stopPropagation();
        var cur = entry.contractStatus || 'pending';
        var next = csArr[(csArr.indexOf(cur)+1)%csArr.length];
        entry.contractStatus = next;
        
        try {
          var arr = JSON.parse(localStorage.getItem('dah_saved')||'[]');
          var idx = arr.findIndex(function(x){ return x.id === entry.id || x.no === entry.no; });
          if (idx>=0) { arr[idx].contractStatus = next; localStorage.setItem('dah_saved', JSON.stringify(arr)); }
        } catch(ex2){}
        badge.textContent = CONTRACT_LABELS[next];
        badge.style.background = next==='contracted'?'var(--dark)':'var(--ivory1)';
        badge.style.color = next==='contracted'?'#fff':'#6B6B6B';
      });
    })(e, contractBadge);

    top.appendChild(noEl); top.appendChild(contractBadge);
    card.appendChild(top);

    
    var mid = el('div', {style:'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px'});
    var spaceEl = el('span', {style:'font-size:11px;color:var(--dark)', text:e.space||'—'});
    var priceEl = el('span', {style:'font-size:12px;font-weight:700;color:var(--dark)', text:(Number(e.price)||0).toLocaleString()+'원'});
    mid.appendChild(spaceEl); mid.appendChild(priceEl);
    card.appendChild(mid);

    
    if (e.fabric) {
      var fabEl = el('div', {style:'font-size:11px;color:var(--sub);margin-bottom:4px', text:'원단: ' + e.fabric});
      card.appendChild(fabEl);
    }

    
    var bot = el('div', {style:'font-size:11px;color:var(--sub)'});
    var dateStr = e.savedAt ? e.savedAt.slice(0,10) : (e.date||'');
    bot.textContent = dateStr + (e.staffName ? ' · ' + e.staffName : '');
    card.appendChild(bot);

    estSec.appendChild(card);
  });

  container.appendChild(estSec);
}
