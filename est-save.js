/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 저장/검증/토스트
   PDF저장, 새견적서 초기화, 입력값 검증, 견적서 저장(고객/견적DB 동기화),
   전체 견적서 엑셀 내보내기, 토스트 알림.
   ══════════════════════════════════════════════════ */

function savePDF() {
  // 2026-08-14: iOS 사파리(아이패드)에서 setTimeout 안의 window.print()가
  // 사용자 동작과 무관한 호출로 간주되어 조용히 무시되던 문제 — 지연 없이
  // 사용자 탭과 같은 실행 흐름에서 즉시 호출해야 함(confirmPdfPrint와 동일 이유).
  showToast('PDF 저장 중...');
  try {
    window.print();
  } catch (e) {
    setTimeout(function(){ try { window.print(); } catch(e2) {} }, 300);
  }
}

function newEstimate() {
  if(!confirm('새 견적서를 작성하시겠어요? 현재 내용이 초기화됩니다.')) return;
  // 2026-08-24(전수 재검사 중 발견 — 잠재적으로 심각한 버그): 기존 견적을
  // "이어서 수정"하던 중(_editingEstDbId가 세팅된 상태)에 이 버튼을 누르면
  // 화면은 비워지는데 이 표시값은 안 지워지고 있었음. 그 상태로 완전히 다른
  // 고객 정보를 입력해서 저장하면, 저장 로직이 "이건 수정이다"로 착각해서
  // 새 고객이 아니라 원래 열려있던 남의 견적을 그 내용으로 덮어써버릴 수
  // 있었음(아직 실제 피해 사례는 확인 안 됐지만 재현 가능한 심각한 버그).
  window._editingEstDbId = null;
  window._editingEstUpdatedAt = null;
  window._viewingFrozenEstimate = false;
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

function getExpiryBadge(savedAt) {
  if(!savedAt) return '';
  var diff = Math.ceil((new Date(savedAt).getTime() + 7*24*60*60*1000 - Date.now()) / 86400000);
  if(diff > 3) return '<span class="expiry-badge ok">D-'+diff+'</span>';
  if(diff > 0) return '<span class="expiry-badge warn">D-'+diff+' 마감임박</span>';
  return '<span class="expiry-badge over">유효기간 만료</span>';
}
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
      xhr.setRequestHeader('Prefer', isUpdate ? 'return=minimal' : 'return=representation');
      xhr.onload=function(){
        if (xhr.status < 200 || xhr.status >= 300) {
          console.warn('Supabase 고객 저장 실패 (status='+xhr.status+'):', xhr.responseText);
        } else if (!isUpdate) {
          // 신규 생성 성공 — 응답으로 받은 진짜 id를 로컬 customer 레코드와 견적이력에도 반영
          try {
            var resData = JSON.parse(xhr.responseText);
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
        saveToEstimates();
      };
      xhr.onerror=function(){ console.warn('Supabase 고객 저장 실패 (localStorage는 완료)'); saveToEstimates(); };
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
      if (isFinalForDrive) { custPayload.price = grand; custPayload.performance_revenue = perf; }
      xhr.send(JSON.stringify(custPayload));
    } catch(e) { console.warn('Supabase 연결 오류:', e); saveToEstimates(); }
  }
  function saveToEstimates() {
    // 2026-08-05: 재시도 큐에서도 그대로 재사용할 수 있도록 payload를 변수로 분리
    // 2026-08-05: 중복행 방지용 idempotency key — 이 저장 시도(재시도 포함) 전체에서
    // 동일한 값을 유지. "서버는 실제로 성공했는데 응답을 못 받아 실패로 오판"해서
    // 재시도했을 때, DB의 유니크 제약(estimates_idempotency_key_uniq)이 중복 삽입을
    // 막아주고, 그 409 응답을 "이미 저장됨"으로 해석해서 정상 처리함.
    var estPayloadForRetry = Object.assign({
      client_idempotency_key: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('est-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
      customer_name:name, price:grand,
      performance_revenue:perf, staff_name:staffName,
      estimate_status:currentTab||'ga',
      phone:phone, space:spaceStr, product:fabricStr,
      date: document.getElementById('c-measure')?.value || '',
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
      xhr2.setRequestHeader('Prefer', (isEditMode && lockUpdatedAt) ? 'return=representation' : 'return=minimal');
      xhr2.onload=function(){
        if (xhr2.status >= 200 && xhr2.status < 300) {
          // 낙관적 잠금이 걸린 수정 저장인데 응답이 빈 배열이면 = 0건 매칭
          // = 그 사이 다른 곳에서 먼저 저장해서 updated_at이 달라졌다는 뜻
          if (isEditMode && lockUpdatedAt) {
            try {
              var lockCheckRows = JSON.parse(xhr2.responseText);
              if (Array.isArray(lockCheckRows) && lockCheckRows.length === 0) {
                showToast('⚠️ 이 견적서가 방금 다른 곳에서 먼저 저장됐어요 — 새로고침해서 최신 내용을 확인해주세요 (내 변경사항은 로컬에만 저장됨)');
                if (typeof addToEstPendingQueue === 'function') { /* 강제 재시도는 위험하므로 큐에 넣지 않음 - 사용자 확인 필요 */ }
                onDone();
                return;
              }
              // 성공 - 다음 저장을 위해 최신 updated_at 갱신
              if (lockCheckRows[0] && lockCheckRows[0].updated_at) window._editingEstUpdatedAt = lockCheckRows[0].updated_at;
            } catch(eLock) {}
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
        var cidx = customers.findIndex(function(c){
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
  if (typeof refreshAuthSessionIfNeeded === 'function') {
    refreshAuthSessionIfNeeded(function() { saveToCustomers(); });
  } else {
    saveToCustomers();
  }
  showToast('저장 완료!');
}

// 2026-08-20(선혜님 발견 — 아이패드에서 저장이 아무 반응 없이 조용히 실패하던
// 문제): 근본 원인을 코드 리뷰로는 확정하지 못했지만, _saveEstimateInner() 안의
// 여러 지점에서 optional chaining 없이 DOM 요소에 직접 접근하고 있어 — 만약
// 2026-08-24(선혜님 발견 — 같은 견적이 5개씩 한번에 중복 저장되던 문제):
// 저장 버튼에 중복 클릭 방지 장치가 전혀 없어서, 짧은 시간 안에 여러 번
// 눌리면(빠른 연타, 또는 터치가 두 번 인식되는 기기 문제 등) 각각이 독립적으로
// _saveEstimateInner()를 실행함 — 첫 저장이 서버 응답을 받아 _editingEstDbId를
// 세팅하기 전에 나머지 클릭들이 이미 실행돼버려서, 전부 "새 견적"으로 처리되어
// 그대로 중복 생성됨(실제 사례: 0.15초 안에 5건 중복 생성 확인). 버튼을 즉시
// 비활성화하고, 저장 흐름이 끝나면(성공/실패 무관) 다시 눌러도 되게 원상복구.
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
  setTimeout(function(){ t.style.opacity='0'; },2200);
}
