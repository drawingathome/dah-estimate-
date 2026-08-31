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
// "지금 편집 중인 견적이 무엇인지" 관련 상태 4가지(_editingEstDbId/
// _editingEstUpdatedAt/_viewingFrozenEstimate/_estSaveCustomerId)를 "새로
// 시작하는" 모든 지점에서 반드시 함께 리셋하도록 이 함수 하나로 모음. 예전엔
// newEstimate()가 앞 3개만 리셋하고 _estSaveCustomerId는 빠뜨리고 있었음
// (다행히 saveToLocalStorage()의 이름기반 재매칭이 우연히 이 문제를 가려주고
// 있었지만, 그건 "우연히 안전"한 거였지 확실한 보장이 아니었음). 앞으로 견적
// 편집상태를 초기화해야 하는 곳이 새로 생기면, 각 변수를 따로따로 건드리지
// 말고 반드시 이 함수를 호출할 것.
function resetEstEditingState() {
  window._editingEstDbId = null;
  window._editingEstUpdatedAt = null;
  window._viewingFrozenEstimate = false;
  window._estSaveCustomerId = null;
  // 2026-08-29(선혜님이 자동백업 중복탐지 알림으로 발견 — 임민희 견적서
  // 8건 중복, 0.074초 안에 생성됨): idempotency_key가 저장 시도(재시도
  // 포함) "전체에서 동일한 값을 유지"해야 DB 유니크 제약이 중복을 막아줄
  // 수 있는데, 실제로는 _saveToEstimatesActual()이 호출될 때마다 매번
  // crypto.randomUUID()로 새 키를 만들고 있었음 - 8/24에 넣은 버튼
  // 비활성화 방어가 어떤 이유로든 뚫리면(리렌더링으로 버튼이 새로
  // 교체되는 등) 각 시도가 전부 다른 키를 가져서 서버쪽 방어가 무력화됨.
  // 이 견적서 편집 세션 하나당 키 하나만 쓰도록 여기서 한 번만 생성.
  window._currentEstIdempotencyKey = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('est-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  // 2026-08-26 추가: 계산결과 캐시 3개(_lastCalcBreakdown/_lastDiscountBreakdown/
  // _lastAppliedDiscounts)도 함께 리셋. 지금은 newEstimate() 끝에서 calcTotal()을
  // 호출해서 결과적으로 이 값들이 다시 채워지고 있어 실제로는 안전하지만, 그건
  // "calcTotal()이 항상 호출된다"는 암묵적 전제에 기댄 우연한 안전이었음(그
  // 호출이 나중에 실수로 빠지면 이전 고객의 계산결과가 새 견적에 남아있을 수
  // 있었음). 명시적으로 여기서도 비워서 그 전제에 기대지 않도록 함.
  window._lastCalcBreakdown = null;
  window._lastDiscountBreakdown = null;
  window._lastAppliedDiscounts = null;
}

function newEstimate() {
  if(!confirm('새 견적서를 작성하시겠어요? 현재 내용이 초기화됩니다.')) return;
  // 2026-08-24(전수 재검사 중 발견 — 잠재적으로 심각한 버그): 기존 견적을
  // "이어서 수정"하던 중(_editingEstDbId가 세팅된 상태)에 이 버튼을 누르면
  // 화면은 비워지는데 이 표시값은 안 지워지고 있었음. 그 상태로 완전히 다른
  // 고객 정보를 입력해서 저장하면, 저장 로직이 "이건 수정이다"로 착각해서
  // 새 고객이 아니라 원래 열려있던 남의 견적을 그 내용으로 덮어써버릴 수
  // 있었음(아직 실제 피해 사례는 확인 안 됐지만 재현 가능한 심각한 버그).
  resetEstEditingState();
  document.getElementById('c-name').value='';
  document.getElementById('c-phone').value='';
  document.getElementById('c-addr').value='';
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
  var name = document.getElementById('c-name')?.value?.trim();
  if (!name) { showFieldError('c-name', '고객명을 입력해주세요'); return false; }
  // 2026-08-29(선혜님 지적 - "이게 중복이 생기는거는 심각한데", 신화경
  // 사례로 발견): 고객명만 필수였고 연락처는 검증이 전혀 없어서, 연락처
  // 없이 저장하면 그런 고객이 그대로 자동 생성됐음 - 나중에 같은 사람을
  // 연락처 포함해서 다시 등록하면, 연락처가 다르니(하나는 없음) 시스템이
  // "다른 사람"으로 착각해 중복 경고 없이 통과되고 있었음(신화경님 사례
  // - 견적 1,192,000원짜리 빈 고객과 실제 결제완료된 고객이 따로 존재).
  // 연락처도 필수로 만들어서 이 경로 자체를 막음.
  var phone = document.getElementById('c-phone')?.value?.trim();
  if (!phone) { showFieldError('c-phone', '연락처를 입력해주세요'); return false; }
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
  if (!hasProduct) {
    // 2026-08-05: AS·수선 접수는 무상 하자처리처럼 제품금액이 없을 수 있음.
    // 증상이 기재되어 있으면 금액 없이도 저장 가능하게 예외 처리 —
    // 예전엔 이 조건이 없어서 무상 AS건은 저장 자체가 막혔었음.
    var asSymptomFilled = (currentCustType === 'as') && (document.getElementById('as-symptom')?.value || '').trim() !== '';
    if (!asSymptomFilled) { showToast('제품 금액을 1개 이상 입력해주세요', 'error'); return false; }
  }
  // 가로/높이까지 입력해놓고 단가만 빼먹은 행이 있으면 — 조용히 0원으로 저장되는 걸 막고 알려줌
  if (missingPriceRows.length > 0) {
    showToast('⚠️ ' + missingPriceRows.join(', ') + ' 항목의 단가가 비어있어요. 확인 후 다시 저장해주세요', 'error');
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
  if (!validateEstimate()) { onDone(); return; }
  var name=document.getElementById('c-name').value.trim();
  if(!name) { showToast('⚠️ 고객명을 입력하세요'); onDone(); return; }
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
  function saveToCustomers() {
    
    saveToLocalStorage();

    // 고객명단 구글시트 동기화 (항상 — 가견적/확정 상관없이 현재 상태 반영)
    var isFinalForDrive = (currentTab === 'final' || document.getElementById('status-final')?.classList.contains('on'));
    syncCustomerToSheet({
      clientName: name, phone: phone, addr: addr+(addr2?' '+addr2:''),
      staffName: staffName, stage: isFinalForDrive ? '확정견적' : '가견적',
      price: grand, performanceRevenue: perf,
      date: document.getElementById('c-measure')?.value||'',
      measureDate: document.getElementById('c-measure')?.value||'',
      installDate: document.getElementById('c-install')?.value||'',
      memo: custMemo
    });

    // 견적서는 확정(최종) 견적서일 때만 구글드라이브에 저장 (가견적서는 저장 안 함)
    if (isFinalForDrive && typeof buildCustomerHTML === 'function') {
      try {
        var custDocHtml = buildCustomerHTML();
        saveDocumentToDrive('견적서', name || '미지정고객', phone, custDocHtml);
      } catch(e) { console.warn('견적서 드라이브 저장용 HTML 생성 실패:', e); }
    }
    
    try {
      var xhr=new XMLHttpRequest();
      var existingCustId = window._estSaveCustomerId;
      var isUpdate = !!existingCustId;
      xhr.open(isUpdate ? 'PATCH' : 'POST', SUPABASE_URL+'/rest/v1/customers'+(isUpdate ? '?id=eq.'+existingCustId : ''), true);
      xhr.setRequestHeader('apikey',SUPABASE_KEY);
      xhr.setRequestHeader('Authorization','Bearer '+(typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
      xhr.setRequestHeader('Content-Type','application/json');
      // 2026-08-25(선혜님 발견 — "이름을 이라리로 바꿔도 오지은으로 뜬다",
      // 진짜 원인): 여기가 sbXHR(dash-api.js)이랑 완전히 별개인 견적서 앱만의
      // 고객 저장 코드라, 오늘 낮에 sbXHR에 넣은 "0건 반영 감지" 수정이 전혀
      // 적용 안 되고 있었음. 게다가 실패해도 console.warn만 찍고 화면엔
      // 아무 표시도 안 해서, 이름 수정이 서버에 반영이 안 됐는데도 사용자는
      // 전혀 알 방법이 없었음. PATCH도 return=representation으로 받아서
      // 실제 반영 건수를 확인하고, 실패시 화면에 명확히 알림.
      xhr.setRequestHeader('Prefer', 'return=representation');
      xhr.onload=function(){
        if (xhr.status < 200 || xhr.status >= 300) {
          console.warn('Supabase 고객 저장 실패 (status='+xhr.status+'):', xhr.responseText);
          showToast('⚠️ 고객정보가 서버에 저장되지 않았어요(오류 '+xhr.status+') — 새로고침해서 확인해주세요');
        } else {
          var resData = null;
          try { resData = xhr.responseText ? JSON.parse(xhr.responseText) : []; } catch(eP) { resData = null; }
          if (isUpdate && Array.isArray(resData) && resData.length === 0) {
            // 0건 반영 = 권한(RLS) 문제 등으로 서버에 실제로는 아무것도 안 바뀐 것
            showToast('⚠️ 고객정보 수정이 서버에 반영되지 않았어요(권한 문제일 수 있어요) — 새로고침해서 확인해주세요');
          } else if (!isUpdate) {
          // 신규 생성 성공 — 응답으로 받은 진짜 id를 로컬 customer 레코드와 견적이력에도 반영
          try {
            if (resData && resData[0] && resData[0].id) {
              var newId = resData[0].id;
              var arr = JSON.parse(localStorage.getItem('dah_customers')||'[]');
              var idx = arr.findIndex(function(c){ return c.clientName === name && !c.id; });
              if (idx >= 0) { arr[idx].id = newId; localStorage.setItem('dah_customers', JSON.stringify(arr)); }
              var savedArr = JSON.parse(localStorage.getItem('dah_saved')||'[]');
              var sIdx = savedArr.findIndex(function(e){ return e.no === document.getElementById('c-no')?.value.trim() && !e.clientId; });
              if (sIdx >= 0) { savedArr[sIdx].clientId = newId; localStorage.setItem('dah_saved', JSON.stringify(savedArr)); }
              window._estSaveCustomerId = newId;
            }
          } catch(e3) { /* 무시 — 로컬 id는 다음 저장시 이름+전화번호로 다시 매칭됨 */ }
          }
        }
        saveToEstimates();
      };
      xhr.onerror=function(){ console.warn('Supabase 고객 저장 실패 (localStorage는 완료)'); showToast('⚠️ 고객정보 저장 실패(네트워크) — 로컬엔 저장됨'); saveToEstimates(); };
      var custPayload = {
        client_name:name, phone:phone
      };
      // 2026-08-12: 기존 고객이면 staff_name을 payload에서 제외 - 예전엔
      // 무조건 포함시켜서, 다른 담당자가 이름 검색으로 견적서를 저장하기만
      // 해도 그 고객의 담당자가 조용히 바뀌어버렸음. 담당자가 바뀌면 매출/
      // 실적 귀속도 같이 바뀌므로 이건 부수효과로 조용히 일어나면 절대 안
      // 됨(선혜님 확인) - 담당자 변경은 고객상세 등 명시적 화면에서만.
      // addr과 동일한 패턴: 신규 고객일 때만 포함.
      if (!isUpdate) custPayload.staff_name = staffName;
      // 2026-08-12: 예전엔 여기에 memo:custMemo+' | 커튼:'+grand+'원' 로
      // customers.memo를 덮어쓰고 있었음 — customers.memo(고객상세 메모,
      // 오늘 임시저장 기능까지 붙인 별개 필드)와 estimates.memo(견적서
      // 내부메모)는 서로 다른 용도인데, 이 코드가 매번 견적서 저장할 때마다
      // 고객이 직접 남긴 중요 메모("이 고객 성격 예민함" 등)를 " | 커튼:
      // 200000원" 같은 값으로 통째로 지워버리는 실제 데이터 손실 위험이
      // 있었음(재현 확인함). customers.memo는 절대 여기서 건드리지 않음.
      // 2026-08-05: 기존 고객을 PATCH(업데이트)할 때, 이번 화면에 주소를 안 채웠다고 해서
      // 서버에 저장돼있던 기존 주소까지 빈 값으로 덮어써지면 안 됨. PATCH는 payload에 있는
      // 필드만 갱신하므로, 주소가 비어있을 땐 아예 payload에서 빼서 기존 값이 유지되게 함.
      // (신규 고객이면 addr가 비어있어도 그냥 빈 값으로 시작하는 게 맞아서 그대로 포함)
      var addrCombined = addr+(addr2?' '+addr2:'');
      if (addrCombined || !isUpdate) custPayload.addr = addrCombined;
      // 확정견적일 때만 고객 실적에 금액 동기화 (2026-08-04 신규) — 예전엔
      // 견적서를 아무리 저장해도 customers.price/performance_revenue가
      // 영구히 0으로 남아서, 신규로 발생하는 모든 고객이 매출탭 계산에
      // 절대 안 잡히는 구조적 결함이었음(이관 데이터만 수동으로 채워놔서
      // 우연히 정상으로 보였을 뿐). 가견적 단계에선 그대로 0으로 둬서,
      // 혹시 오래 방치돼도 하위호환 폴백에 잘못 걸리지 않도록 안전하게 둠.
      //
      // 2026-08-28(선혜님 지적 — "결제도 대시보드쪽에 적으면 견적서에
      // 같이 적어지게 해줘", 최시내 사례로 발견: 선금 200만원을 실제
      // 받았는데도 칸반카드엔 금액이 하나도 안 보였음): 위 gate가
      // "확정견적일 때만"이라 가견적 단계인 고객은 견적을 몇 번을 다시
      // 저장해도 customers.price가 계속 0으로 남아서, 칸반카드의 금액
      // 표시(c.price 기준)와 "선금결제 처리" 필요항목 판단 등이 전부
      // 어긋나고 있었음. price(매출계산 기준금액=화면표시용)는 가견적
      // 단계에서도 항상 최신 견적금액으로 동기화하도록 분리했었음.
      //
      // 2026-08-28(선혜님 재확인 — "실장의 매출은 제품비용만으로 들어가는건데
      // 50%선금 50%잔금으로 진행하면 계산이 안맞지 않니?"): 위에서
      // performance_revenue만 "확정일 때만"으로 남겨뒀던 게 오히려 문제를
      // 만들었음 - 미확정(가견적/실측준비중/선금결제 등) 고객은 performance_
      // revenue가 계속 0으로 남아서, splitCustomerPayments()가 어쩔 수 없이
      // c.price(전체 100%, 레일·시공비 포함)로 폴백해서 매출을 계산하고
      // 있었음(오늘 아침 그 폴백 자체를 도입한 게 부작용을 만든 것).
      // perf 변수 자체가 이미 "커튼·블라인드 총액-할인"(레일·시공비는
      // 애초에 안 들어감, 순수 제품비용)이라 확정 여부와 무관하게 항상
      // 동기화해도 실적 왜곡 위험이 없음 - price와 동일하게 gate 제거.
      custPayload.price = grand;
      custPayload.performance_revenue = perf;
      xhr.send(JSON.stringify(custPayload));
    } catch(e) { console.warn('Supabase 연결 오류:', e); saveToEstimates(); }
  }
  function saveToEstimates() {
    // 2026-08-26(선혜님 발견 — 김채은/유경진 견적서 중복 생성 사례):
    // "오늘 이미 만든 견적이면 PATCH로 이어서 수정"하는 판단(est-customer-load.js)이
    // 이 브라우저의 로컬 저장소(dah_saved)만 보고 내려졌음 — 그래서 (1) 다른
    // 기기/다른 탭에서 방금 저장한 걸 이 브라우저가 모르거나, (2) 같은 브라우저라도
    // 탭을 두 개 열어 거의 동시에 저장하면(유경진 사례: 19초 간격) 양쪽 다
    // "처음 저장하는 줄" 알고 각자 새로 생성해버림. 로컬 판단을 믿지 말고, 실제
    // POST/PATCH를 결정하기 직전에 서버에 "이 고객, 오늘, 아직 안 지워진 견적이
    // 이미 있는지"를 직접 한 번 더 물어봐서 있으면 그 레코드로 PATCH하도록 함.
    // (완벽한 동시성 보장은 아님 - 두 탭이 이 확인마저 같은 찰나에 동시에 하면
    // 여전히 둘 다 생성될 수 있음. 그 마지막 좁은 틈은 DB의
    // estimates_idempotency_key_uniq 유니크 제약과는 별개 문제라 여기선 못 막음 -
    // 대신 그 경우를 대비해 8-2번처럼 주기적으로 견적서 목록에서 중복을
    // 스캔하는 걸 권장.)
    if (!window._editingEstDbId && window._estSaveCustomerId && typeof SUPABASE_URL !== 'undefined') {
      var todayStart = new Date(); todayStart.setHours(0,0,0,0);
      var xhrCheck = new XMLHttpRequest();
      // 2026-08-31(선혜님 지적 — "현은지 왜 또 중복이 되지????", 개판이네
      // 진짜!!!!): 이 "오늘 이미 저장된 견적 찾기" 안전장치가 created_at
      // (최초 생성일) 기준으로만 찾고 있었음 - 현은지 원본 견적서는
      // 8/4에 처음 만들어졌는데, 오늘(8/31) 그 견적을 열어서 수정저장까지
      // 했음에도 "오늘 생성된 것"에는 안 걸려서 못 찾음. 그 상태로
      // _editingEstDbId도 어떤 이유로(정확한 재현은 못 했으나 mode=edit
      // 아닌 경로로 재진입했을 가능성) 유실된 채 "확정" 저장을 하니,
      // 이 안전장치도 원본을 못 찾아 완전히 새 레코드(POST)를 만들어버림.
      // "오늘 작업 중인 견적"을 정확히 찾으려면 최초 생성일이 아니라
      // 최근 수정일(updated_at) 기준이어야 함.
      xhrCheck.open('GET', SUPABASE_URL + '/rest/v1/estimates?client_id=eq.' + encodeURIComponent(window._estSaveCustomerId) +
        '&is_archived=eq.false&updated_at=gte.' + encodeURIComponent(todayStart.toISOString()) +
        '&select=id,updated_at&order=updated_at.desc&limit=1', true);
      xhrCheck.setRequestHeader('apikey', SUPABASE_KEY);
      xhrCheck.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
      xhrCheck.timeout = 5000;
      var proceeded = false;
      var proceed = function() {
        if (proceeded) return; proceeded = true;
        _saveToEstimatesActual();
      };
      xhrCheck.onload = function() {
        try {
          if (xhrCheck.status >= 200 && xhrCheck.status < 300) {
            var rows = JSON.parse(xhrCheck.responseText || '[]');
            if (rows && rows.length) {
              window._editingEstDbId = rows[0].id;
              window._editingEstUpdatedAt = rows[0].updated_at || null;
              showToast('오늘 이미 저장된 견적을 찾아 이어서 수정합니다(중복 방지)');
            }
          }
        } catch (e) { /* 파싱 실패시에도 아래 proceed()로 정상 진행(신규 저장 취급) */ }
        proceed();
      };
      // 이 확인 자체가 실패(네트워크/타임아웃)해도 저장 흐름 전체를 막지는 않음 —
      // "중복 방지 확인 한 번 더" 실패가 "아예 저장이 안 됨"보다 훨씬 나쁜 결과이므로,
      // 확인이 안 되면 예전처럼 로컬 판단 그대로 신규 저장을 진행함.
      xhrCheck.onerror = proceed;
      xhrCheck.ontimeout = proceed;
      xhrCheck.send();
      return;
    }
    _saveToEstimatesActual();
  }
  function _saveToEstimatesActual() {
    // 2026-08-05: 재시도 큐에서도 그대로 재사용할 수 있도록 payload를 변수로 분리
    // 2026-08-05: 중복행 방지용 idempotency key — 이 저장 시도(재시도 포함) 전체에서
    // 동일한 값을 유지. "서버는 실제로 성공했는데 응답을 못 받아 실패로 오판"해서
    // 재시도했을 때, DB의 유니크 제약(estimates_idempotency_key_uniq)이 중복 삽입을
    // 막아주고, 그 409 응답을 "이미 저장됨"으로 해석해서 정상 처리함.
    var estPayloadForRetry = Object.assign({
      client_idempotency_key: window._currentEstIdempotencyKey || ((window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('est-' + Date.now() + '-' + Math.random().toString(36).slice(2))),
      customer_name:name, price:grand,
      performance_revenue:perf, staff_name:staffName,
      estimate_status:currentTab||'ga',
      phone:phone, space:spaceStr, product:fabricStr,
      date: document.getElementById('c-measure')?.value || '',
      // 2026-08-28(선혜님 지적 — "견적서에 시공일을 적어놔도 없어져"):
      // 시공일(c-install)이 지금까지 구글시트 동기화(syncCustomerToSheet)
      // 에만 보내지고, 정작 견적서 DB(estimates 테이블)엔 저장할 컬럼
      // 자체가 없었음 - 그래서 적어도 저장할 곳이 없어 사라진 것처럼
      // 보였음. install_date 컬럼을 새로 추가하고 여기서 함께 저장.
      install_date: document.getElementById('c-install')?.value || '',
      memo: custMemo,
      confirmed_at: window._estimateConfirmedAt || null,
      branch: '반포점',
      client_id: window._estSaveCustomerId || null,
      line_items: lineItems,
      cust_type: currentCustType || 'new',
      region: document.getElementById('c-region')?.value || '',
      // 2026-08-14: 할인 정보 자체가 지금까지 저장 안 되고 있던 필드누락을
      // 쿠폰 다중선택 기능 만들면서 같이 발견/해결 - 재구매/열어서수정시
      // 어떤 쿠폰이 선택돼있었는지 정확히 복원하기 위해 저장.
      applied_discounts: window._lastAppliedDiscounts || { coupons: [], manual: null },
      // 2026-08-24(선혜님 확인 — "다시 열어도 저장 당시 금액 그대로"): 제품소계/
      // 시공자재/할인/최종금액/계약금/잔금 스냅샷을 같이 저장. 안 하면 견적을
      // 나중에 다시 열었을 때 그 사이 바뀐 할인쿠폰/설정으로 재계산되어 금액이
      // 달라지는 문제가 있었음(최시내님 사례로 발견 — 저장시 482만원이었는데
      // 나중에 다시 여니 490.9만원으로 나옴).
      price_breakdown: window._lastCalcBreakdown || null
    }, currentCustType === 'as' ? {
      as_install_date: document.getElementById('as-install-date')?.value || null,
      as_type: document.getElementById('as-type-sel')?.value || null,
      as_symptom: document.getElementById('as-symptom')?.value || null,
      as_photo_memo: document.getElementById('as-photo-memo')?.value || null,
      as_fee_type: (document.querySelector('input[name="as-fee"]:checked')?.value) || 'free'
    } : {});
    try {
      var xhr2=new XMLHttpRequest();
      // 2026-08-12: "견적서 이력에서 특정 견적서를 열어 수정" 기능 추가를 위한
      // 기반 작업 — 예전엔 항상 POST(신규)만 해서, 같은 견적서를 다시 저장해도
      // 서버엔 계속 새 레코드가 쌓였음(로컬만 no기준으로 덮어써짐, 서버는 중복
      // 축적). window._editingEstDbId가 있으면(견적서이력의 "열어서 수정"으로
      // 진입한 경우) PATCH로 그 레코드 자체를 갱신, 없으면(신규작성/"복사해서
      // 새로만들기") 기존처럼 POST — 이 경우 응답에서 생성된 id를 받아 로컬에
      // dbId로 저장해둬야 다음번에 "열어서 수정"이 가능해짐.
      var isEditMode = !!window._editingEstDbId;
      // 2026-08-13: 동시편집 충돌 방지(낙관적 잠금) - PATCH할 때 "내가 불러온
      // 시점의 updated_at"도 조건에 포함시켜서, 그 사이 다른 사람(다른 탭/다른
      // 스태프)이 먼저 저장했으면(=updated_at이 달라졌으면) 이번 PATCH가 0건
      // 매칭되어 아무것도 안 바뀜 - 이걸로 "덮어쓰기 충돌"을 감지해서 조용히
      // 데이터를 잃지 않고 사용자에게 알림.
      var lockUpdatedAt = window._editingEstUpdatedAt || null;
      if (isEditMode) {
        var patchUrl = SUPABASE_URL+'/rest/v1/estimates?id=eq.'+encodeURIComponent(window._editingEstDbId);
        if (lockUpdatedAt) patchUrl += '&updated_at=eq.'+encodeURIComponent(lockUpdatedAt);
        xhr2.open('PATCH', patchUrl, true);
      } else {
        xhr2.open('POST', SUPABASE_URL+'/rest/v1/estimates', true);
      }
      xhr2.setRequestHeader('apikey',SUPABASE_KEY);
      xhr2.setRequestHeader('Authorization','Bearer '+(typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
      xhr2.setRequestHeader('Content-Type','application/json');
      // 2026-08-25(선혜님 발견 — "저장했는데 나중에 수정이 안 됨", 진짜
      // 원인): 수정(PATCH) 저장인데 updated_at 잠금값이 없는 경우엔
      // return=minimal을 써서, 서버가 실제로 몇 건을 바꿨는지 전혀 확인을
      // 안 하고 있었음. 최근 적용된 보안규칙(담당자 이름이 안 맞으면 그
      // 견적 수정 자체가 조용히 0건 처리됨) 때문에, 이 경우 실제로는 아무것도
      // 안 바뀌었는데도 무조건 "저장 완료!"가 떠서 대표님이 데이터가 사라진
      // 걸 전혀 알 방법이 없었음. 수정 저장은 항상 return=representation으로
      // 받아서 실제 몇 건이 바뀌었는지 확인하도록 수정.
      xhr2.setRequestHeader('Prefer', isEditMode ? 'return=representation' : 'return=minimal');
      xhr2.onload=function(){
        if (xhr2.status >= 200 && xhr2.status < 300) {
          // 수정 저장인데 응답이 빈 배열이면 = 0건 매칭 = 실제로 아무것도
          // 안 바뀐 것(담당자 불일치로 보안규칙에 막혔거나, updated_at
          // 잠금이 걸려있었다면 그 사이 다른 곳에서 먼저 저장한 것).
          if (isEditMode) {
            try {
              var lockCheckRows = JSON.parse(xhr2.responseText);
              if (Array.isArray(lockCheckRows) && lockCheckRows.length === 0) {
                showToast(lockUpdatedAt
                  ? '⚠️ 이 견적서가 방금 다른 곳에서 먼저 저장됐어요 — 새로고침해서 최신 내용을 확인해주세요 (내 변경사항은 안전하게 백업됐어요)'
                  : '⚠️ 저장이 서버에 반영되지 않았어요 (권한 문제일 수 있어요) — 마스터님께 알려주세요. 내 변경사항은 안전하게 백업됐어요');
                // 2026-08-31(선혜님 지적 — "앞으로 다른 견적서도 확정을
                // 누르면 지워진다는 말이니, 복구 못하는게 말이 되니"로
                // 발견·수정): 저장이 서버에 막혔을 때(권한 문제 등) "강제
                // 재시도는 위험하니 큐에 안 넣는다"는 판단까지는 맞지만,
                // 그럼 그 내용 자체를 아예 어디에도 안 남기고 있었음 -
                // 유일한 백업이던 자동저장 초안(dah_estimate_draft)도
                // 60분 지나면 지워지는 임시용이라, 신화경 사례처럼 며칠
                // 뒤엔 이미 사라지고 없었음. 재시도는 안 하되(위험 방지는
                // 유지), 이 payload 자체는 기한 없이 별도 보관해서 절대
                // 사라지지 않게 함 - 나중에 마스터가 이 백업을 보고 수동
                // 으로 확인/재저장할 수 있음.
                try {
                  var failedSaves = JSON.parse(localStorage.getItem('dah_failed_saves')||'[]');
                  failedSaves.push({
                    savedAt: new Date().toISOString(),
                    reason: lockUpdatedAt ? '동시저장충돌' : '권한문제(담당자불일치 추정)',
                    editingEstDbId: window._editingEstDbId,
                    payload: estPayloadForRetry
                  });
                  if (failedSaves.length > 50) failedSaves = failedSaves.slice(-50); // 무한정 쌓이지 않게 최근 50건만
                  localStorage.setItem('dah_failed_saves', JSON.stringify(failedSaves));
                } catch(eBackup) { /* 백업 자체가 실패해도 저장 흐름엔 영향 안 줌 */ }
                // 로컬 백업은 "이 브라우저/이 기기"에서만 확인 가능한 한계가
                // 있어서, 어느 기기에서든 마스터가 확인할 수 있게 서버
                // (client_error_logs, 이미 있던 자동 에러수집 채널)에도
                // 같은 내용을 함께 남김.
                if (typeof reportClientError === 'function') {
                  reportClientError(
                    '견적서 저장 실패(권한문제 또는 동시저장충돌) - 내용 백업됨',
                    null,
                    { estPayload: estPayloadForRetry, reason: lockUpdatedAt ? '동시저장충돌' : '권한문제' }
                  );
                }
                onDone();
                return;
              }
              // 성공 - 다음 저장을 위해 최신 updated_at 갱신
              if (lockCheckRows[0] && lockCheckRows[0].updated_at) window._editingEstUpdatedAt = lockCheckRows[0].updated_at;
            } catch(eLock) {
              // 응답 파싱 실패 = 실제로 뭐가 바뀌었는지 확인 불가 상태 —
              // 조용히 "성공"으로 넘어가지 않고 확인 필요하다고 알림
              showToast('⚠️ 저장 결과를 확인할 수 없어요 — 새로고침해서 반영됐는지 꼭 확인해주세요');
              onDone();
              return;
            }
          }
          showToast('저장 완료! (DB+로컬)');
          if (!isEditMode) {
            try {
              var createdRows = JSON.parse(xhr2.responseText);
              var newDbId = createdRows && createdRows[0] && createdRows[0].id;
              if (newDbId) {
                window._editingEstDbId = newDbId; // 이후 같은 화면에서 재저장하면 이제부터 수정모드
                window._editingEstUpdatedAt = createdRows[0].updated_at || null;
                var localArr = JSON.parse(localStorage.getItem('dah_saved')||'[]');
                var lastIdx = localArr.length - 1;
                // 2026-08-24: 여기서도 .dbId만 갱신하고 .id는 그대로 둬서, 첫 저장
                // 직후부터 이미 로컬 항목과 클라우드 항목이 서로 다른 id로 갈라져
                // 있었음(위 idx 매칭 로직 수정과 같은 원인). .id도 같이 서버 UUID로
                // 맞춰서 이후 클라우드 동기화시 정확히 같은 레코드로 병합되게 함.
                if (lastIdx >= 0) { localArr[lastIdx].dbId = newDbId; localArr[lastIdx].id = newDbId; localStorage.setItem('dah_saved', JSON.stringify(localArr)); }
              }
            } catch(eParse) {}
          }
        } else if (xhr2.status === 409) {
          // 2026-08-05: idempotency key 중복 = 이전 시도가 실제로는 이미 성공했었다는 뜻
          // (응답만 유실됐던 것) — 실패가 아니라 정상 처리
          console.log('견적서 이미 저장됨(idempotency key 중복, 정상):', xhr2.responseText);
          showToast('저장 완료! (DB+로컬)');
        } else {
          console.warn('Supabase 견적서 저장 실패 (status='+xhr2.status+'):', xhr2.responseText);
          showToast('저장 완료 (로컬) — DB 동기화는 실패했어요');
          // 2026-08-05: 실패하면 그걸로 끝이라 나중에 수동으로 다시 저장해야 했음 —
          // 재시도 큐에 등록해서 네트워크 복구시 자동으로 다시 시도되도록 함
          if (typeof addToEstPendingQueue === 'function') addToEstPendingQueue(estPayloadForRetry, isEditMode, window._editingEstDbId);
        }
        onDone(); // 2026-08-24: 성공/409/실패 모든 경우에 버튼 다시 눌러도 되게 원상복구
      };
      xhr2.onerror=function(){
        console.warn('Supabase 견적서 저장 실패 (localStorage는 완료)');
        showToast('저장 완료 (로컬) — DB 동기화는 실패했어요');
        if (typeof addToEstPendingQueue === 'function') addToEstPendingQueue(estPayloadForRetry, isEditMode, window._editingEstDbId);
        onDone();
      };
      xhr2.send(JSON.stringify(estPayloadForRetry));
    } catch(e) {
      console.warn('Supabase 연결 오류:', e);
      showToast('저장 완료 (로컬) — DB 동기화는 실패했어요');
      if (typeof addToEstPendingQueue === 'function') addToEstPendingQueue(estPayloadForRetry, isEditMode, window._editingEstDbId);
      onDone();
    }
  }
  function saveToLocalStorage() {
    try {
      var saved = JSON.parse(localStorage.getItem('dah_saved')||'[]');
      var noStr = document.getElementById('c-no').value.trim();
      var isFinal = (currentTab === 'final' || document.getElementById('status-final')?.classList.contains('on'));
      var curtainCount = document.querySelectorAll('#curtain-body tr').length;
      var blindCount = document.querySelectorAll('#blind-body tr').length;
      var itemCount = curtainCount + blindCount;

      // 품목별 거래처 정보 수집 (2026-07-21 신규) — 대시보드 발주현황에서
      // 자동으로 채워쓸 수 있도록, 커튼/블라인드 각각의 거래처를 중복없이 저장
      var curtainVendors = Array.from(document.querySelectorAll('#curtain-body tr .c-vendor'))
        .map(function(el){ return el.value.trim(); }).filter(Boolean);
      var blindVendors = Array.from(document.querySelectorAll('#blind-body tr .c-vendor'))
        .map(function(el){ return el.value.trim(); }).filter(Boolean);
      var uniqCurtainVendors = curtainVendors.filter(function(v,i){ return curtainVendors.indexOf(v)===i; });
      var uniqBlindVendors = blindVendors.filter(function(v,i){ return blindVendors.indexOf(v)===i; });

      var editingDbId = window._editingEstDbId || null;
      var idx = saved.findIndex(function(e){ return (editingDbId && (e.dbId === editingDbId || e.id === editingDbId)) || e.no === noStr; });
      var entry = {
        // 2026-08-24(선혜님 발견 — "이 두개의 견적번호가 다른 이유는?": 같은 저장인데
        // 로컬 목록엔 실제 서버 UUID(56ab6596...)랑 로컬 표시번호(DAH-20260824-03)
        // 둘로 쪼개져서 영원히 안 합쳐지고 있었음): 클라우드에서 동기화해온 항목은
        // .id에 항상 서버 UUID를 쓰는데(estimateDbRowToLocal 참고), 로컬 저장
        // 항목은 .id에 표시번호(noStr)를 쓰고 있어서 서로 다른 값으로 취급되어
        // loadEstimatesAsync의 병합 로직(cloudIds.indexOf(e.id)===-1이면 "로컬전용"
        // 으로 간주해 계속 보존)이 절대 같은 레코드로 인식을 못 했음. 이미 서버
        // id를 아는 경우(수정 모드)엔 .id를 서버 UUID로 맞춰서 클라우드 동기화때
        // 정확히 같은 레코드로 병합/치환되도록 함.
        id: editingDbId || noStr || ('local-'+Date.now()),
        no: noStr,
        dbId: editingDbId || (idx >= 0 ? saved[idx].dbId : null) || null,
        clientName: name,
        phone: phone,
        addr: addr+(addr2?' '+addr2:''),
        space: spaceStr,
        fabric: fabricStr,
        itemCount: itemCount,
        curtainCount: curtainCount,
        blindCount: blindCount,
        curtainVendors: uniqCurtainVendors,
        blindVendors: uniqBlindVendors,
        price: grand,
        performanceRevenue: perf,
        staffName: staffName,
        status: isFinal ? 'final' : 'ga',   
        contractStatus: isFinal ? 'contracted' : 'pending', // 2026-08-04: 최종견적서로 저장하면 계약상태도 자동 동기화(예전엔 별개로 남아 "최종견적서"인데 "가견적"으로 모순되게 보이던 문제)
        savedAt: new Date().toISOString(),
        expiryAt: new Date(Date.now()+7*24*60*60*1000).toISOString(),
        date: document.getElementById('c-measure')?.value || '',
        installDate: document.getElementById('c-install')?.value || '',
        memo: custMemo,
        confirmedAt: window._estimateConfirmedAt || null,
        branch: '반포점',
        lineItems: lineItems,
        custType: currentCustType || 'new',
        region: document.getElementById('c-region')?.value || '',
        appliedDiscounts: window._lastAppliedDiscounts || { coupons: [], manual: null }
      };
      if (currentCustType === 'as') {
        entry.asInstallDate = document.getElementById('as-install-date')?.value || null;
        entry.asType = document.getElementById('as-type-sel')?.value || null;
        entry.asSymptom = document.getElementById('as-symptom')?.value || null;
        entry.asPhotoMemo = document.getElementById('as-photo-memo')?.value || null;
        entry.asFeeType = (document.querySelector('input[name="as-fee"]:checked')?.value) || 'free';
      }
      if (idx >= 0) saved[idx] = entry;
      else saved.unshift(entry);
      
      if (saved.length > 500) saved = saved.slice(0, 500);
      localStorage.setItem('dah_saved', JSON.stringify(saved));

      
      try {
        var customers = JSON.parse(localStorage.getItem('dah_customers')||'[]');
        // ⚠️ 예전엔 cidx를 entry.id(견적서번호, 저장마다 값이 다름)로 찾아서, 같은 고객이
        // 여러 번 저장할 때마다(가견적→확정견적 등) 매번 새 레코드가 로컬에 쌓이는 버그가 있었음.
        // 이제 "이름+전화번호"로 기존 고객을 찾아서, 있으면 그 고객의 진짜 id(Supabase UUID)를
        // 유지한 채 갱신하고, 없을 때만 새로 만든다.
        var normPhone = function(p){ return (p||'').replace(/\D/g,''); };
        // 2026-08-25(선혜님 발견 — "이름을 이라리로 바꿔도 오지은으로 뜬다",
        // 진짜 원인): 이름+전화번호로만 기존 고객을 찾다 보니, "이름을 바꾸는"
        // 상황 자체에서 항상 매칭에 실패했음(바뀐 새 이름은 로컬에 없으니 당연히
        // 못 찾음) — 그래서 수정이 아니라 매번 완전히 새 고객으로 만들어지고
        // 있었음. 이미 "이 견적은 이 고객 것"이라고 알고 있는 id(고객 불러오기로
        // 로드했거나 이전에 이미 저장해서 알고 있는 경우 window._estSaveCustomerId
        // 에 남아있음)가 있으면 이름이 바뀌었어도 그 id를 최우선으로 써서 정확히
        // "수정"으로 처리되게 함 — 이름+전화번호 매칭은 그 id를 모를 때(진짜
        // 신규/다른 고객 가능성)만 보조적으로 사용.
        var knownId = window._estSaveCustomerId || null;
        var cidx = knownId
          ? customers.findIndex(function(c){ return String(c.id) === String(knownId); })
          : customers.findIndex(function(c){
              return c.clientName === entry.clientName && normPhone(c.phone) === normPhone(entry.phone);
            });
        var existingId = cidx >= 0 ? customers[cidx].id : null;
        entry.clientId = existingId; // dah_saved(견적이력)에도 고객 고유번호 반영
        localStorage.setItem('dah_saved', JSON.stringify(saved));
        var custEntry = {
          id: existingId, // 기존 고객이면 진짜 id 유지, 신규면 null(Supabase 저장 응답으로 채워짐)
          clientName: entry.clientName,
          phone: entry.phone,
          addr: entry.addr,
          space: entry.space,
          price: entry.price,
          performanceRevenue: entry.performanceRevenue,
          staffName: entry.staffName,
          stage: entry.contractStatus === 'contracted' ? '확정견적' : '가견적',
          date: entry.date || new Date().toISOString().slice(0,10),
          measureDate: document.getElementById('c-measure')?.value || '',
          installDate: entry.installDate || '',
          memo: entry.memo || '',
          visitCount: 1,
          estimateNo: entry.no,
          estimateStatus: entry.status,
          createdAt: entry.savedAt
        };
        if (cidx >= 0) {
          // 2026-08-05: stage/visitCount는 이미 "새 값이 없으면 기존값 유지"로 안전하게
          // 처리돼 있었는데, addr/space/memo는 이 보호가 빠져있었음 — 그래서 예전에
          // 주소를 입력해뒀어도, 나중에 주소칸이 빈 상태로 다른 견적서를 저장하면
          // (예: 빠른 가격 확인용으로 새 견적서 폼을 열었을 때) 조용히 지워지는 버그가
          // 있었음. 같은 방식으로 보호.
          custEntry.stage = customers[cidx].stage || custEntry.stage;
          custEntry.visitCount = customers[cidx].visitCount || 1;
          custEntry.addr = custEntry.addr || customers[cidx].addr;
          custEntry.space = custEntry.space || customers[cidx].space;
          custEntry.memo = custEntry.memo || customers[cidx].memo;
          customers[cidx] = Object.assign(customers[cidx], custEntry);
        } else {
          customers.unshift(custEntry);
        }
        localStorage.setItem('dah_customers', JSON.stringify(customers));
        window._estSaveCustomerId = existingId; // saveToCustomers/saveToEstimates에서 사용
      } catch(e2) { console.warn('dah_customers 동기화 실패', e2); }

    } catch(e) { console.warn('localStorage 저장 실패', e); }
  }
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
      if (ok) {
        saveToCustomers();
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
    saveToCustomers();
  }
}

// 2026-08-24(선혜님 발견 — 같은 견적이 5개씩 한번에 중복 저장되던 문제):
// 저장 버튼에 중복 클릭 방지 장치가 전혀 없어서, 짧은 시간 안에 여러 번
// 눌리면(빠른 연타, 또는 터치가 두 번 인식되는 기기 문제 등) 각각이 독립적으로
// _saveEstimateInner()를 실행함 — 첫 저장이 서버 응답을 받아 _editingEstDbId를
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
function saveEstimate() {
  var btn = document.getElementById('btn-save-estimate');
  if (btn) {
    if (btn.disabled) return; // 이미 저장 진행 중이면 이번 클릭은 무시
    btn.disabled = true;
    btn.style.opacity = '0.6';
  }
  function reenable() {
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
  }
  try {
    _saveEstimateInner(reenable);
  } catch (err) {
    console.error('저장 중 예외 발생:', err);
    alert('⚠️ 저장 중 오류가 발생했어요\n\n' + (err && err.message ? err.message : err) + '\n\n이 화면을 캡처해서 보내주시면 원인을 찾을 수 있어요.');
    reenable();
  }
}

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

  check('현재 페이지 버전', true, 'v' + (window.DAH_BUILD||'?'));
}

function exportAllEstimatesExcel() {
  try {
    var estimates = [];
    try { estimates = JSON.parse(localStorage.getItem('dah_saved') || '[]'); } catch(ex) {}
    if (!estimates || estimates.length === 0) { showToast('저장된 견적서가 없습니다'); return; }

    var CONTRACT_KO = {pending:'가견적', contracted:'계약됨', rejected:'미계약'};
    var STATUS_KO   = {ga:'가견적서', final:'최종견적서'};

    var headers = [
      '견적번호','구분','계약상태','고객명','연락처','주소','공간',
      '제품/원단','금액(원)','성과매출(원)',
      '담당자','실측일','시공일','저장일','메모'
    ];

    var rows = estimates.map(function(e) {
      return [
        e.no                               || '',
        STATUS_KO[e.status]                || '가견적서',
        CONTRACT_KO[e.contractStatus]      || '가견적',
        e.clientName                       || '',
        e.phone                            || '',
        e.addr                             || '',
        e.space                            || '',
        e.fabric                           || '',
        Number(e.price)                    || 0,
        Number(e.performanceRevenue)       || 0,
        e.staffName                        || '',
        e.date                             || '',
        e.installDate                      || '',
        e.savedAt ? e.savedAt.slice(0,10)  : '',
        e.memo                             || ''
      ];
    });

    var BOM = '\uFEFF';
    var csv = BOM + [headers].concat(rows).map(function(row) {
      return row.map(function(cell) {
        var s = String(cell);
        if (s.indexOf(',') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('"') >= 0) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(',');
    }).join('\r\n');

    var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    var d    = new Date();
    var pad  = function(n){ return String(n).padStart(2,'0'); };
    a.href     = url;
    a.download = '드로잉엣홈_견적서목록_' + d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('견적서 엑셀 저장 완료 (' + estimates.length + '건)');
  } catch(e) {
    alert('내보내기 실패: ' + e.message);
  }
}

function showToast(msg) {
  var t=document.getElementById('toast');
  t.textContent=msg; t.style.opacity='1';
  // 2026-08-28: 대시보드 버전(dash-core.js)과 표시시간(2200→2500ms) 통일
  // - 실질적 버그는 아니었지만 두 앱 UX를 일관되게 맞춤(선혜님 요청 -
  // "쌍둥이 함수 찾기, 코드 정리, 제대로 하자").
  setTimeout(function(){ t.style.opacity='0'; },2500);
}
