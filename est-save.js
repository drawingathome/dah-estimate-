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

  // 블라인드 옵션추가금(전동 등)이 있는데 지역(시공비 행)이 선택 안 된 경우 —
  // 이 금액이 견적 총액에 반영되지 못하고 그대로 저장되어 누락될 수 있으므로 저장 자체를 막음
  var blindBody = document.getElementById('blind-body');
  var svcBody = document.getElementById('svc-body');
  if (blindBody && svcBody) {
    var extraSum = 0;
    blindBody.querySelectorAll('.blind-extra').forEach(function(inp){
      extraSum += Math.max(0, parseFloat(inp.value.replace(/[^0-9.-]/g,''))||0);
    });
    var hasSvcRow = !!svcBody.querySelector('[data-svc-type="시공비"]');
    if (extraSum > 0 && !hasSvcRow) {
      showToast('⚠️ 옵션추가금(전동 등)이 반영되려면 먼저 지역(서울/경기/기타)을 선택해주세요', 'error');
      return false;
    }
  }
  return true;
}

function getExpiryBadge(savedAt) {
  if(!savedAt) return '';
  var diff = Math.ceil((new Date(savedAt).getTime() + 7*24*60*60*1000 - Date.now()) / 86400000);
  if(diff > 3) return '<span class="expiry-badge ok">D-'+diff+'</span>';
  if(diff > 0) return '<span class="expiry-badge warn">D-'+diff+' 마감임박</span>';
  return '<span class="expiry-badge over">유효기간 만료</span>';
}
function saveEstimate() {
  clearDraft(); // 저장 완료 시 초안 삭제
  if (!validateEstimate()) return;
  var name=document.getElementById('c-name').value.trim();
  if(!name) { showToast('⚠️ 고객명을 입력하세요'); return; }
  var phone=document.getElementById('c-phone').value.trim();
  var addr=document.getElementById('c-addr').value.trim();
  var addr2=document.getElementById('c-addr2')?.value.trim()||'';
  var staffName=document.getElementById('c-staff').value.trim();
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
      applied_discounts: window._lastAppliedDiscounts || { coupons: [], manual: null }
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
                if (lastIdx >= 0) { localArr[lastIdx].dbId = newDbId; localStorage.setItem('dah_saved', JSON.stringify(localArr)); }
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
      };
      xhr2.onerror=function(){
        console.warn('Supabase 견적서 저장 실패 (localStorage는 완료)');
        showToast('저장 완료 (로컬) — DB 동기화는 실패했어요');
        if (typeof addToEstPendingQueue === 'function') addToEstPendingQueue(estPayloadForRetry, isEditMode, window._editingEstDbId);
      };
      xhr2.send(JSON.stringify(estPayloadForRetry));
    } catch(e) {
      console.warn('Supabase 연결 오류:', e);
      showToast('저장 완료 (로컬) — DB 동기화는 실패했어요');
      if (typeof addToEstPendingQueue === 'function') addToEstPendingQueue(estPayloadForRetry, isEditMode, window._editingEstDbId);
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
      var idx = saved.findIndex(function(e){ return (editingDbId && e.dbId === editingDbId) || e.no === noStr; });
      var entry = {
        id: noStr || ('local-'+Date.now()),
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
  saveToCustomers();
  showToast('저장 완료!');
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
