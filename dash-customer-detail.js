/* ══════════════════════════════════════════════════
   DAH 대시보드 — 고객상세 모달 기능
   고객 상세보기, 단계변경, 결제(선금/잔금) 관리, 알림톡 발송,
   고객 추가/수정, 견적서 이력 표시.
   ══════════════════════════════════════════════════ */

// 2026-09-08(선혜님 지적 - "지금 단계는 제대로 들어갔어(칸반) 근데 위에
// 가견적이 나오는게 맞아?? 현재단계가 나와야 할꺼 같은데"로 처음 발견,
// "이전부터 계속 말했던 오류 아니니"로 재발 확인): 견적서 카드에 계약
// 상태(contract_status - 사람이 직접 배지를 눌러야만 바뀌는 별도 필드)를
// 보여주는 로직이 renderDetailEstTabInner()와 renderEstimateHistory()
// 두 곳에 독립적으로 존재했음(쌍둥이 함수 패턴) - 처음엔 앞의 것만 고쳐서
// "고객상세 > 정보 탭"(renderEstimateHistory가 그리는 화면)에서는 여전히
// 예전 계약상태 배지가 남아있었음. 두 곳 모두 이 전역 헬퍼를 쓰도록 통일.
function getCustomerCurrentStage(clientName, clientId) {
  try {
    var custArr = loadCustomers();
    var thisCust = custArr.find(function(x){ return clientId ? x.id === clientId : x.clientName === clientName; });
    return thisCust ? (thisCust.stage || '') : '';
  } catch(eStage) { return ''; }
}
function stageColorFor(stage) {
  if (DAH_PRE_CONTRACT_STAGES.indexOf(stage) >= 0) return '#8A8378';
  if (stage === '시공완료') return '#2F6690';
  return 'var(--terra)';
}

// 단계 순서는 shared-common-utils.js의 DAH_STAGE_ORDER 한 곳에만 있음(2026-09-29 코드정리)
var STAGES = DAH_STAGE_ORDER;
// 2026-08-05: STAGES_ALL(옛 6단계 이름 배열)은 코드베이스 어디서도 참조되지 않는
// 죽은 코드였고 이름까지 옛것이라 혼동 소지가 있어 제거함

// 2026-09-11: 22개 → 13개로 재통합(선혜님 지시). A/B/C/D 4개 신규 항목은
// 구조가 같은 옛 항목들을 변수화해서 합침(merged 주석에 원본 표시). 담백한
// 톤으로 재작성 완료(습니다체/겠어요/과한 친밀표현/반복형용사 전부 제거,
// 스크립트로 검증함). 11·12번은 혜택성 문구(사은품/할인) 삭제 — 알림톡은
// 정보성 메시지만 허용되고 혜택은 친구톡 전용이라 심사 반려 위험 있었음.
// 신규 변수(#{방문유형},#{일정유형},#{금액유형},#{환불안내},#{공간})는
// 발송 시점의 트리거 컨텍스트로 자동 매칭 예정(사람이 고르지 않음) — 아직
// 트리거감지 함수가 없어서 지금은 수동 발송 시 미리보기에서 직접 채움.
var STAGE_ALIM = {
  방문예약: ['t00_reservation','t01_survey','tA_visit_dday'],
  상담:   ['t00_reservation','tA_visit_dday','t03_estimate'],
  가견적: ['t03_estimate','tC_payment'],
  선금결제: ['tC_payment','tB_schedule_confirm'],
  실측준비중:   ['tB_schedule_confirm','tA_visit_dday','t07_final_estimate'],
  확정견적: ['t07_final_estimate','tC_payment'],
  잔금결제:   ['tC_payment','tB_schedule_confirm'],
  시공준비중:   ['tB_schedule_confirm','tA_visit_dday'],
  시공완료:   ['t11_after_install']
};
// 특정 단계에 묶이지 않는 항목(취소/노쇼/재고이슈) — "취소·기타" 카테고리에서 표시
var OTHER_ALIM_KEYS = ['tD_cancel','t14_noshow','t15_restock_split'];
var ALIM_META = {
  t00_reservation: {label:'1. 예약 확인', desc:'수동 · 즉시', tag:'수동', button:'[오시는 길 보기] → https://naver.me/59vSkG3Y',
    template:'#{고객명}님, 안녕하세요 드로잉엣홈입니다 🙂\n\n쇼룸 방문 예약이 확인됐어요 ✔\n\n방문 일정: #{방문일시}\n위치: 서울 서초구 반포동 (예약제 운영)\n쇼룸 바로 옆 주차장을 이용해 주세요.\n\n1:1 예약제로 운영되어 방문이 어려우신 경우\n하루 전까지 연락 부탁드려요.\n\n궁금하신 점은 편하게 말씀해 주세요 🙂'},
  // 2026-09-12(카카오 알림톡 검수 반려 - "수신 대상을 명확하게 확인하기
  // 어려움, 어떤 액션으로 발송되는지 메시지 내 추가": 실제 채널톡에
  // 등록했던 예전 버전이 이 문구로 반려됨): 알림톡은 "고객이 어떤 행동을
  // 해서 이 메시지가 오는지"가 문구 안에 명확히 있어야 함. "예약해
  // 주셔서 감사해요" 트리거 문구를 첫 줄에 추가해서 재반려 방지.
  t01_survey: {label:'2. 설문지 발송', desc:'자동 · 예약확인 30분~1시간 후', tag:'자동', button:'[설문지 작성하기] → https://dah-estimate.vercel.app/survey',
    template:'#{고객명}님, 안녕하세요 드로잉엣홈입니다 🙂\n\n쇼룸 방문 예약해 주셔서 감사해요 ✔\n방문 전 설문지를 미리 작성해 주시면\n상담 시간을 줄이고 공간에 맞는 원단을\n미리 준비해드릴 수 있어요.\n\n3분이면 충분해요.\n설문지: https://dah-estimate.vercel.app/survey'},
  // 옛 2번(방문전날)+6번(실측전날)+10번(시공전날) 통합. #{방문유형}=쇼룸/실측/시공
  tA_visit_dday: {label:'3. 방문 전날 안내 (쇼룸·실측·시공 공통)', desc:'자동 · D-1', tag:'자동',
    template:'#{고객명}님, 안녕하세요 드로잉엣홈입니다 🙂\n\n내일 #{방문유형} 예정이에요 ✔\n\n일정: #{일정}\n\n오늘 중으로 전담팀에서\n정확한 방문 시간 안내 전화드릴게요.\n\n편하게 기다려 주세요 🙂'},
  // 2026-09-14(선혜님 지시): 고객용 견적서 공개보기 페이지(est-public-view.js)
  // 완성 후 버튼으로 연결. #{견적번호}는 발송 시점에 sendAlimtalk가
  // 그 고객의 최신 견적 ID를 DB에서 조회해서 자동으로 채움(사람이
  // 직접 입력 안 해도 됨) - 재구매 등으로 여러 견적이 있어도 항상
  // "가장 최근 것"으로 연결됨.
  t03_estimate: {label:'4. 가견적서 발송', desc:'수동 · 상담 당일', tag:'수동', button:'[가견적서 보기] → https://dah-estimate.vercel.app/view?id=#{견적번호}',
    template:'#{고객명}님, 안녕하세요 드로잉엣홈입니다 🙂\n\n오늘 상담 감사드려요 ✔\n\n가견적서를 아래에 정리해드렸어요.\n\n계약금(총 금액의 50%) 결제 후\n실측 일정을 잡아드리며,\n실측 후 정확한 치수로 최종 견적을 다시 안내드려요.\n\n진행을 원하시면 편하게 말씀해 주세요 🙂'},
  // #{공간}: 상담 시 등록된 공간명(거실/안방 등), 없으면 그 줄 생략
  // 2026-09-16(카카오 검수 반려 - "요청하지 않은 리마인드는 광고성"으로
  // 최종 판단해서 5번(팔로업) 완전 제거함. "고객이 이미 확정한 일에
  // 대한 필수 안내"가 아니라 "아직 결정 안 한 걸 다시 권하는" 내용이라
  // 문구를 아무리 다듬어도 통과 불가 - 선혜님 지시로 알림톡 목록에서
  // 아예 삭제. 필요하면 나중에 브랜드메시지(광고성 허용)로 별도 재검토.
  // 옛 4-1(결제방법확인)+4-2(계약금현금)+4-3(계약금카드)+8(잔금리마인드) 통합.
  // "물어보고→답장받고→골라서 재발송"하던 2단계를 계좌+카드 동시안내 1단계로 단순화.
  // #{금액유형}=계약금/잔금
  // 2026-09-12(같은 반려 기준 선제 적용): "진행 확정해 주셔서" 트리거
  // 문구 추가 — 계약금/잔금 둘 다 고객이 앞 단계 진행에 동의했기 때문에
  // 나가는 안내라 공통으로 걸리는 표현.
  // 2026-09-14(선혜님 지시 - 결제선생 실제 링크 2개 비교로 확인): 링크
  // 구조가 매번 달라서("bill.payssam.kr/receipt/bill/코드" vs
  // "bill.payssam.kr/코드?share=코드2") 카카오의 "고정prefix+변수" 버튼
  // URL 규칙에 안 맞음 - "https://"만 고정하면 사실상 버튼 의미가 없어져서
  // 버튼 자체를 포기. 본문 텍스트의 "#{결제링크}"가 카카오톡에서 자동으로
  // 눌리는 링크가 되므로 버튼 없이도 정상 작동.
  // 2026-09-14(선혜님 재확인 - "전문업체 입장으로 보면 이게 맞는거 확실해??"):
  // 검색해보니 실제 업계 자료(비즈고 2026-01)에 "텍스트 URL은 스팸필터·
  // 고객불신·낮은 클릭률 문제가 있어 버튼이 정답"이라고 나와있어서, "버튼
  // 포기하고 텍스트만" 판단을 뒤집음. 버튼 URL엔 "https://"만 고정하고
  // 나머지 전체를 변수로 등록(채널톡이 실제로 이 형식은 통과시킴, 완전히
  // 빈 "#{결제링크}"만 있는 건 반려됨 - 선혜님이 직접 확인). 본문 텍스트도
  // 같은 형식("https://#{결제링크}")으로 맞춰서, 저장된 링크 값 자체엔
  // "https://"가 들어있어도(fillAlimTemplate에서 자동으로 떼어내므로)
  // "https://https://..." 이중 접두어 사고가 안 나게 함.
  tC_payment: {label:'6. 결제 안내 (계약금·잔금 공통)', desc:'수동/자동 겸용 · 계약금·잔금 요청 시 · 잔금 미납 2일 후', tag:'수동/자동 겸용', button:'[카드로 결제하기] → https://#{결제링크}',
    template:'#{고객명}님, 안녕하세요 드로잉엣홈입니다 🙂\n\n진행 확정해 주셔서 #{금액유형} 안내드릴게요 ✔\n\n계좌이체: 국민은행 015401-04-258798\n(예금주: 장선혜(드로잉엣홈))\n카드결제: https://#{결제링크}\n금액: #{금액}원\n\n현금영수증 발급을 원하시면 휴대폰 번호를 남겨주세요.\n\n입금 확인 후 다음 단계 안내드릴게요 🙂'},
  t07_final_estimate: {label:'7. 확정 견적서 발송', desc:'수동 · 실측 완료 후', tag:'수동', button:'[확정견적서 보기] → https://dah-estimate.vercel.app/view?id=#{견적번호}',
    // 2026-09-15(카카오 검수 반려 - "수신 대상을 명확하게 확인하기 어려움,
    // 어떤 액션으로 발송되는지 문구에 추가해달라": "실측 치수를 바탕으로"
    // 만으로는 트리거가 불명확하다고 판단됨 - "실측을 완료해 주셔서"로
    // 명확한 트리거 문구로 교체(2번/6번 등 승인된 템플릿과 같은 패턴).
    template:'#{고객명}님, 안녕하세요 드로잉엣홈입니다 🙂\n\n실측을 완료해 주셔서\n최종 견적서를 정리해드렸어요 ✔\n\n실측 사이즈에 따라 가견적과\n금액이 달라질 수 있어요.\n\n잔금 안내는 이어서 드릴게요.\n궁금한 점 있으시면 말씀해 주세요 🙂'},
  // 옛 5번(실측일정확정)+9번(시공일정확정)+18번(AS접수확인) 통합. #{일정유형}=실측/시공/AS
  tB_schedule_confirm: {label:'8. 일정 확정 (실측·시공·AS 공통)', desc:'수동 · 계약금·잔금 결제 확인 후 · AS 접수 시', tag:'수동',
    template:'#{고객명}님, 안녕하세요 드로잉엣홈입니다 🙂\n\n#{일정유형} 일정을 확정해드렸어요 ✔\n\n일정: #{일정}\n\n정확한 방문 시간은 전날 오후에\n전담팀에서 직접 연락드릴게요.\n\n필요하신 점 있으시면 언제든 말씀해 주세요 🙂'},
  // 2026-09-14(선혜님이 실제 승인된 다른 템플릿 보여주심 - "시공완료
  // 템플릿인데 사은품 얘기 있어도 승인됐다고 하던데"): 카카오 정책에
  // "이미 완료된 행동(구매/이용완료)에 대한 보상으로 조건이 명확히
  // 적혀있는 사은품은 광고성으로 안 보고 알림톡 허용"하는 예외가 실제로
  // 있음 - 새 구매를 유도하는 게 아니라 이미 끝난 시공에 대한 후기
  // 요청이라 이 예외에 해당. v3 원본에 있던 사은품 문구를 다시 복원
  // (9/11에 과하게 삭제했었음). 12번(재구매유도)의 "5% 할인"은 앞으로의
  // 새 구매를 유도하는 다른 성격이라 계속 제외.
  t11_after_install: {label:'9. 시공 후 안부', desc:'자동 · 시공완료 3일 후', tag:'자동', button:'[네이버 리뷰 작성] → https://naver.me/59vSkG3Y',
    template:'#{고객명}님, 안녕하세요 드로잉엣홈입니다 🙂\n\n시공이 완료됐어요, 축하드려요 🎉\n생활하시다가 불편한 점 있으시면 편하게 말씀해 주세요.\n\n아래 중 한 가지 방법으로 후기 작성 후\n원본 사진과 리뷰 링크를 카톡으로 보내주시면\n소정의 사은품을 보내드려요 🙏\n\n네이버 플레이스 리뷰\n네이버 블로그 후기\n네이버 카페 후기\n\n네이버 리뷰: https://naver.me/59vSkG3Y'},
  // 2026-09-16(카카오 검수 반려 - "요청하지 않은 리마인드/구매유도는
  // 광고성"으로 최종 판단해서 10번(재구매유도) 완전 제거함. 05번(팔로업)과
  // 같은 이유 - 선혜님 지시로 알림톡 목록에서 삭제. 필요하면 나중에
  // 브랜드메시지로 별도 재검토.

  // 옛 13번(취소안내)+16번(취소-실측전)+17번(취소-실측후) 통합. #{환불안내}는
  // 상황별 환불 문구, 해당 없으면(예약단계 취소 등) 빈 줄로 생략됨
  tD_cancel: {label:'11. 취소 안내', desc:'수동 · 취소 접수 시', tag:'수동',
    template:'#{고객명}님, 안녕하세요 드로잉엣홈입니다 🙂\n\n취소 접수 확인했어요.\n\n#{환불안내}\n\n나중에 필요하실 때 다시 연락 주세요 🙂'},
  t14_noshow: {label:'12. 노쇼 재예약 안내', desc:'수동 · 노쇼 처리 후', tag:'수동',
    template:'#{고객명}님, 안녕하세요 드로잉엣홈입니다 🙂\n\n오늘 방문이 어려우셨나요?\n\n일정 조율이 필요하시면 편하게 말씀해 주세요.\n재예약 도와드릴게요 🙂'},
  t15_restock_split: {label:'13. 재고 없음 · 2차 시공 안내', desc:'수동', tag:'수동',
    template:'#{고객명}님, 안녕하세요 드로잉엣홈입니다 🙂\n\n주문하신 제품 중\n일부 재고 확인이 필요해요 ✔\n\n재고 상황에 따라 2차 시공으로\n나눠서 진행해드릴 수 있어요.\n\n일정은 별도로 안내드릴게요.\n불편을 드려 죄송해요 🙂'},
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


var DETAIL_TABS = ['info', 'pay', 'alim', 'order', 'est', 'as'];
function switchDetailTab(tab) {
  var panels = { info:'detail-body', pay:'detail-pay-body', alim:'detail-alim-body', order:'detail-order-body', est:'detail-est-body', as:'detail-as-body' };
  var tabBtns = { info:'dtab-info', pay:'dtab-pay', alim:'dtab-alim', order:'dtab-order', est:'dtab-est', as:'dtab-as' };
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
  if (tab === 'as') { var c = findCurrentDetailCustomer(loadCustomers()); if (c) renderASSection(c, document.getElementById('detail-as-body')); }
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
  // 2026-09-13(선혜님 - "동시저장충돌" 원인 조사 후 결정): 이 고객상세를
  // 여는 순간 "나 지금 이 고객 보고 있음"을 알리고, 다른 사람이 이미
  // 보고 있으면 배너로 알려줌(renderDetailStageSection 등이 body를 다시
  // 채우기 전에 먼저 걸어둬야, 나중에 다른 사람이 들어와도 배너가
  // body 맨 위에 유지됨).
  if (typeof joinCustomerPresence === 'function' && c.id) {
    joinCustomerPresence(c.id, renderPresenceBanner);
  }
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
    var estPayForAutoTab = (typeof getLatestEstPay === 'function') ? getLatestEstPay(c) : c;
    if ((c.stage === '선금결제' && !estPayForAutoTab.depositAmount) || (c.stage === '잔금결제' && !estPayForAutoTab.balanceAmount)) {
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

  // 2026-09-21(선혜님 - "그럼 언제 하라는거지??????" → 견적서별 결제
  // 관리로 구조 전환): 결제는 이제 "고객 하나"가 아니라 "견적서 각각"에
  // 속함 - 이 고객의 견적서를 전부 찾아서(최신순), 각각에 대해
  // renderPaySection을 반복 호출. 견적서가 하나도 없으면(신규 고객,
  // 아직 견적서를 만든 적 없음) est 없이 한 번 호출해서 예전처럼
  // 고객(customers) 레벨 결제 폴백을 그대로 씀.
  //
  // 2026-09-21(선혜님 지적 - "근본까지 하자": 김은/황남주 실사례로 발견한
  // 진짜 근본 원인): 위 "견적서가 있는지" 판단이 이 기기의 로컬 캐시
  // (dah_saved)만 보고 있어서, 서버엔 견적서가 실제로 있어도 이 기기
  // 로컬에 그게 없으면(다른 기기에서 결제 처리했거나 캐시가 비어있던
  // 경우) "견적서 없음"으로 잘못 판단해 예전 고객레벨 저장으로 조용히
  // 되돌아가고 있었음 - 오늘 하루 종일 봤던 "로컬 캐시 vs 서버 불일치"
  // 계열의 근본 원인이 바로 여기였음. 화면은 로컬 캐시로 일단 빠르게
  // 그리되(체감 지연 없음), 그 직후 서버에서 진짜 견적서 목록을 한 번
  // 더 확인해서 로컬 캐시가 틀렸으면(서버엔 있는데 로컬엔 없었으면)
  // 캐시를 바로잡고 화면을 다시 그려서, 항상 서버가 최종 진실이 되게 함.
  function renderPayTabContent(estsForPay) {
    payBody.innerHTML = '';
    var sorted = estsForPay.slice().sort(function(a,b){ return (b.savedAt||b.date||'') > (a.savedAt||a.date||'') ? 1 : -1; });
    if (sorted.length === 0) {
      renderPaySection(c, payBody);
    } else {
      sorted.forEach(function(e, idx) {
        var dt = e.savedAt ? new Date(e.savedAt) : (e.date ? new Date(e.date) : null);
        var dateStr = dt ? ((dt.getMonth()+1) + '/' + dt.getDate() + ' 작성') : '';
        var statusStr = e.contractStatus === 'contracted' ? '확정견적' : '가견적';
        var label = '견적서 ' + (sorted.length - idx) + (sorted.length > 1 ? ('/' + sorted.length) : '') + (dateStr ? (' · ' + dateStr) : '') + ' · ' + statusStr;
        renderPaySection(c, payBody, {
          id: e.id, price: e.price,
          depositAmount: e.depositAmount, depositDate: e.depositDate, depositMethod: e.depositMethod, depositReceipt: e.depositReceipt,
          balanceAmount: e.balanceAmount, balanceDate: e.balanceDate, balanceMethod: e.balanceMethod, balanceReceipt: e.balanceReceipt,
          estimateLabel: label
        });
      });
    }
  }
  var allEstsForPaySection = [];
  try { allEstsForPaySection = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(ePaySec) {}
  var myEstsForPaySection = allEstsForPaySection.filter(function(e){ return (c.id && e.clientId) ? e.clientId === c.id : e.clientName === c.clientName; });
  renderPayTabContent(myEstsForPaySection);
  // 로컬 캐시가 "견적서 없음"으로 봤을 때만 서버로 재확인(있으면 캐시를
  // 바로잡고 다시 그림) - 로컬에 이미 견적서가 있으면 그 안의 결제정보
  // 자체가 최신인지는 다른 화면(견적서 저장 시)이 책임지므로, 여기서는
  // "아예 없다고 잘못 판단하는" 사고만 정확히 겨냥해서 막음.
  if (myEstsForPaySection.length === 0 && c.id && typeof sbXHR === 'function') {
    sbXHR('GET', 'estimates?client_id=eq.' + encodeURIComponent(c.id) + '&select=id,client_id,client_name,price,deposit_amount,deposit_date,deposit_method,deposit_receipt,balance_amount,balance_date,balance_method,balance_receipt,contract_status,created_at,updated_at&order=updated_at.desc', null, function(err, rows) {
      if (err || !Array.isArray(rows) || rows.length === 0) return; // 서버도 진짜 없으면 로컬 판단이 맞았던 것 - 그대로 둠
      // 2026-09-21(재검증 중 발견 - pay-changestage-lock-sync-check.js가
      // 갑자기 실패하며 발견): 응답이 배열이고 길이가 0보다 크다는 것만
      // 확인하면, 이 요청과 무관한 다른 종류의 응답(다른 테스트 목업의
      // 범용 폴백 등)까지 "진짜 견적서 찾음"으로 잘못 받아들일 수 있음 -
      // client_id가 정확히 이 고객과 일치하는 행만 진짜로 인정.
      var validRows = rows.filter(function(r){ return String(r.client_id) === String(c.id); });
      if (validRows.length === 0) return;
      var serverEsts = validRows.map(function(r){
        return {
          id: r.id, clientId: r.client_id, clientName: r.client_name, price: r.price,
          depositAmount: r.deposit_amount, depositDate: r.deposit_date, depositMethod: r.deposit_method, depositReceipt: r.deposit_receipt,
          balanceAmount: r.balance_amount, balanceDate: r.balance_date, balanceMethod: r.balance_method, balanceReceipt: r.balance_receipt,
          contractStatus: r.contract_status, savedAt: r.updated_at || r.created_at
        };
      });
      try {
        var cacheArr = JSON.parse(localStorage.getItem('dah_saved')||'[]');
        var existingIds = {}; cacheArr.forEach(function(x){ if (x.id) existingIds[x.id] = true; });
        serverEsts.forEach(function(se){ if (!existingIds[se.id]) cacheArr.push(se); });
        localStorage.setItem('dah_saved', JSON.stringify(cacheArr));
      } catch(eCacheFix) {}
      if (currentDetailId === c.id) {
        // 2026-09-21(선혜님 - "안전하게 해야지" 지시로 보강): 서버 재확인
        // 응답이 도착하는 그 찰나에, 사용자가 이미 (로컬 캐시 기준 폴백
        // 폼에) 선금/잔금 금액을 입력하기 시작했다면, 화면을 통째로
        // 다시 그리면 입력 중이던 값이 사라짐 - 로컬 캐시 자체는 이미
        // 위에서 서버 기준으로 바로잡았으니(cacheArr 저장 완료), 지금
        // 당장 화면을 갱신 안 해도 다음에 이 고객 상세를 다시 열 때는
        // 정확하게 나옴. 입력 필드에 값이 있거나 포커스가 결제 영역
        // 안에 있으면 지금은 다시 그리지 않고 건너뜀.
        var hasUserInput = /** @type {HTMLInputElement[]} */ (Array.from(payBody.querySelectorAll('input[placeholder="선금 금액"], input[placeholder="잔금 금액"]')))
          .some(function(inp){ return inp.value && inp.value.trim() !== ''; });
        var hasFocusInside = payBody.contains(document.activeElement);
        if (!hasUserInput && !hasFocusInside) {
          renderPayTabContent(serverEsts);
        }
      }
    });
  }

  
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
  if (_dsb) { _dsb.textContent = getDisplayStageLabel(c); }

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
  // 2026-09-19(선혜님 - "노지경님 견적서가 1개였는데 내가 한개를 더
  // 넣었어... 2건에 대한 건 없고 이거뿐이야" / "그래야지" - 확인 후
  // 진행): "진행중인 견적" 요약이 이 고객의 견적서가 여러 건이어도
  // 항상 "가장 최근 것 하나"만 보여주고 있었음 - 앞서 매출 계산
  // 기준금액(customers.price)은 여러 견적서 합산으로 고쳤는데, 이
  // 요약 박스는 그 데이터 소스 자체가 다른 별개 표시(dah_saved 로컬
  // 캐시)라 안 고쳐져 있었음. openDetail()이 이미 loadEstimatesAsync()
  // 로 서버 최신 목록을 받아온 뒤에만 이 화면을 그리므로(2026-08-28
  // 확인), myEsts는 이 시점에 신뢰 가능한 "이 고객의 전체 견적서
  // 목록" - 최신 것 하나가 아니라 전체 합계로 보여줌.
  var estSumForCur = 0, itemSumForCur = 0;
  myEsts.forEach(function(e) {
    estSumForCur += Number(e.price) || 0;
    itemSumForCur += Number(e.itemCount) || 0;
  });
  if (curEstBox) {
    if (latestEst) {
      var amt = estSumForCur.toLocaleString()+'원';
      var itemLabel = itemSumForCur ? ('총 '+itemSumForCur+'개 품목') : '';
      var countLabel = myEsts.length > 1 ? (' · 견적서 '+myEsts.length+'건') : '';
      curEstBox.innerHTML =
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
          '<span style="width:6px;height:6px;border-radius:50%;background:var(--terra);display:inline-block"></span>' +
          '<span style="font-size:11px;font-weight:600;color:#B85A2E;letter-spacing:0.3px">진행중인 견적' + (itemLabel ? ' · '+itemLabel : '') + countLabel + '</span>' +
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
    // 2026-09-15(선혜님 지적 - "같은 숫자가 두 번 뜬다, 전문업체 기준
    // 만족스럽니??"로 재검토): "진행중인 견적"(최신 견적서 금액)과
    // "매출 계산 기준금액"(customer.price)이 서로 다른 소스인 건 맞지만,
    // 실무에서 거의 항상 같은 값이라(둘 다 안 어긋난 경우가 대부분)
    // 매번 똑같은 숫자를 두 줄로 보여줘서 헷갈렸음 - 두 값이 실제로
    // 다를 때만 별도로 보여주고, 같으면 한 줄로 합쳐서 보여줌.
    var priceEditRow = document.getElementById('detail-price-edit-row');
    if (!priceEditRow) {
      priceEditRow = document.createElement('div');
      priceEditRow.id = 'detail-price-edit-row';
      priceEditRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)';
      curEstBox.parentNode.insertBefore(priceEditRow, curEstBox.nextSibling);
    }
    function renderPriceRow() {
      var pricesMatch = latestEst && Number(c.price||0) === estSumForCur;
      priceEditRow.style.display = 'flex';
      if (pricesMatch) {
        // 값이 같을 땐 숫자를 또 안 보여주고, 수정 링크만 작게 남겨둠(편집 기능은 유지)
        priceEditRow.innerHTML = '<span style="font-size:11px;color:var(--sub)">매출 반영 금액 = 위 견적 금액과 동일 · <span id="price-edit-trigger" style="cursor:pointer;text-decoration:underline;text-decoration-style:dotted;color:var(--dark);font-weight:600">직접 수정</span></span>';
      } else {
        priceEditRow.innerHTML =
          '<span style="font-size:11px;color:var(--sub)">매출 계산 기준금액 (견적과 다름)</span>' +
          '<span style="font-size:12px;font-weight:700;color:var(--dark);cursor:pointer;text-decoration:underline;text-decoration-style:dotted" id="price-edit-trigger">' + (Number(c.price)||0).toLocaleString() + '원 (수정)</span>';
      }
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
    '<span id="detail-staffname-label">' + escHtml(c.staffName || '마스터') + '</span>';
  // 2026-09-14(선혜님 지시 - "고객정보가 양쪽에서 보이게 하고 내가
  // 상담할 고객으로 지정이 될 수 있게" → "본인 지정도 되고 마스터가
  // 바꿀 수도 있게"): 마스터는 이미 "고객 정보 수정" 모달에서 담당자를
  // 자유롭게 바꿀 수 있었지만, 실장 등 직원은 그 모달에서 담당자
  // 버튼이 아예 막혀있어서(pointer-events:none) 본인 스스로 담당을
  // 가져올 방법이 없었음 - 지금 보고 있는 사람이 현재 담당자가 아니면
  // "내가 담당할게요" 버튼을 바로 옆에 띄워서 원클릭으로 가능하게 함.
  if (typeof currentUser !== 'undefined' && currentUser && (c.staffName || '마스터') !== currentUser.name) {
    var claimBtn = document.createElement('button');
    claimBtn.textContent = '내가 담당할게요';
    claimBtn.style.cssText = 'font-size:11px;font-weight:700;color:var(--terra);background:none;border:1px solid var(--terra);border-radius:20px;padding:3px 10px;cursor:pointer;font-family:inherit;margin-left:6px';
    claimBtn.onclick = function () {
      if (!confirm('"' + (c.clientName || '') + '" 고객을 본인 담당으로 지정할까요?')) return;
      // 2026-09-15(선혜님 - "전문업체면 어떻게 하는게 나을까"로 결정):
      // 이 버튼도 홈화면 "미배정 선착순 배정"과 똑같은 안전장치(조건부
      // PATCH - 지금 담당자가 화면에 보이는 사람이 맞을 때만 저장)를
      // 쓰도록 공용 함수(claimCustomer, dash-api.js)로 통합. 예전엔
      // saveCustomerToDb(일반 저장, updated_at 비교)를 따로 썼는데,
      // 그 사이 다른 사람이 이미 담당을 가져갔으면 여기서도 정확히
      // 감지해서 "이미 가져갔다"고 알려줌 - 조용히 덮어쓰지 않음.
      claimBtn.disabled = true; claimBtn.textContent = '저장 중...';
      claimCustomer(c.id, c.staffName || '마스터', currentUser.name, function (err) {
        if (err) {
          if (err.zeroRows) {
            alert('그 사이 다른 분이 이미 담당으로 지정했어요. 화면을 새로고침해주세요.');
          } else {
            alert('저장에 실패했어요: ' + (err.message || err));
          }
          claimBtn.disabled = false; claimBtn.textContent = '내가 담당할게요';
          return;
        }
        showToast(currentUser.name + '님 담당으로 지정했어요');
        openDetailInner(c.clientName, c.id, 'info');
      });
    };
    infoBar.appendChild(claimBtn);
  }

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
    if (DAH_PRE_CONTRACT_STAGES.indexOf(c.stage) >= 0) {
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
      // 2026-09-14(선혜님 지시 - "진행 단계를 숫자로 바꾸기"): 아래 진행바가
      // 점(선)만 있고 숫자가 없어서 "지금 전체 몇 단계 중 몇 번째인지"를
      // 한눈에 못 봤음 - 배지에 "8/9"처럼 전체 대비 현재 위치를 명시.
      el('span', {style:'display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:20px;padding:0 6px;border-radius:10px;background:var(--dark);color:#fff;font-size:11px;font-weight:700;flex-shrink:0', text: stageNum + '/' + STAGES.length}),
      el('span', {style:'font-size:12px;font-weight:700;color:var(--dark);letter-spacing:-0.3px', text:getDisplayStageLabel(c) + ' 단계'})
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
      getDisplayStageLabel({stage: nextStage, region: c.region}) + '으로 진행 →', function(){ changeStage(nextStage); }
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
      num+'. '+getDisplayStageLabel({stage: s, region: c.region}), function(){ changeStage(s); }
    );
    stageBar.appendChild(pill);
  });

  
  stageSec.appendChild(stageBar);
  body.appendChild(stageSec);

}

