/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 저장/검증/토스트
   PDF저장, 새견적서 초기화, 입력값 검증, 견적서 저장(고객/견적DB 동기화),
   전체 견적서 엑셀 내보내기, 토스트 알림.
   ══════════════════════════════════════════════════ */

// 2026-08-28(선혜님 지시 - "코드정리 싹 다 한거니?"로 발견): savePDF는
// confirmPdfPrint(est-customer-load.js, "인쇄/PDF저장" 버튼에 실제 연결된
// 함수)와 정확히 같은 목적(window.print() 호출)의 버려진 예전 버전이었음
// - 어디서도 안 불리는 걸 확인 후 제거.


// 2026-08-26(선혜님과 함께 진행한 코드 구조 개선 — "전역변수가 여기저기
// 흩어져있어서 한 곳에서 리셋을 빠뜨리면 또 버그가 난다"는 문제의식으로 시작):
// "지금 편집 중인 견적이 무엇인지" 관련 상태 4가지(window._estEditState.editingEstDbId/
// window._estEditState.editingEstUpdatedAt/window._estEditState.viewingFrozenEstimate/window._estEditState.estSaveCustomerId)를 "새로
// 시작하는" 모든 지점에서 반드시 함께 리셋하도록 이 함수 하나로 모음. 예전엔
// newEstimate()가 앞 3개만 리셋하고 window._estEditState.estSaveCustomerId는 빠뜨리고 있었음
// (다행히 saveToLocalStorage()의 이름기반 재매칭이 우연히 이 문제를 가려주고
// 있었지만, 그건 "우연히 안전"한 거였지 확실한 보장이 아니었음). 앞으로 견적
// 편집상태를 초기화해야 하는 곳이 새로 생기면, 각 변수를 따로따로 건드리지
// 말고 반드시 이 함수를 호출할 것.
// 2026-09-15(선혜님 지적 - "왜 자꾸 이런 일이 생기지?"로 재설계):
// 이 목록이 "새 견적서를 시작할 때 반드시 초기화해야 하는 전역 상태"의
// 유일한 원천임. 8/24(편집중 표시가 안 지워짐)·9/10(같은 유형 재발)·
// 9/15(확정상태 누락)까지, 전부 "resetEstEditingState() 함수 본문에
// 새 줄 추가하는 걸 깜빡해서" 반복된 사고였음 - 함수 안에 흩어진 개별
// 대입문 대신, 이 객체 하나에 "이름: 초기화값"만 추가하면 자동으로
// 리셋 대상에 포함되는 구조로 바꿔서, "깜빡하고 안 넣는" 실수 자체가
// 나기 어렵게 함. 새 편집세션 상태 변수를 추가할 때는 반드시 여기부터
// 등록할 것.
var EST_SESSION_RESET_VALUES = {
  editingEstDbId: null,
  editingEstUpdatedAt: null,
  viewingFrozenEstimate: false,
  estSaveCustomerId: null,
  estimateConfirmedAt: null, // 9/15: 확정 상태 - 안 넣었다가 "허서진 데이터 실종" 사건 발생
  // skipTodayDuplicateCheck(2026-09-15 도입 "복사해서 새로 만들기" 전용 플래그)는 2026-09-30에
  // 제거함 - 이 플래그를 읽던 "오늘 이미 저장된 견적 찾기" 안전장치 자체를 없앴으니(전문업체
  // 판단 - 실수로 중복저장 방지는 이미 idempotency key가 더 정확하게 하고 있었음, 날짜+고객
  // 기준의 이 안전장치는 의도적인 두 번째 견적서까지 하나로 합쳐버리는 문제가 있었음) 이제
  // 아무도 안 읽는 플래그였음.
  lastCalcBreakdown: null,
  lastDiscountBreakdown: null,
  lastAppliedDiscounts: null,
  // 2026-09-22(선혜님 - "안바뀌엇고 열면 자꾸 50%로 된다니깐" - 최금희
  // 실사례 끝까지 추적해서 발견): 견적서를 불러올 때 저장된 품목(커튼/
  // 블라인드)을 화면에 다시 그리는 과정(addCurtainRow 등)이 "사용자가
  // 방금 품목을 편집했다"는 신호로 오인돼 unfreezeEstimateIfEditing()이
  // 발동함 - 그 결과 방금 정확히 복원한 계약금(userTyped로 보호된)의
  // 보호가 곧바로 풀려서, 그 직후 실행되는 자동 재계산이 다시 50%로
  // 덮어씀. "지금 불러오는 중"임을 나타내는 이 플래그가 켜져있는 동안은
  // unfreezeEstimateIfEditing()이 아무것도 안 하도록 함(진짜 사용자
  // 편집과, 프로그램이 데이터를 복원하는 것을 구분).
  isRestoringEstimate: false,
  // 2026-10-08: 시공 행이 모두 저장된 견적을 여는 동안만 true — 자동 시공 행 재계산을 건너뜀
  skipAutoSvc: false
};

// 2026-09-15: 위 레지스트리를 실제로 담는 상자. 103곳에 흩어져있던
// window._xxx 개별 전역변수를 전부 이 객체 하나의 프로퍼티로 통합함
// (읽기/쓰기 지점은 window._estEditState.xxx로 전부 변경됨). 리셋은
// 이제 "객체 통째로 새로 만들기" 한 줄로 끝남 - 개별 대입문을 하나씩
// 나열할 필요가 없어져서, 새 상태값을 깜빡하고 안 넣는 재발 자체가
// 구조적으로 불가능해짐(위 레지스트리에 등록만 하면 자동 포함).
window._estEditState = Object.assign({}, EST_SESSION_RESET_VALUES);

function resetEstEditingState() {
  window._estEditState = Object.assign({}, EST_SESSION_RESET_VALUES);
  if (typeof lockEstimateForm === 'function') lockEstimateForm(false);
  if (typeof renderConfirmBadge === 'function') renderConfirmBadge();
  // 2026-08-29(선혜님이 자동백업 중복탐지 알림으로 발견 — 임민희 견적서
  // 8건 중복, 0.074초 안에 생성됨): idempotency_key는 위 목록과 달리
  // "고정된 초기값"이 아니라 매번 새로 생성해야 하는 값이라 별도 처리 -
  // 이 견적서 편집 세션 하나당 키 하나만 쓰도록 여기서 한 번만 생성.
  window._estEditState.currentEstIdempotencyKey = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('est-' + Date.now() + '-' + Math.random().toString(36).slice(2));
}

function newEstimate() {
  if(!confirm('새 견적서를 작성하시겠어요? 현재 내용이 초기화됩니다.')) return;
  // 2026-08-24(전수 재검사 중 발견 — 잠재적으로 심각한 버그): 기존 견적을
  // "이어서 수정"하던 중(window._estEditState.editingEstDbId가 세팅된 상태)에 이 버튼을 누르면
  // 화면은 비워지는데 이 표시값은 안 지워지고 있었음. 그 상태로 완전히 다른
  // 고객 정보를 입력해서 저장하면, 저장 로직이 "이건 수정이다"로 착각해서
  // 새 고객이 아니라 원래 열려있던 남의 견적을 그 내용으로 덮어써버릴 수
  // 있었음(아직 실제 피해 사례는 확인 안 됐지만 재현 가능한 심각한 버그).
  resetEstEditingState();
  document.getElementById('c-name').value='';
  document.getElementById('c-phone').value='';
  document.getElementById('c-addr').value='';
  // 2026-09-15("견적서나 실측 의뢰서 등등 주소 나오는 곳은 모두 같이
  // 보고 직접 확인해"로 전수조사 중 발견): 기본주소(c-addr)는 지우면서
  // 상세주소(c-addr2)는 안 지우고 있었음 - "새 견적서"로 완전히 다른
  // 고객을 시작해도 이전 고객의 동/호수가 화면에 그대로 남아있다가,
  // 새 주소 뒤에 엉뚱하게 합쳐져서 저장될 위험이 있었음.
  document.getElementById('c-addr2').value='';
  document.getElementById('c-memo').value='';
  document.getElementById('c-region').value='';
  document.getElementById('discount').value=0;
  var depInp=document.getElementById('deposit-input');
  if(depInp){depInp.value='';depInp.removeAttribute('data-raw');}
  document.getElementById('sum-balance').textContent='0원';
  document.getElementById('curtain-body').innerHTML='';
  document.getElementById('blind-body').innerHTML='';
  document.getElementById('svc-body').innerHTML='';
  document.getElementById('blind-table').style.display='none';
  document.getElementById('survey-card').style.display='none';
  // 2026-09-10(전체 재검토 중 발견 — 8/24와 정확히 같은 유형의 재발):
  // 오늘 새로 만든 필드(희망 도착일, 설치기사명/연락처)가 newEstimate()의
  // 초기화 목록에 빠져있어서, "새 견적서" 버튼을 눌러도 이전 고객의
  // 값이 그대로 남아있었음 - 실제로 다른 고객의 발주서/실측시공 문서에
  // 엉뚱한 도착일·설치기사 정보가 섞여 나갈 수 있는 심각한 문제.
  // 2026-09-11(선혜님 지적으로 거래처별 도착일 방식으로 재설계 -
  // c-order-arrival-date 필드 자체는 폐기됨): 대신 새로 만든
  // window._vendorArrivalDates(거래처별 맵)를 여기서 반드시 초기화 -
  // 아까(9/10) 겪었던 "새 필드 초기화 누락"과 같은 실수를 반복 안 하려고
  // 미리 넣어둠.
  window._vendorArrivalDates = {};
  window._vendorArrivalLocations = {};
  document.getElementById('c-installer-name').value='';
  document.getElementById('c-installer-phone').value='';
  var d=new Date();
  document.getElementById('c-date').value=d.toISOString().slice(0,10);
  // 견적번호 안전한 순번 채번
  (function(){
    var p2 = function(n){ return String(n).padStart(2,'0'); };
    var saved = [];
    try { saved = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e) {}
    var prefix = 'DAH-' + d.getFullYear() + p2(d.getMonth()+1) + p2(d.getDate()) + '-';
    var todayNos = saved
      .map(function(e){ return e.no||''; })
      .filter(function(no){ return no.indexOf(prefix) === 0; })
      .map(function(no){ return parseInt(no.replace(prefix,''))||0; });
    var nextSeq = todayNos.length > 0 ? Math.max.apply(null, todayNos) + 1 : 1;
    document.getElementById('c-no').value = prefix + String(nextSeq).padStart(2,'0');
  })();
  setStatus('ga');
  setCustType('new');
  addCurtainRow();
  calcTotal();
  showToast('새 견적서 시작');
}

function showFieldError(fieldId, msg) {
  var el = document.getElementById(fieldId);
  if (!el) return;
  el.style.borderBottomColor = '#C0392B';
  var errEl = el.parentNode.querySelector('.field-err');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.className = 'field-err';
    errEl.style.cssText = 'font-size:11px;color:#C0392B;margin-top:3px;font-weight:500';
    el.parentNode.appendChild(errEl);
  }
  errEl.textContent = msg;
  setTimeout(function() {
    el.style.borderBottomColor = '';
    if (errEl) errEl.remove();
  }, 3000);
  el.focus();
}

function validateEstimate() {
  // 2026-09-22(선혜님 - "오류를 모두 확인한거 맞니 누락 없이 개선을
  // 해야지" - 실제 프로덕션 로그 조회 중 발견: 오지은 실장이 "윤정자"
  // 고객을 15분 안에 3번 저장 시도했는데 전부 실패, 근데 왜 실패했는지
  // 로그에 detail이 항상 null로 남아서 원인을 전혀 알 수 없었음): 각
  // 검증 실패 지점마다 화면에 보여주는 것과 똑같은 이유를 이 변수에도
  // 남겨서, 다음에 이런 일이 또 생기면 로그만 보고도 바로 원인을 알 수
  // 있게 함.
  window._lastValidationFailReason = null;
  var name = document.getElementById('c-name')?.value?.trim();
  if (!name) { showFieldError('c-name', '고객명을 입력해주세요'); window._lastValidationFailReason = '고객명 없음'; return false; }
  // 2026-08-29(선혜님 지적 - "이게 중복이 생기는거는 심각한데", 신화경
  // 사례로 발견): 고객명만 필수였고 연락처는 검증이 전혀 없어서, 연락처
  // 없이 저장하면 그런 고객이 그대로 자동 생성됐음 - 나중에 같은 사람을
  // 연락처 포함해서 다시 등록하면, 연락처가 다르니(하나는 없음) 시스템이
  // "다른 사람"으로 착각해 중복 경고 없이 통과되고 있었음(신화경님 사례
  // - 견적 1,192,000원짜리 빈 고객과 실제 결제완료된 고객이 따로 존재).
  // 연락처도 필수로 만들어서 이 경로 자체를 막음.
  var phone = document.getElementById('c-phone')?.value?.trim();
  if (!phone) { showFieldError('c-phone', '연락처를 입력해주세요'); window._lastValidationFailReason = '연락처 없음'; return false; }
  // 2026-10-05(선혜님 - 김유진 고객 주소 재발 신고): 기본주소는 비었는데 상세주소에만 글이 있으면
  // 저장 코드가 ' ' + 상세주소로 합쳐 "맨 앞 공백 + 도로명 없는 주소"가 DB에 저장됨(배수희 9/19,
  // 김유진 10/5). 주소를 아직 모르는 상태(둘 다 빔)는 정상이라 막지 않고, 이 모순된 조합만 차단.
  var addrBaseEl = /** @type {HTMLInputElement|null} */ (document.getElementById('c-addr'));
  var addrDetailEl = /** @type {HTMLInputElement|null} */ (document.getElementById('c-addr2'));
  var addrBaseVal = addrBaseEl ? addrBaseEl.value.trim() : '';
  var addrDetailVal = addrDetailEl ? addrDetailEl.value.trim() : '';
  if (!addrBaseVal && addrDetailVal) {
    showFieldError('c-addr2', '기본주소가 비어있어요 - [🔍 검색]으로 기본주소(시/구/도로명)를 먼저 선택해주세요. 검색에 안 나오는 신축이면 [직접입력]을 눌러 적어주세요.');
    window._lastValidationFailReason = '기본주소 없음(상세주소만 입력됨)';
    return false;
  }
  var hasProduct = false;
  var missingPriceRows = []; // 가로/높이는 채웠는데 단가를 빼먹은 행 번호(사람이 세는 순서, 1부터)

  document.querySelectorAll('#curtain-body tr').forEach(function(r, idx) {
    var price = getPriceVal(r.querySelector('.cprice'));
    var hasSize = (r.querySelector('.mw')?.value || '').trim() !== '' || (r.querySelector('.mh')?.value || '').trim() !== '';
    if (price > 0) hasProduct = true;
    else if (hasSize) missingPriceRows.push('커튼 ' + (idx + 1) + '번째');
  });
  document.querySelectorAll('#blind-body tr').forEach(function(r, idx) {
    var price = getPriceVal(r.querySelector('.blind-price'));
    var hasSize = (r.querySelector('.mw')?.value || '').trim() !== '' || (r.querySelector('.mh')?.value || '').trim() !== '';
    if (price > 0) hasProduct = true;
    else if (hasSize) missingPriceRows.push('블라인드 ' + (idx + 1) + '번째');
  });
  // 2026-09-18(선혜님 - "제품금액을 1개 이상 넣으라고 하면서 저장이
  // 안돼" - 침구만 있는 견적서로 재현): hasProduct 검사가 커튼/블라인드
  // 두 표만 보고 #other-body(기타 품목 - 침구·러그, 2026-09-15 신설)는
  // 아예 빠뜨리고 있었음 - 그래서 침구만 담긴 견적서는 금액을 다 채워도
  // 항상 "제품 금액을 1개 이상 입력해주세요"로 막히고 있었음.
  document.querySelectorAll('#other-body tr').forEach(function(r) {
    var price = getPriceVal(r.querySelector('.other-price'));
    var hasName = (r.querySelector('.other-name')?.value || '').trim() !== '';
    if (price > 0) hasProduct = true;
    else if (hasName) missingPriceRows.push('기타품목 "' + (r.querySelector('.other-name')?.value || '').trim() + '"');
  });
  // 2026-09-18(선혜님 - "코드정리하고 버그 없는지 확인해"로 직접 발견,
  // 침구 때와 정확히 같은 패턴 재발): "레일만 시공" 기능(레일·시공비·
  // 기타 표에 위치 넣고 수동 추가)을 오늘 만들었는데, 이 hasProduct
  // 검사가 svc-body는 전혀 확인 안 해서, 레일만 시공하는 견적서는
  // 금액을 채워도 항상 "제품 금액을 1개 이상 입력해주세요"로 막혔음.
  // 자동생성 행(레일자재/레일시공비/실측비/시공비 등, data-rail-src 등
  // 마커 있음)은 커튼/블라인드가 이미 hasProduct를 채웠을 것이므로
  // 제외하고, 사용자가 직접 추가한 수동 항목만 확인.
  document.querySelectorAll('#svc-body tr').forEach(function(r) {
    if (r.hasAttribute('data-rail-src') || r.hasAttribute('data-railcost-src') || r.hasAttribute('data-svc-type')) return;
    var price = getPriceVal(r.querySelector('.sprice'));
    var hasContent = (r.querySelector('.svc-content')?.value || '').trim() !== '';
    if (price > 0) hasProduct = true;
    else if (hasContent) missingPriceRows.push('"' + (r.querySelector('.svc-content')?.value || '').trim() + '"');
  });
  if (!hasProduct) {
    // 2026-08-05: AS·수선 접수는 무상 하자처리처럼 제품금액이 없을 수 있음.
    // 증상이 기재되어 있으면 금액 없이도 저장 가능하게 예외 처리 —
    // 예전엔 이 조건이 없어서 무상 AS건은 저장 자체가 막혔었음.
    var asSymptomFilled = (currentCustType === 'as') && (document.getElementById('as-symptom')?.value || '').trim() !== '';
    if (!asSymptomFilled) { showToast('제품 금액을 1개 이상 입력해주세요', 'error'); window._lastValidationFailReason = '제품 금액 0개'; return false; }
  }
  // 가로/높이까지 입력해놓고 단가만 빼먹은 행이 있으면 — 조용히 0원으로 저장되는 걸 막고 알려줌
  if (missingPriceRows.length > 0) {
    showToast('⚠️ ' + missingPriceRows.join(', ') + ' 항목의 단가가 비어있어요. 확인 후 다시 저장해주세요', 'error');
    window._lastValidationFailReason = '단가누락: ' + missingPriceRows.join(', ');
    return false;
  }

  // 2026-08-15: 옵션추가금(전동 부품비 등)을 지역시공비 행과 독립된 svc행으로
  // 분리하면서(recalcBlindOptionExtras 참고), 이 저장차단 로직 자체가
  // 불필요해짐 - 예전엔 지역 미선택시 옵션추가금을 "얹을 곳"이 없어서
  // 누락 위험이 있었지만, 이제 독립 행이라 지역 여부와 무관하게 항상
  // 정확히 반영/저장됨.
  return true;
}

// 2026-08-28(선혜님 지시 - "코드정리 싹 다 한거니?"로 발견, 선혜님 확인 -
// "이 기능은 스킵"): getExpiryBadge(견적서 유효기간 7일 D-day 뱃지)는
// 계산 로직은 완성돼있는데 화면 어디에도 안 붙어있던 미완성 기능이었음 -
// 어디에 붙일지 여쭤봤고 스킵하기로 확인해 제거함.

function _saveEstimateInner(_onDone) {
  var onDone = typeof _onDone === 'function' ? _onDone : function(){};
  clearDraft(); // 저장 완료 시 초안 삭제
  if (!validateEstimate()) { logSaveStage('검증실패-중단', window._lastValidationFailReason); onDone('invalid'); return; }
  logSaveStage('검증통과');
  var name=document.getElementById('c-name').value.trim();
  if(!name) { showToast('⚠️ 고객명을 입력하세요'); onDone('invalid'); return; }
  var phone=document.getElementById('c-phone').value.trim();
  var addr=document.getElementById('c-addr').value.trim();
  var addr2=document.getElementById('c-addr2')?.value.trim()||'';
  var staffName=document.getElementById('c-staff').value.trim();
  // 2026-08-25(선혜님 발견 — "오지은 실장이 작성해서 저장을 했는데 그 견적서가
  // 다시 확인이 안된다"): 담당자 이름을 화면의 텍스트 입력칸 값에만 의존하고
  // 있었는데, 이 칸은 로그인 정보와 별개로 사람이 직접 수정 가능한 일반
  // 텍스트칸이라 자동채움 타이밍/로그인 인식 실패 등으로 실제 로그인한
  // 사람과 다른 값이 들어갈 위험이 있었음. 최근 적용된 보안규칙(담당자
  // 이름이 정확히 일치해야 그 직원 계정으로 조회 가능)때문에, 이게 어긋나면
  // 본인이 방금 저장한 견적서를 본인이 다시 못 보는 심각한 문제로 이어짐.
  // 로그인 세션(_estCurrentUser)에 신뢰할 수 있는 이름이 있으면 그걸로
  // 무조건 덮어써서, 화면 입력칸 값과 무관하게 항상 정확한 담당자로 저장되게 함.
  if (window._estCurrentUser && window._estCurrentUser.name) {
    staffName = window._estCurrentUser.name;
  }
  var custMemo=document.getElementById('c-memo').value.trim();
  var grand=parseInt(document.getElementById('sum-total').textContent.replace(/[^0-9]/g,''))||0;
  var perf=parseInt(document.getElementById('sum-perf').textContent.replace(/[^0-9]/g,''))||0;
  var spaceArr=[],fabricArr=[];
  document.querySelectorAll('#curtain-body tr').forEach(function(tr){
    var s=tr.querySelector('.space-inp')?.value||''; if(s) spaceArr.push(s);
    var f=tr.querySelector('.c-display-name')?.value||''; if(f) fabricArr.push(f);
  });
  var spaceStr=spaceArr.join(', '), fabricStr=fabricArr.join(', ');
  // 커튼/블라인드 각 행의 전체 세부정보 수집 (2026-08-04 신규, 2026-08-10에
  // collectLineItems() 공용함수로 분리 — 임시저장에서도 재사용하기 위함)
  var lineItems = collectLineItems();
  // ══════════════════════════════════════════════════
  // 2026-09-28(선혜님 - "전문업체서 잡으면 어떻게 하겠니" - est-save.js는 버그 수정이 83번
  // 중 70번으로 재발 버그가 가장 많이 몰린 파일): 이 함수(763줄)는 안에 "저장 단계" 함수
  // 4개를 품고 있으면서 바깥 변수를 몰래 같이 쓰고 있었음. 그 단계 함수들을
  // est-save-stages.js로 꺼내고, 공유하던 값(12개)을 아래 ctx로 "명시해서" 넘김.
  // (단계 함수들은 이 값들을 읽기만 하고 안 바꿈 - 파서로 확인. 바뀌는 건 staffName이
  // 위에서 한 번 정해지는 것뿐이라 ctx는 그 뒤에 만듦.)
  // 검증: tests/save-golden-master-check.js(서버 요청/화면/로컬저장 기록이 글자 단위로 동일)
  // ══════════════════════════════════════════════════
  var ctx = { onDone: onDone, name: name, phone: phone, addr: addr, addr2: addr2, staffName: staffName, custMemo: custMemo, grand: grand, perf: perf, spaceStr: spaceStr, fabricStr: fabricStr, lineItems: lineItems };

  // 2026-08-20(태블릿에서 확인된 실제 문제 — "로그인 세션 있음: true"인데도
  // 401 인증실패): 토큰 자동갱신이 4분 백그라운드 타이머에만 의존했는데,
  // 화면이 꺼지거나 다른 앱으로 전환되면 브라우저가 이 타이머를 멈추는 경우가
  // 흔함. 서버 전송 직전에 명시적으로 토큰 갱신부터 확인하도록 함(재시도큐와
  // 동일한 패턴 - est-sync-queue.js 참고).
  // 2026-08-25(선혜님 발견 — 오지은 실장 403 사례, "덜 생기는게 아니라
  // 안생기게 해야지"): 여기 두 가지 심각한 문제가 있었음 —
  // (1) 바로 아래 있던 showToast('저장 완료!')가 실제 저장 성공 여부와
  //     무관하게 함수 호출 직후 무조건 떴음(비동기 저장이 끝나기도 전에
  //     "완료"라고 거짓 표시). 완전히 제거 — 실제 성공/실패 메시지는
  //     saveToEstimates() 안의 xhr2.onload에서만 뜨도록 함.
  // (2) refreshAuthSessionIfNeeded의 성공여부(true/false)를 무시하고 항상
  //     저장을 강행해서, 갱신 자체가 실패한 경우(refresh_token도 만료됨 등)
  //     예정된 대로 또 403이 났음. 갱신이 실패하면 저장을 시도하지 않고
  //     "다시 로그인해주세요"로 명확히 안내하고 멈추도록 함.
  if (typeof refreshAuthSessionIfNeeded === 'function') {
    refreshAuthSessionIfNeeded(function(ok) {
      logSaveStage(ok ? '세션확인-정상' : '세션확인-만료', null);
      if (ok) {
        _saveStage_customers(ctx);
      } else {
        onDone();
        // 2026-08-25(선혜님 요청 — "로그아웃해서 새로 등록만 오늘 몇번 하니"):
        // alert로 "다시 로그인하세요"만 띄우고 끝내던 걸, 로그아웃 없이 그
        // 자리에서 비밀번호만 다시 넣으면 저장까지 자동으로 이어지도록 변경.
        if (typeof showReloginPrompt === 'function') {
          showReloginPrompt(function() { _saveEstimateInner(_onDone); });
        } else {
          alert('⚠️ 로그인이 만료됐어요.\n\n이 화면을 벗어나지 마시고, 새 탭에서 다시 로그인한 뒤 이 탭으로 돌아와 저장을 다시 눌러주세요.\n(지금 입력하신 내용은 이 화면에 그대로 남아있어요 — 새로고침하지만 마세요)');
        }
      }
    });
  } else {
    logSaveStage('세션확인-건너뜀(함수없음)', null);
    _saveStage_customers(ctx);
  }
}

// 2026-08-24(선혜님 발견 — 같은 견적이 5개씩 한번에 중복 저장되던 문제):
// 저장 버튼에 중복 클릭 방지 장치가 전혀 없어서, 짧은 시간 안에 여러 번
// 눌리면(빠른 연타, 또는 터치가 두 번 인식되는 기기 문제 등) 각각이 독립적으로
// _saveEstimateInner()를 실행함 — 첫 저장이 서버 응답을 받아 window._estEditState.editingEstDbId를
// 세팅하기 전에 나머지 클릭들이 이미 실행돼버려서, 전부 "새 견적"으로 처리되어
// 그대로 중복 생성됨(실제 사례: 0.15초 안에 5건 중복 생성 확인). 버튼을 즉시
// 비활성화하고, 저장 흐름이 끝나면(성공/실패 무관) 다시 눌러도 되게 원상복구.
//
// 2026-08-29(선혜님이 자동백업 중복탐지 알림으로 발견 — 임민희 8건 중복,
// 0.074초 안에 발생): 근본 원인은 idempotency_key가 매번 새로 생성돼서
// DB의 기존 유니크 인덱스(estimates_idempotency_key_uniq, 이미 있었음 -
// pg_constraint로만 찾다가 놓쳤던 별도 unique index)가 무력화되고 있던
// 것이었음 - resetEstEditingState()에서 키를 한 번만 생성해 세션 내내
// 재사용하도록 수정(위 참고)해서, 이제 짧은 시간 안에 여러 번 시도해도
// 같은 키로 요청되어 DB가 두 번째부터 정확히 막아줌.
// (참고: 처음엔 여기에 "2초 이내 재호출 무조건 무시"라는 시간기반
// 방어도 추가했었으나, 검증 후→값 수정→재저장 같은 정당한 짧은 간격의
// 재시도까지 막아버리는 회귀를 자체 테스트로 발견해 제거함 - idempotency
// key 재사용만으로 이미 충분한 방어였음.)
// 2026-09-15(선혜님 지시 - "여기에 버그 있는지 확인해" → "해": 어제
// "인테리어오월" 견적서가 저장완료라고 봤는데 서버·로컬·실패백업·
// 재시도큐 어디에도 흔적이 없던 사건으로 발견): validateEstimate()가
// 저장 버튼을 누른 즉시(네트워크 요청 나가기도 전에) 조용히 멈출 수
// 있어서, 그 경우 "시도했다"는 기록 자체가 아무 데도 안 남았음 -
// 검증 통과/실패와 무관하게 "저장 버튼을 눌렀다"는 사실 자체를
// 무조건 여기 남겨서, 다음에 똑같이 흔적 없이 사라지는 상황이 다시는
// 안 생기게 함.
function logSaveAttempt() {
  try {
    var log = JSON.parse(localStorage.getItem('dah_save_attempts')||'[]');
    log.push({
      at: new Date().toISOString(),
      customerName: (document.getElementById('c-name')?.value || '').trim(),
      phone: (document.getElementById('c-phone')?.value || '').trim()
    });
    if (log.length > 30) log = log.slice(-30); // 최근 30건만
    localStorage.setItem('dah_save_attempts', JSON.stringify(log));
  } catch (e) { /* 이 기록 자체가 실패해도 저장 흐름엔 영향 안 줌 */ }
}

// 2026-09-21(선혜님 - "니가 한 자료 계속 똑같은 문제가 생기지 무조건
// 원인 찾아!!" - 민소아 견적서: 화면엔 저장한 것처럼 보였는데 서버
// 이력에 그 시점 기록이 전혀 없던 두 번째 재발): logSaveAttempt()는
// "저장 버튼을 눌렀다"는 사실 하나만 남겼지, 그 다음 어느 단계에서
// 멈췄는지(검증 실패/확인창 취소/세션 만료/서버 응답 실패 등)는 전혀
// 기록이 안 남아서, 이번에도 서버 DB를 직접 뒤져도 "왜"까지는 못
// 밝혀냈음(estimate_history/client_error_logs 둘 다 그날 기록이
// 0건 - 즉 정상 흐름 안에서 조용히 멈췄다는 뜻이라 예외 로그에도
// 안 잡힘). 저장 시도마다 거치는 모든 주요 단계를 순서대로 기록해서,
// 다음엔 이 로그만 보면 정확히 어느 단계에서 멈췄는지 100% 알 수
// 있게 함 - localStorage(이 기기)뿐 아니라 서버(client_error_logs)
// 에도 함께 남겨서, 어느 기기에서 벌어졌든 마스터가 확인 가능하게 함.
function logSaveStage(stage, detail) {
  try {
    var log = JSON.parse(localStorage.getItem('dah_save_diagnostics')||'[]');
    log.push({
      at: new Date().toISOString(),
      customerName: (document.getElementById('c-name')?.value || '').trim(),
      stage: stage,
      detail: detail || null
    });
    if (log.length > 100) log = log.slice(-100); // 최근 100건(저장 1건당 여러 단계라 넉넉히)
    localStorage.setItem('dah_save_diagnostics', JSON.stringify(log));
  } catch (e) { /* 진단 로그 자체가 실패해도 저장 흐름엔 영향 안 줌 */ }
  try {
    if (typeof reportClientError === 'function') {
      reportClientError('저장단계: ' + stage, null, { stage: stage, detail: detail || null, customerName: (document.getElementById('c-name')?.value || '').trim() });
    }
  } catch (e2) { /* 서버 기록 실패해도 저장 흐름엔 영향 안 줌 */ }
}

// 2026-10-08(조유정 "처음부터 실측시공비가 빠져있었어 서울 지역 체크했는데도…" — 원인 재현 불가):
// 원인이 뭐든 "시공이 있는 지역인데 실측비·시공비 행이 하나도 없는" 견적이 조용히 저장되는 것을 막는
// 최후 안전장치 + 그 순간의 화면 상태를 관측 기록(영수증)에 남겨 다음 발생 때 원인을 증거로 찾기 위한 요약.
function estSvcState() {
  var region = '';
  var types = [], count = 0, hasFeeRow = false, sum = 0;
  try {
    var regionEl = /** @type {any} */ (document.getElementById('c-region'));
    region = (regionEl && regionEl.value) || '';
    document.querySelectorAll('#svc-body tr').forEach(function(tr) {
      count++;
      var kindEl = /** @type {any} */ (tr.querySelector('.svc-kind'));
      var contentEl = /** @type {any} */ (tr.querySelector('.svc-content'));
      var qtyEl = /** @type {any} */ (tr.querySelector('.sqty'));
      var kind = (kindEl && kindEl.value) || '';
      var content = (contentEl && contentEl.value) || '';
      var t = tr.getAttribute('data-svc-type') || (tr.hasAttribute('data-rail-src') ? '레일' : (tr.hasAttribute('data-railcost-src') ? '레일시공' : '수동'));
      types.push(t + ':' + kind);
      if (kind === '실측비' || kind === '시공비' || /실측|시공/.test(content)) hasFeeRow = true;
      sum += (getPriceVal(tr.querySelector('.sprice')) || 0) * (parseFloat((qtyEl && qtyEl.value) || '') || 1);
    });
  } catch (e) { /* 요약 실패는 저장에 영향 없음 */ }
  return { region: region, count: count, has_fee_row: hasFeeRow, sum: sum, types: types.slice(0, 12) };
}
// 지역이 시공 있는 지역(요금 0원이 아님)인데 실측비·시공비 행이 없으면 true — 커튼/블라인드가 있을 때만 의미 있음
function estMissingInstallRows() {
  try {
    var regionEl = /** @type {any} */ (document.getElementById('c-region'));
    var region = (regionEl && regionEl.value) || '';
    if (!region || !hasCurtainOrBlindItem()) return false;
    var priceEl = /** @type {any} */ (document.getElementById('c-region-price'));
    var customBase = parseFloat((priceEl && priceEl.value) || '') || 0;
    var fees = (typeof getRegionFees === 'function') ? getRegionFees() : {};
    var prices = resolveRegionPrices(region, fees, customBase, DEFAULT_REGION_FEES);
    if (isNoInstallFee(prices)) return false;
    return !estSvcState().has_fee_row;
  } catch (e) { return false; }
}

function saveEstimate() {
  logSaveAttempt();
  logSaveStage('시작');
  estSendReceipt('save', 'start', { phase: 'start', pending_queue: (typeof getEstPendingQueue === 'function') ? getEstPendingQueue().length : null, svc: estSvcState() });
  // 2026-10-06(선혜님 - "저장 눌렀어"/"프린트까지 했는데" 김성은님 견적서가 서버에 없음): 인쇄·PDF 전에 저장을 먼저 하고, 그 결과를 받아 진행 여부를
  // 정하기 위한 콜백(ensureEstimateSavedThen이 설정). 저장 흐름이 어디서 끝나든(검증 중단/확인창 취소/이미 진행 중/서버 성공/서버 실패) 정확히 한 번만 호출됨.
  var _afterSave = window._estAfterSave || null; window._estAfterSave = null;
  function _finishAfter(outcome) { var cb = _afterSave; _afterSave = null; if (cb) { try { cb(outcome); } catch (eCb) { console.error('저장 후 처리 오류:', eCb); } } }
  // 2026-09-08(선혜님 지적 - "저장 후 대시보드를 클릭하면 사이트에서
  // 나갈까요? 저장되지 않을 수 있습니다가 무조건 알림이 떠 저장이
  // 됐으면 안떠야지"): dah-estimate.html의 beforeunload 핸들러가
  // c-name의 dataset.saved를 확인해서 경고 여부를 정하는데, 정작 이
  // dataset.saved를 '설정'하는 코드 자체가 어디에도 없었음(전수검색으로
  // 확인) - 그래서 저장을 아무리 성공해도 saved는 항상 undefined로
  // 남아, 이름만 입력되어 있으면 무조건 나가기 경고가 뜨고 있었음.
  // 저장 흐름이 끝나는 시점(reenable, 성공/로컬저장/실패 무관하게 항상
  // 호출됨)에 플래그를 설정.
  // 2026-09-04(선혜님 요청 - "우리가 채워야 하는 부분... 안채워지면
  // 견적서 저장할때 따로 알림이 뜨게 해줘"): 저장 직전에 주소/실측일/
  // 시공일이 비어있는지 확인 - "날짜미정" 체크박스가 되어있으면 그
  // 항목은 빠뜨림 취급 안 함(진짜로 아직 못 정한 거니까). 강제로 막지는
  // 않고(급하게 먼저 저장해야 할 상황도 있으니) 확인창으로 한 번 더
  // 물어봐서, 실수로 빠뜨린 걸 이 시점에 알아차릴 수 있게 함.
  var missing = [];
  if (!(document.getElementById('c-addr')?.value || '').trim()) missing.push('주소');
  // 2026-09-18(선혜님 - "우리가 시공을 안하는걸로 선택했는데도 알림
  // 문구가 저렇게 뜨네" - 침구만 있는 견적서로 재현): 이 검증이 항상
  // "커튼/블라인드가 있는 견적서"만 가정하고 만들어져서, 실측·시공
  // 자체가 필요 없는 침구/러그만 있는 견적서에도 무조건 실측/시공
  // 예정일을 요구하고 있었음. 커튼·블라인드 품목이 하나도 없으면(기타
  // 품목만 있으면) 이 두 항목 검증 자체를 건너뜀 - 실측/시공이 있는
  // 기존 흐름은 전혀 안 건드림.
  // 주의: 새 견적서를 열면 addCurtainRow()가 기본으로 빈 커튼 행을 하나
  // 만들어두므로(dah-estimate.html 초기화 코드), "행이 존재하는지"가
  // 아니라 "그 행에 실제로 뭔가 입력됐는지"(사이즈나 단가)로 판단해야
  // 함 - 처음엔 이걸 놓쳐서 테스트에서 직접 재현·발견함.
  // 2026-09-18: 이 판단 로직은 계약금 100%/50% 자동계산(est-product-
  // calc.js)에도 필요해져서 hasCurtainOrBlindItem()으로 공용화함.
  var hasCurtainOrBlind = hasCurtainOrBlindItem();
  if (hasCurtainOrBlind) {
    if (!document.getElementById('c-measure-tbd')?.checked && !(document.getElementById('c-measure')?.value || '')) missing.push('실측 예정일');
    if (!document.getElementById('c-install-tbd')?.checked && !(document.getElementById('c-install')?.value || '')) missing.push('시공 예정일');
  }
  // 2026-10-08: 시공이 있는 지역인데 실측비·시공비 행이 하나도 없으면 같은 확인창에 함께 안내(막지는 않음 — 레일만 시공 등 정당한 경우 있음)
  if (estMissingInstallRows()) missing.push('실측비·시공비 행(지역은 ' + ((/** @type {any} */ (document.getElementById('c-region')) || {}).value || '') + '인데 시공 항목이 없어요 — 금액에 시공비가 빠질 수 있어요)');
  logSaveStage('필수항목검증완료', { missing: missing, hasCurtainOrBlind: hasCurtainOrBlind, svc: estSvcState() });
  if (missing.length > 0) {
    var okToProceed = window.confirm('다음 항목이 비어있어요: ' + missing.join(', ') + '\n\n그래도 저장하시겠어요?');
    logSaveStage(okToProceed ? '확인창-진행' : '확인창-취소', { missing: missing });
    if (!okToProceed) {
      // 2026-09-15(선혜님 지시 - "원인을 찾아야지 다음에 문제가 안되게
      // 하지"): 여기서 "취소"를 누르면 화면에 아무 표시도 없이 그냥
      // 아무 일도 안 일어났음 - 바빠서 놓치면 "저장했다고 생각했는데
      // 사실 취소였다"는 상황이 재발할 수 있음. 눈에 띄는 안내를 남김.
      showToast('저장이 취소됐어요 — "저장" 버튼을 다시 눌러주세요');
      estSendReceipt('save', 'invalid', { phase: 'end', reason: '필수항목 확인창 취소' });
      _finishAfter('invalid');
      return;
    }
  }

  // 2026-10-09: 열었을 때 저장 금액과 화면 금액이 달랐고 아직 "확인했어요"를 안 눌렀다면, 저장 직전에 한 번 더 확인(조용히 금액이 바뀌는 사고 방지).
  if (window._estOpenMismatch && !window._estMismatchAck) {
    var mm = window._estOpenMismatch;
    var nowShown = parseInt(String((document.getElementById('sum-total') || {}).textContent || '').replace(/[^0-9]/g, ''), 10) || 0;
    if (nowShown > 0 && nowShown !== mm.stored) {
      var okMm = window.confirm('저장된 금액은 ' + mm.stored.toLocaleString() + '원인데 지금 화면 금액은 ' + nowShown.toLocaleString() + '원이에요.\n\n이 금액으로 저장하면 고객 금액도 바뀝니다. 그래도 저장하시겠어요?');
      logSaveStage(okMm ? '금액불일치-진행' : '금액불일치-취소', { stored: mm.stored, shown: nowShown });
      if (!okMm) {
        showToast('저장이 취소됐어요 — 금액을 확인해주세요');
        estSendReceipt('save', 'invalid', { phase: 'end', reason: '금액 불일치 확인창 취소' });
        _finishAfter('invalid');
        return;
      }
      window._estMismatchAck = true;
      estRenderMismatchBanner();
    }
  }

  var btn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-save-estimate'));
  if (btn) {
    // 2026-09-21(선혜님 지적 - "전문업체는 원인을 어떻게 찾을까, 이게
    // 한두번이 아니잖아"로 전 구간 재점검 중 발견): 이 조기 종료 지점엔
    // logSaveStage() 호출이 아예 없었음 - 만약 이전 저장 시도의
    // reenable()이 어떤 이유로든 실행되지 않아 버튼이 disabled 상태로
    // 고착되면, 그 뒤로는 "저장"을 몇 번을 눌러도 여기서 매번 조용히
    // 끝나버려서 완전히 흔적 없는 실패가 반복될 수 있었음(인테리어오월/
    // 민소아 사건과 정확히 같은 증상 패턴). 단순히 알리기만 하는 게
    // 아니라, 15초 넘게 비활성 상태로 멈춰있으면(정상적인 저장은
    // 그보다 훨씬 빨리 끝남) 고착으로 판단하고 스스로 풀어서 이번
    // 클릭으로 다시 시도하게 함 - 사람이 새로고침할 때까지 기다리지 않음.
    var stuckMs = btn.disabled && btn.dataset.disabledAt ? (Date.now() - Number(btn.dataset.disabledAt)) : 0;
    if (btn.disabled && stuckMs > 15000) {
      logSaveStage('버튼-고착감지-자동복구', { stuckMs: stuckMs });
      btn.disabled = false; btn.style.opacity = '';
    }
    if (btn.disabled) {
      logSaveStage('버튼-이미비활성-무시');
      showToast('⚠️ 저장이 이미 진행 중이에요 — 잠시 후 다시 시도해주세요');
      estSendReceipt('save', 'invalid', { phase: 'end', reason: '이미 저장 진행 중' });
      _finishAfter('invalid');
      return;
    }
    btn.disabled = true;
    btn.dataset.disabledAt = String(Date.now());
    btn.style.opacity = '0.6';
  }
  function reenable(outcome) {
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    var nameEl = document.getElementById('c-name');
    // 2026-10-06: 예전엔 서버 저장이 실패해도 항상 saved='1'로 표시해서(코드 주석에도 "성공/로컬저장/실패 무관") 페이지를 나갈 때 경고가 안 떴음 -
    // 이제 서버가 실제로 받았을 때('server')만 저장됨으로 표시하고, 아니면 표시를 지워서 나갈 때 경고가 뜨게 함.
    if (nameEl) { if (outcome === 'server') { nameEl.dataset.saved = '1'; window._estDirty = false; } else { delete nameEl.dataset.saved; } }
    estSendReceipt('save', outcome || 'failed', { phase: 'end', pending_queue: (typeof getEstPendingQueue === 'function') ? getEstPendingQueue().length : null });
    _finishAfter(outcome || 'failed');
  }
  try {
    _saveEstimateInner(reenable);
  } catch (err) {
    console.error('저장 중 예외 발생:', err);
    alert('⚠️ 저장 중 오류가 발생했어요\n\n' + (err && err.message ? err.message : err) + '\n\n이 화면을 캡처해서 보내주시면 원인을 찾을 수 있어요.');
    reenable('failed');
  }
}

// 2026-10-06(선혜님 - 김성은님 견적서: "저장 눌렀어, 프린트까지 했는데" 서버엔 없음): 인쇄·PDF가 저장 여부를 확인하지 않아서 서버에 없는 서류가
// 종이로 나갔음. 저장이 필요한 상태(새 견적서이거나 수정 후 저장 안 함)면 먼저 저장하고, 서버가 받았을 때만 곧바로 진행. 서버에 못 올리면 물어봄.
function estimateNeedsSave() {
  var nameEl = /** @type {HTMLInputElement|null} */ (document.getElementById('c-name'));
  var name = nameEl && nameEl.value && nameEl.value.trim();
  if (!nameEl || !name) return false;
  if (nameEl.dataset.saved === '1') return false;
  var editing = window._estEditState && window._estEditState.editingEstDbId;
  return editing ? window._estDirty === true : true;
}
function ensureEstimateSavedThen(proceed) {
  if (!estimateNeedsSave()) { estSendReceipt('print', 'direct', {}); proceed(); return; }
  if (typeof showToast === 'function') showToast('저장하고 진행할게요…');
  window._estAfterSave = function (outcome) {
    if (outcome === 'server') { estSendReceipt('print', 'saved-then-proceed', {}); proceed(); return; }
    if (outcome === 'invalid') { estSendReceipt('print', 'blocked-invalid', {}); return; } // 이미 안내 메시지가 떴음 - 고치고 다시 누르면 됨
    if (window.confirm('⚠️ 서버에 저장하지 못했어요.\n\n이 견적서는 이 기기에만 있어서 나중에 사라질 수 있어요.\n\n그래도 계속할까요?')) { estSendReceipt('print', 'confirm-yes', {}); proceed(); }
    else { estSendReceipt('print', 'confirm-no', {}); }
  };
  saveEstimate();
}

// ══ 저장·열기·인쇄 영수증 (2026-10-06) ══
// 선혜님 - "너 희안하게 원인을 찾을 생각을 안하는거 같다 / 어떻게 하면 니가 오류를 찾을 수 있을까 고민해봐": 서버에는 "저장 결과"만 남고 "그때 화면에서 일어난
// 일"(화면에 보인 금액, 연 방법, 입력값, 기기, 로그인 상태)은 어디에도 없어서 9/23 김성은님 견적서나 08:59 할인 변화 같은 일을 매번 추측으로 풀어야 했음.
// 저장 시작/끝, 견적서 열기(저장된 금액 vs 화면 금액), 인쇄·PDF 때마다 화면 상태를 save_receipts 표에 남긴다(직원은 쓰기만, 읽기는 서버 관리자만).
// 영수증 전송이 실패해도 저장·인쇄 흐름에는 절대 영향이 없고, 실패하면 이 기기에 30건까지 보관했다가 다시 보냄(오프라인이었던 때의 기록도 나중에 도착).
var EST_RECEIPT_QUEUE_KEY = 'dah_receipt_queue';
function estCollectFormSnapshot() {
  var gv = function (id) { var el = /** @type {any} */ (document.getElementById(id)); return el ? el.value : null; };
  var gc = function (id) { var el = /** @type {any} */ (document.getElementById(id)); return el ? !!el.checked : null; };
  var gt = function (id) { var el = document.getElementById(id); return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) : null; };
  var svc = Array.prototype.map.call(document.querySelectorAll('#svc-body tr'), function (r) {
    return { t: r.getAttribute('data-svc-type') || null, k: (r.querySelector('.svc-kind') || {}).value || null, c: ((r.querySelector('.svc-content') || {}).value || '').slice(0, 40), p: (r.querySelector('.sprice') || {}).value || null, q: (r.querySelector('.sqty') || {}).value || null, m: r.dataset.manualOverride || null };
  });
  var st = document.getElementById('status-final');
  return {
    region: gv('c-region'), measure: gv('c-measure'), install: gv('c-install'), measure_tbd: gc('c-measure-tbd'), install_tbd: gc('c-install-tbd'),
    total: gt('sum-total'), discount_amount: gt('sum-discount'), discount_type: gv('discount-type'), discount_value: gv('discount'),
    curtain_rows: document.querySelectorAll('.row-curtain').length, blind_rows: document.querySelectorAll('#blind-body tr, .row-blind').length,
    svc_rows: svc, final_status: !!(st && st.classList.contains('on')),
    path: (window._estEditState && window._estEditState.editingEstDbId) ? 'edit' : 'new', url_params: String(location.search || '').slice(0, 90)
  };
}
function _estPostReceipt(row, allowQueue) {
  if (typeof SUPABASE_URL === 'undefined') return;
  var xhr = new XMLHttpRequest();
  xhr.open('POST', SUPABASE_URL + '/rest/v1/save_receipts', true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Prefer', 'return=minimal');
  xhr.timeout = 10000;
  var fail = function () { if (allowQueue) _estQueueReceipt(row); };
  xhr.onload = function () { if (!(xhr.status >= 200 && xhr.status < 300)) fail(); };
  xhr.onerror = fail; xhr.ontimeout = fail;
  xhr.send(JSON.stringify(row));
}
function _estQueueReceipt(row) {
  try {
    var q = JSON.parse(localStorage.getItem(EST_RECEIPT_QUEUE_KEY) || '[]'); q.push(row);
    if (q.length > 30) q = q.slice(-30);
    localStorage.setItem(EST_RECEIPT_QUEUE_KEY, JSON.stringify(q));
  } catch (e) { /* 보관 실패도 무시 */ }
}
function estFlushReceiptQueue() {
  try {
    var q = JSON.parse(localStorage.getItem(EST_RECEIPT_QUEUE_KEY) || '[]'); if (!q.length) return;
    localStorage.setItem(EST_RECEIPT_QUEUE_KEY, '[]');
    q.forEach(function (r) { r.detail = Object.assign({}, r.detail, { resent: true }); _estPostReceipt(r, true); });
  } catch (e) { /* 무시 */ }
}
function estSendReceipt(kind, outcome, extra) {
  try {
    var s = null; try { s = JSON.parse(localStorage.getItem('dah_auth_session') || 'null'); } catch (e1) {}
    var scr = /** @type {any} */ (document.querySelector('script[src*="est-save.js"]'));
    var ver = scr && scr.src && scr.src.indexOf('?v=') !== -1 ? scr.src.split('?v=')[1] : null;
    var nameEl = /** @type {any} */ (document.getElementById('c-name'));
    var row = {
      kind: kind, outcome: outcome || null,
      customer_name: nameEl && nameEl.value ? String(nameEl.value).trim().slice(0, 60) : null,
      estimate_id: (window._estEditState && window._estEditState.editingEstDbId) || null,
      app_version: ver, user_email: (s && s.email) || null,
      device: String(navigator.userAgent || '').slice(0, 120) + ' | ' + screen.width + 'x' + screen.height + ' | online=' + navigator.onLine,
      detail: Object.assign({ at_local: String(new Date()).slice(0, 33), snapshot: estCollectFormSnapshot() }, extra || {})
    };
    _estPostReceipt(row, true);
  } catch (e) { /* 영수증 실패는 절대 저장·인쇄 흐름에 영향을 주지 않음 */ }
}
// 열었을 때 저장 금액과 화면 금액이 다르면 화면 맨 위에 계속 남는 안내를 띄움(인쇄에는 안 나옴). "확인했어요"를 누르면 닫힘.
function estRenderMismatchBanner() {
  try {
    var old = document.getElementById('est-open-mismatch-banner'); if (old) old.remove();
    var m = window._estOpenMismatch; if (!m || window._estMismatchAck) return;
    var b = document.createElement('div');
    b.id = 'est-open-mismatch-banner'; b.className = 'print-hide';
    b.setAttribute('style', 'position:sticky;top:0;z-index:9999;background:#FFF3E0;border-bottom:2px solid #F06E2D;color:#5A3A12;padding:10px 16px;font-size:13px;line-height:1.5;display:flex;gap:12px;align-items:center;justify-content:space-between');
    var t = document.createElement('div');
    t.textContent = '⚠️ 저장된 금액(' + m.stored.toLocaleString() + '원)과 지금 화면 금액(' + m.shown.toLocaleString() + '원)이 달라요. 항목을 확인하고, 맞는 금액일 때만 저장하세요. 그대로 저장하면 고객 금액도 바뀌어요.';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = '확인했어요';
    btn.setAttribute('style', 'min-height:32px;padding:0 12px;border:1px solid #F06E2D;background:#fff;color:#F06E2D;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap');
    btn.onclick = function () { window._estMismatchAck = true; b.remove(); };
    b.appendChild(t); b.appendChild(btn);
    document.body.insertBefore(b, document.body.firstChild);
  } catch (e) { /* 안내 실패는 저장 흐름에 영향 없음 */ }
}
// 견적서를 연 뒤 저장된 금액과 화면 금액이 다르면 기록하고 저장 전에 확인하라고 경고(예: 저장 7,968,000원인데 열면 7,544,000원).
var _estMmState = { tries: 0, last: -1, stable: 0 };
function estCheckOpenMismatch(source) {
  try {
    var row = window._estLoadedRow; if (!row) return;
    var shown = parseInt(String((document.getElementById('sum-total') || {}).textContent || '').replace(/[^0-9]/g, ''), 10) || 0;
    // 2026-10-09: 열고 3.5초 시점엔 쿠폰·시공 행 복원이 아직 끝나기 전이라 금액이 중간값일 수 있음(실제로 박윤아 1,503,000원/유경진 3,542,000원처럼
    // 잘못된 값으로 거짓 경고가 뜸). 복원이 끝나(저장 버튼이 다시 켜지고) 금액이 2번 연속 같을 때까지 기다렸다가 판단함(최대 약 20초).
    var saveBtnEl = /** @type {HTMLButtonElement|null} */ (document.getElementById('btn-save-estimate'));
    var restoring = !!(saveBtnEl && saveBtnEl.disabled);
    if (_estMmState.tries === 0 || window._estMmRowId !== row.id) { _estMmState = { tries: 0, last: -1, stable: 0 }; window._estMmRowId = row.id; }
    _estMmState.stable = (shown === _estMmState.last) ? _estMmState.stable + 1 : 0;
    _estMmState.last = shown;
    _estMmState.tries++;
    if ((restoring || _estMmState.stable < 2) && _estMmState.tries < 20) {
      setTimeout(function () { estCheckOpenMismatch(source); }, 1000);
      return;
    }
    _estMmState = { tries: 0, last: -1, stable: 0 };
    var stored = Number(row.price) || 0;
    var mismatch = stored > 0 && shown > 0 && shown !== stored;
    estSendReceipt('open', mismatch ? 'mismatch' : 'ok', { source: source, stored_price: stored, shown_total: shown, stored_final: row.price_breakdown && row.price_breakdown.finalTotal, stored_region: row.region || null, stored_install_tbd: row.install_date_tbd, stored_manual_discount: (row.applied_discounts && row.applied_discounts.manual) || null });
    // 2026-10-09(선혜님 - 박윤아: 예전 형식 견적서를 열면 저장 1,361,000원이 1,411,000원으로 바뀌는데 알림이 3.5초 뒤 잠깐 떴다 사라져 놓치기 쉬움):
    // 잠깐 뜨는 알림 대신 화면에 계속 남는 안내를 띄우고, 저장 직전에도 한 번 더 확인함(saveEstimate).
    window._estOpenMismatch = mismatch ? { stored: stored, shown: shown } : null;
    window._estMismatchAck = false;
    estRenderMismatchBanner();
    estAutoFreezeOnOpen(row, mismatch, stored, shown);
    if (mismatch && typeof showToast === 'function') showToast('⚠️ 저장된 금액(' + stored.toLocaleString() + '원)과 화면 금액(' + shown.toLocaleString() + '원)이 달라요 — 저장하기 전에 확인해주세요');
  } catch (e) { /* 무시 */ }
}
// 2026-10-09 고정 자동화(선혜님 - "고정자동화해줘"): 예전 형식(시공 행 표식 없음) 견적서 중 계약금이 들어왔거나 확정된 것은,
// 열었을 때 저장 금액과 화면 금액이 정확히 같으면 지금 화면의 행들을 그대로 저장해 "고정"함(표식 svcRowsSaved). 이후 열 때 금액이 바뀌지 않음.
// 금액이 다르면(박윤아·우사랑 같은 경우) 절대 건드리지 않고 경고만 유지. 금액·계약금·잔금·성과매출은 건드리지 않고 행과 표식만 저장.
// 동시 수정 방지로 열었을 때의 updated_at이 그대로일 때만 저장하며, 실패해도 조용히 넘어감(다음에 열 때 다시 시도).
function estAutoFreezeOnOpen(row, mismatch, stored, shown) {
  try {
    if (mismatch || !row || !row.id || window._estAutoFreezeDone === row.id) return;
    if (!(stored > 0) || shown !== stored) return;
    if (row.price_breakdown && row.price_breakdown.svcRowsSaved) return;
    if (row.is_archived || row.cust_type === 'as') return;
    if (!(Number(row.deposit_amount) > 0) && row.estimate_status !== 'final') return;
    var st = window._estEditState || {};
    if (st.editingEstDbId !== row.id) return;
    var lockAt = st.editingEstUpdatedAt || row.updated_at;
    if (!lockAt) return;
    var items = collectLineItems();
    if (!Array.isArray(items) || !items.length) return;
    var pb = Object.assign({}, row.price_breakdown || {}, { svcRowsSaved: true });
    window._estAutoFreezeDone = row.id;
    var x = new XMLHttpRequest();
    x.open('PATCH', SUPABASE_URL + '/rest/v1/estimates?id=eq.' + encodeURIComponent(row.id) + '&updated_at=eq.' + encodeURIComponent(lockAt), true);
    x.setRequestHeader('apikey', SUPABASE_KEY);
    x.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
    x.setRequestHeader('Content-Type', 'application/json');
    x.setRequestHeader('Prefer', 'return=representation');
    x.timeout = 15000;
    x.onload = function () {
      try {
        var out = JSON.parse(x.responseText);
        if (x.status >= 200 && x.status < 300 && Array.isArray(out) && out.length === 1) {
          if (out[0].updated_at) window._estEditState.editingEstUpdatedAt = out[0].updated_at;
          row.price_breakdown = pb;
          estSendReceipt('open', 'auto_freeze', { stored_price: stored, rows: items.length });
        }
      } catch (e) { /* 무시 */ }
    };
    x.send(JSON.stringify({ line_items: items, price_breakdown: pb }));
  } catch (e) { /* 자동 고정 실패는 열기 흐름에 영향 없음 */ }
}
window.addEventListener('online', function () { estFlushReceiptQueue(); });
document.addEventListener('DOMContentLoaded', function () { setTimeout(estFlushReceiptQueue, 4000); });

// 2026-08-21(선혜님 요청 — "내가 어떻게 다 검토하니, 코드를 활용할 수 없니"):
// 여러 핵심 항목을 자동으로 검사해서 한 화면에 초록/빨강으로 보여주는 자가진단
// 기능. 하나하나 물어보는 대신, 이 결과 화면 캡처 한 장이면 충분히 진단 가능.
function runSelfDiagnosis() {
  var results = [];
  function render() {
    var modal = document.getElementById('self-diag-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'self-diag-modal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:9999999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
      modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
      document.body.appendChild(modal);
    }
    var rows = results.map(function(r) {
      return '<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid #EEE6DC;align-items:flex-start;">' +
        '<span style="font-size:16px;flex-shrink:0">' + (r.ok ? '✅' : '❌') + '</span>' +
        '<div><div style="font-size:13px;font-weight:600;color:#1A1A1A">' + r.label + '</div>' +
        (r.detail ? '<div style="font-size:11px;color:#8A8378;margin-top:2px">' + r.detail + '</div>' : '') +
        '</div></div>';
    }).join('');
    modal.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:420px;width:100%;max-height:80vh;overflow-y:auto;padding:20px;box-sizing:border-box;">' +
      '<div style="font-size:15px;font-weight:700;margin-bottom:4px">🔍 자가진단 결과</div>' +
      '<div style="font-size:11px;color:#8A8378;margin-bottom:12px">v' + (window.DAH_BUILD||'?') + ' · ' + new Date().toLocaleString('ko-KR') + '</div>' +
      rows +
      '<button onclick="document.getElementById(\'self-diag-modal\').remove()" style="margin-top:16px;width:100%;padding:10px;background:#282828;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700">닫기</button>' +
      '</div>';
  }
  function check(label, ok, detail) { results.push({ label: label, ok: ok, detail: detail || '' }); render(); }

  render();
  check('진단 시작', true, '아래 항목이 하나씩 채워집니다');

  check('인터넷 연결', navigator.onLine, navigator.onLine ? '정상' : '오프라인 상태로 감지됨');

  try {
    localStorage.setItem('__diag_test__', '1');
    localStorage.removeItem('__diag_test__');
    check('기기 저장공간(localStorage)', true, '정상');
  } catch(e) {
    check('기기 저장공간(localStorage)', false, '사용 불가 - ' + e.message);
  }

  var session = (typeof getAuthSession === 'function') ? getAuthSession() : null;
  if (!session) {
    check('로그인 세션', false, '세션 없음 - 다시 로그인 필요');
  } else {
    var minsLeft = Math.round((session.expires_at - Date.now()) / 60000);
    check('로그인 세션', minsLeft > 0, minsLeft > 0 ? (minsLeft + '분 후 만료 예정(자동갱신됨)') : (Math.abs(minsLeft) + '분 전 만료됨 - 저장시 자동갱신 시도함'));
  }

  var xhr1 = new XMLHttpRequest();
  xhr1.open('GET', SUPABASE_URL + '/rest/v1/', true);
  xhr1.setRequestHeader('apikey', SUPABASE_KEY);
  xhr1.timeout = 5000;
  xhr1.onload = function() { check('서버(Supabase) 연결', xhr1.status < 500, 'HTTP ' + xhr1.status); };
  xhr1.onerror = function() { check('서버(Supabase) 연결', false, '연결 실패 - 네트워크 확인 필요'); };
  xhr1.ontimeout = function() { check('서버(Supabase) 연결', false, '응답 없음(5초 초과)'); };
  xhr1.send();

  var coupons = [];
  try { coupons = JSON.parse(localStorage.getItem('dah_discount_coupons') || '[]'); } catch(e) {}
  check('할인쿠폰 목록', coupons.length > 0, coupons.length + '개 로드됨' + (coupons.length === 0 ? ' (설정에 등록된 쿠폰이 없거나 아직 못 받아옴)' : ''));

  var regionFees = null;
  try { regionFees = JSON.parse(localStorage.getItem('dah_region_fees') || 'null'); } catch(e) {}
  var regionCount = regionFees ? Object.keys(regionFees).length : 0;
  check('지역별 실측·시공비', regionCount > 0, regionCount + '개 지역 로드됨');

  var pending = [];
  try { pending = JSON.parse(localStorage.getItem('dah_pending_estimate_sync') || '[]'); } catch(e) {}
  check('서버 저장 대기열', pending.length === 0, pending.length === 0 ? '밀린 것 없음' : (pending.length + '건 대기중 - 하단 배너를 눌러 재시도해보세요'));

  var attempts = [];
  try { attempts = JSON.parse(localStorage.getItem('dah_save_attempts') || '[]'); } catch(e) {}
  var recentAttempts = attempts.slice(-3).reverse().map(function(a){
    return (a.customerName||'(이름없음)') + ' — ' + new Date(a.at).toLocaleString('ko-KR');
  }).join('<br>');
  check('최근 저장 시도 기록', attempts.length > 0, attempts.length + '건 기록됨' + (recentAttempts ? '<br>최근: ' + recentAttempts : ''));

  check('현재 페이지 버전', true, 'v' + (window.DAH_BUILD||'?'));
}

// 2026-09-09(선혜님 - "저게 있는게 맞을까?? 전문업체 관점에서 평가해봐"):
// exportAllEstimatesExcel()(전체 견적서 엑셀 다운로드) 함수를 여기서
// 완전히 제거함 - 대시보드(dash-export.js의 _exportEstimatesExcelInner)에
// 완전히 동일한 기능이 이미 있었음. "개별 견적서 작성 화면"에 "전체
// 견적서 목록" 다운로드 버튼이 있는 건 위치도 안 맞고 순수 중복이었음.

// 2026-09-16(선혜님 - "링크 너가 나한테 준거잖아"): showToast는
// shared-common-utils.js로 옮김 - 이 파일의 정의는 삭제(2026-08-28에
// 이미 "쌍둥이 함수 찾기, 코드 정리, 제대로 하자"로 표시시간만 맞춰
// 뒀던 걸 이제 진짜로 파일 자체를 하나로 합침).
