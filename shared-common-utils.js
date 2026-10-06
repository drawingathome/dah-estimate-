// ══════════════════════════════════════════════════════════
// DAH 공용 — 두 앱(대시보드/견적서)에서 완전히 동일하게 써야 하는
// 순수 유틸 함수 모음.
// 2026-09-16(선혜님 - "링크 너가 나한테 준거잖아"로 재확인 후 결정):
// README에 이미 "escHtml/syncCustomerToSheet 등은 아직 각 앱에
// 복사된 채 tests/cross-app-twin-check.js로만 동기화를 지키고
// 있어, 향후 같은 방식으로 정리할 여지가 있음"이라고 적혀있던
// 항목을 실제로 정리함. shared-optimistic-lock.js/shared-staging-
// guard.js와 똑같은 패턴 - 두 앱 모두 이 파일 하나를 그대로
// 로드하므로, 이 파일 안의 로직을 고치면 양쪽에 동시에 반영됨.
// (완전히 별도 Vercel 프로젝트로 배포되지만, 같은 GitHub 저장소를
// 보고 있어서 정적 파일 하나를 양쪽 다 서빙할 수 있음 - 이미 이
// 패턴으로 shared-optimistic-lock.js가 몇 주째 실제로 작동 중.)
//
// 로드 순서 주의: syncCustomerToSheet는 DRIVE_WEBHOOK_URL/
// fetchWithRetry/reportClientError가, showToast는 #toast 엘리먼트가
// 이미 존재해야 함 - 각 앱의 dash-api.js/est-utils.js와 dah-*.html의
// #toast 마크업이 먼저 로드된 뒤에 이 파일을 불러야 함.
// ══════════════════════════════════════════════════════════

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function openKakaoAddr(targetId, detailTargetId) {
  // 2026-09-22(선혜님 지시 - "2번과 3번 확실히 고쳐" - 주소 상세분리가
  // 9/15에 두 번, 오늘 한 번 총 세 번 재발한 근본 원인은 "이미 합쳐진
  // 텍스트를 나중에 정규식으로 추측해서 쪼갠다"는 방식 자체에 있었음 -
  // 아무리 패턴을 늘려도 사람이 자유롭게 쓰는 주소 형식을 100% 다
  // 맞힐 수는 없음. 추측을 더 정교하게 다듬는 대신, 애초에 추측이
  // 필요 없게 만듦: 주소 검색이 끝나는 순간 자동으로 "상세주소" 칸에
  // 커서를 옮겨서, 사람이 자연스럽게 올바른 칸에 동/호수를 입력하게
  // 유도함(입주지원서 등에서 흔한 패턴). detailTargetId를 넘긴 화면만
  // 적용되고, 안 넘기면 기존 동작 그대로.
  function focusDetailField() {
    if (detailTargetId) {
      var detailEl = document.getElementById(detailTargetId);
      if (detailEl) setTimeout(function(){ detailEl.focus(); }, 50);
    }
  }
  // 2026-10-02(선혜님 - "검색창 눌러서 쓰지, 최근주소는 쓰지도 않았다!!" 지적으로 재조사해
  // 발견): Daum 우편번호 서비스 공식 Q&A - "사용자가 지번-도로명 1:N 관계에서 메인 지번주소를
  // 선택할 경우, 도로명 주소는 roadAddress가 아니라 별도 필드인 autoRoadAddress에 들어간다."
  // 지금까지는 data.roadAddress || data.jibunAddress만 읽어서 autoRoadAddress를 전혀 안 봤음 -
  // 대단지 아파트(반포자이, 트리니원 등)는 검색 결과에 여러 줄이 뜨는 경우가 많아, 그중
  // "지번" 쪽 줄을 선택하면 roadAddress가 비고 jibunAddress도 건물명 위주로 짧게 나오는 경우가
  // 있어 "반포자이 138동 1504호"처럼 도로명 없이 저장되는 정확한 메커니즘으로 보임. 이제
  // autoRoadAddress/autoJibunAddress까지 전부 순서대로 확인.
  function extractAddr(data) {
    // data.address: 다음 API가 문서화한 "기본 주소" 필드 - 위 4개가 전부 비었을 때의 마지막 안전망.
    return data.roadAddress || data.autoRoadAddress || data.jibunAddress || data.autoJibunAddress || data.address || '';
  }
  // 2026-10-05(선혜님 - "주소 해결됐다고하지만 주소 여전히 오류야 제대로 확인해" - 김유진 고객, 수정 배포
  // 3일 뒤 등록분에서 재발): 저장된 값이 " 힐스테이트라군인테라스2차 201동 2602호"처럼 맨 앞에 공백이
  // 있었고, 이는 저장 코드(기본주소 + ' ' + 상세주소)에서 "기본주소가 빈 문자열이었다"는 서명임 -
  // 같은 서명이 배수희(9/19, 힐스테이트등촌역)에도 있었고 둘 다 입주 초기 신축 단지. 다음 우편번호 API는
  // "도로명주소가 발급된 주소만 검색 가능"(공식 Q&A)이라 신축은 검색에 안 잡힐 수 있는데, 기본주소 칸을
  // readOnly로 막아놔서 사용자가 상세주소 칸에 전부 적는 것 외엔 방법이 없는 막다른 길이었고, 저장 시
  // 이를 막는 검증도 없었음. 그래서 (1) 검색 결과에서 주소를 못 가져오면 그 자리에서 알리고 칸을 비우지
  // 않음, (2) enableManualBaseAddr()로 "직접입력" 탈출구 제공, (3) 각 저장 경로에서 "기본주소 없이 상세주소만"
  // 저장을 차단(est-save.js, dash-customer-add.js).
  function onPicked(data) {
    var addr = extractAddr(data);
    if (!addr) {
      // 2026-10-05: 다음 검색이 비어서 돌아온 경우 "사용자가 뭘 검색했는지/어떤 건물이었는지"를 에러로그에 남겨, 다음엔 추측 대신 기록으로 원인을 알 수 있게 함
      if (typeof reportClientError === 'function') reportClientError('주소검색-결과비어있음: query=' + (data.query || '') + ' building=' + (data.buildingName || '') + ' sido=' + (data.sido || '') + ' sigungu=' + (data.sigungu || ''));
      alert('선택한 항목에서 주소를 가져오지 못했어요.\n\n다른 항목을 선택하시거나, 목록에 없는 신축 건물이면 [직접입력]을 눌러 기본주소(시/구/도로명)를 적어주세요.');
      return;
    }
    var el = /** @type {HTMLInputElement|null} */ (document.getElementById(targetId));
    if (el) {
      // 2026-10-05(재현으로 확인한 진짜 결함 - 선혜님 "검색해서 선택하고 상세주소를 적었는데 주소가 이상하게 나온다"):
      // 고객추가 모달은 9/29에 React로 재작성돼 기본주소 칸이 controlled input인데, 여기서 el.value = addr 로
      // 칸만 바꾸고 버블링 안 되는 Event('input')을 보내면 React 내부 상태는 그대로 ''임. 그 결과 (1) 고른 직후엔
      // 화면에 주소가 보이지만 (2) 상세주소를 타이핑해 다시 그려지는 순간 기본주소 칸이 ''로 지워지고 (3) 저장값엔
      // 기본주소가 빠져 ' ' + 상세주소(앞 공백 서명)나 빈 주소로 저장됨(실제 모달을 그대로 구동해 재현). 외부에서
      // React 입력칸 값을 바꾸는 표준 방식 = 프로토타입의 native value setter + 버블링 이벤트. 일반(바닐라) 칸에도 동일하게 동작.
      var desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (desc && desc.set) desc.set.call(el, addr); else el.value = addr;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    focusDetailField();
  }
  // (이전엔 이 콜백이 script.onload용/이미 로드된 경우용 두 군데에 똑같이 복사돼 있었음 - 한 곳으로 통합)
  function openPostcode() {
    var w = /** @type {any} */ (window);
    if (!(w.daum && w.daum.Postcode)) { failLoad(); return; }
    new w.daum.Postcode({ oncomplete: onPicked }).open();
  }
  function failLoad() {
    if (typeof reportClientError === 'function') reportClientError('주소검색-스크립트로드실패');
    alert('주소 검색 서비스를 불러오지 못했어요.\n\n인터넷 연결을 확인하고 다시 눌러보시거나, [직접입력]을 눌러 기본주소(시/구/도로명)를 적어주세요.');
  }
  loadDaumPostcode(openPostcode, failLoad);
}

// 2026-10-05(선혜님 - "카카오 API인데 문제가 생기는 게 더 이상한 거 아니야? 검색이 안 되는 것 자체가 말이 안 돼"):
// 외부 서비스(다음 우편번호)는 "항상 성공한다"고 가정하면 안 되고, 실패해도 사용자가 막다른 길에 빠지지 않게
// 설계해야 함. 코드로 확인한 구멍 2개 - (1) 스크립트 로드 실패 처리(onerror)가 없어 검색 버튼이 조용히 먹통,
// (2) 페이지마다 첫 클릭이 "스크립트 다운로드 후 비동기로 팝업 열기"라 모바일 브라우저의 팝업 차단에 걸릴 수 있음
// (같은 종류의 교훈: CONCEPT_REGISTRY iOS_사용자제스처_동기호출). 그래서 페이지 로드 때 미리 불러와 첫 클릭도
// 클릭 안에서 바로 열리게 하고, 로드 실패는 알림 + 에러로그 + 직접입력 안내로 바꿈. (실제 아이패드에서 차단되는지는
// 이 환경에서 재현 불가 - 원인으로 단정하지 않고 구조적으로 막은 것.)
function loadDaumPostcode(onReady, onFail) {
  var w = /** @type {any} */ (window);
  if (w.daum && w.daum.Postcode) { if (onReady) onReady(); return; }
  var s = /** @type {HTMLScriptElement|null} */ (document.getElementById('daum-postcode-script'));
  if (!s) {
    s = document.createElement('script');
    s.id = 'daum-postcode-script';
    s.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    s.async = true;
    document.head.appendChild(s);
  }
  var tag = s;
  tag.addEventListener('load', function () { if (onReady) onReady(); });
  tag.addEventListener('error', function () { tag.remove(); if (onFail) onFail(); }); // 실패한 태그는 지워서 다음 클릭에서 새로 시도
}

// 2026-10-06(선혜님 - "상세주소랑 따로 넣어도 왜 이렇게 뜨지?? 이 오류 여러번 말했지??", 9/15부터 반복 지적):
// DB에는 기본주소+상세주소를 합친 addr 한 칸만 저장돼서, 불러올 때 어디까지가 상세주소인지 알 수 없었음. 9/15엔 글자
// 모양(정규식)으로 추측해 쪼개다 세 번 틀렸고, 10/1엔 쪼개기를 아예 없애서 "전부 위 칸에 합쳐져 보이는" 상태가 됨 - 둘 다
// 임시방편이었음. 이제 customers.addr_detail에 상세주소를 따로 저장하고, 불러올 때는 "addr가 상세주소로 끝날 때만"
// 그만큼을 떼어 기본주소/상세주소로 나눈다(추측 없음). 옛 고객(addr_detail 없음)이나 addr가 나중에 다른 값으로 바뀐 경우는
// 나누지 않고 전체를 기본주소 칸에 그대로 보여줌(정보 손실 없음).
function splitStoredAddr(addr, addrDetail) {
  var a = String(addr || '').trim();
  var d = String(addrDetail || '').trim();
  if (d && a.length > d.length && a.slice(a.length - d.length) === d) {
    var b = a.slice(0, a.length - d.length).trim();
    if (b) return { base: b, detail: d };
  }
  return { base: a, detail: '' };
}

// "직접입력" 탈출구 - 검색에 안 나오는 신축 건물일 때 기본주소 칸을 직접 쓸 수 있게 풀어줌(기본은 readOnly).
function enableManualBaseAddr(targetId) {
  var el = /** @type {HTMLInputElement|null} */ (document.getElementById(targetId));
  if (!el) return;
  el.readOnly = false;
  el.removeAttribute('onclick');
  el.onclick = null;
  el.style.cursor = 'text';
  el.style.background = '#fff';
  el.placeholder = '시/구/도로명부터 입력 (예: 경기 안산시 단원구 ...)';
  el.focus();
}

// 페이지가 열릴 때 미리 불러와서, 첫 [검색] 클릭도 클릭 안에서 바로 팝업이 열리게 함(실패해도 조용히 - 알림은 클릭했을 때만)
try { loadDaumPostcode(); } catch (e) { /* 미리 불러오기 실패는 무시 */ }

function syncCustomerToSheet(customer) {
  if (!DRIVE_WEBHOOK_URL) return;
  try {
    fetchWithRetry(DRIVE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'syncCustomer',
        clientName: customer.clientName, phone: customer.phone, addr: customer.addr,
        staffName: customer.staffName, stage: customer.stage,
        price: customer.price, performanceRevenue: customer.performanceRevenue,
        date: customer.date, measureDate: customer.measureDate, installDate: customer.installDate,
        memo: customer.memo
      })
    }).catch(function(e) { console.warn('고객명단 동기화 실패:', e); typeof reportClientError==='function' && reportClientError('고객명단 동기화 실패(재시도 2회 후에도 실패): ' + (e && e.message || e), e && e.stack); });
  } catch (e) { console.warn('고객명단 동기화 실패:', e); typeof reportClientError==='function' && reportClientError('고객명단 동기화 실패: ' + (e && e.message || e), e && e.stack); }
}

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(function() { t.style.opacity = '0'; }, 2500);
}

// 지역별 실측비/시공비 (2026-07-31 신규, 2026-09-16 공용화)
var DEFAULT_REGION_FEES = { '서울': {'실측비':40000, '시공비':50000}, '경기': {'실측비':60000, '시공비':80000} };
function getRegionFees() {
  try {
    var cached = JSON.parse(localStorage.getItem('dah_region_fees') || 'null');
    return cached || DEFAULT_REGION_FEES;
  } catch(e) { return DEFAULT_REGION_FEES; }
}

// 전화번호 포맷 핵심 로직(숫자만 들어와서 하이픈 포맷 문자열로 반환) -
// 2026-08-28에 이미 한 번 "두 앱 결과가 다르다"는 이유로 로직을
// 맞춘 적이 있는데, 그때도 파일은 각자 유지해서 다시 벌어질 위험이
// 있었음. 이제 핵심 로직 자체를 여기 하나로 두고, 각 앱은 자기
// 방식(값 반환 vs 엘리먼트 직접수정)에 맞게 얇은 래퍼만 유지.
// 3자리 이하일 때 하이픈 없이 그대로 두는 처리 포함(전에는 대시보드
// 버전에 이 처리가 없어서 "010" 입력 시점에 "010-"처럼 하이픈이
// 먼저 붙는 미세한 차이가 있었음 - 이번에 통일).
function formatPhoneDigits(digits) {
  var d = digits;
  if (d.slice(0,2) === '02') {
    if (d.length <= 6) return d.slice(0,2) + '-' + d.slice(2);
    if (d.length <= 9) return d.slice(0,2) + '-' + d.slice(2,5) + '-' + d.slice(5);
    return d.slice(0,2) + '-' + d.slice(2,6) + '-' + d.slice(6,10);
  }
  if (d.length <= 3) return d;
  if (d.length <= 7) return d.slice(0,3) + '-' + d.slice(3);
  return d.slice(0,3) + '-' + d.slice(3,7) + '-' + d.slice(7,11);
}

// ── 고객 진행 단계(9단계) 공용 정의 ──────────────────────────────
// 2026-09-29(코드정리 - 선혜님 "하자"): 같은 9단계 순서(STAGES/STAGE_ORDER)와 "계약 이전 3단계"
// (PRE_CONTRACT_STAGES, 매출/전환 집계에서 제외되는 단계)가 dash-render.js/dash-kanban.js/
// dash-customer-detail.js/dash-chart.js/dash-customer-pay.js 등 여러 파일에 각각 하드코딩돼
// 있었음 - 나중에 단계를 추가/변경할 때 하나라도 놓치면 조용히 어긋나는 위험이 있어서 여기 하나로
// 모음(2026-08-28 formatPhoneDigits를 여기로 모았던 것과 같은 이유). 값 자체는 전부 동일했음
// (기존 동작 변화 없음) - 각 파일은 이제 이 상수를 그대로 참조.
var DAH_STAGE_ORDER = ['방문예약','상담','가견적','선금결제','실측준비중','확정견적','잔금결제','시공준비중','시공완료'];
var DAH_PRE_CONTRACT_STAGES = ['방문예약','상담','가견적'];
// 2026-09-30(코드정리 - 계약 이후 6단계도 dash-customer-estimates.js/dash-utils.js에 각각
// 하드코딩돼 있던 것 발견): DAH_STAGE_ORDER에서 계약 이전 3단계를 뺀 나머지와 정확히 같음.
var DAH_POST_CONTRACT_STAGES = ['선금결제','실측준비중','확정견적','잔금결제','시공준비중','시공완료'];
