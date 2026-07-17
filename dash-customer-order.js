/* ══════════════════════════════════════════════════
   고객상세 - 발주 탭 렌더링
   ══════════════════════════════════════════════════
   dash-customer-detail.js에서 분리됨 (2026-07-17). */

function renderOrderSection(c, orderBody) {
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
    if (orderBody) orderBody.appendChild(orderCard);
  }

}
