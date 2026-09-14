/* ══════════════════════════════════════════════════
   DAH 대시보드 — 저장 실패 백업 확인/복구 화면
   ══════════════════════════════════════════════════
   2026-09-11(선혜님 - client_error_logs 알림 메일 보고 "그럼 아무 문제가
   없다고??"로 발견): 고객/견적 저장이 "권한문제 또는 동시저장충돌"로
   실패하면 내용을 localStorage(dah_failed_customer_saves, dah_failed_saves)에
   백업만 해두고, 그걸 사람이 실제로 확인/복구할 수 있는 화면이 어디에도
   없었음 - "백업됐다"는 문구만 있고 실제로는 조용히 쌓이기만 하는 상태.
   홈 화면에 눈에 띄는 배너를 띄우고, 클릭하면 각 건을 보고 그대로 다시
   저장하거나(강제 재시도) 확인 후 지울 수 있게 함. */

function getFailedSaveEntries() {
  var custEntries = [], estEntries = [];
  try { custEntries = JSON.parse(localStorage.getItem('dah_failed_customer_saves') || '[]'); } catch (e) {}
  try { estEntries = JSON.parse(localStorage.getItem('dah_failed_saves') || '[]'); } catch (e) {}
  var merged = [];
  custEntries.forEach(function (e) {
    merged.push({
      type: 'customer', savedAt: e.savedAt, reason: e.reason, customerId: e.customerId,
      payload: e.payload,
      label: (e.payload && (e.payload.client_name || e.payload.clientName)) || ('고객 #' + e.customerId)
    });
  });
  estEntries.forEach(function (e) {
    merged.push({
      type: 'estimate', savedAt: e.savedAt, reason: e.reason, estDbId: e.editingEstDbId,
      payload: e.payload,
      label: (e.payload && (e.payload.customer_name || e.payload.customerName)) || ('견적서 ' + String(e.editingEstDbId || '').slice(0, 8))
    });
  });
  merged.sort(function (a, b) { return new Date(b.savedAt) - new Date(a.savedAt); });
  return merged;
}

function removeFailedSaveEntry(type, savedAt) {
  var key = type === 'customer' ? 'dah_failed_customer_saves' : 'dah_failed_saves';
  var arr = [];
  try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) {}
  arr = arr.filter(function (e) { return e.savedAt !== savedAt; });
  localStorage.setItem(key, JSON.stringify(arr));
}

function renderFailedSavesBanner() {
  var existing = document.getElementById('failed-saves-banner');
  if (existing) existing.remove();
  var entries = getFailedSaveEntries();
  if (entries.length === 0) return;
  var wrap = document.getElementById('home');
  if (!wrap) return;
  var banner = document.createElement('div');
  banner.id = 'failed-saves-banner';
  banner.style.cssText = 'background:#FBEAE7;border-bottom:2px solid #E4483A;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;cursor:pointer';
  banner.innerHTML = '<span style="font-size:13px;font-weight:700;color:#C0392B">⚠️ 확인이 필요한 저장 실패가 ' + entries.length + '건 있어요</span><span style="font-size:12px;font-weight:700;color:#C0392B">확인하기 →</span>';
  banner.onclick = openFailedSavesModal;
  wrap.insertBefore(banner, wrap.firstChild);
}

function retryFailedSave(entry) {
  if (!confirm('백업된 내용을 그대로 다시 저장할까요?\n(그 사이 다른 곳에서 저장된 내용이 있다면 지금 이 백업 내용으로 덮어써요)')) return;
  var method, path;
  if (entry.type === 'customer') {
    method = entry.customerId ? 'PATCH' : 'POST';
    path = entry.customerId ? ('customers?id=eq.' + entry.customerId) : 'customers';
  } else {
    method = 'PATCH';
    path = 'estimates?id=eq.' + entry.estDbId;
  }
  sbXHR(method, path, entry.payload, function (err) {
    if (err) { alert('다시 저장하는 데 실패했어요: ' + (err.message || err) + '\n잠시 후 다시 시도해주세요.'); return; }
    showToast('다시 저장했어요');
    removeFailedSaveEntry(entry.type, entry.savedAt);
    openFailedSavesModal();
    renderFailedSavesBanner();
    if (entry.type === 'customer' && typeof renderHome === 'function') renderHome();
  });
}

function dismissFailedSave(entry) {
  if (!confirm('이 백업 내용을 확인했고 지워도 될까요? (되돌릴 수 없어요)')) return;
  removeFailedSaveEntry(entry.type, entry.savedAt);
  openFailedSavesModal();
  renderFailedSavesBanner();
}

function openFailedSavesModal() {
  var existing = document.getElementById('failed-saves-modal');
  if (existing) existing.remove();
  var entries = getFailedSaveEntries();

  var ov = document.createElement('div');
  ov.id = 'failed-saves-modal';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#F5F2EE;z-index:9999;overflow-y:auto';

  var nav = document.createElement('div');
  nav.style.cssText = 'position:sticky;top:0;background:#282828;color:#fff;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;z-index:1';
  nav.innerHTML = '<span style="font-size:14px;font-weight:700">저장 실패 확인 (' + entries.length + '건)</span>';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.style.cssText = 'padding:6px 12px;background:none;color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit';
  closeBtn.onclick = function () { ov.remove(); };
  nav.appendChild(closeBtn);
  ov.appendChild(nav);

  var content = document.createElement('div');
  content.style.cssText = 'padding:16px';

  if (entries.length === 0) {
    content.innerHTML = '<div style="text-align:center;color:#B0A99F;padding:60px 20px;font-size:13px">확인할 저장 실패가 없어요.</div>';
  }

  entries.forEach(function (entry) {
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border:1px solid #EEE6DC;border-radius:8px;padding:14px;margin-bottom:12px';

    var when = new Date(entry.savedAt);
    var whenStr = when.getFullYear() + '.' + (when.getMonth() + 1) + '.' + when.getDate() + ' ' + String(when.getHours()).padStart(2, '0') + ':' + String(when.getMinutes()).padStart(2, '0');

    var head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px';
    head.innerHTML = '<div><div style="font-size:14px;font-weight:700">' + (entry.type === 'customer' ? '👤 ' : '📋 ') + entry.label + '</div>' +
      '<div style="font-size:11px;color:#B0A99F;margin-top:2px">' + whenStr + ' · ' + entry.reason + '</div></div>';
    card.appendChild(head);

    var detailsToggle = document.createElement('button');
    detailsToggle.textContent = '백업된 내용 보기';
    detailsToggle.style.cssText = 'font-size:11px;color:#8E8078;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline';
    var pre = document.createElement('pre');
    pre.style.cssText = 'display:none;background:#FAF7F5;padding:10px;border-radius:6px;font-size:11px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;margin:8px 0 0';
    pre.textContent = JSON.stringify(entry.payload, null, 2);
    detailsToggle.onclick = function () { pre.style.display = pre.style.display === 'none' ? 'block' : 'none'; };

    var checkBtn = document.createElement('button');
    checkBtn.textContent = '🔍 지금 값과 비교하기';
    checkBtn.style.cssText = 'font-size:11px;color:#8E8078;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;margin-left:14px';
    var toggleRow = document.createElement('div');
    toggleRow.style.cssText = 'margin-bottom:8px';
    toggleRow.appendChild(detailsToggle);
    toggleRow.appendChild(checkBtn);
    card.appendChild(toggleRow);
    card.appendChild(pre);
    var diffBox = document.createElement('div');
    diffBox.style.cssText = 'display:none;margin-bottom:10px';
    card.appendChild(diffBox);
    // 2026-09-14(선혜님 - "이거는 계속 이런데?!!! 처리 안해줄래?"로 발견):
    // 이 백업들이 localStorage(브라우저 자체)에만 있어서, 저는 원격에서
    // 직접 지워드릴 수가 없음 - 대신 직접 지금 실제 저장된 값과
    // 한 눈에 비교해서, 이미 반영됐는지 그 자리에서 바로 판단할 수
    // 있게 함(예전 이메일 알림 때처럼 "몇 개만 보고 자동으로 판단"하지
    // 않고, 백업된 값 전부를 하나하나 눈으로 직접 대조해서 스스로
    // 판단하시게).
    checkBtn.onclick = function () {
      if (diffBox.style.display !== 'none') { diffBox.style.display = 'none'; return; }
      diffBox.style.display = 'block';
      diffBox.innerHTML = '<div style="font-size:11px;color:#B0A99F;padding:8px 0">조회 중...</div>';
      var table = entry.type === 'customer' ? 'customers' : 'estimates';
      var filterField = entry.type === 'customer' ? 'phone' : 'id';
      var filterVal = entry.type === 'customer' ? entry.payload.phone : entry.estDbId;
      if (!filterVal) { diffBox.innerHTML = '<div style="font-size:11px;color:#C0392B;padding:8px 0">비교할 기준값이 없어요.</div>'; return; }
      sbXHR('GET', table + '?' + filterField + '=eq.' + encodeURIComponent(filterVal) + '&select=*', null, function (err, rows) {
        if (err || !rows || !rows[0]) { diffBox.innerHTML = '<div style="font-size:11px;color:#C0392B;padding:8px 0">지금 값을 못 가져왔어요(이미 삭제됐거나 네트워크 문제).</div>'; return; }
        var current = rows[0];
        var rowsHtml = '';
        var allMatch = true;
        Object.keys(entry.payload).forEach(function (key) {
          if (key === 'line_items') return; // 품목 배열은 통째로 비교하기엔 너무 길어서 별도 표시
          var backedUp = entry.payload[key];
          var currentVal = current[key];
          var match = String(backedUp == null ? '' : backedUp) === String(currentVal == null ? '' : currentVal);
          if (!match) allMatch = false;
          rowsHtml += '<tr><td style="padding:3px 6px;color:#8E8078">' + key + '</td>' +
            '<td style="padding:3px 6px;' + (match ? '' : 'color:#C0392B') + '">' + (backedUp === '' ? '(빈값)' : String(backedUp)) + '</td>' +
            '<td style="padding:3px 6px;' + (match ? '' : 'font-weight:700') + '">' + (currentVal === '' || currentVal == null ? '(빈값)' : String(currentVal)) + '</td></tr>';
        });
        var lineItemsNote = '';
        if (entry.payload.line_items) {
          var curCount = Array.isArray(current.line_items) ? current.line_items.length : 0;
          var backedCount = entry.payload.line_items.length;
          lineItemsNote = '<div style="font-size:11px;margin-top:6px;' + (curCount === backedCount ? 'color:#8E8078' : 'color:#C0392B') + '">품목 개수 — 백업: ' + backedCount + '개 / 지금: ' + curCount + '개' + (curCount === backedCount ? '' : ' (달라요)') + '</div>';
          if (curCount !== backedCount) allMatch = false;
        }
        diffBox.innerHTML = '<div style="font-size:12px;font-weight:700;margin-bottom:6px;color:' + (allMatch ? '#3A7D44' : '#C0392B') + '">' + (allMatch ? '✅ 지금 저장된 값과 완전히 일치해요 — 안심하고 지우셔도 돼요' : '⚠️ 지금 값과 다른 부분이 있어요 — 아래 빨간 글씨 확인해주세요') + '</div>' +
          '<table style="width:100%;font-size:11px;border-collapse:collapse"><tr style="font-weight:700;border-bottom:1px solid #EEE6DC"><td style="padding:3px 6px">항목</td><td style="padding:3px 6px">백업된 값</td><td style="padding:3px 6px">지금 값</td></tr>' + rowsHtml + '</table>' + lineItemsNote;
      });
    };

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px';
    var retryBtn = document.createElement('button');
    retryBtn.textContent = '이 내용 그대로 다시 저장';
    retryBtn.style.cssText = 'flex:1;padding:9px 0;background:#282828;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit';
    retryBtn.onclick = function () { retryFailedSave(entry); };
    var dismissBtn = document.createElement('button');
    dismissBtn.textContent = '확인함 (지우기)';
    dismissBtn.style.cssText = 'padding:9px 14px;background:#fff;color:#8E8078;border:1px solid #EEE6DC;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit';
    dismissBtn.onclick = function () { dismissFailedSave(entry); };
    btnRow.appendChild(retryBtn);
    btnRow.appendChild(dismissBtn);
    card.appendChild(btnRow);

    content.appendChild(card);
  });

  ov.appendChild(content);
  document.body.appendChild(ov);
}
