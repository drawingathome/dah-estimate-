/* ══════════════════════════════════════════════════
   DAH 대시보드 — 고객상세 모달 기능
   고객 상세보기, 단계변경, 결제(선금/잔금) 관리, 알림톡 발송,
   고객 추가/수정, 견적서 이력 표시.
   ══════════════════════════════════════════════════ */

var STAGES = ['방문예약','상담','가견적','선금결제','실측준비중','확정견적','잔금결제','시공준비중','시공완료'];
// 2026-08-05: STAGES_ALL(옛 6단계 이름 배열)은 코드베이스 어디서도 참조되지 않는
// 죽은 코드였고 이름까지 옛것이라 혼동 소지가 있어 제거함

// 2026-08-29: 알림톡 v3 문서(선혜님 원본) 기준으로 전면 재작성.
// v3의 A/B/C 상황별 분기(예: 3번 가견적 발송, 7번 확정견적 발송)는 이번엔
// 케이스 구분 없이 대표 문구 1개만 등록함 — 선혜님 결정, 세분화는 다음 세션.
// 각 대표문구 선택 근거는 ALIM_META의 template 옆 주석에 표시.
var STAGE_ALIM = {
  방문예약: ['t00_reservation','t01_survey','t02_reminder'],
  상담:   ['t00_reservation','t02_reminder','t03_estimate','t04_followup'],
  가견적: ['t03_estimate','t04_followup','t41_payment_method','t42_deposit_cash','t43_deposit_card'],
  선금결제: ['t42_deposit_cash','t43_deposit_card','t05_measure_confirm'],
  실측준비중:   ['t05_measure_confirm','t06_measure_dday','t07_final_estimate'],
  확정견적: ['t07_final_estimate','t08_balance_remind'],
  잔금결제:   ['t08_balance_remind','t09_install_confirm'],
  시공준비중:   ['t09_install_confirm','t10_install_dday'],
  시공완료:   ['t10_install_dday','t11_after_install','t12_repeat_purchase','t18_as_confirm']
};
// 특정 단계에 묶이지 않는 항목(취소/노쇼/재고이슈/AS) — "취소·기타" 카테고리에서 표시
var OTHER_ALIM_KEYS = ['t13_cancel','t14_noshow','t15_restock_split','t16_cancel_before_measure','t17_cancel_after_measure'];
var ALIM_META = {
  t00_reservation: {label:'0. 예약 확인', desc:'수동 · 즉시', tag:'수동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 쇼룸 방문 예약이 확인됐습니다 ✔\n\n방문 일정: #{방문일시}\n위치: 서울 서초구 반포동 (예약제 운영)\n주차는 쇼룸 바로 옆 주차장을 이용하시면 됩니다.\n\n1:1 예약제로 운영되어 방문이 어려우신 경우\n하루 전까지 꼭 연락 주시면 감사하겠습니다.\n\n궁금하신 점은 편하게 말씀해 주세요.'},
  t01_survey: {label:'1. 설문지 발송', desc:'자동 · 예약확인 30분~1시간 후', tag:'자동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 방문 전 설문지를 미리 작성해 주시면\n상담 시간을 줄이고 공간에 맞는 원단을\n미리 준비해드릴 수 있어요 ✔\n\n3분이면 충분합니다.\n설문지: https://dah-estimate.vercel.app/survey'},
  // v3 원본은 방문 D-1이 설문지 완료(A)/미완료(B) 2가지로 갈라짐 — 이번엔 케이스 구분 없이
  // B(미완료 가정, 설문지 링크 재안내 포함)를 대표로 사용. 완료 고객에게도 무난히 통함.
  t02_reminder: {label:'2. 방문 1일 전 리마인더', desc:'자동 · 방문일 D-1', tag:'자동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 내일 쇼룸 방문 예정이세요 ✔\n\n방문 일정: #{방문일시}\n\n아직 설문지를 작성 안 하셨다면\n방문 전에 미리 작성해 주시면 더 좋아요 ✔\n공간 사이즈나 도면도 함께 준비해 오시면\n더 정확한 견적과 제품 선택이 수월해져요.\n\n내일 뵙겠습니다 🙂\n설문지: https://dah-estimate.vercel.app/survey'},
  // v3 원본 3케이스(A:매장결제완료/B:생각중/C:카톡결제예정) 중 B를 대표로 사용
  // — 결제 여부를 가정하지 않는 게 가장 무난함.
  t03_estimate: {label:'3. 가견적서 발송', desc:'수동 · 상담 당일', tag:'수동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 오늘 상담 감사드려요 ✔\n\n가견적서를 아래에 정리해드렸어요.\n\n계약금(총 금액의 50%) 결제 후\n실측 일정을 잡아드리며,\n실측 후 정확한 치수로 최종 견적을 다시 안내드려요.\n\n진행을 원하시면 편하게 말씀해 주세요 🙂'},
  t04_followup: {label:'4. 팔로업', desc:'자동 · 상담 3일 후 · 계약금 미결제', tag:'자동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 지난번 상담 이후 잘 지내고 계신가요?\n\n결정이 쉽지 않으실 수 있어요.\n추가로 궁금하신 점이 있으시면\n언제든 편하게 말씀해 주세요 ✔\n\n쇼룸에 다시 방문하셔서 원단을 한 번 더\n확인해보시는 것도 좋아요 🙂'},
  t41_payment_method: {label:'4-1. 결제 방법 확인', desc:'수동 · 팔로업 후 진행의사 밝혔을 때', tag:'수동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 계약금 결제 안내드릴게요 ✔\n\n아래 두 가지 방법이 가능해요.\n\n✔ 현금 계좌이체 (현금영수증 발급 가능)\n✔ 카드 결제 링크\n\n어떤 방법이 편하세요? 🙂'},
  t42_deposit_cash: {label:'4-2. 계약금 안내 · 현금', desc:'수동', tag:'수동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 계좌 안내드릴게요 ✔\n\n국민은행 015401-04-258798\n(예금주: 장선혜(드로잉엣홈))\n금액: #{계약금}원\n\n현금영수증 발급을 원하시면\n휴대폰 번호를 남겨주세요.\n\n입금 확인 후 실측 일정 안내드릴게요 🙂'},
  t43_deposit_card: {label:'4-3. 계약금 안내 · 카드', desc:'수동', tag:'수동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 결제 링크 안내드릴게요 ✔\n\n결제 링크: #{결제링크}\n금액: #{계약금}원\n\n결제 완료 후 실측 일정 안내드릴게요 🙂'},
  t05_measure_confirm: {label:'5. 실측 일정 확정', desc:'수동 · 계약금 결제 확인 후', tag:'수동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 계약금 결제 확인했어요 ✔\n\n실측 일정을 아래와 같이 잡아드렸어요.\n\n실측 일정: #{실측일시}\n\n정확한 방문 시간은 실측 전날 오후에\n전담팀에서 직접 연락드릴게요.\n\n궁금하신 점은 편하게 말씀해 주세요 🙂'},
  t06_measure_dday: {label:'6. 실측 1일 전 안내', desc:'자동 · 실측일 D-1 오후', tag:'자동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 내일 실측 방문 예정입니다 ✔\n\n실측 일정: #{실측일시}\n\n오늘 오후 중으로 전담팀에서\n정확한 방문 시간 안내 전화드릴게요.\n\n궁금하신 점은 편하게 말씀해 주세요 🙂'},
  // v3 3케이스(A:매장결제완료/B:결제방법확인필요/C:카드링크발송) 중 B를 대표로 사용
  t07_final_estimate: {label:'7. 확정 견적서 발송', desc:'수동 · 실측 완료 후', tag:'수동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 실측 치수를 바탕으로\n최종 견적서를 정리해드렸어요 ✔\n\n실측 사이즈에 따라 가견적과\n금액이 달라질 수 있어요.\n\n잔금 결제는 아래 두 가지 방법이 가능해요.\n\n✔ 현금 계좌이체 (현금영수증 발급 가능)\n✔ 카드 결제 링크\n\n어떤 방법이 편하세요? 🙂'},
  // v3 2케이스(A:현금/B:카드) 중 A를 대표로 사용
  t08_balance_remind: {label:'8. 잔금 리마인드', desc:'자동 · 확정견적 발송 2일 후 · 잔금 미결제', tag:'자동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 잔금 안내드려요 ✔\n\n국민은행 015401-04-258798 (예금주: 장선혜(드로잉엣홈))\n금액: #{잔금}원\n\n현금영수증 발급을 원하시면\n휴대폰 번호를 남겨주세요 ✔\n\n입금 확인 후 바로 시공 일정을 잡아드릴게요.\n궁금하신 점은 편하게 말씀해 주세요 🙂'},
  t09_install_confirm: {label:'9. 시공 일정 확정', desc:'수동 · 잔금 결제 확인 후', tag:'수동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 잔금 결제 확인했어요 ✔\n\n시공 일정이 확정됐습니다.\n\n시공 일정: #{시공일시}\n\n정확한 방문 시간은 시공 전날 오후에\n전담팀에서 직접 연락드릴게요.\n\n궁금하신 점은 편하게 말씀해 주세요 🙂'},
  t10_install_dday: {label:'10. 시공 1일 전 안내', desc:'자동 · 시공일 D-1 오후', tag:'자동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 내일 시공 방문 예정입니다 ✔\n\n시공 일정: #{시공일시}\n\n오늘 오후 중으로 전담팀에서\n정확한 방문 시간 안내 전화드릴게요.\n\n시공 당일 길이나 마감 상태를\n고객님과 함께 꼼꼼히 확인해드려요.\n현장에서 바로 말씀해 주시면\n즉시 수정해드릴게요 ✔\n\n궁금하신 점은 편하게 말씀해 주세요 🙂'},
  t11_after_install: {label:'11. 시공 후 안부', desc:'자동 · 시공완료 3일 후', tag:'자동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 시공 후 잘 사용하고 계신가요? ✔\n\n궁금하신 점이 있으시면\n언제든 편하게 말씀해 주세요.\n\n시공 후 예뻐진 공간, 자랑해주세요 🙂\n\n아래 중 하나를 카톡으로 보내주시면\n작은 사은품을 택배로 보내드릴게요!\n\n✔ 네이버 리뷰 작성 후 링크 전송\n✔ 카페 후기 작성 후 링크 전송\n✔ 예뻐진 공간 사진 5장 이상 전송\n\n보내주신 모든 분께 빠짐없이 보내드려요 ✔\n네이버 리뷰: https://map.naver.com/v5/entry/place/1813414113'},
  t12_repeat_purchase: {label:'12. 재구매 유도', desc:'자동 · 시공완료 6개월 후', tag:'자동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 시공 후 잘 지내고 계신가요? ✔\n\n혹시 다른 공간도 커튼이나 블라인드가\n필요하시면 편하게 말씀해 주세요.\n\n재구매 고객님께는 추가 5% 할인을\n드리고 있어요 🙂\n\n언제든 편하게 연락 주세요 ✔'},
  t13_cancel: {label:'13. 취소 안내', desc:'선택 · 취소 시', tag:'선택',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 예약 취소 처리됐습니다.\n\n나중에 필요하실 때 언제든 다시 연락 주세요.\n감사합니다 🙂'},
  t14_noshow: {label:'14. 노쇼 재예약 안내', desc:'수동 · 노쇼 처리 후', tag:'수동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 오늘 방문이 어려우셨나요?\n\n일정 조율이 필요하시면\n편하게 말씀해 주세요.\n재예약 도와드릴게요 🙂'},
  t15_restock_split: {label:'15. 재고 없음 · 2차 시공 안내', desc:'수동', tag:'수동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 주문하신 제품 중\n일부 재고 확인이 필요해요 ✔\n\n재고 상황에 따라 2차 시공으로\n나눠서 진행해드릴 수 있어요.\n\n일정은 별도로 안내드릴게요.\n불편을 드려 죄송합니다 🙂'},
  t16_cancel_before_measure: {label:'16. 취소 안내 · 실측 전', desc:'수동', tag:'수동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 취소 접수 확인했습니다.\n\n계약금 전액을 환불해드릴게요 ✔\n\n환불 계좌를 알려주시면\n빠르게 처리해드릴게요.\n\n나중에 필요하실 때 언제든\n다시 연락 주세요 🙂'},
  t17_cancel_after_measure: {label:'17. 취소 안내 · 실측 후', desc:'수동', tag:'수동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, 취소 접수 확인했습니다.\n\n실측 진행 후 취소의 경우\n실측 수수료 10만원을 제외한\n금액을 환불해드려요 ✔\n\n환불 계좌를 알려주시면\n빠르게 처리해드릴게요.\n\n나중에 필요하실 때 언제든\n다시 연락 주세요 🙂'},
  t18_as_confirm: {label:'18. AS 접수 확인', desc:'수동', tag:'수동',
    template:'안녕하세요, 드로잉엣홈입니다 🙂\n\n#{고객명}님, AS 접수 확인했어요 ✔\n\n방문 일정: #{AS일시}\n\n전담팀에서 꼼꼼히 확인해드릴게요.\n궁금하신 점은 편하게 말씀해 주세요 🙂'}
};

// 2026-08-05: 색상 3그룹으로 단순화(제안1 확정) - 방문예약~가견적=회색, 선금결제~시공준비중=오렌지, 시공완료=그린
// 2026-08-05: 여기 있던 STAGE_COLORS 변수는 정의만 되고 실제로 어디서도
// 참조되지 않는 죽은 코드였음(감사 중 발견, 제거함). 스테이지 컬러가
// 필요하면 dash-kanban.js의 PIPE_STAGES 또는 dash-styles.css의
// .stage-pill 클래스를 참조할 것 — 이 두 곳이 실제 적용되는 정본임.
var STAGE_BG = {상담:'#EEF2F7',계약금:'#FFF3EE',실측:'#F3EFF8',잔금:'#EEF5F2',시공:'#FDECEA',완료:'#F5F2EE'};
var STAGE_NUM = {방문예약:1,상담:2,가견적:3,선금결제:4,실측준비중:5,확정견적:6,잔금결제:7,시공준비중:8,시공완료:9};
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
  // 2026-08-28(선혜님 지적 — "F5해도 여전히 3개야", 유경진 사례로 발견):
  // 이 함수가 localStorage(dah_saved)만 그대로 읽고 있어서, 서버에서
  // 견적서가 지워져도(관리자가 직접 지웠거나, 다른 기기/다른 사람이
  // 지웠거나) 이 화면은 브라우저에 남아있는 예전 캐시를 계속 보여주고
  // 있었음 - 새로고침(F5)해도 dah_saved 자체를 새로 받아오는 코드가
  // 없어서 안 고쳐졌음. loadEstimatesAsync(force=true)로 서버 최신
  // 상태를 먼저 받아온 뒤에만 그리도록 구조 변경.
  loadEstimatesAsync(function(){ renderDetailEstTabInner(estEl); }, true);
}

function renderDetailEstTabInner(estEl) {
  if (!currentDetailName || !document.getElementById('detail-est-body')) return; // 로딩 중 다른 고객으로 넘어간 경우 방지
  estEl.innerHTML = '';

  var all = [];
  try { all = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e) {}
  var ests = all.filter(function(e){
    var mine = (currentDetailId && e.clientId) ? e.clientId === currentDetailId : e.clientName === currentDetailName;
    return mine && !e.isArchived;
  });
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

  var CONTRACT_KO    = {pending:'가견적', contracted:'계약됨', rejected:'미계약'};
  var CONTRACT_BG    = {pending:'#F5F2EE', contracted:'#EEF5F2', rejected:'#FDECEA'};
  var CONTRACT_COLOR = {pending:'var(--sub)', contracted:'#2F6690', rejected:'#C0392B'};
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
    // 2026-08-24(선혜님 요청 — "세부내용 보기 팝업은 의미없다, 대신 고객용
    // 견적서를 보여줘"): 내부 요약 팝업 대신, 실제 고객용 견적서 문서를
    // 저장 당시 금액 그대로 새 창에서 보여줌.
    var detailBtn = btn('width:100%;margin-top:6px;padding:9px 0;background:#fff;color:var(--dark);border:1px solid var(--border);border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer', '📄 고객용 견적서 보기', function(){
      if (!e.id) { showToast('이 견적은 세부 데이터가 없어서 미리보기를 만들 수 없어요'); return; }
      window.open('dah-estimate.html?loadEstDbId=' + encodeURIComponent(e.id) + '&mode=view', '_blank');
    });

    // 2026-08-29(선혜님 지시 - "견적서목록/고객상세의 이력탭에 버튼으로
    // 다시 붙이기"): 저장된 lineItems로 발주서/실측·시공 의뢰서를 다시
    // 만드는 기능 - 8/24에 세부내용팝업을 없애면서 같이 사라졌던 걸 복원.
    // lineItems가 없는 예전 견적(요약 문자열만 있던 시절)은 재구성할
    // 원본 데이터가 없으므로 버튼 자체를 안 보여줌.
    var reGenActions = null;
    if (e.lineItems && e.lineItems.length > 0) {
      reGenActions = div('display:flex;gap:6px;margin-top:6px', [
        btn('flex:1;padding:9px 0;background:#fff;color:var(--dark);border:1px solid var(--border);border-radius:12px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer', '📋 발주서', function(){ showVendorOrderFromEstimate(e); }),
        btn('flex:1;padding:9px 0;background:#fff;color:var(--dark);border:1px solid var(--border);border-radius:12px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer', '📐 실측의뢰서', function(){ showRequestFromEstimate('measure', e); }),
        btn('flex:1;padding:9px 0;background:#fff;color:var(--dark);border:1px solid var(--border);border-radius:12px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer', '🔧 시공의뢰서', function(){ showRequestFromEstimate('install', e); })
      ]);
    }

    var deleteEstBtn = btn('width:100%;margin-top:6px;padding:9px 0;background:#fff;color:#C0392B;border:1px solid #F5D6D0;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer', '삭제', function(){
      if (!confirm('⚠️ 이 견적서를 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
      archiveEstimate(e, function(err){
        if (err) { showToast('⚠️ 삭제가 서버에 반영되지 않았어요' + (err.zeroRows ? '(권한 문제일 수 있어요)' : '') + ' — 새로고침해서 확인해주세요'); return; }
        showToast('완전히 삭제했어요');
        loadEstimatesAsync(function(){ renderDetailEstTab(); }, true); // 서버 최신상태로 강제 재동기화 후 다시 그림
      });
    });

    card.appendChild(top);
    card.appendChild(priceRow);
    card.appendChild(infoGrid);
    card.appendChild(dateRow);
    card.appendChild(actions);
    card.appendChild(detailBtn);
    if (reGenActions) card.appendChild(reGenActions);
    card.appendChild(deleteEstBtn);
    estEl.appendChild(card);
  });

  // 새 견적 버튼
  var newEstBtn = btn('width:100%;padding:var(--sp-3);background:#F5F2EE;color:var(--dark);border:1px solid var(--border);border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:var(--sp-1)',
    '+ 새 견적서 작성', function(){ openEstimate(currentDetailName); });
  estEl.appendChild(newEstBtn);
}

function openDetail(name, id, forceTab) {
  // 2026-08-28(선혜님 지적 — "유경진 이름 클릭하면 견적서 3개 나와", F5해도
  // 그대로였던 문제와 같은 원인이 이 화면(고객상세 '정보'탭, 이름클릭으로
  // 들어오는 기본화면)에도 있었음): renderEstimateHistory()와 이력탭
  // 배지(dtab-est-cnt)가 전부 localStorage(dah_saved)만 그대로 읽고
  // 있어서, 서버에서 견적서가 지워져도 브라우저에 남은 예전 캐시를 계속
  // 보여주고 있었음. 이력탭(renderDetailEstTab)만 먼저 고쳤었는데,
  // 고객상세를 여는 진입점 자체인 이 함수도 똑같이 고쳐야 했음 - 다음부턴
  // 고객상세를 열 때마다(이름 클릭이든 어디서든) 항상 서버 최신 견적
  // 목록을 먼저 받아온 뒤에만 화면을 그림.
  loadEstimatesAsync(function(){ openDetailInner(name, id, forceTab); }, true);
}

function openDetailInner(name, id, forceTab) {
  var customers = loadCustomers();
  // 2026-08-05: HTML data-cid 속성에서 넘어오는 id는 항상 문자열인데, customer.id는
  // 숫자라서 엄격비교(===)가 항상 실패해 "고객을 찾을 수 없습니다" 오류가 나던 버그.
  // 실제 화면 클릭(문자열 id)에서만 재현되고, 함수를 코드로 직접 호출(숫자 id)하면
  // 재현이 안 돼서 오늘 검증에서 계속 놓쳤음 — 앞으로 클릭 경로까지 실제로 재현해서 검증할 것.
  var c = id ? customers.find(function(x) { return String(x.id) === String(id); }) : customers.find(function(x) { return x.clientName === name; });
  if (!c) {
    // 2026-08-25(선혜님 발견 — 오지은 실장 계정에서 신화경님 견적 클릭시
    // "고객 정보를 찾을 수 없어요" 뜸): 로컬 캐시에 없으면 바로 실패 처리만
    // 하고 서버에 다시 물어보는 로직이 아예 없었음. 최근에 다른 기기/계정에서
    // 새로 만든 고객은 이 기기가 아직 동기화 전이라 당연히 로컬엔 없는데,
    // 그럴 때마다 이 오류가 뜨고 끝이었음. 실패로 단정하기 전에 서버에서
    // 한 번 더 최신 목록을 받아와서 재시도하도록 함.
    if (typeof loadCustomersAsync === 'function') {
      showToast('고객 정보를 새로 불러오는 중...');
      loadCustomersAsync(function(fresh){
        var c2 = id ? fresh.find(function(x){ return String(x.id) === String(id); }) : fresh.find(function(x){ return x.clientName === name; });
        if (c2) { openDetail(name, id, forceTab); }
        else { showToast('"' + (name||'') + '" 고객 정보를 찾을 수 없어요 (삭제되었거나 이름이 변경된 것 같아요)'); }
      }, true);
      return;
    }
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
    if ((c.stage === '선금결제' && !c.depositAmount) || (c.stage === '잔금결제' && !c.balanceAmount)) {
      autoTab = 'pay'; // 입금 대기 중이면 결제탭부터
    } else {
      var os = c.orderStatus || {};
      var orderNotStarted = !os.fabric && !os.production && !os.blind && !os.material && !os.install;
      // 2026-08-05: 옛 6단계 이름 잔여참조 버그 수정 — 매핑표(계약금→선금결제/실측→실측준비중/
      // 잔금→잔금결제/시공→시공준비중) 그대로 적용. 바로 위 라인(243)은 이미 신규 이름으로
      // 고쳐져 있었는데 이 라인만 누락돼서, 실측준비중~시공준비중 단계에서 발주가 전혀 안
      // 시작됐어도 발주탭이 자동으로 안 열리고 있었음(정보탭에 머무름)
      if (['선금결제','실측준비중','잔금결제','시공준비중'].indexOf(c.stage) >= 0 && orderNotStarted) autoTab = 'order'; // 발주 전혀 안됐으면 발주탭부터
    }
  }
  switchDetailTab(autoTab || 'info');
  // 견적 건수 배지
  var all = []; try { all = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e) {}
  // 2026-08-31(선혜님 지시 - "더 디테일한 검사를 하길 바래"로 발견): 오늘
  // clientId 매핑 누락 버그(신화경 사례)와 정확히 같은 위험 패턴 - 여기는
  // id 체크 자체가 없이 무조건 이름으로만 세고 있었음. 동명이인이 있으면
  // 서로의 견적 건수가 합쳐져서 잘못된 숫자("N건")가 표시될 수 있었음.
  var estCnt = all.filter(function(e){ return (c.id && e.clientId) ? e.clientId === c.id : e.clientName === c.clientName; }).length;
  var cntEl = document.getElementById('dtab-est-cnt');
  if (cntEl) cntEl.textContent = estCnt > 0 ? estCnt+'건' : '';

  
  renderDetailStageSection(c, body, isMaster);

  
  renderDetailTodoSection(c, body);

  renderPaySection(c, payBody);

  
  renderAlimSection(c, alimBody);

  // 고객 정보 섹션
  renderDetailInfoSection(c, body);

  renderEstimateHistory(body, c.clientName, c.id);

  
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
  // 2026-08-31(선혜님 지시 - "더 디테일한 검사를 하길 바래"로 발견,
  // 오늘 신화경 사건이 실제로는 여기서부터 시작됐을 가능성이 높음):
  // "고객상세 화면 상단에 항상 보이는 현재 견적 요약"이 id 체크 없이
  // 무조건 이름으로만 매칭하고 있었음 - 동명이인이 있으면 다른 사람의
  // 최근 견적이 이 고객의 "현재 견적"인 것처럼 화면 맨 위에 표시될 수
  // 있었음(이력탭 안쪽이 아니라 처음 딱 보이는 자리라 더 위험).
  var myEsts = allEstsForCur.filter(function(e){ return (c.id && e.clientId) ? e.clientId === c.id : e.clientName === c.clientName; });
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
    // 2026-08-05: 위 "진행중인 견적"은 최신 견적서 금액(참고용)이고, 매출/성과
    // 계산에는 이 값이 아니라 customer.price가 실제로 쓰임 — 둘이 다른 소스라
    // 서로 어긋날 수 있어서(예: 견적을 여러개 받은 뒤 더 작은 금액으로 확정한
    // 경우), 실무자가 직접 확인·수정할 수 있게 별도로 명확히 표시
    var priceEditRow = document.getElementById('detail-price-edit-row');
    if (!priceEditRow) {
      priceEditRow = document.createElement('div');
      priceEditRow.id = 'detail-price-edit-row';
      priceEditRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)';
      curEstBox.parentNode.insertBefore(priceEditRow, curEstBox.nextSibling);
    }
    function renderPriceRow() {
      priceEditRow.innerHTML =
        '<span style="font-size:11px;color:var(--sub)">매출 계산 기준금액</span>' +
        '<span style="font-size:12px;font-weight:700;color:var(--dark);cursor:pointer;text-decoration:underline;text-decoration-style:dotted" id="price-edit-trigger">' + (Number(c.price)||0).toLocaleString() + '원 (수정)</span>';
      document.getElementById('price-edit-trigger').onclick = function() {
        var input = document.createElement('input');
        input.type = 'number'; input.value = c.price || 0;
        input.style.cssText = 'width:120px;padding:4px 8px;border:1px solid var(--terra);border-radius:6px;font-size:12px;text-align:right';
        priceEditRow.innerHTML = '<span style="font-size:11px;color:var(--sub)">매출 계산 기준금액</span>';
        priceEditRow.appendChild(input);
        input.focus(); input.select();
        function commit() {
          var v = Math.max(0, Number(input.value) || 0);
          var arr = loadCustomers();
          var target = arr.find(function(x){ return String(x.id) === String(c.id); });
          if (target) { target.price = v; target.performanceRevenue = v; }
          saveCustomers(arr);
          sbXHR('PATCH', 'customers?id=eq.' + c.id, { price: v, performance_revenue: v }, function(err){
            if (err) showToast('⚠️ 매출 기준금액이 서버에 반영되지 않았어요' + (err.zeroRows ? '(권한 문제일 수 있어요)' : '') + ' — 새로고침해서 확인해주세요');
          });
          c.price = v; c.performanceRevenue = v;
          renderPriceRow();
        }
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', function(e){ if(e.key==='Enter') input.blur(); });
      };
    }
    renderPriceRow();
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

  // 되돌릴 대상이 없는 상태(시공완료/취소/노쇼)에서는 케밥 메뉴 자체를 숨김
  // 2026-08-05: 9단계 전환 후 옛 이름 '완료'로 체크하던 잔여참조 버그 수정 —
  // 실제 stage값은 '시공완료'라 이 조건이 항상 true가 되어, 시공완료된 고객도
  // 계속 취소/노쇼 처리가 가능한 상태였음(7-12 규칙 위반 사례)
  var canCancelOrNoshow = ['시공완료', '취소', '노쇼'].indexOf(c.stage) === -1;

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
    if (['방문예약','상담','가견적'].indexOf(c.stage) >= 0) {
      var parkBtn = btn('display:block;width:100%;padding:10px 14px;border:none;background:#fff;font-size:12px;color:var(--dark);font-family:inherit;cursor:pointer;text-align:left;border-top:1px solid var(--border)','리드 보관', function(){
        if(confirm(c.clientName+'님을 대기 리드로 보관할까요? (고객목록에서는 계속 찾아볼 수 있어요)')) {
          var all = loadCustomers();
          var target = all.find(function(x){ return String(x.id) === String(c.id); });
          if (target) target.leadParked = true;
          saveCustomers(all);
          parkLead(c, function(){ closeDetail(); renderHome(true); });
        }
      });
      kebabMenu.appendChild(parkBtn);
    }
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
  // 2026-08-04: Make.com 웹훅이 실제로 연결 안 되어 있어서(webhook_url 빈값),
  // '자동'/'알림' 태그 알림들이 실제로는 아무도 발송하고 있지 않았음
  // (몇 달간 리마인더/안부 메시지가 안 나갔을 가능성). 진짜 자동화 연결
  // 전까지는, 놓치지 않도록 '지금 해야 할 일'에 같이 포함시킴 ('선택' 태그만 제외)
  var manualKeys = todoKeys.filter(function(k){ return ALIM_META[k] && ALIM_META[k].tag !== '선택'; });
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
  // 2026-08-10: 메모도 blur(포커스 아웃) 전에 새로고침 등으로 중단되면
  // 타이핑 내용이 날아가던 문제 - 고객ID별 임시저장 키로 해결.
  var memoDraftKey = 'dah_memo_draft_' + c.id;
  function getMemoDraft() { try { return localStorage.getItem(memoDraftKey) || ''; } catch(e) { return ''; } }
  function saveMemoDraft(v) { try { localStorage.setItem(memoDraftKey, v); } catch(e) {} }
  function clearMemoDraft() { try { localStorage.removeItem(memoDraftKey); } catch(e) {} }

  var memoBlock = div('background:#FFFBF5;border:1px solid #FFE5CC;border-radius:12px;padding:10px 14px;margin-bottom:var(--sp-2);cursor:pointer', []);
  renderMemoDisplay(memoBlock, c.memo || '');
  memoBlock.addEventListener('click', function() {
    if (memoBlock.querySelector('textarea')) return; // 이미 편집중이면 무시
    memoBlock.innerHTML = '';
    memoBlock.appendChild(el('div', {style:'font-size:11px;color:var(--terra);letter-spacing:0.8px;margin-bottom:4px', text:'메모'}));
    var textarea = document.createElement('textarea');
    var draftVal = getMemoDraft();
    textarea.value = draftVal || c.memo || '';
    textarea.style.cssText = 'width:100%;min-height:60px;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:12px;font-family:inherit;resize:vertical;box-sizing:border-box';
    textarea.addEventListener('input', function() { saveMemoDraft(textarea.value); });
    memoBlock.appendChild(textarea);
    var quickWrap = div('display:flex;flex-wrap:wrap;gap:4px;margin-top:6px', []);
    (typeof getMempoPhrases === 'function' ? getMempoPhrases() : []).slice(0, 9).forEach(function(p) {
      var qbtn = el('button', {type: 'button', style: 'font-size:11px;padding:6px 10px;min-height:32px;background:var(--ivory1);border:1px solid var(--border);border-radius:20px;cursor:pointer;font-family:inherit'});
      qbtn.textContent = p;
      qbtn.addEventListener('click', function(e) {
        e.stopPropagation();
        textarea.value = textarea.value ? textarea.value + ' / ' + p : p;
        saveMemoDraft(textarea.value);
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
        clearMemoDraft();
        saveCustomerToDb(target, function(err){
          showToast(err ? '⚠️ 메모: 로컬엔 저장됨(서버 재시도 대기)' : '메모가 저장됐습니다');
        });
      }
      renderMemoDisplay(memoBlock, newVal);
    });
  });
  infoSec.appendChild(memoBlock);

  // 2026-08-29: 카카오 알림톡 v3 재작성 시 추가 — #{결제링크} 변수용 저장란.
  // 결제선생/네이버페이 등에서 발급한 링크를 여기 한 번 저장해두면, 4-3/7-C/8-B 등
  // 카드결제 안내 알림톡 발송 때마다 다시 입력할 필요 없이 자동으로 채워짐.
  function renderPaymentLinkDisplay(block, val) {
    block.innerHTML = '';
    block.appendChild(el('div', {style:'font-size:11px;color:var(--terra);letter-spacing:0.8px;margin-bottom:3px', text:'결제 링크 (탭해서 편집 · #{결제링크} 변수로 사용)'}));
    block.appendChild(el('div', {style:'font-size:11px;color:'+(val?'var(--dark)':'var(--light)')+';line-height:1.6;word-break:break-all', text: val || '결제 링크를 추가하려면 눌러주세요'}));
  }
  var paymentLinkBlock = div('background:#FFFBF5;border:1px solid #FFE5CC;border-radius:12px;padding:10px 14px;margin-bottom:var(--sp-2);cursor:pointer', []);
  renderPaymentLinkDisplay(paymentLinkBlock, c.paymentLink || '');
  paymentLinkBlock.addEventListener('click', function() {
    if (paymentLinkBlock.querySelector('input')) return;
    paymentLinkBlock.innerHTML = '';
    paymentLinkBlock.appendChild(el('div', {style:'font-size:11px;color:var(--terra);letter-spacing:0.8px;margin-bottom:4px', text:'결제 링크'}));
    var input = document.createElement('input');
    input.type = 'text';
    input.value = c.paymentLink || '';
    input.placeholder = 'https://...';
    input.style.cssText = 'width:100%;min-height:36px;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:12px;font-family:inherit;box-sizing:border-box';
    paymentLinkBlock.appendChild(input);
    input.focus();
    input.addEventListener('blur', function() {
      var newVal = input.value.trim();
      var arr = loadCustomers();
      var target = findCurrentDetailCustomer(arr);
      if (target) {
        target.paymentLink = newVal;
        saveCustomers(arr);
        saveCustomerToDb(target, function(err){
          showToast(err ? '⚠️ 결제링크: 로컬엔 저장됨(서버 재시도 대기)' : '결제 링크가 저장됐습니다');
        });
      }
      renderPaymentLinkDisplay(paymentLinkBlock, newVal);
    });
  });
  infoSec.appendChild(paymentLinkBlock);

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
            saveCustomerToDb(target, function(err){
              showToast(err ? '⚠️ ' + item.label + ': 로컬엔 저장됨(서버 재시도 대기)' : item.label + '이 저장됐습니다');
            });
          } else {
            showToast(item.label + '이 저장됐습니다');
          }
          valueDiv.textContent = newVal || '—';
          valueDiv.style.color = newVal ? 'var(--dark)' : 'var(--light)';
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
  // 2026-08-27(선혜님 지시 - "실장도 삭제 권한 줘야 할 것 같아") →
  // 2026-08-28(선혜님 지시 - "삭제하면 보관처리 하지마", "실장도 완전삭제"):
  // 이제 "삭제"는 항상 완전삭제이므로, 앞으로는 이 isSoftDeleted 분기 자체를
  // 새로 만들 일이 없음(예전에 이미 보관 처리됐던 레거시 데이터만 여기 걸림).
  // 그런 레거시 건에 대해서도 마스터+본인담당실장 둘 다 완전삭제/복구
  // 가능하게 일관되게 맞춤.
  var canActOnThis = isMaster || (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'staff' && (c.staffName||'마스터') === currentUser.name);
  if (isSoftDeleted(c)) {
    if (canActOnThis) {
      bottomBtns.unshift(btn('flex:1;padding:11px;background:#fff;border:1px solid var(--dark);font-size:11px;font-family:inherit;cursor:pointer;color:var(--dark);font-weight:700;border-radius:12px', '↩ 복구', function(){ restoreCustomer(c.clientName, c.id); }));
      bottomBtns.unshift(btn('flex:1;padding:11px;background:#fff;border:1px solid #C0392B;font-size:11px;font-family:inherit;cursor:pointer;color:#C0392B;font-weight:700;border-radius:12px', '완전 삭제', function(){ permanentlyDeleteCustomer(c); }));
    }
  } else {
    bottomBtns.unshift(btn('flex:1;padding:11px;background:#fff;border:1px solid var(--border);font-size:11px;font-family:inherit;cursor:pointer;color:var(--dark);border-radius:12px', '삭제', deleteCustomer));
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
  // 2026-08-05: 옛 이름 '완료' 잔여참조 수정 — 실제 값은 '시공완료'라 이 확인창이 영원히 안 뜨고 있었음
  if (stage === '시공완료') { if (!confirm(currentDetailName + ' 고객을 "시공 완료"로 변경할까요?')) return; }
  var fromStage = target.stage;
  target.stage = stage;
  // 2026-08-10: 확정일 기록 - "확정견적" 단계로 처음 전환될 때만 기록(이미
  // confirmDate가 있으면 덮어쓰지 않음 - 나중에 단계를 왔다갔다해도 최초
  // 확정일 유지). 엑셀 다운로드에 확정일 컬럼 추가하면서 필요해진 필드.
  if (stage === '확정견적' && !target.confirmDate) {
    target.confirmDate = todayStr();
  }
  saveCustomers(arr);
  if (typeof logEvent === 'function') logEvent('stage_change', { from: fromStage, to: stage });
  renderHome(true); openDetail(currentDetailName, target.id);
  saveCustomerToDb(target, function(err){
    showToast(err ? ('⚠️ "' + stage + '"으로 변경(로컬만) — 서버 재시도 대기중') : ('"' + stage + '"으로 변경됐습니다'));
  });
}

// 2026-08-28(선혜님 지시 — "삭제하면 보관처리 하지마"): 예전엔 이 함수가
// 보관처리(is_archived=true)를 했었는데, 그게 나중에 "이미 등록된 고객"
// 오판 등 계속 혼란을 만들어서, 이제 "삭제"는 항상 완전삭제로 감. 별도
// 로직을 여기 다시 짜지 않고 permanentlyDeleteCustomer를 그대로 재사용함
// (같은 개념이 두 곳에 따로 있으면 한쪽만 고치고 잊어버리는 실수가
// 오늘 하루 계속 반복됐음 - 체크리스트 24번).
function deleteCustomer() {
  var arr = loadCustomers();
  var target = findCurrentDetailCustomer(arr);
  if (!target) { if (typeof showToast === 'function') showToast('고객 정보를 찾을 수 없어요'); return; }
  permanentlyDeleteCustomer(target);
}

// 2026-08-05: 진짜 완전 삭제 — 이중 확인(경고 문구 + 이름 재확인)을 거쳐야
// 실행됨. 되돌릴 방법이 전혀 없음.
//
// 2026-08-28(선혜님 지시 — "삭제하면 보관처리 하지마 그러면 자꾸 이런
// 헷갈리거나 중복되는 일이 생기는거 같아", 배재연 사례로 확인됨): 보관처리
// (소프트삭제)가 나중에 "이미 등록된 고객"으로 잘못 잡히는 등 계속 혼란을
// 만들어서, 이제 "삭제"는 항상 이 완전삭제 함수 하나로 통일함(deleteCustomer는
// 이 함수를 그대로 재사용 - 같은 로직을 두 번 안 짜기 위함, 체크리스트 24번).
// 마스터는 항상 가능, 실장은 본인 담당 고객만 가능(일관성 우선으로 선혜님
// 확인) - DB RLS(customers_delete)도 함께 확장해뒀음.
function permanentlyDeleteCustomer(c) {
  var isMasterUser = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'master';
  var isOwnStaffCustomer = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'staff' &&
    c && (c.staffName || '마스터') === currentUser.name;
  if (!isMasterUser && !isOwnStaffCustomer) {
    if (typeof showToast === 'function') showToast('본인 담당 고객만 삭제할 수 있어요');
    return;
  }
  var name = c.clientName || '고객';
  if (!confirm('⚠️ ' + name + '님 정보를 삭제할까요?\n\n이 작업은 절대 되돌릴 수 없어요. 견적서·결제기록 등 모든 정보가 완전히 사라져요.')) return;
  var typed = prompt('정말 삭제하려면 고객명을 정확히 입력해주세요: "' + name + '"');
  if (typed !== name) { showToast('입력한 이름이 정확하지 않아 취소됐어요'); return; }
  permanentlyDeleteCustomerFromDb(c, function(err) {
    if (err) { showToast('삭제 실패 — 다시 시도해주세요'); return; }
    var arr = loadCustomers().filter(function(x){ return String(x.id) !== String(c.id); });
    saveCustomers(arr);
    showToast(name + '님 정보가 완전히 삭제됐습니다');
    closeDetail(); renderHome(true);
  });
}

function restoreCustomer(clientName, id) {
  if (!confirm((clientName||'고객') + ' 정보를 복구할까요?')) return;
  var arr = loadCustomers();
  var target = id ? arr.find(function(c) { return String(c.id) === String(id); }) : arr.find(function(c) { return c.clientName === clientName; });
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
// 2026-08-29(선혜님 지시 - "코드정리 누락없이 다했니" 재점검으로 발견):
// showEstimateDetailPopup을 지운 여파로 그 안에서만 쓰이던
// parseEstimateItems/confirmEstimateToFinal/showRequestFromEstimate/
// showVendorOrderFromEstimate가 연쇄적으로 고아 코드가 됐던 걸 발견해
// 함께 제거함(실제 발주서/의뢰서 생성 로직인 buildVendorOrderFromLineItems/
// buildRequestFromLineItems는 계속 사용중이라 그대로 둠 - 그걸 새 창으로
// 띄우던 wrapper만 죽어있었음). 하나를 지우면 그 안에서만 쓰이던 것들도
// 같이 죽을 수 있다는 교훈 - 삭제할 때마다 다시 스캔해야 함.


// 2026-08-28(선혜님 지시 - "누락된 코드정리는 없니?"로 발견): showEstimateDetailPopup은
// 2026-08-24에 선혜님이 "세부내용 보기 팝업은 의미없다, 대신 고객용 견적서를
// 보여줘"라고 요청하셔서 printForCustomer()로 대체된 뒤 어디서도 안 불리던
// 죽은 코드였음 - 제거함.


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
    // 2026-08-29(선혜님 지시 - "코드도 다 봤어?"로 발견): 이 대시보드 버전이
    // 2026-08-04 최초 버전 그대로 방치돼서, 견적서 앱(est-documents.js)이
    // 8/24("겉지/속지 묶어서 표시")·8/28("공간+세부위치[메인] 구분, 겉/속커튼
    // 구성 표시")에 걸쳐 개선한 내용을 전혀 반영 못 하고 있었음 - 실측일 다시
    // 볼 때마다 낡은 형식(항목별 1:1 나열)으로 보이고 있었음. est-documents.js의
    // 최신 그룹핑 로직을 lineItems 배열 기반으로 그대로 포팅.
    function extractSubLoc(name) { var m = (name||'').match(/^\[([^\]]+)\]/); return m ? m[1] : ''; }
    function curtainRole(name) {
      if (/속커튼/.test(name)) return '속커튼';
      if (/겉커튼/.test(name)) return '겉커튼';
      return '커튼';
    }
    function groupLabel(space, subLoc) { return (space||'—') + (subLoc ? '['+subLoc+']' : ''); }
    var curtainGroups = {}, curtainOrder = [];
    var blindGroups = {}, blindOrder = [];
    items.forEach(function(it) {
      if (it.type === 'curtain') {
        var subLoc = extractSubLoc(it.displayName);
        var key = (it.space||'—')+'|'+subLoc;
        if (!(key in curtainGroups)) { curtainGroups[key] = { space: it.space, subLoc: subLoc, roles: {} }; curtainOrder.push(key); }
        var role = curtainRole(it.displayName);
        curtainGroups[key].roles[role] = (curtainGroups[key].roles[role]||0) + 1;
      } else if (it.type === 'blind') {
        var subLoc2 = extractSubLoc(it.displayName);
        var key2 = (it.space||'—')+'|'+subLoc2+'|'+(it.kind||'블라인드');
        if (!(key2 in blindGroups)) { blindGroups[key2] = { space: it.space, subLoc: subLoc2, kind: it.kind||'블라인드', count: 0 }; blindOrder.push(key2); }
        blindGroups[key2].count++;
      }
    });
    var lines = [];
    curtainOrder.forEach(function(key) {
      var g = curtainGroups[key], label = groupLabel(g.space, g.subLoc), roleKeys = Object.keys(g.roles);
      if (g.roles['겉커튼'] && g.roles['속커튼'] && roleKeys.length === 2) lines.push(label+' : 겉커튼+속커튼');
      else if (roleKeys.length === 1 && roleKeys[0] === '커튼') lines.push(label+' : 커튼 '+g.roles['커튼']+'장');
      else lines.push(label+' : '+roleKeys.map(function(r){ var n=g.roles[r]; return n>1 ? r+' '+n+'장' : r; }).join('+'));
    });
    blindOrder.forEach(function(key) {
      var g = blindGroups[key], label = groupLabel(g.space, g.subLoc);
      lines.push(label+' : '+g.kind+(g.count>1 ? ' '+g.count+'피스' : ''));
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

// 2026-08-29(선혜님 지시 - "견적서목록/고객상세의 이력탭에 버튼으로 다시
// 붙이기"): 8/24에 세부내용 팝업을 없애면서 이 두 wrapper도 같이 죽었던
// 걸 복원 - build*FromLineItems(실제 문서 생성 로직)는 계속 살아있었고,
// 이건 그걸 새 창으로 띄우기만 하는 얇은 래퍼임.
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

function openEstimate(name, id) {
  var useId = id || (typeof currentDetailId !== 'undefined' ? currentDetailId : null);
  // 2026-08-12: 예전엔 localStorage(dah_open_customer)로 고객정보를 넘기고
  // 페이지 이동했는데, 대시보드(dah-dashboard.vercel.app)와 견적서 앱
  // (dah-estimate.vercel.app)이 서로 다른 도메인이라 localStorage가 전혀
  // 공유되지 않아 "빈 화면"이 뜨는 버그였음(선혜님 실사용에서 확인됨).
  // URL 쿼리파라미터로 고객ID만 넘기고, 견적서 앱이 그 ID로 Supabase에서
  // 직접 조회하도록 변경 - 지역출장비/거래처목록과 동일한 해결 패턴.
  //
  // 2026-08-24(선혜님 발견 — "최시내 견적서 또 생겼다"): 이 버튼이 항상
  // loadCustId 경로로만 열려서, 기존 견적이 있는 고객이어도 _editingEstDbId가
  // 절대 세팅 안 되고 있었음 — 그래서 이 버튼으로 들어가서 "저장"만 눌러도
  // 매번 완전히 새 견적이 만들어졌음(오늘 발견된 다른 중복들 — Gbn, Hbug 등도
  // 같은 경로로 생겼을 가능성이 높음). 고객에게 이미 견적이 있으면
  // loadEstDbId+mode=edit로 열어서 "이어서 수정"이 되도록, 없으면(진짜 신규
  // 고객) 기존처럼 loadCustId로 열리도록 분기함.
  if (useId) {
    var latestUrl = SUPABASE_URL + '/rest/v1/estimates?client_id=eq.' + encodeURIComponent(useId) +
      '&is_archived=is.false&order=created_at.desc&limit=1&select=id';
    var lxhr = new XMLHttpRequest();
    lxhr.open('GET', latestUrl, true);
    lxhr.setRequestHeader('apikey', SUPABASE_KEY);
    lxhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
    lxhr.onload = function() {
      var latestId = null;
      try {
        var rows = JSON.parse(lxhr.responseText);
        if (rows && rows[0] && rows[0].id) latestId = rows[0].id;
      } catch(e) {}
      if (latestId) {
        window.location.href = 'dah-estimate.html?loadEstDbId=' + encodeURIComponent(latestId) + '&mode=edit';
      } else {
        window.location.href = 'dah-estimate.html?loadCustId=' + encodeURIComponent(useId);
      }
    };
    lxhr.onerror = function() {
      // 조회 실패시엔 예전처럼 loadCustId로라도 열리게(완전히 막히는 것보단 나음)
      window.location.href = 'dah-estimate.html?loadCustId=' + encodeURIComponent(useId);
    };
    lxhr.send();
  } else if (name) {
    window.location.href = 'dah-estimate.html?loadCustName=' + encodeURIComponent(name);
  } else {
    window.location.href = 'dah-estimate.html';
  }
}



var CONTRACT_LABELS = {pending:'가견적', contracted:'계약됨', rejected:'미계약'};
var STATUS_LABELS = {ga:'가견적서', final:'최종견적서'};

function renderEstimateHistory(container, clientName, clientId) {
  var estSec = el('div', {style:'margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)'});
  var hd = el('div', {style:'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px'});
  var lbl = el('div', {style:'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1px;text-transform:uppercase', text:'견적서'});
  hd.appendChild(lbl);
  estSec.appendChild(hd);

  var estimates = [];
  try {
    var all = JSON.parse(localStorage.getItem('dah_saved')||'[]');
    // 2026-08-31(선혜님 지시 - "더 디테일한 검사를 하길 바래"로 발견):
    // 고객상세 "정보" 탭의 견적서 목록도 id 체크 없이 무조건 이름으로만
    // 매칭하고 있었음 - 동명이인이면 여기서도 섞여 보일 수 있었음.
    estimates = all.filter(function(e){ return (clientId && e.clientId) ? e.clientId === clientId : e.clientName === clientName; });
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
        // 2026-08-24(선혜님 요청 — "한번만 눌러도 왔다갔다 되게"): 예전엔
        // 가견적→계약됨→미계약→가견적...으로 3단계를 순서대로만 돌아서,
        // 미계약에서 계약됨으로 되돌리려면 두 번 눌러야 했음. 이제 가견적
        // 상태에서만 첫 클릭이 계약됨으로 가고, 계약됨↔미계약은 클릭 한 번
        // 으로 바로 왔다갔다 하도록 변경.
        var next = cur === 'rejected' ? 'contracted'
                 : cur === 'contracted' ? 'rejected'
                 : 'contracted';
        // 2026-08-24(선혜님 요청 — "확인창이 한번 더 떠야 전문성이 있지"):
        // 매출 집계에도 영향을 주는 값이라, 실수로 잘못 눌러 바뀌는 걸
        // 막기 위해 바꾸기 전에 한 번 확인받도록 함.
        var label = entry.clientName || '이 고객';
        if (!confirm(label + ' 님을 "' + CONTRACT_LABELS[next] + '"(으)로 변경할까요?')) return;
        entry.contractStatus = next;

        try {
          var arr = JSON.parse(localStorage.getItem('dah_saved')||'[]');
          var idx = arr.findIndex(function(x){ return x.id === entry.id || x.no === entry.no; });
          if (idx>=0) { arr[idx].contractStatus = next; localStorage.setItem('dah_saved', JSON.stringify(arr)); }
        } catch(ex2){}
        // 2026-08-24(선혜님 질문 — "계약을 안 할 수도 있는데 이런 경우 어떻게
        // 잡으면 좋을까"): 이 배지가 로컬(그 브라우저)에만 저장되고 서버엔
        // 전혀 안 남고 있었음 — 다른 기기에서 보거나, 클라우드에서 다시
        // 동기화되면 "미계약" 표시가 사라짐(estimates 테이블에 이 상태를
        // 저장할 컬럼 자체가 없었음). contract_status 컬럼을 새로 만들고
        // 여기서 서버에도 저장하도록 함 — 이제부터 이 배지를 누르면
        // 기기/새로고침과 무관하게 유지됨.
        if (entry.id && typeof entry.id === 'string' && entry.id.length > 20 && typeof sbXHR === 'function') {
          sbXHR('PATCH', 'estimates?id=eq.' + entry.id, { contract_status: next }, function(err){
            if (err) console.warn('계약상태 서버 저장 실패:', err);
          });
        }
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

    if (e.dbId) {
      var actionRow = el('div', {style:'display:flex;gap:6px;margin-top:8px'});
      var editBtn = el('button', {style:
        'flex:1;font-size:11px;font-weight:600;padding:7px;border-radius:8px;' +
        'border:1px solid var(--border);background:#fff;color:var(--dark);cursor:pointer;font-family:inherit;min-height:32px'
      });
      editBtn.textContent = '열어서 수정';
      (function(dbId){
        editBtn.addEventListener('click', function(ev){
          ev.stopPropagation();
          window.location.href = 'dah-estimate.html?loadEstDbId=' + encodeURIComponent(dbId) + '&mode=edit';
        });
      })(e.dbId);
      var copyBtn = el('button', {style:
        'flex:1;font-size:11px;font-weight:600;padding:7px;border-radius:8px;' +
        'border:1px solid var(--border);background:#fff;color:var(--dark);cursor:pointer;font-family:inherit;min-height:32px'
      });
      copyBtn.textContent = '복사해서 새로 만들기';
      (function(dbId){
        copyBtn.addEventListener('click', function(ev){
          ev.stopPropagation();
          window.location.href = 'dah-estimate.html?loadEstDbId=' + encodeURIComponent(dbId) + '&mode=copy';
        });
      })(e.dbId);
      actionRow.appendChild(editBtn); actionRow.appendChild(copyBtn);
      // 2026-08-28(선혜님 지적 — "위 이미지에서 개별 견적서 삭제는 왜 안되지
      // 전체 삭제만 되게 했지??"): 맨 위 "견적서" 탭엔 이미 개별 삭제(🗑)
      // 버튼이 있었는데, 이 고객상세 화면의 견적서 목록엔 애초에 코드
      // 자체가 없었음(열기/복사만 있었음). 같은 archiveEstimate() 함수를
      // 그대로 재사용해서 여기도 추가함(완전삭제로 동작하도록 함께 수정됨).
      var delBtn2 = el('button', {style:
        'flex:0 0 40px;font-size:13px;padding:7px;border-radius:8px;' +
        'border:1px solid #F0D8D5;background:#fff;color:#C0392B;cursor:pointer;font-family:inherit;min-height:32px'
      });
      delBtn2.textContent = '🗑';
      delBtn2.title = '삭제';
      (function(estObj){
        delBtn2.addEventListener('click', function(ev){
          ev.stopPropagation();
          var label = (estObj.clientName || currentDetailName || '이름없음') + ' · ' + (Number(estObj.price)||0).toLocaleString() + '원';
          if (!confirm(label + '\n\n⚠️ 이 견적서를 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
          // archiveEstimate()는 est.id(서버 UUID)를 기준으로 판단하는데,
          // 이 카드 객체는 서버ID가 e.dbId에 들어있어서 명시적으로 매핑.
          archiveEstimate({ id: estObj.dbId, no: estObj.no, clientName: estObj.clientName, price: estObj.price }, function(err){
            if (err) { if (typeof showToast === 'function') showToast('⚠️ 삭제가 서버에 반영되지 않았어요' + (err.zeroRows ? '(권한 문제일 수 있어요)' : '') + ' — 새로고침해서 확인해주세요'); return; }
            if (typeof showToast === 'function') showToast('완전히 삭제했어요');
            openDetail(currentDetailName, currentDetailId); // 목록 새로고침
          });
        });
      })(e);
      actionRow.appendChild(delBtn2);
      card.appendChild(actionRow);
    } else {
      // 2026-08-12 이전에 저장된 견적서는 서버 레코드 id(dbId)가 없어서
      // 정확히 다시 열 방법이 없음 - 소급 적용 안 됨(confirmDate/custType과 동일한 한계)
      var noteEl = el('div', {style:'font-size:10px;color:var(--sub);margin-top:6px', text:'이전 저장 견적 — 열기/복사 불가 (새로 작성한 견적부터 가능)'});
      card.appendChild(noteEl);
    }

    estSec.appendChild(card);
  });

  container.appendChild(estSec);
}
