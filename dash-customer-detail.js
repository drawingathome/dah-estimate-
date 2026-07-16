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
  t01_reservation:    {label:'1. 예약확인',           desc:'수동 · 예약 즉시',         tag:'수동'},
  t02_reminder:       {label:'2. 방문 1일 전 리마인더',desc:'자동 · 방문일 D-1',        tag:'자동'},
  t03_estimate:       {label:'3. 가견적서 발송',       desc:'수동 · 상담 당일',         tag:'수동'},
  t31_deposit:        {label:'3-1. 계약금 결제 요청',  desc:'수동 · 가견적서 발송 후',  tag:'수동'},
  t04_followup:       {label:'4. 팔로업',             desc:'알림 · 상담 2일 후',        tag:'알림'},
  t05_measure_confirm:{label:'5. 실측 일정 확정',      desc:'수동 · 계약금 납부 후',    tag:'수동'},
  t06_measure_dday:   {label:'6. 실측 하루 전 안내',   desc:'알림 · 실측일 D-1',        tag:'알림'},
  t07_final_estimate: {label:'7. 확정견적서 발송',     desc:'수동 · 실측 완료 후',      tag:'수동'},
  t71_balance_request:{label:'7-1. 잔금 결제 요청',    desc:'수동 · 확정견적서 확인 후',tag:'수동'},
  t08_balance_remind: {label:'8. 잔금 리마인드',       desc:'알림 · 미납 2일 후',       tag:'알림'},
  t09_order_confirm:  {label:'9. 발주 확정+제작 안내', desc:'수동 · 잔금 완납 후',      tag:'수동'},
  t10_install_confirm:{label:'10. 시공 일정 확정',     desc:'수동 · 제작 완료 후',      tag:'수동'},
  t11_install_dday:   {label:'11. 시공 전날 안내',     desc:'알림 · 시공일 D-1',        tag:'알림'},
  t12_after_install:  {label:'12. 시공 후 안부',       desc:'자동 · 시공일 D+3',        tag:'자동'},
  t13_cancel:         {label:'13. 취소 안내',          desc:'선택 · 취소 시',           tag:'선택'},
  t14_noshow:         {label:'14. 노쇼 재예약 안내',   desc:'선택 · 노쇼 처리 후',      tag:'선택'}
};

var STAGE_COLORS = {상담:'#282828',계약금:'#F06E2D',실측:'#A67C52',잔금:'#2E7D6B',시공:'#C0392B',완료:'var(--light)'};
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
  var c = arr.find(function(x){ return x.clientName === currentDetailName; });
  if (!c) return;
  var meta = ALIM_META[key]; if (!meta) return;
  if (!confirm('['+meta.label+'] 알림톡을 발송할까요?')) return;

  
  try {
    var logs = JSON.parse(localStorage.getItem('dah_kakao_log')||'[]');
    var now = new Date();
    logs.unshift({
      name: c.clientName,
      type: key,
      label: meta.label,
      date: (now.getMonth()+1)+'월 '+now.getDate()+'일',
      time: now.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}),
      method: meta.tag
    });
    localStorage.setItem('dah_kakao_log', JSON.stringify(logs.slice(0,200)));
  } catch(e){}

  alert('['+meta.label+'] 발송 완료\n\n※ 실제 발송은 Make.com 연동 후 자동화됩니다.\n지금은 발송 이력만 기록됩니다.');
  closeDetail(); openDetail(c.clientName, c.id);
}

function switchDetailTab(tab) {
  var bodyEl  = document.getElementById('detail-body');
  var estEl   = document.getElementById('detail-est-body');
  var tabInfo = document.getElementById('dtab-info');
  var tabEst  = document.getElementById('dtab-est');
  if (!bodyEl || !estEl) return;
  if (tab === 'info') {
    bodyEl.style.display = ''; estEl.style.display = 'none';
    if (tabInfo) { tabInfo.style.borderBottom='2px solid #282828'; tabInfo.style.color='#282828'; tabInfo.style.fontWeight='700'; }
    if (tabEst)  { tabEst.style.borderBottom='2px solid transparent'; tabEst.style.color='var(--light)'; tabEst.style.fontWeight='600'; }
  } else {
    bodyEl.style.display = 'none'; estEl.style.display = '';
    if (tabInfo) { tabInfo.style.borderBottom='2px solid transparent'; tabInfo.style.color='var(--light)'; tabInfo.style.fontWeight='600'; }
    if (tabEst)  { tabEst.style.borderBottom='2px solid #282828'; tabEst.style.color='#282828'; tabEst.style.fontWeight='700'; }
    // 견적 이력 렌더
    renderDetailEstTab();
  }
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
      '<button onclick="openEstimate(\''+currentDetailName+'\')" style="margin-top:14px;padding:10px 20px;background:#282828;color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer">+ 견적서 작성하기</button></div>';
    return;
  }

  var CONTRACT_KO    = {pending:'가견적', contracted:'✅ 계약됨', rejected:'미계약'};
  var CONTRACT_BG    = {pending:'#F5F2EE', contracted:'#EEF5F2', rejected:'#FDECEA'};
  var CONTRACT_COLOR = {pending:'#9A9490', contracted:'#2E7D6B', rejected:'#C0392B'};
  var STATUS_KO      = {ga:'가견적서', final:'최종견적서'};

  // 재구매 여부 - 계약된 견적이 2개 이상이면 재구매
  var contractedCount = ests.filter(function(e){ return e.contractStatus === 'contracted'; }).length;
  if (contractedCount > 1) {
    var rebuyBanner = div('background:#FFF3EE;border:1px solid #F06E2D;border-radius:12px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:8px', [
      el('span', {style:'font-size:11px', text:'🔄'}),
      el('span', {style:'font-size:12px;font-weight:700;color:#F06E2D', text:'재구매 고객 — 계약 '+contractedCount+'회'})
    ]);
    estEl.appendChild(rebuyBanner);
  }

  ests.forEach(function(e, i) {
    var cs = e.contractStatus || 'pending';
    var isFinal = e.status === 'final';
    var isContracted = cs === 'contracted';

    var card = div(
      'border:1px solid '+(isContracted?'#B0D4B0':'#EEE6DC')+';border-radius:12px;padding:14px;margin-bottom:10px;' +
      'background:'+(isContracted?'#FAFFF9':'#fff'),
      []
    );

    // 순번 표시 (최신순)
    var orderBadge = el('span', {style:'font-size:11px;color:#9A9490', text: (i+1)+'번째 견적'});

    // 상단: 번호 + 유형 + 계약상태 + 확정여부
    var topItems = [
      orderBadge,
      el('span', {style:'font-size:11px;font-weight:800;color:#282828', text: e.no||'—'}),
      el('span', {style:'font-size:12px;font-weight:700;padding:2px 6px;border-radius:4px;background:'+(isFinal?'#282828':'#F5F2EE')+';color:'+(isFinal?'#fff':'#9A9490'), text: STATUS_KO[e.status]||'가견적서'})
    ];
    if (e.confirmedAt) {
      topItems.push(el('span', {style:'font-size:11px;font-weight:700;color:#fff;background:#282828;padding:2px 8px;border-radius:20px', text:'✓ 확정'}));
    }
    topItems.push(el('span', {style:'margin-left:auto;font-size:12px;font-weight:700;padding:3px 9px;border-radius:4px;background:'+CONTRACT_BG[cs]+';color:'+CONTRACT_COLOR[cs], text: CONTRACT_KO[cs]}));
    var top = div('display:flex;align-items:center;gap:6px;margin-bottom:10px', topItems);

    // 금액 크게
    var priceRow = div('margin-bottom:8px', [
      el('div', {style:'font-size:22px;font-weight:900;color:#282828;letter-spacing:-1px', text: (Number(e.price)||0).toLocaleString()+'원'}),
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
        el('div', {style:'font-size:11px;color:#9A9490;margin-bottom:2px', text:item.label}),
        el('div', {style:'font-size:12px;font-weight:700;color:#282828;white-space:nowrap;overflow:hidden;text-overflow:ellipsis', text:item.value})
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
    var openBtn = btn('flex:1;padding:9px 0;background:#282828;color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer', '📄 견적서 앱', function(){
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
  var newEstBtn = btn('width:100%;padding:12px;background:#F5F2EE;color:#282828;border:1px solid #EEE6DC;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:4px',
    '+ 새 견적서 작성', function(){ openEstimate(currentDetailName); });
  estEl.appendChild(newEstBtn);
}

function openDetail(name, id) {
  var customers = loadCustomers();
  var c = id ? customers.find(function(x) { return x.id === id; }) : customers.find(function(x) { return x.clientName === name; });
  if (!c) return;
  currentDetailName = c.clientName;
  currentDetailId = c.id || null;
  var isMaster = currentUser && currentUser.role === 'master';

  // 이름
  var _dn=document.getElementById('detail-name'); if(_dn) _dn.textContent = c.clientName;

  // 요약 row: 단계뱃지 + 재구매 + 경과일
  var summaryRow = document.getElementById('detail-summary-row');
  if(!summaryRow) return;
  summaryRow.innerHTML = '';
  var stageBadge = document.createElement('span');
  stageBadge.textContent = c.stage;
  stageBadge.style.cssText = 'font-size:12px;font-weight:700;padding:3px 9px;border-radius:4px;color:#fff;background:' + (STAGE_COLORS[c.stage]||'#282828');
  summaryRow.appendChild(stageBadge);
  if (c.visitCount > 1) {
    var reBadge = document.createElement('span');
    reBadge.textContent = '재구매 '+c.visitCount+'회';
    reBadge.style.cssText = 'font-size:12px;font-weight:700;padding:3px 8px;border-radius:4px;background:#FAF7F5;color:#F06E2D;border:1px solid #EEE6DC';
    summaryRow.appendChild(reBadge);
  }
  if (c.date) {
    var diff = daysDiff(c.date);
    var diffBadge = document.createElement('span');
    diffBadge.textContent = diff === 0 ? '오늘 상담' : diff > 0 ? diff+'일 경과' : Math.abs(diff)+'일 후';
    diffBadge.style.cssText = 'font-size:11px;color:#9A9490';
    summaryRow.appendChild(diffBadge);
  }

  // 핵심 정보 3칸 요약
  var infoBar = document.getElementById('detail-info-bar');
  infoBar.innerHTML = '';
  var infoItems = [
    {label:'견적금액', value: c.price ? fmt(c.price) : '—'},
    {label:'공간',     value: c.space || '—'},
    {label:'담당자',   value: c.staffName || '마스터'}
  ];
  infoItems.forEach(function(item) {
    var cell = document.createElement('div');
    cell.style.cssText = 'background:#FAF7F5;padding:10px 12px;text-align:center';
    cell.innerHTML = '<div style="font-size:11px;color:#9A9490;letter-spacing:0.8px;margin-bottom:4px">' + item.label + '</div>' +
                     '<div style="font-size:12px;font-weight:700;color:#282828;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + item.value + '</div>';
    infoBar.appendChild(cell);
  });

  var body = document.getElementById('detail-body');
  body.innerHTML = '';
  // 탭 초기화
  var estBodyEl = document.getElementById('detail-est-body');
  if (estBodyEl) { estBodyEl.innerHTML = ''; estBodyEl.style.display = 'none'; }
  switchDetailTab('info');
  // 견적 건수 배지
  var all = []; try { all = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e) {}
  var estCnt = all.filter(function(e){ return e.clientName === c.clientName; }).length;
  var cntEl = document.getElementById('dtab-est-cnt');
  if (cntEl) cntEl.textContent = estCnt > 0 ? estCnt+'건' : '';

  
  var stageNum = STAGE_NUM[c.stage] || 1;
  var stageSec = div('margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #EEE6DC', []);
  var stageTop = div('display:flex;justify-content:space-between;align-items:center;margin-bottom:10px', [
    div('display:flex;align-items:center;gap:8px', [
      el('span', {style:'display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#282828;color:#fff;font-size:12px;font-weight:700;flex-shrink:0', text:stageNum}),
      el('span', {style:'font-size:12px;font-weight:700;color:#282828;letter-spacing:-0.3px', text:c.stage + ' 단계'})
    ]),
    isMaster ? btn('font-size:11px;color:#282828;background:#FAF7F5;border:1px solid #EEE6DC;padding:5px 10px;cursor:pointer;font-family:inherit;border-radius:4px', '✏️ 수정', function(){ closeDetail(); openAdd(c.clientName); }) : el('span',{})
  ]);
  stageSec.appendChild(stageTop);

  
  var progressBar = div('display:flex;gap:3px;margin-bottom:10px', []);
  STAGES.forEach(function(s) {
    var done = STAGE_NUM[s] <= STAGE_NUM[c.stage];
    var cur  = s === c.stage;
    var seg  = div(
      'flex:1;height:3px;border-radius:2px;background:'+(done?'#282828':'#EEE6DC'),[]
    );
    progressBar.appendChild(seg);
  });
  stageSec.appendChild(progressBar);

  
  var stageBar = div('display:flex;flex-wrap:wrap;gap:6px', []);
  STAGES.forEach(function(s) {
    var on = s === c.stage;
    var num = STAGE_NUM[s] || 1;
    var pill = btn(
      'padding:5px 11px;border:1px solid '+(on?'#282828':'#EEE6DC')+';'+
      'background:'+(on?'#282828':'#fff')+';color:'+(on?'#fff':'#6B6B6B')+';'+
      'font-size:11px;font-weight:'+(on?'700':'400')+';font-family:inherit;cursor:pointer;border-radius:4px',
      num+'. '+s, function(){ changeStage(s); }
    );
    stageBar.appendChild(pill);
  });

  
  var extraBtns = div('display:flex;gap:6px;margin-top:6px', []);
  var cancelBtn = btn('flex:1;padding:6px;border:1px solid #EEE6DC;background:#fff;font-size:11px;color:#6B6B6B;font-family:inherit;cursor:pointer;border-radius:4px','취소 처리', function(){
    if(confirm(c.clientName+'님을 취소 처리할까요? 자동 발송이 중단됩니다.')) {
      changeStage('취소'); closeDetail();
    }
  });
  var noshowBtn = btn('flex:1;padding:6px;border:1px solid #EEE6DC;background:#fff;font-size:11px;color:#6B6B6B;font-family:inherit;cursor:pointer;border-radius:4px','노쇼 처리', function(){
    if(confirm(c.clientName+'님을 노쇼 처리할까요?')) {
      changeStage('노쇼'); closeDetail();
    }
  });
  extraBtns.appendChild(cancelBtn);
  extraBtns.appendChild(noshowBtn);
  stageSec.appendChild(stageBar);
  stageSec.appendChild(extraBtns);
  body.appendChild(stageSec);

  
  var todoKeys = STAGE_ALIM[c.stage] || [];
  var manualKeys = todoKeys.filter(function(k){ return ALIM_META[k] && ALIM_META[k].tag === '수동'; });
  if (manualKeys.length > 0) {
    var todoSec = div('margin-bottom:14px;padding:12px;background:#FAF7F5;border:1.5px solid #282828;border-radius:12px', []);
    todoSec.appendChild(el('div', {style:'font-size:12px;font-weight:700;color:#282828;letter-spacing:1.5px;margin-bottom:8px', text:'지금 해야 할 일'}));
    manualKeys.forEach(function(key) {
      var meta = ALIM_META[key]; if(!meta) return;
      var row = div('display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#fff;border:1px solid #EEE6DC;border-radius:4px;margin-bottom:5px', [
        div('', [
          el('span', {style:'font-size:12px;font-weight:700;color:#282828;display:block', text:meta.label}),
          el('span', {style:'font-size:11px;color:var(--sub)', text:meta.desc})
        ]),
        el('span', {style:'font-size:12px;font-weight:600;color:#282828;background:#fff;border:1px solid #282828;padding:5px 12px;border-radius:12px;flex-shrink:0', text:'발송'})
      ]);
      (function(k){ row.addEventListener('click', function(){ sendAlimtalk(k); }); })(key);
      todoSec.appendChild(row);
    });
    body.appendChild(todoSec);
  }

  // 결제 관리 섹션 - customers 객체 직접 사용 (localStorage 병행)
  var payData = {
    depositAmount:  c.depositAmount  || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').depositAmount||0; }catch(e){return 0;} })(),
    depositDate:    c.depositDate    || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').depositDate||''; }catch(e){return '';} })(),
    depositMethod:  c.depositMethod  || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').depositMethod||''; }catch(e){return '';} })(),
    depositReceipt: c.depositReceipt || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').depositReceipt||false; }catch(e){return false;} })(),
    balanceAmount:  c.balanceAmount  || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').balanceAmount||0; }catch(e){return 0;} })(),
    balanceDate:    c.balanceDate    || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').balanceDate||''; }catch(e){return '';} })(),
    balanceMethod:  c.balanceMethod  || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').balanceMethod||''; }catch(e){return '';} })(),
    balanceReceipt: c.balanceReceipt || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').balanceReceipt||false; }catch(e){return false;} })()
  };

  var paySec = div('margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #EEE6DC', []);
  paySec.appendChild(el('div', {style:'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px', text:'결제 관리'}));

  function savePayData(pd) {
    // 1) localStorage 백업
    localStorage.setItem('dah_pay_'+c.clientName, JSON.stringify(pd));
    // 2) customers 캐시 업데이트
    var arr = loadCustomers();
    var idx = c.id ? arr.findIndex(function(x){ return x.id === c.id; }) : arr.findIndex(function(x){ return x.clientName === c.clientName; });
    if (idx >= 0) {
      arr[idx].depositAmount  = Number(pd.depositAmount)||0;
      arr[idx].depositDate    = pd.depositDate||'';
      arr[idx].depositMethod  = pd.depositMethod||'';
      arr[idx].depositReceipt = pd.depositReceipt||false;
      arr[idx].balanceAmount  = Number(pd.balanceAmount)||0;
      arr[idx].balanceDate    = pd.balanceDate||'';
      arr[idx].balanceMethod  = pd.balanceMethod||'';
      arr[idx].balanceReceipt = pd.balanceReceipt||false;
      saveCustomers(arr);
    }
    // 3) Supabase 동기화
    if (c.id) {
      sbXHR('PATCH', 'customers?id=eq.'+c.id, {
        deposit_amount:  Number(pd.depositAmount)||0,
        deposit_date:    pd.depositDate||'',
        deposit_method:  pd.depositMethod||'',
        deposit_receipt: pd.depositReceipt||false,
        balance_amount:  Number(pd.balanceAmount)||0,
        balance_date:    pd.balanceDate||'',
        balance_method:  pd.balanceMethod||'',
        balance_receipt: pd.balanceReceipt||false
      }, function(){});
    }
  }

  // 선금 섹션
  var depositDone = payData.depositAmount && payData.depositDate;
  var depSec = div('margin-bottom:8px;padding:12px;background:'+(depositDone?'#F5FAF5':'#FAF7F5')+';border-radius:12px;border:1px solid '+(depositDone?'#B0D4B0':'#EEE6DC'), []);
  var depTitle = div('display:flex;align-items:center;justify-content:space-between;margin-bottom:8px', [
    el('div', {style:'font-size:12px;font-weight:700;color:#282828', text:(depositDone?'✔ ':'')+'선금 (계약금)'}),
  ]);
  if (depositDone) {
    var depEditBtn = btn('font-size:11px;color:#6B6B6B;background:none;border:1px solid #EEE6DC;border-radius:4px;padding:2px 8px;cursor:pointer;font-family:inherit', '수정', function(){
      depSec.innerHTML = ''; buildDepForm();
    });
    depTitle.appendChild(depEditBtn);
    depSec.appendChild(depTitle);
    depSec.appendChild(el('div', {style:'font-size:11px;font-weight:800;color:#282828;letter-spacing:-0.5px;margin-bottom:2px', text: Number(payData.depositAmount).toLocaleString()+'원'}));
    depSec.appendChild(el('div', {style:'font-size:11px;color:#6B6B6B', text: (payData.depositMethod||'') + ' · ' + (payData.depositDate||'') + (payData.depositReceipt?' · 현금영수증 ✔':'')}));
  } else {
    depSec.appendChild(depTitle);
    buildDepForm();
  }
  function buildDepForm() {
    var depForm = div('display:flex;flex-wrap:wrap;gap:6px', []);
    var depMethod = el('select', {style:'flex:1;min-width:80px;padding:6px;border:1px solid #EEE6DC;border-radius:12px;font-size:11px;font-family:inherit;background:#fff'});
    ['카드','현금'].forEach(function(m){ var o=el('option',{}); o.value=m; o.textContent=m; depMethod.appendChild(o); });
    if (payData.depositMethod) depMethod.value = payData.depositMethod;
    var depAmt = el('input', {type:'text', placeholder:'선금 금액', style:'flex:2;min-width:90px;padding:6px;border:1px solid #EEE6DC;border-radius:12px;font-size:11px;font-family:inherit'});
    if (payData.depositAmount) depAmt.value = Number(payData.depositAmount).toLocaleString();
    var depDate = el('input', {type:'date', style:'flex:2;min-width:110px;padding:6px;border:1px solid #EEE6DC;border-radius:12px;font-size:11px;font-family:inherit'});
    if (payData.depositDate) depDate.value = payData.depositDate;
    var depReceipt = el('label', {style:'display:flex;align-items:center;gap:4px;font-size:11px;color:#6B6B6B;cursor:pointer;width:100%'});
    var depReceiptChk = el('input', {type:'checkbox'}); depReceiptChk.checked = payData.depositReceipt||false;
    depReceipt.appendChild(depReceiptChk); depReceipt.appendChild(document.createTextNode('현금영수증'));
    var depSave = btn('width:100%;padding:9px;background:#282828;color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:4px', '선금 저장', function(){
      var inputAmt = Number(depAmt.value.replace(/[^0-9]/g,'')) || 0;
      var expectedHalf = Math.round((c.price || 0) * 0.5);
      if (c.price > 0 && inputAmt > 0 && inputAmt !== expectedHalf) {
        var proceed = confirm(
          '입력하신 선금(' + inputAmt.toLocaleString() + '원)이 견적금액의 50%(' + expectedHalf.toLocaleString() + '원)와 달라요.\n'
          + '이대로 저장할까요?'
        );
        if (!proceed) return;
      }
      var newPd = Object.assign({}, payData);
      newPd.depositMethod  = depMethod.value;
      newPd.depositAmount  = depAmt.value.replace(/[^0-9]/g,'');
      newPd.depositDate    = depDate.value;
      newPd.depositReceipt = depReceiptChk.checked;
      savePayData(newPd);
      if (c.stage === '상담') changeStage('계약금');
      closeDetail(); openDetail(c.clientName, c.id);
    });
    depForm.appendChild(depMethod); depForm.appendChild(depAmt); depForm.appendChild(depDate); depForm.appendChild(depReceipt);
    depSec.appendChild(depForm); depSec.appendChild(depSave);
  }
  paySec.appendChild(depSec);

  // 잔금 섹션
  var balanceDone = payData.balanceAmount && payData.balanceDate;
  var balSec = div('padding:12px;background:'+(balanceDone?'#F5FAF5':'#FAF7F5')+';border-radius:12px;border:1px solid '+(balanceDone?'#B0D4B0':'#EEE6DC'), []);
  var balTitle = div('display:flex;align-items:center;justify-content:space-between;margin-bottom:8px', [
    el('div', {style:'font-size:12px;font-weight:700;color:#282828', text:(balanceDone?'✔ ':'')+'잔금'})
  ]);
  if (balanceDone) {
    var balEditBtn = btn('font-size:11px;color:#6B6B6B;background:none;border:1px solid #EEE6DC;border-radius:4px;padding:2px 8px;cursor:pointer;font-family:inherit', '수정', function(){
      balSec.innerHTML = ''; buildBalForm();
    });
    balTitle.appendChild(balEditBtn);
    balSec.appendChild(balTitle);
    balSec.appendChild(el('div', {style:'font-size:11px;font-weight:800;color:#282828;letter-spacing:-0.5px;margin-bottom:2px', text: Number(payData.balanceAmount).toLocaleString()+'원'}));
    balSec.appendChild(el('div', {style:'font-size:11px;color:#6B6B6B', text: (payData.balanceMethod||'') + ' · ' + (payData.balanceDate||'') + (payData.balanceReceipt?' · 현금영수증 ✔':'')}));
  } else {
    balSec.appendChild(balTitle);
    buildBalForm();
  }
  function buildBalForm() {
    var balForm = div('display:flex;flex-wrap:wrap;gap:6px', []);
    var balMethod = el('select', {style:'flex:1;min-width:80px;padding:6px;border:1px solid #EEE6DC;border-radius:12px;font-size:11px;font-family:inherit;background:#fff'});
    ['카드','현금'].forEach(function(m){ var o=el('option',{}); o.value=m; o.textContent=m; balMethod.appendChild(o); });
    if (payData.balanceMethod) balMethod.value = payData.balanceMethod;
    var balAmt = el('input', {type:'text', placeholder:'잔금 금액', style:'flex:2;min-width:90px;padding:6px;border:1px solid #EEE6DC;border-radius:12px;font-size:11px;font-family:inherit'});
    if (payData.balanceAmount) balAmt.value = Number(payData.balanceAmount).toLocaleString();
    var balDate = el('input', {type:'date', style:'flex:2;min-width:110px;padding:6px;border:1px solid #EEE6DC;border-radius:12px;font-size:11px;font-family:inherit'});
    if (payData.balanceDate) balDate.value = payData.balanceDate;
    var balReceipt = el('label', {style:'display:flex;align-items:center;gap:4px;font-size:11px;color:#6B6B6B;cursor:pointer;width:100%'});
    var balReceiptChk = el('input', {type:'checkbox'}); balReceiptChk.checked = payData.balanceReceipt||false;
    balReceipt.appendChild(balReceiptChk); balReceipt.appendChild(document.createTextNode('현금영수증'));
    var balSave = btn('width:100%;padding:9px;background:#282828;color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:4px', '잔금 저장', function(){
      var inputAmt = Number(balAmt.value.replace(/[^0-9]/g,'')) || 0;
      var expectedBalance = Math.max(0, (c.price || 0) - (Number(payData.depositAmount) || 0));
      if (c.price > 0 && inputAmt > 0 && inputAmt !== expectedBalance) {
        var proceed = confirm(
          '입력하신 잔금(' + inputAmt.toLocaleString() + '원)이 예상 잔금(견적금액-선금, ' + expectedBalance.toLocaleString() + '원)과 달라요.\n'
          + '이대로 저장할까요?'
        );
        if (!proceed) return;
      }
      var newPd = Object.assign({}, payData);
      newPd.balanceMethod  = balMethod.value;
      newPd.balanceAmount  = balAmt.value.replace(/[^0-9]/g,'');
      newPd.balanceDate    = balDate.value;
      newPd.balanceReceipt = balReceiptChk.checked;
      savePayData(newPd);
      if (c.stage === '실측' || c.stage === '잔금') changeStage('시공');
      closeDetail(); openDetail(c.clientName, c.id);
    });
    balForm.appendChild(balMethod); balForm.appendChild(balAmt); balForm.appendChild(balDate); balForm.appendChild(balReceipt);
    balSec.appendChild(balForm); balSec.appendChild(balSave);
  }
  paySec.appendChild(balSec);
  body.appendChild(paySec);

  
  var alimSec = div('margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #EEE6DC', []);
  alimSec.appendChild(el('div', {style:'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px', text:'알림톡 발송 현황'}));

  var allKeys = ['t01_reservation','t02_reminder','t03_estimate','t31_deposit','t04_followup',
    't05_measure_confirm','t06_measure_dday','t07_final_estimate','t71_balance_request',
    't08_balance_remind','t09_order_confirm','t10_install_confirm','t11_install_dday',
    't12_after_install','t13_cancel','t14_noshow'];

  var logs = [];
  try { logs = JSON.parse(localStorage.getItem('dah_kakao_log')||'[]'); } catch(e){}
  var sentMap = {};
  logs.forEach(function(l){ if(l.name===c.clientName) sentMap[l.type]=l; });

  
  var recommendedKeys = STAGE_ALIM[c.stage] || [];

  allKeys.forEach(function(key) {
    var meta = ALIM_META[key]; if(!meta) return;
    var sent = sentMap[key];
    var isRecommended = recommendedKeys.indexOf(key) >= 0;
    var tagColor = meta.tag==='자동'?'#6B6B6B':(meta.tag==='선택'?'var(--light)':'#282828');

    var row = div(
      'display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #FAF7F5',
      []
    );
    var left = div('flex:1;min-width:0', []);
    var labelRow = div('display:flex;align-items:center;gap:6px', []);
    labelRow.appendChild(el('span', {style:'font-size:11px;font-weight:'+(isRecommended?'700':'500')+';color:'+(isRecommended?'#282828':'#6B6B6B'), text:meta.label}));
    labelRow.appendChild(el('span', {style:'font-size:11px;color:'+tagColor+';background:#FAF7F5;padding:2px 5px;border-radius:var(--r-btn)', text:meta.tag}));
    left.appendChild(labelRow);
    if (sent) {
      left.appendChild(el('span', {style:'font-size:11px;color:var(--sub)', text:'✅ '+sent.date+' '+sent.time}));
    }
    row.appendChild(left);

    if (!sent) {
      var sendBtn = el('span', {style:'font-size:12px;font-weight:700;color:'+(isRecommended?'#282828':'var(--light)')+';cursor:pointer;flex-shrink:0;padding:4px 8px;border:1px solid '+(isRecommended?'#282828':'#EEE6DC')+';border-radius:4px', text:'발송'});
      (function(k){ sendBtn.addEventListener('click', function(){ sendAlimtalk(k); }); })(key);
      row.appendChild(sendBtn);
    } else {
      var resendBtn = el('span', {style:'font-size:11px;color:var(--sub);cursor:pointer;flex-shrink:0;padding:4px 8px', text:'재발송'});
      (function(k){ resendBtn.addEventListener('click', function(){ if(confirm('재발송할까요?')) sendAlimtalk(k); }); })(key);
      row.appendChild(resendBtn);
    }
    alimSec.appendChild(row);
  });
  body.appendChild(alimSec);

  // 고객 정보 섹션
  var infoSec = div('margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #EEE6DC', []);
  infoSec.appendChild(el('div', {style:'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px', text:'고객 정보'}));

  // 연락처 - 크고 눈에 띄게
  var phoneBlock = div('background:#FAF7F5;border:1px solid #EEE6DC;border-radius:12px;padding:12px 14px;margin-bottom:8px', []);
  phoneBlock.appendChild(el('div', {style:'font-size:11px;color:#9A9490;letter-spacing:0.8px;margin-bottom:4px', text:'연락처'}));
  if (c.phone) {
    var telLink = el('a', {href:'tel:'+c.phone.replace(/[^0-9]/g,''), style:'font-size:11px;font-weight:800;color:#282828;text-decoration:none;letter-spacing:-0.3px'});
    telLink.textContent = c.phone;
    phoneBlock.appendChild(telLink);
  } else {
    phoneBlock.appendChild(el('span', {style:'font-size:11px;font-weight:700;color:var(--sub)', text:'—'}));
  }
  infoSec.appendChild(phoneBlock);

  // 주소
  if (c.addr) {
    var addrBlock = div('background:#FAF7F5;border:1px solid #EEE6DC;border-radius:12px;padding:10px 14px;margin-bottom:8px', [
      el('div', {style:'font-size:11px;color:#9A9490;letter-spacing:0.8px;margin-bottom:3px', text:'주소'}),
      el('div', {style:'font-size:12px;font-weight:600;color:#282828;line-height:1.4', text:c.addr})
    ]);
    infoSec.appendChild(addrBlock);
  }

  // 메모
  if (c.memo) {
    var memoBlock = div('background:#FFFBF5;border:1px solid #FFE5CC;border-radius:12px;padding:10px 14px;margin-bottom:8px', [
      el('div', {style:'font-size:11px;color:#F06E2D;letter-spacing:0.8px;margin-bottom:3px', text:'메모'}),
      el('div', {style:'font-size:11px;color:#282828;line-height:1.6', text:c.memo})
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
    var box = div('background:#FAF7F5;border:1px solid #EEE6DC;border-radius:12px;padding:10px 8px;text-align:center;position:relative'+(item.key?';cursor:pointer':''),[
      el('div',{style:'font-size:11px;color:#9A9490;letter-spacing:0.8px;margin-bottom:4px',text:item.label}),
      el('div',{style:'font-size:12px;font-weight:700;color:'+(item.value==='—'?'var(--light)':'#282828'),text:item.value})
    ]);
    if (item.key) {
      box.addEventListener('click', function(){
        if (box.querySelector('input')) return; // 이미 편집중이면 무시
        var valueDiv = box.children[1];
        var originalText = valueDiv.textContent;
        valueDiv.textContent = '';
        var dateInp = el('input', {type:'date', style:'width:100%;border:none;background:transparent;font-size:12px;font-weight:700;color:#282828;text-align:center;font-family:inherit;outline:none'});
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
          valueDiv.style.color = newVal ? '#282828' : 'var(--light)';
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

  
  body.appendChild(btn('width:100%;padding:12px;background:#FAF7F5;color:#282828;border:1px solid #EEE6DC;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;border-radius:4px;margin-bottom:6px', '견적서 앱에서 열기', function(){ openEstimate(currentDetailName); }));
  // 발주 현황: 계약 이후(계약금 단계 이후)에만 표시 —
  // 가견적/상담 단계에서는 아직 발주할 게 없으므로 불필요한 정보 노출 방지
  var ORDER_STAGES = ['계약금', '실측', '잔금', '시공', '완료'];
  if (ORDER_STAGES.indexOf(c.stage) >= 0) {
    var orderStatus = c.orderStatus || {};
    var orderItems = [
      { key: 'fabric', label: '원단 발주' },
      { key: 'production', label: '제작 발주' },
      { key: 'blind', label: '블라인드 발주' },
      { key: 'material', label: '자재 발주' },
      { key: 'install', label: '시공 발주' }
    ];
    var orderCard = div('background:#fff;margin-bottom:10px;padding:16px', [
      span('font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.2px;display:block;margin-bottom:10px', '📦 발주 현황')
    ]);
    orderItems.forEach(function(item) {
      var row = div('display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #EEE6DC');
      var label = span('font-size:12px;color:#282828', item.label);
      var checkbox = el('input', { type: 'checkbox' });
      checkbox.checked = !!orderStatus[item.key];
      checkbox.style.cssText = 'width:20px;height:20px;cursor:pointer';
      checkbox.addEventListener('change', function() {
        var arr = loadCustomers();
        var target = findCurrentDetailCustomer(arr);
        if (!target) return;
        if (!target.orderStatus) target.orderStatus = {};
        target.orderStatus[item.key] = checkbox.checked;
        saveCustomers(arr);
        if (typeof saveCustomerToDb === 'function') saveCustomerToDb(target, function(err) { if (err) console.warn('발주현황 DB 동기화 실패:', err.text); });
        showToast(item.label + (checkbox.checked ? ' 완료 처리됐습니다' : ' 완료 취소됐습니다'));
      });
      row.appendChild(label);
      row.appendChild(checkbox);
      orderCard.appendChild(row);
    });
    body.appendChild(orderCard);
  }

  var bottomBtns = [btn('flex:2;padding:11px;background:#282828;color:#fff;border:none;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;border-radius:12px;letter-spacing:0.2px', '닫기', closeDetail)];
  if (isMaster) {
    if (isSoftDeleted(c)) {
      bottomBtns.unshift(btn('flex:1;padding:11px;background:#fff;border:1px solid #282828;font-size:11px;font-family:inherit;cursor:pointer;color:#282828;font-weight:700;border-radius:12px', '↩ 복구', function(){ restoreCustomer(c.clientName, c.id); }));
    } else {
      bottomBtns.unshift(btn('flex:1;padding:11px;background:#fff;border:1px solid #EEE6DC;font-size:11px;font-family:inherit;cursor:pointer;color:#282828;border-radius:12px', '삭제', deleteCustomer));
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
  target.stage = stage;
  saveCustomers(arr);
  saveCustomerToDb(target, null);
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
      sb.style.cssText = 'padding:6px 12px;border-radius:4px;border:1px solid '+(isActive?'#F06E2D':'#EEE6DC')+';font-size:11px;font-weight:'+(isActive?'700':'500')+';font-family:inherit;cursor:pointer;background:'+(isActive?'#F06E2D':'#fff')+';color:'+(isActive?'#fff':'#B0A99F');
      staffWrap.appendChild(sb);
    });
  }
  document.querySelectorAll('.staff-btn').forEach(function(b) {
    var isActive = b.getAttribute('data-staff') === defaultStaff;
    b.classList.toggle('active', isActive); b.style.background = isActive ? '#F06E2D' : '#fff'; b.style.color = isActive ? '#fff' : '#8E8078'; b.style.borderRadius = '4px'; b.style.border = '1.5px solid ' + (isActive ? '#F06E2D' : '#EEE6DC'); b.style.fontWeight = isActive ? '700' : '400';
    if (isStaffUser) { b.style.pointerEvents = 'none'; b.style.opacity = isActive ? '1' : '0.3'; } else { b.style.pointerEvents = ''; b.style.opacity = ''; }
  });
  var _ov = document.getElementById('add-overlay');
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
    var newCustomer = { clientName:name, phone:phone, addr:document.getElementById('add-addr').value.trim(), space:document.getElementById('add-space').value.trim(), price:0, performanceRevenue:0, staffName:staffName, stage:document.getElementById('add-stage').value, date:document.getElementById('add-date').value, measureDate:document.getElementById('add-measure').value, installDate:document.getElementById('add-install').value, memo:document.getElementById('add-memo').value.trim(), visitCount:visitCount, createdAt:new Date().toISOString() };
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
  var arr = loadCustomers(); var c = arr.find(function(x) { return x.clientName === currentDetailName; });
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
      logEl.appendChild(div('font-size:11px;color:#282828;padding:3px 0;border-bottom:1px solid #EEE6DC', [span('', l.date + ' ' + l.time + ' — ' + l.type + methodBadge)]));
    });
  } catch(e) {}
}


var CONTRACT_LABELS = {pending:'가견적', contracted:'✅ 계약됨', rejected:'미계약'};
var STATUS_LABELS = {ga:'가견적서', final:'최종견적서'};

function renderEstimateHistory(container, clientName) {
  var estSec = el('div', {style:'margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #EEE6DC'});
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
      'border:1px solid #EEE6DC;border-radius:12px;padding:12px 14px;' +
      'margin-bottom:' + (isLast?'0':'8px') + ';background:#fff'
    });

    
    var top = el('div', {style:'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px'});
    var noEl = el('div', {style:'display:flex;align-items:center;gap:6px'});
    var noSpan = el('span', {style:'font-size:12px;font-weight:700;color:#282828', text:e.no||'—'});
    var typeSpan = el('span', {style:
      'font-size:11px;color:#6B6B6B;border:1px solid #EEE6DC;' +
      'padding:1px 6px;border-radius:var(--r-btn)',
      text: STATUS_LABELS[e.status]||'가견적서'
    });
    noEl.appendChild(noSpan); noEl.appendChild(typeSpan);
    if (e.confirmedAt) {
      var confirmedSpan = el('span', {style:'font-size:11px;font-weight:700;color:#fff;background:#282828;padding:1px 8px;border-radius:20px', text:'✓ 확정'});
      noEl.appendChild(confirmedSpan);
    }

    
    var contractBadge = el('button', {style:
      'font-size:12px;font-weight:700;border:none;cursor:pointer;' +
      'padding:3px 10px;border-radius:4px;font-family:inherit;' +
      'background:' + (cs==='contracted'?'#282828':'#FAF7F5') + ';' +
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
        badge.style.background = next==='contracted'?'#282828':'#FAF7F5';
        badge.style.color = next==='contracted'?'#fff':'#6B6B6B';
      });
    })(e, contractBadge);

    top.appendChild(noEl); top.appendChild(contractBadge);
    card.appendChild(top);

    
    var mid = el('div', {style:'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px'});
    var spaceEl = el('span', {style:'font-size:11px;color:#282828', text:e.space||'—'});
    var priceEl = el('span', {style:'font-size:12px;font-weight:700;color:#282828', text:(Number(e.price)||0).toLocaleString()+'원'});
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
