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
    var rebuyBanner = div('background:#FFF3EE;border:1px solid var(--terra);border-radius:12px;padding:10px 14px;margin-bottom:var(--sp-3);display:flex;align-items:center;gap:var(--sp-2)', [
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
    var priceRow = div('margin-bottom:var(--sp-2)', [
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

    // 세부내용 보기 (2026-08-04 신규) — 저장된 품목 문자열("이름(금액원), 이름(금액원)...")을
    // 실제로 읽을 수 있는 목록으로 펼쳐서 보여줌. 예전엔 "공간"/"원단" 칸에 요약(또는
    // 지나치게 긴 원문)만 보이고 실제 항목별 내역을 확인할 방법이 없었음.
    var detailBtn = btn('width:100%;margin-top:6px;padding:9px 0;background:#fff;color:var(--dark);border:1px solid var(--border);border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer', '🔍 세부내용 보기', function(){
      showEstimateDetailPopup(e);
    });

    card.appendChild(top);
    card.appendChild(priceRow);
    card.appendChild(infoGrid);
    card.appendChild(dateRow);
    card.appendChild(actions);
    card.appendChild(detailBtn);
    estEl.appendChild(card);
  });

  // 새 견적 버튼
  var newEstBtn = btn('width:100%;padding:var(--sp-3);background:#F5F2EE;color:var(--dark);border:1px solid var(--border);border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:var(--sp-1)',
    '+ 새 견적서 작성', function(){ openEstimate(currentDetailName); });
  estEl.appendChild(newEstBtn);
}

function openDetail(name, id, forceTab) {
  var customers = loadCustomers();
  var c = id ? customers.find(function(x) { return x.id === id; }) : customers.find(function(x) { return x.clientName === name; });
  if (!c) {
    showToast('"' + (name||'') + '" 고객 정보를 찾을 수 없어요 (삭제되었거나 이름이 변경된 것 같아요)');
    return;
  }
  currentDetailName = c.clientName;
  currentDetailId = c.id || null;
  if (typeof logEvent === 'function') logEvent('detail_open', { stage: c.stage, tab: forceTab || 'info' });
  var isMaster = currentUser && currentUser.role === 'master';

  renderDetailHeader(c);

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

  
  renderDetailStageSection(c, body, isMaster);

  
  renderDetailTodoSection(c, body);

  renderPaySection(c, payBody);

  
  renderAlimSection(c, alimBody);

  // 고객 정보 섹션
  renderDetailInfoSection(c, body);

  renderEstimateHistory(body, c.clientName);

  
  body.appendChild(btn('width:100%;padding:var(--sp-3);background:var(--ivory1);color:var(--dark);border:1px solid var(--border);font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;border-radius:10px;margin-bottom:6px', '견적서 앱에서 열기', function(){ openEstimate(currentDetailName); }));
  renderOrderSection(c, orderBody);

  renderDetailBottomButtons(c, isMaster, body);

  document.getElementById('detail-overlay').className = 'overlay open';
  renderKakaoLog();
}


function renderDetailHeader(c) {
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
    ? '<a href="tel:' + c.phone.replace(/[^0-9]/g,'') + '" style="color:var(--dark);text-decoration:none;font-weight:500">' + escHtml(c.phone) + '</a>'
    : '<span style="color:var(--sub)">연락처 없음</span>';
  infoBar.innerHTML =
    '<span>' + phoneHtml + '</span>' +
    '<span style="color:var(--border)">|</span>' +
    '<span>' + escHtml(c.staffName || '마스터') + '</span>';

}

function renderDetailStageSection(c, body, isMaster) {
  var stageNum = STAGE_NUM[c.stage] || 1;
  var stageSec = div('margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)', []);

  // 되돌릴 대상이 없는 상태(완료/취소/노쇼)에서는 케밥 메뉴 자체를 숨김
  var canCancelOrNoshow = ['완료', '취소', '노쇼'].indexOf(c.stage) === -1;

  var kebabWrap = div('position:relative', []);
  if (canCancelOrNoshow) {
    var kebabBtn = btn('font-size:15px;color:var(--sub);background:none;border:none;padding:5px 8px;cursor:pointer;line-height:1;min-width:32px;min-height:32px;display:inline-flex;align-items:center;justify-content:center', '⋮', function(e){
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
    div('display:flex;align-items:center;gap:var(--sp-2)', [
      el('span', {style:'display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:var(--dark);color:#fff;font-size:12px;font-weight:700;flex-shrink:0', text:stageNum}),
      el('span', {style:'font-size:12px;font-weight:700;color:var(--dark);letter-spacing:-0.3px', text:c.stage + ' 단계'})
    ]),
    div('display:flex;align-items:center;gap:2px', [
      isMaster ? btn('font-size:11px;color:var(--dark);background:var(--ivory1);border:1px solid var(--border);padding:5px 10px;cursor:pointer;font-family:inherit;border-radius:10px;min-height:32px', '수정', function(){ closeDetail(); openAdd(c.clientName); }) : el('span',{}),
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

  var stageActionRow = div('display:flex;gap:var(--sp-2);align-items:center', []);
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

}

function renderDetailTodoSection(c, body) {
  var todoKeys = STAGE_ALIM[c.stage] || [];
  var manualKeys = todoKeys.filter(function(k){ return ALIM_META[k] && ALIM_META[k].tag === '수동'; });
  if (manualKeys.length > 0) {
    var todoSec = div('margin-bottom:14px;padding:var(--sp-3);background:var(--ivory1);border:1.5px solid var(--dark);border-radius:12px', []);
    todoSec.appendChild(el('div', {style:'font-size:12px;font-weight:700;color:var(--dark);letter-spacing:1.5px;margin-bottom:var(--sp-2)', text:'지금 해야 할 일'}));
    // 가장 급한 것 1개만 크게 보여주고, 나머지는 "N건 더 남음" 뒤에 접어둠(눌러야만 펼쳐짐)
    var firstKey = manualKeys[0];
    var firstMeta = ALIM_META[firstKey];
    var primaryBtn = btn('width:100%;padding:11px;background:var(--dark);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-bottom:6px', firstMeta.label + ' 발송하기', function(){ sendAlimtalk(firstKey); });
    todoSec.appendChild(primaryBtn);
    if (manualKeys.length > 1) {
      var moreRow = div('display:flex;align-items:center;justify-content:space-between', [
        el('span', {style:'font-size:11px;color:var(--sub)', text:(manualKeys.length-1)+'건 더 남음'}),
        btn('font-size:11px;color:var(--dark);background:none;border:1px solid var(--border);padding:4px 10px;border-radius:10px;cursor:pointer;font-family:inherit;min-height:32px', '전체 보기', function(){
          var wrap = document.getElementById('todo-rest');
          if (wrap) wrap.style.display = wrap.style.display === 'none' ? '' : 'none';
        })
      ]);
      todoSec.appendChild(moreRow);
      var restWrap = div('display:none;margin-top:var(--sp-2)', []);
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

}

function renderDetailInfoSection(c, body) {
  var infoSec = div('margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)', []);
  infoSec.appendChild(el('div', {style:'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px', text:'고객 정보'}));

  // 연락처/주소는 헤더에 항상 고정 표시되므로 여기선 생략 (중복 방지).
  // 단, 전화 클릭 기능은 정보바의 연락처 칸에서 그대로 사용 가능.

  // 메모 (2026-07-21: 읽기전용 표시 -> 탭하면 편집+빠른문구버튼 나오는 방식으로 개편.
  // 예전엔 메모를 실제로 입력/수정할 방법이 앱 어디에도 없었음 — 표시만 되고 편집 UI가 없었음)
  function renderMemoDisplay(memoBlock, val) {
    memoBlock.innerHTML = '';
    memoBlock.appendChild(el('div', {style:'font-size:11px;color:var(--terra);letter-spacing:0.8px;margin-bottom:3px', text:'메모 (탭해서 편집)'}));
    memoBlock.appendChild(el('div', {style:'font-size:11px;color:'+(val?'var(--dark)':'var(--light)')+';line-height:1.6', text: val || '메모를 추가하려면 눌러주세요'}));
  }
  var memoBlock = div('background:#FFFBF5;border:1px solid #FFE5CC;border-radius:12px;padding:10px 14px;margin-bottom:var(--sp-2);cursor:pointer', []);
  renderMemoDisplay(memoBlock, c.memo || '');
  memoBlock.addEventListener('click', function() {
    if (memoBlock.querySelector('textarea')) return; // 이미 편집중이면 무시
    memoBlock.innerHTML = '';
    memoBlock.appendChild(el('div', {style:'font-size:11px;color:var(--terra);letter-spacing:0.8px;margin-bottom:4px', text:'메모'}));
    var textarea = document.createElement('textarea');
    textarea.value = c.memo || '';
    textarea.style.cssText = 'width:100%;min-height:60px;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:12px;font-family:inherit;resize:vertical;box-sizing:border-box';
    memoBlock.appendChild(textarea);
    var quickWrap = div('display:flex;flex-wrap:wrap;gap:4px;margin-top:6px', []);
    (typeof getMempoPhrases === 'function' ? getMempoPhrases() : []).slice(0, 9).forEach(function(p) {
      var qbtn = el('button', {type: 'button', style: 'font-size:11px;padding:6px 10px;min-height:32px;background:var(--ivory1);border:1px solid var(--border);border-radius:20px;cursor:pointer;font-family:inherit'});
      qbtn.textContent = p;
      qbtn.addEventListener('click', function(e) {
        e.stopPropagation();
        textarea.value = textarea.value ? textarea.value + ' / ' + p : p;
        textarea.focus();
      });
      quickWrap.appendChild(qbtn);
    });
    memoBlock.appendChild(quickWrap);
    textarea.focus();
    textarea.addEventListener('blur', function() {
      var newVal = textarea.value.trim();
      var arr = loadCustomers();
      var target = findCurrentDetailCustomer(arr);
      if (target) {
        target.memo = newVal;
        saveCustomers(arr);
        saveCustomerToDb(target, null);
        showToast('메모가 저장됐습니다');
      }
      renderMemoDisplay(memoBlock, newVal);
    });
  });
  infoSec.appendChild(memoBlock);

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
      el('div',{style:'font-size:11px;color:var(--sub);letter-spacing:0.8px;margin-bottom:var(--sp-1)',text:item.label}),
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

}

function renderDetailBottomButtons(c, isMaster, body) {
  var bottomBtns = [btn('flex:2;padding:11px;background:var(--dark);color:#fff;border:none;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;border-radius:12px;letter-spacing:0.2px', '닫기', closeDetail)];
  if (isMaster) {
    if (isSoftDeleted(c)) {
      bottomBtns.unshift(btn('flex:1;padding:11px;background:#fff;border:1px solid var(--dark);font-size:11px;font-family:inherit;cursor:pointer;color:var(--dark);font-weight:700;border-radius:12px', '↩ 복구', function(){ restoreCustomer(c.clientName, c.id); }));
    } else {
      bottomBtns.unshift(btn('flex:1;padding:11px;background:#fff;border:1px solid var(--border);font-size:11px;font-family:inherit;cursor:pointer;color:var(--dark);border-radius:12px', '삭제', deleteCustomer));
    }
  }
  body.appendChild(div('display:flex;gap:var(--sp-2)', bottomBtns));

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

// 견적서 품목 문자열("이름(금액원), 이름(금액원)...")을 파싱해서 항목별
// 목록으로 보여주는 팝업 (2026-08-04 신규)
function parseEstimateItems(fabricStr) {
  if (!fabricStr) return [];
  return fabricStr.split(/,\s*(?=[^)]*(?:\(|$))/).map(function(part) {
    var m = part.trim().match(/^(.*)\(([\d,]+)원\)$/);
    if (m) return { name: m[1].trim() || '(이름없음)', amount: m[2] };
    return part.trim() ? { name: part.trim(), amount: null } : null;
  }).filter(Boolean);
}

function confirmEstimateToFinal(estId, clientName, price, clientId) {
  if (!confirm(clientName + '님의 이 견적을 "확정견적"으로 전환할까요?\n(계약이 성사된 게 맞을 때만 눌러주세요)')) return;
  var btn = document.getElementById('est-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }
  sbXHR('PATCH', 'estimates?id=eq.' + estId, { estimate_status: 'final', performance_revenue: price, confirmed_at: new Date().toISOString() }, function(err) {
    if (err) { showToast('전환 실패 — 다시 시도해주세요'); if (btn) { btn.disabled = false; btn.textContent = '확정견적으로 전환'; } return; }
    // 로컬 캐시도 즉시 반영
    try {
      var saved = JSON.parse(localStorage.getItem('dah_saved') || '[]');
      var idx = saved.findIndex(function(s){ return s.id === estId; });
      if (idx >= 0) { saved[idx].status = 'final'; saved[idx].performanceRevenue = price; saved[idx].contractStatus = 'contracted'; }
      localStorage.setItem('dah_saved', JSON.stringify(saved));
    } catch(e) {}
    // 연결된 고객의 실적도 동기화 (2026-08-04 신규) — 견적만 확정되고
    // 고객 레코드의 price/performance_revenue는 그대로 0으로 남으면
    // 매출탭 계산에 안 잡히는 문제가 있었음
    if (clientId) {
      sbXHR('PATCH', 'customers?id=eq.' + clientId, { price: price, performance_revenue: price }, function(){});
      try {
        var custs = JSON.parse(localStorage.getItem('dah_customers') || '[]');
        var cIdx = custs.findIndex(function(c){ return c.id === clientId; });
        if (cIdx >= 0) { custs[cIdx].price = price; custs[cIdx].performanceRevenue = price; }
        localStorage.setItem('dah_customers', JSON.stringify(custs));
      } catch(e) {}
    }
    showToast('확정견적으로 전환됐습니다 ✅');
    document.getElementById('est-detail-popup')?.remove();
    if (typeof loadEstimatesAsync === 'function') loadEstimatesAsync(renderEstList, true);
    if (typeof openDetail === 'function' && currentDetailName) openDetail(currentDetailName, currentDetailId, 'est');
  });
}

function showEstimateDetailPopup(e) {
  var existing = document.getElementById('est-detail-popup');
  if (existing) existing.remove();

  var items = parseEstimateItems(e.fabric);
  var rowsHtml = items.length > 0
    ? items.map(function(it) {
        return '<tr>' +
          '<td style="padding:10px 12px;border-bottom:1px solid #EEE6DC;font-size:12px;color:#282828">' + escHtml(it.name) + '</td>' +
          '<td style="padding:10px 12px;border-bottom:1px solid #EEE6DC;font-size:12px;color:#282828;text-align:right;white-space:nowrap">' + (it.amount ? it.amount + '원' : '—') + '</td>' +
          '</tr>';
      }).join('')
    : '<tr><td colspan="2" style="padding:30px 0;text-align:center;color:#B0A99F;font-size:12px">세부 항목 정보가 없어요</td></tr>';

  var statusLabel = e.status === 'final' ? '최종 견적서' : '가견적서';
  var dateLabel = e.date ? e.date.replace(/-/g, '.') : '—';
  // 가견적 → 확정견적 전환 (2026-08-04 신규) — 이관된 가견적은 세부 항목을
  // 다시 편집할 방법이 없으므로(원본에 커튼/블라인드 낱개 입력데이터가 없음),
  // "계약 성사됨"만 표시할 수 있게 상태 전환만 지원. 진짜 내용을 고쳐야 하면
  // 새 견적서를 작성해야 함(하단 "새 견적서 작성" 버튼).
  var confirmBtnHtml = (e.status !== 'final' && e.id)
    ? '<div style="padding:0 28px 20px">' +
        '<button id="est-confirm-btn" data-est-id="' + escHtml(String(e.id)) + '" data-est-price="' + (Number(e.price)||0) + '" data-est-client-id="' + escHtml(String(e.clientId||'')) + '" ' +
        'style="width:100%;padding:12px;background:#282828;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer">확정견적으로 전환</button>' +
        '<div style="font-size:10px;color:#B0A99F;text-align:center;margin-top:6px">세부 품목을 고치려면 새 견적서를 작성해야 해요</div>' +
      '</div>'
    : '';

  var hasVendorItems = (e.lineItems || []).some(function(it){ return it.vendor; });
  var vendorBtnHtml = hasVendorItems
    ? '<div style="padding:0 28px 20px"><button id="est-vendor-btn" style="width:100%;padding:11px;background:#fff;color:#282828;border:1px solid #E5DDD5;border-radius:10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer">📋 발주서 다시 보기</button></div>'
    : '';
  var hasLineItems = (e.lineItems || []).length > 0;
  var requestBtnHtml = hasLineItems
    ? '<div style="padding:0 28px 20px;display:flex;gap:8px">' +
        '<button id="est-measure-req-btn" style="flex:1;padding:11px;background:#fff;color:#282828;border:1px solid #E5DDD5;border-radius:10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer">📐 실측의뢰서</button>' +
        '<button id="est-install-req-btn" style="flex:1;padding:11px;background:#fff;color:#282828;border:1px solid #E5DDD5;border-radius:10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer">🔧 시공의뢰서</button>' +
      '</div>'
    : '';

  var overlay = document.createElement('div');
  overlay.id = 'est-detail-popup';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML =
    '<div id="est-detail-doc" style="background:#fff;border-radius:12px;max-width:480px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.2)">' +
      // 문서 헤더 — 실제 견적서와 같은 톤(로고/문서유형/닫기)
      '<div style="padding:24px 28px 16px;border-bottom:2px solid #282828;display:flex;justify-content:space-between;align-items:flex-start">' +
        '<div>' +
          '<div style="font-size:11px;letter-spacing:2px;color:#B0A99F;margin-bottom:4px">DRAWING at HOME</div>' +
          '<div style="font-size:17px;font-weight:800;color:#282828">' + statusLabel + '</div>' +
        '</div>' +
        '<button onclick="document.getElementById(\'est-detail-popup\').remove()" style="border:none;background:transparent;font-size:20px;cursor:pointer;color:#B0A99F;line-height:1;padding:4px">×</button>' +
      '</div>' +
      // 고객/견적 정보
      '<div style="padding:16px 28px;background:#FAF7F5;display:grid;grid-template-columns:1fr 1fr;gap:10px 16px">' +
        '<div><div style="font-size:10px;color:#B0A99F;margin-bottom:2px">고객명</div><div style="font-size:13px;font-weight:700;color:#282828">' + escHtml(e.clientName||'—') + '</div></div>' +
        '<div><div style="font-size:10px;color:#B0A99F;margin-bottom:2px">견적일자</div><div style="font-size:13px;font-weight:700;color:#282828">' + dateLabel + '</div></div>' +
        '<div><div style="font-size:10px;color:#B0A99F;margin-bottom:2px">담당자</div><div style="font-size:13px;font-weight:700;color:#282828">' + escHtml(e.staffName||'—') + '</div></div>' +
        '<div><div style="font-size:10px;color:#B0A99F;margin-bottom:2px">공간</div><div style="font-size:13px;font-weight:700;color:#282828">' + escHtml(e.space||'—') + '</div></div>' +
      '</div>' +
      // 품목 표
      '<div style="padding:20px 28px 0">' +
        '<table style="width:100%;border-collapse:collapse">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:8px 12px;font-size:11px;color:#B0A99F;border-bottom:1.5px solid #282828">품목</th>' +
            '<th style="text-align:right;padding:8px 12px;font-size:11px;color:#B0A99F;border-bottom:1.5px solid #282828">금액</th>' +
          '</tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
      '</div>' +
      // 합계
      '<div style="padding:16px 28px 24px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:2px solid #282828">' +
          '<span style="font-size:13px;font-weight:700;color:#282828">합계</span>' +
          '<span style="font-size:19px;font-weight:900;color:#282828">' + (Number(e.price)||0).toLocaleString() + '원</span>' +
        '</div>' +
      '</div>' +
      confirmBtnHtml +
      vendorBtnHtml +
      requestBtnHtml +
    '</div>';
  overlay.addEventListener('click', function(ev){ if (ev.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  var confirmBtnEl = document.getElementById('est-confirm-btn');
  if (confirmBtnEl) {
    confirmBtnEl.addEventListener('click', function() {
      confirmEstimateToFinal(confirmBtnEl.getAttribute('data-est-id'), e.clientName || '', Number(confirmBtnEl.getAttribute('data-est-price')) || 0, confirmBtnEl.getAttribute('data-est-client-id') || null);
    });
  }
  var vendorBtnEl = document.getElementById('est-vendor-btn');
  if (vendorBtnEl) {
    vendorBtnEl.addEventListener('click', function() { showVendorOrderFromEstimate(e); });
  }
  var measureReqBtnEl = document.getElementById('est-measure-req-btn');
  if (measureReqBtnEl) {
    measureReqBtnEl.addEventListener('click', function() { showRequestFromEstimate('measure', e); });
  }
  var installReqBtnEl = document.getElementById('est-install-req-btn');
  if (installReqBtnEl) {
    installReqBtnEl.addEventListener('click', function() { showRequestFromEstimate('install', e); });
  }
}

// 저장된 견적 세부데이터(lineItems)로 발주서를 다시 만드는 기능 (2026-08-04 신규)
// — 예전엔 견적서 저장 후엔 사이즈/원단/거래처 정보가 사라져서 발주서를
// 다시 만들 방법이 전혀 없었음. 지금부터 저장되는 견적서는 lineItems에
// 이 정보가 남아있으므로, 그걸로 발주서를 재구성할 수 있음.
function buildVendorOrderFromLineItems(lineItems, clientName, staffName) {
  var withVendor = (lineItems || []).filter(function(it){ return it.vendor; });
  if (withVendor.length === 0) return null;
  var groups = {};
  withVendor.forEach(function(it) {
    var key = it.vendor;
    if (!groups[key]) groups[key] = [];
    var size = it.type === 'curtain' ? (it.mw && it.mh ? it.mw+'×'+it.mh : '—') : (it.bmw && it.bmh ? it.bmw+'×'+it.bmh : '—');
    var content = it.type === 'curtain'
      ? [(it.pleatType||'').replace('형',''), (it.openType||'').replace('형','')].filter(Boolean).join(' ')
      : (it.handle ? it.handle+'잡이' : '—');
    groups[key].push({ space: it.space||'—', product: it.fabric||it.displayName||'—', color: it.color||'—', size: size, content: content||'—' });
  });
  var today = new Date();
  var todayStr = today.getFullYear()+'년 '+(today.getMonth()+1)+'월 '+today.getDate()+'일';
  var out = '';
  Object.keys(groups).forEach(function(vendor, i) {
    out += '<div style="' + (i>0 ? 'page-break-before:always;margin-top:40px;' : '') + 'max-width:720px;margin:0 auto;background:#fff;padding:36px 32px;font-family:inherit">';
    out += '<div style="text-align:center;margin-bottom:6px"><div style="font-size:22px;font-weight:700;letter-spacing:1.5px;color:#282828">DRAWING at HOME</div><div style="font-size:11px;color:#B0A99F;letter-spacing:3px;margin-top:6px">발 주 서</div></div>';
    out += '<div style="display:flex;gap:24px;margin-top:24px;padding-top:16px;border-top:1px solid #282828;font-size:13px">' +
      '<div style="flex:1"><div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:#8E8078">요청일</span><strong>'+todayStr+'</strong></div>' +
      '<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:#8E8078">업체명</span><strong>드로잉엣홈</strong></div>' +
      '<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:#8E8078">담당자</span><strong>'+escHtml(staffName||'—')+'</strong></div></div>' +
      '<div style="flex:1"><div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:#8E8078">받는곳</span><strong>'+escHtml(vendor)+'</strong></div></div></div>';
    out += '<div style="margin-top:20px;padding:8px 14px;background:#F5F2EE;font-size:13px;font-weight:700;color:#282828">거래처: '+escHtml(vendor)+'</div>';
    out += '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="border-bottom:1.5px solid #282828;background:#FAF7F5">' +
      '<th style="text-align:left;padding:8px 6px">위치</th><th style="text-align:left;padding:8px 6px">품명</th>' +
      '<th style="text-align:left;padding:8px 6px">컬러</th><th style="text-align:center;padding:8px 6px">사이즈</th>' +
      '<th style="text-align:left;padding:8px 6px">내용</th><th style="text-align:left;padding:8px 6px">고객명</th></tr></thead><tbody>';
    groups[vendor].forEach(function(it){
      out += '<tr style="border-bottom:1px solid #EEE6DC"><td style="padding:8px 6px">'+escHtml(it.space)+'</td>' +
        '<td style="padding:8px 6px">'+escHtml(it.product)+'</td><td style="padding:8px 6px">'+escHtml(it.color)+'</td>' +
        '<td style="padding:8px 6px;text-align:center">'+escHtml(it.size)+'</td><td style="padding:8px 6px">'+escHtml(it.content)+'</td>' +
        '<td style="padding:8px 6px;font-weight:700;color:#E4483A">'+escHtml(clientName||'—')+'</td></tr>';
    });
    out += '</tbody></table></div>';
  });
  return out;
}

// 저장된 lineItems로 실측/시공 의뢰서를 재생성 (2026-08-04 신규, 발주서와 같은 원리)
function buildRequestFromLineItems(kind, e) {
  var label = kind === 'measure' ? '실측' : '시공';
  var dateVal = kind === 'measure' ? e.date : e.installDate;
  function infoRow(l, v) {
    return '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px">' +
      '<span style="color:#8E8078">' + l + '</span><strong style="color:#282828;text-align:right">' + escHtml(v||'—') + '</strong></div>';
  }
  var out = '<div style="max-width:720px;margin:0 auto;background:#fff;padding:36px 32px;font-family:inherit">';
  out += '<div style="text-align:center;margin-bottom:6px"><div style="font-size:22px;font-weight:700;letter-spacing:1.5px;color:#282828">DRAWING at HOME</div>' +
    '<div style="font-size:11px;color:#B0A99F;letter-spacing:3px;margin-top:6px">' + label + ' 의 뢰 서</div></div>';
  out += '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #282828;font-size:13px">' +
    infoRow(label+'일', dateVal||'미정') + infoRow('고객명', e.clientName) + infoRow('연락처', e.phone) + infoRow('담당자', e.staffName) + '</div>';
  out += '<div style="margin-top:14px;padding:8px 0;background:#F5F2EE;text-align:center;font-size:12px;font-weight:700;color:#282828">내 용</div>';

  var items = e.lineItems || [];
  if (kind === 'measure') {
    var lines = items.map(function(it) {
      return (it.space||'—') + ' : ' + (it.type === 'curtain' ? '커튼 1조' : (it.kind||'블라인드'));
    });
    out += lines.length
      ? '<div style="padding:20px 10px;text-align:center">' + lines.map(function(t,i){ return '<div style="font-size:13px;color:#282828;padding:8px 0">'+(i+1)+'. '+escHtml(t)+'</div>'; }).join('') + '</div>'
      : '<div style="padding:30px 0;text-align:center;color:#B0A99F;font-size:12px">저장된 세부 항목이 없어요</div>';
  } else {
    out += '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="border-bottom:1.5px solid #282828;background:#FAF7F5">' +
      '<th style="text-align:left;padding:8px 6px">위치</th><th style="text-align:center;padding:8px 6px">사이즈</th>' +
      '<th style="text-align:left;padding:8px 6px">내용</th><th style="text-align:left;padding:8px 6px">거래처</th></tr></thead><tbody>';
    items.forEach(function(it) {
      var size = it.type === 'curtain' ? (it.mw && it.mh ? it.mw+'×'+it.mh : '—') : (it.bmw && it.bmh ? it.bmw+'×'+it.bmh : '—');
      var content = it.type === 'curtain' ? [(it.pleatType||'').replace('형',''),(it.openType||'').replace('형','')].filter(Boolean).join(' ') : (it.handle ? it.handle+'잡이' : '—');
      out += '<tr style="border-bottom:1px solid #EEE6DC"><td style="padding:8px 6px">'+escHtml(it.space||'—')+'</td>' +
        '<td style="padding:8px 6px;text-align:center">'+escHtml(size)+'</td><td style="padding:8px 6px">'+escHtml(content||'—')+'</td>' +
        '<td style="padding:8px 6px">'+escHtml(it.vendor||'—')+'</td></tr>';
    });
    out += '</tbody></table>';
  }
  out += '</div>';
  return out;
}

function showRequestFromEstimate(kind, e) {
  if (!e.lineItems || e.lineItems.length === 0) { showToast('이 견적엔 저장된 세부 항목이 없어요'); return; }
  var html = buildRequestFromLineItems(kind, e);
  var w = window.open('', '_blank');
  var label = kind === 'measure' ? '실측의뢰서' : '시공의뢰서';
  w.document.write('<html><head><title>' + label + ' - ' + escHtml(e.clientName||'') + '</title></head><body style="margin:0;background:#f5f5f5;padding:20px">' + html + '</body></html>');
  w.document.close();
}

function showVendorOrderFromEstimate(e) {
  var html = buildVendorOrderFromLineItems(e.lineItems, e.clientName, e.staffName);
  if (!html) { showToast('이 견적엔 거래처가 입력된 항목이 없어요'); return; }
  var w = window.open('', '_blank');
  w.document.write('<html><head><title>발주서 - ' + escHtml(e.clientName||'') + '</title></head><body style="margin:0;background:#f5f5f5;padding:20px">' + html + '</body></html>');
  w.document.close();
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

    
    var top = el('div', {style:'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-2)'});
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
      'padding:3px 10px;border-radius:6px;font-family:inherit;min-height:32px;' +
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
      var fabEl = el('div', {style:'font-size:11px;color:var(--sub);margin-bottom:var(--sp-1)', text:'원단: ' + e.fabric});
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
