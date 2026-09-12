/* ══════════════════════════════════════════════════
   고객상세 - AS 탭 렌더링
   ══════════════════════════════════════════════════
   2026-09-11: as_records 테이블은 있었지만 UI가 없었음(GitHub 이슈#4).
   접수→방문예정→완료 3단계 상태만 두고, 유상/무상 여부와 금액만 기록.
   사진(photo_memo)은 이번엔 텍스트 메모로만 지원(파일 업로드는 범위 밖). */

var AS_STATUS_STEPS = ['접수', '방문예정', '완료'];

function renderASSection(c, asBody) {
  if (!asBody || !c) return;
  asBody.innerHTML = '<div style="font-size:12px;color:var(--sub)">불러오는 중...</div>';

  var addWrap = div('background:var(--ivory1);border-radius:var(--r-card);padding:10px 12px;margin-bottom:12px', []);
  addWrap.appendChild(el('div', {style:'font-size:11px;font-weight:700;color:var(--terra);letter-spacing:0.05em;margin-bottom:8px', text:'📋 AS 접수'}));
  var symptomInput = el('textarea', {placeholder:'증상/요청 내용', style:'width:100%;min-height:56px;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;box-sizing:border-box;resize:vertical;margin-bottom:6px'});
  var visitDateInput = el('input', {type:'date', style:'width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;box-sizing:border-box;margin-bottom:6px'});
  var feeRow = div('display:flex;gap:6px;margin-bottom:8px', []);
  var feeSelect = el('select', {style:'flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit'});
  ['무상','유상'].forEach(function(v) { feeSelect.appendChild(el('option', {value:v, text:v})); });
  var feeAmountInput = el('input', {type:'number', placeholder:'금액(유상일 때만)', style:'flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;box-sizing:border-box;display:none'});
  feeSelect.addEventListener('change', function() { feeAmountInput.style.display = feeSelect.value === '유상' ? '' : 'none'; });
  feeRow.appendChild(feeSelect); feeRow.appendChild(feeAmountInput);
  var addBtn = btn('width:100%;padding:9px;background:var(--dark);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer', '접수 등록', function() {
    var symptom = symptomInput.value.trim();
    if (!symptom) { showToast('증상을 입력해주세요'); return; }
    var payload = {
      customer_id: c.id || null,
      customer_name: c.clientName || '',
      install_date: c.installDate || '',
      receipt_date: todayStr(),
      symptom: symptom,
      visit_date: visitDateInput.value || null,
      fee_type: feeSelect.value,
      fee_amount: feeSelect.value === '유상' ? (Number(feeAmountInput.value) || 0) : 0,
      staff_name: (currentUser && currentUser.role === 'staff') ? currentUser.name : '마스터',
      status: '접수'
    };
    addBtn.disabled = true; addBtn.textContent = '등록 중...';
    sbXHR('POST', 'as_records', payload, function(err) {
      addBtn.disabled = false; addBtn.textContent = '접수 등록';
      if (err) { showToast('등록 실패, 다시 시도해주세요'); return; }
      if (typeof logEvent === 'function') logEvent('as_receipt', { customerId: c.id, customerName: c.clientName, symptom: symptom });
      showToast('AS 접수가 등록됐어요');
      symptomInput.value = ''; visitDateInput.value = ''; feeSelect.value = '무상'; feeAmountInput.value = ''; feeAmountInput.style.display = 'none';
      renderASSection(c, asBody);
    });
  });
  addWrap.appendChild(symptomInput); addWrap.appendChild(visitDateInput); addWrap.appendChild(feeRow); addWrap.appendChild(addBtn);

  sbXHR('GET', 'as_records?customer_id=eq.' + encodeURIComponent(c.id) + '&is_archived=eq.false&order=created_at.desc', null, function(err, rows) {
    asBody.innerHTML = '';
    asBody.appendChild(addWrap);
    if (err || !Array.isArray(rows)) {
      asBody.appendChild(el('div', {style:'font-size:12px;color:var(--sub)', text:'AS 이력을 불러오지 못했어요'}));
      return;
    }
    if (rows.length === 0) {
      asBody.appendChild(el('div', {style:'font-size:12px;color:var(--sub);padding:8px 0', text:'등록된 AS 이력이 없어요'}));
      return;
    }
    var listWrap = div('', []);
    rows.forEach(function(rec) {
      var statusColor = rec.status === '완료' ? '#2F6690' : (rec.status === '방문예정' ? 'var(--terra)' : '#8A8378');
      var row = div('padding:10px 0;border-bottom:1px solid var(--ivory1)', []);
      var topRow = div('display:flex;align-items:center;justify-content:space-between;margin-bottom:4px', []);
      topRow.appendChild(el('span', {style:'font-size:11px;color:var(--sub)', text:(rec.receipt_date||'')}));
      topRow.appendChild(el('span', {style:'font-size:11px;font-weight:700;color:'+statusColor+';background:var(--ivory1);padding:2px 8px;border-radius:10px', text:rec.status||'접수'}));
      row.appendChild(topRow);
      row.appendChild(el('div', {style:'font-size:12px;color:var(--dark);margin-bottom:4px', text:rec.symptom||''}));
      var metaLine = (rec.fee_type||'무상') + (rec.fee_type === '유상' ? (' · ' + Number(rec.fee_amount||0).toLocaleString('ko-KR') + '원') : '') + (rec.visit_date ? (' · 방문예정: ' + rec.visit_date) : '');
      row.appendChild(el('div', {style:'font-size:11px;color:var(--sub);margin-bottom:6px', text:metaLine}));
      var nextIdx = AS_STATUS_STEPS.indexOf(rec.status) + 1;
      if (nextIdx > 0 && nextIdx < AS_STATUS_STEPS.length) {
        var nextStatus = AS_STATUS_STEPS[nextIdx];
        row.appendChild(btn('font-size:11px;font-weight:700;color:var(--dark);background:none;border:1px solid var(--border);border-radius:8px;padding:4px 10px;cursor:pointer;font-family:inherit', nextStatus + '로 변경', function() {
          sbXHR('PATCH', 'as_records?id=eq.' + encodeURIComponent(rec.id), { status: nextStatus }, function(err2) {
            if (err2) { showToast('상태 변경 실패'); return; }
            if (typeof logEvent === 'function') logEvent('as_status_change', { customerId: c.id, customerName: c.clientName, from: rec.status, to: nextStatus });
            renderASSection(c, asBody);
          });
        }));
      }
      listWrap.appendChild(row);
    });
    asBody.appendChild(listWrap);
  });
}
