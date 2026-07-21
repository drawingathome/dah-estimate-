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
  var myEsts = savedEsts.filter(function(e){ return e.clientName === c.clientName; });
  myEsts.sort(function(a,b){ return (b.savedAt||b.date||'') > (a.savedAt||a.date||'') ? 1 : -1; });
  var latestEst = myEsts[0];
  var hasCurtain = latestEst ? (Number(latestEst.curtainCount)||0) > 0 : true;
  var hasBlind   = latestEst ? (Number(latestEst.blindCount)||0) > 0 : true;
  var allOrderItems = [
    { key: 'fabric', label: '원단 발주', relevant: hasCurtain },
    { key: 'production', label: '제작 발주', relevant: hasCurtain },
    { key: 'blind', label: '블라인드 발주', relevant: hasBlind },
    { key: 'material', label: '자재 발주', relevant: hasCurtain },
    { key: 'install', label: '시공 발주', relevant: hasCurtain || hasBlind }
  ];
  return allOrderItems.filter(function(item){ return item.relevant; });
}

// 이 고객에게 아직 안 끝난(관련은 있는데 미체크인) 발주 항목이 있는지
function hasIncompleteOrder(c) {
  var orderStatus = c.orderStatus || {};
  var items = getRelevantOrderItems(c);
  return items.some(function(item){ return !orderStatus[item.key]; });
}

function renderOrderSection(c, orderBody) {
  // 발주 현황: 계약 이후(계약금 단계 이후)에만 표시 —
  // 가견적/상담 단계에서는 아직 발주할 게 없으므로 불필요한 정보 노출 방지
  var ORDER_STAGES = ['계약금', '실측', '잔금', '시공', '완료'];
  if (ORDER_STAGES.indexOf(c.stage) >= 0) {
    var orderStatus = c.orderStatus || {};
    var orderItems = getRelevantOrderItems(c);

    var orderCard = div('background:#fff;margin-bottom:10px;padding:var(--sp-4)', [
      span('font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.2px;display:block;margin-bottom:10px', '발주 현황')
    ]);
    orderItems.forEach(function(item) {
      var row = div('display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)');
      var label = span('font-size:12px;color:var(--dark)', item.label);
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
        if (typeof logEvent === 'function') logEvent('order_check', { item: item.key, checked: checkbox.checked });
        showToast(item.label + (checkbox.checked ? ' 완료 처리됐습니다' : ' 완료 취소됐습니다'));
      });
      row.appendChild(label);
      row.appendChild(checkbox);
      orderCard.appendChild(row);
    });
    if (orderItems.length === 0) {
      orderCard.appendChild(span('font-size:12px;color:var(--sub)', '저장된 견적서가 없어 발주 항목을 표시할 수 없습니다'));
    }
    if (orderBody) orderBody.appendChild(orderCard);
  }

}
