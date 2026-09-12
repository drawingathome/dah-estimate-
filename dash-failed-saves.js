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
    detailsToggle.style.cssText = 'font-size:11px;color:#8E8078;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;margin-bottom:8px';
    var pre = document.createElement('pre');
    pre.style.cssText = 'display:none;background:#FAF7F5;padding:10px;border-radius:6px;font-size:11px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;margin:0 0 10px';
    pre.textContent = JSON.stringify(entry.payload, null, 2);
    detailsToggle.onclick = function () { pre.style.display = pre.style.display === 'none' ? 'block' : 'none'; };
    card.appendChild(detailsToggle);
    card.appendChild(pre);

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
