/* ══════════════════════════════════════════════════
   고객상세 - 발주 탭 렌더링
   ══════════════════════════════════════════════════
   dash-customer-detail.js에서 분리됨 (2026-07-17). */

// 이 고객에게 실제로 해당하는 발주 항목 목록을 반환 (2026-07-21 공용함수로 분리)
// — 예전엔 발주탭과 홈화면 "처리필요"가 각자 다른 기준으로 판단해서, 홈화면 쪽은
// "5개 항목 중 하나라도 체크되면 전부 완료"로 오판하는 심각한 버그가 있었음.
// 이제 두 곳 다 이 함수 하나로 "관련 항목 중 안 끝난 게 있는지"를 정확히 판단함.
function getRelevantOrderItems(c) {
  var savedEsts = [];
  try { savedEsts = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e) {}
  // 동명이인 안전 매칭 (2026-08-04 수정) — 예전엔 이름만으로 매칭해서, 동명이인이
  // 있으면 서로 다른 사람의 견적(커튼/블라인드 구성)이 섞여 최신순 정렬되고,
  // 그 중 아무거나 최신인 게 뽑혀서 엉뚱한 발주항목(예: 커튼만 있는 고객에게
  // 블라인드 발주가 뜨는 등)이 나오는 실제 버그가 있었음
  var myEsts = savedEsts.filter(function(e){
    return (c.id && e.clientId) ? e.clientId === c.id : e.clientName === c.clientName;
  });
  myEsts.sort(function(a,b){ return (b.savedAt||b.date||'') > (a.savedAt||a.date||'') ? 1 : -1; });
  var latestEst = myEsts[0];
  // 2026-08-06: 견적서는 있는데 품목데이터(curtainCount/blindCount/lineItems)가
  // 전부 비어있는 경우(예전 버그로 저장된 115건짜리 견적서들), "판단할 근거가
  // 없다"고 전부 숨기는 대신 "견적서 자체가 없는 경우"와 똑같이 취급해서 5개
  // 항목을 정상적으로 다 보여줌. 스태프가 견적서를 다시 입력할 필요 없이,
  // 발주 탭에서 바로 수동으로 체크하면서 관리할 수 있게 하려는 것
  // (재입력을 요구하는 건 너무 번거롭다는 선혜님 피드백으로 변경).
  var estHasData = latestEst && ((Number(latestEst.curtainCount)||0) > 0 || (Number(latestEst.blindCount)||0) > 0 || (Array.isArray(latestEst.lineItems) && latestEst.lineItems.length > 0));
  var hasCurtain = estHasData ? (Number(latestEst.curtainCount)||0) > 0 : true;
  var hasBlind   = estHasData ? (Number(latestEst.blindCount)||0) > 0 : true;
  var allOrderItems = [
    { key: 'fabric', label: '원단 발주', relevant: hasCurtain },
    { key: 'production', label: '제작 발주', relevant: hasCurtain },
    { key: 'blind', label: '블라인드 발주', relevant: hasBlind },
    { key: 'material', label: '자재 발주', relevant: hasCurtain },
    { key: 'install', label: '시공 발주', relevant: hasCurtain || hasBlind }
  ];
  return allOrderItems.filter(function(item){ return item.relevant; });
}

// 2026-08-06 신규: 견적서는 있는데(latestEst 존재) 정작 line_items/제품개수가
// 하나도 없어서 "발주할 게 없다"고 조용히 판단되던 케이스(우사랑님 실제 사례)를
// 구분. 이 경우 hasIncompleteOrder()는 false를 반환해서 처리필요 목록에서
// 아예 사라졌었는데, "발주할 게 정말 없음"과 "데이터가 비어서 판단 불가"는
// 전혀 다른 상황이라 구분해서 다르게 알려줘야 함.
function hasOrderDataGap(c) {
  var savedEsts = [];
  try { savedEsts = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e) {}
  var myEsts = savedEsts.filter(function(e){
    return (c.id && e.clientId) ? e.clientId === c.id : e.clientName === c.clientName;
  });
  if (myEsts.length === 0) return false; // 견적서 자체가 없으면 이건 별개 문제(발주 판단은 정상 동작)
  myEsts.sort(function(a,b){ return (b.savedAt||b.date||'') > (a.savedAt||a.date||'') ? 1 : -1; });
  var latestEst = myEsts[0];
  var curtainCount = Number(latestEst.curtainCount)||0;
  var blindCount = Number(latestEst.blindCount)||0;
  var lineItemsCount = Array.isArray(latestEst.lineItems) ? latestEst.lineItems.length : 0;
  return curtainCount === 0 && blindCount === 0 && lineItemsCount === 0;
}

// 발주 항목이 완료됐는지 (기존 boolean true 형식과 신규 {done,vendor,date} 객체 형식 둘 다 지원)
function isOrderItemDone(orderStatus, key) {
  var v = orderStatus[key];
  if (v && typeof v === 'object') return !!v.done;
  return !!v;
}

// 이 고객에게 아직 안 끝난(관련은 있는데 미체크인) 발주 항목이 있는지
function hasIncompleteOrder(c) {
  var orderStatus = c.orderStatus || {};
  var items = getRelevantOrderItems(c);
  return items.some(function(item){ return !isOrderItemDone(orderStatus, item.key); });
}

function renderOrderSection(c, orderBody) {
  // 발주 현황: 계약 이후(선금결제 단계 이후)에만 표시 —
  // 방문예약/상담/가견적 단계에서는 아직 발주할 게 없으므로 불필요한 정보 노출 방지
  var ORDER_STAGES = ['선금결제', '실측준비중', '확정견적', '잔금결제', '시공준비중', '시공완료'];
  if (ORDER_STAGES.indexOf(c.stage) >= 0) {
    var orderStatus = c.orderStatus || {};
    var orderItems = getRelevantOrderItems(c);

    // 견적서에 이미 입력했던 거래처 정보 가져오기 (2026-07-21 신규)
    // — 견적서 작성시 거래처를 이미 입력했다면, 발주탭에서 또 입력할 필요 없이
    // 자동으로 채워지도록. 여러 곳을 썼으면 자동완성 목록으로 골라잡게 함.
    var savedEsts3 = [];
    try { savedEsts3 = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e) {}
    // 2026-08-05: 이름으로만 매칭하던 버그 수정 — 위 getRelevantOrderItems()와 동일하게
    // id가 있으면 id 우선 매칭(동명이인이면 서로 다른 사람의 거래처가 자동완성되는 걸 방지)
    var myEsts3 = savedEsts3.filter(function(e){
      return (c.id && e.clientId) ? e.clientId === c.id : e.clientName === c.clientName;
    });
    myEsts3.sort(function(a,b){ return (b.savedAt||b.date||'') > (a.savedAt||a.date||'') ? 1 : -1; });
    var latestEst3 = myEsts3[0];
    var savedCurtainVendors = (latestEst3 && latestEst3.curtainVendors) || [];
    var savedBlindVendors = (latestEst3 && latestEst3.blindVendors) || [];
    function getVendorSuggestions(key) {
      return key === 'blind' ? savedBlindVendors : savedCurtainVendors;
    }
    // 자동완성 드롭다운엔 이 고객 전용 거래처 + 설정탭에서 관리하는 전역 거래처 목록을 합침
    // (자동채움 판단은 고객전용 목록만 써야 정확하므로 getVendorSuggestions와 분리)
    // 2026-08-01: 거래처에 카테고리(원단/제작/블라인드/자재/실측시공)가 생겨서,
    // 이 발주항목(key)과 카테고리가 일치하거나 미분류인 거래처만 자동완성에 노출
    function getVendorDropdownOptions(key) {
      var own = getVendorSuggestions(key);
      var globalList = (typeof getVendorList === 'function') ? getVendorList() : [];
      var globalNames = globalList
        .filter(function(v) { return !Array.isArray(v.categories) || v.categories.length === 0 || v.categories.indexOf(key) >= 0; })
        .map(function(v) { return v.name; });
      var merged = own.concat(globalNames);
      return merged.filter(function(v, i){ return merged.indexOf(v) === i; });
    }

    var orderCard = div('background:#fff;margin-bottom:10px;padding:var(--sp-4)', [
      span('font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.2px;display:block;margin-bottom:10px', '발주 현황')
    ]);
    orderItems.forEach(function(item) {
      var curVal = orderStatus[item.key];
      var isDone = isOrderItemDone(orderStatus, item.key);
      var vendorInfo = (curVal && typeof curVal === 'object') ? curVal : null;
      var vendorSuggestions = getVendorSuggestions(item.key);
      // 도착예정일 기본값: 자재(원단/제작/블라인드/자재)와 시공발주 전부 "시공일"이 기준.
      // (실측 관련 발주 항목이 생기면 c.measureDate로 매핑 추가 가능하도록 확장해둠)
      var defaultDueDate = c.installDate || '';

      var rowWrap = div('padding:7px 0;border-bottom:1px solid var(--border)', []);
      var row = div('display:flex;align-items:center;justify-content:space-between', []);
      var label = span('font-size:12px;color:var(--dark)', item.label);
      var checkbox = el('input', { type: 'checkbox' });
      checkbox.checked = isDone;
      checkbox.style.cssText = 'width:20px;height:20px;cursor:pointer';

      // 업체명·발주일·도착예정일 간단 입력 (2026-07-21 신규) — 체크하면 나타남, 이미 값 있으면 미리 채워짐
      var detailWrap = div('flex-direction:column;gap:6px;margin-top:6px', []);
      detailWrap.style.display = isDone ? 'flex' : 'none';
      var vendorListId = 'order-vendor-list-' + item.key;
      var vendorInput = el('input', { type: 'text', placeholder: '업체명 (선택)', list: vendorListId });
      vendorInput.style.cssText = 'width:100%;height:32px;padding:0 8px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;box-sizing:border-box';
      var vendorDatalist = el('datalist', { id: vendorListId });
      getVendorDropdownOptions(item.key).forEach(function(v) {
        var opt = document.createElement('option');
        opt.value = v;
        vendorDatalist.appendChild(opt);
      });
      var dateRow = div('display:flex;gap:6px', []);
      var orderDateWrap = div('flex:1', [ el('div', {style:'font-size:11px;color:var(--sub);margin-bottom:2px', text:'발주일'}) ]);
      var orderDateInput = el('input', { type: 'date' });
      orderDateInput.style.cssText = 'width:100%;height:32px;padding:0 8px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;box-sizing:border-box';
      var dueDateWrap = div('flex:1', [ el('div', {style:'font-size:11px;color:var(--sub);margin-bottom:2px', text:'도착예정일'}) ]);
      var dueDateInput = el('input', { type: 'date' });
      dueDateInput.style.cssText = 'width:100%;height:32px;padding:0 8px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;box-sizing:border-box';
      if (vendorInfo) {
        vendorInput.value = vendorInfo.vendor || '';
        orderDateInput.value = vendorInfo.orderDate || '';
        dueDateInput.value = vendorInfo.dueDate || defaultDueDate;
      } else {
        // 견적서에 입력했던 거래처가 1곳뿐이면 자동으로 채워줌 (여러 곳이면 자동완성목록에서 고르게)
        if (vendorSuggestions.length === 1) vendorInput.value = vendorSuggestions[0];
        dueDateInput.value = defaultDueDate;
      }

      function saveOrderState() {
        var arr = loadCustomers();
        var target = findCurrentDetailCustomer(arr);
        if (!target) return;
        if (!target.orderStatus) target.orderStatus = {};
        target.orderStatus[item.key] = checkbox.checked
          ? { done: true, vendor: vendorInput.value.trim(), orderDate: orderDateInput.value, dueDate: dueDateInput.value }
          : false;
        saveCustomers(arr);
        if (typeof saveCustomerToDb === 'function') saveCustomerToDb(target, function(err) { if (err) console.warn('발주현황 DB 동기화 실패:', err.text); });
        if (typeof logEvent === 'function') logEvent('order_check', { item: item.key, checked: checkbox.checked });
      }

      checkbox.addEventListener('change', function() {
        detailWrap.style.display = checkbox.checked ? 'flex' : 'none';
        saveOrderState();
        showToast(item.label + (checkbox.checked ? ' 완료 처리됐습니다' : ' 완료 취소됐습니다'));
      });
      vendorInput.addEventListener('change', saveOrderState);
      orderDateInput.addEventListener('change', saveOrderState);
      dueDateInput.addEventListener('change', saveOrderState);

      orderDateWrap.appendChild(orderDateInput);
      dueDateWrap.appendChild(dueDateInput);
      dateRow.appendChild(orderDateWrap);
      dateRow.appendChild(dueDateWrap);
      detailWrap.appendChild(vendorInput);
      detailWrap.appendChild(vendorDatalist);
      detailWrap.appendChild(dateRow);
      row.appendChild(label);
      row.appendChild(checkbox);
      rowWrap.appendChild(row);
      rowWrap.appendChild(detailWrap);
      orderCard.appendChild(rowWrap);
    });
    if (orderItems.length === 0) {
      orderCard.appendChild(span('font-size:12px;color:var(--sub)', '저장된 견적서가 없어 발주 항목을 표시할 수 없습니다'));
    }
    if (orderBody) orderBody.appendChild(orderCard);
  }

}
