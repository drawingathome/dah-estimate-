/* ══════════════════════════════════════════════════
   고객상세 - 결제 탭의 "환불" 영역 (2026-10-14)
   ══════════════════════════════════════════════════
   원칙(선혜님 확정): 환불은 마스터만 등록한다. 입금칸을 지워서 환불을 표현하지 않고, 환불 기록(payment_refunds)을 남긴다.
   - 마스터: "환불 등록"(선금/잔금 칸 선택, 금액, 환불일, 사유 필수) / 등록된 환불의 "환불 취소"
   - 실장: 환불 내역을 읽기만 가능. 입금액 감액은 DB가 막고, 이 화면은 "마스터에게 요청" 안내만 보여줌.
   환불을 등록하면 입금칸이 환불 후 금액(순수령)으로 줄고, 환불 행에 원래 입금일이 남아서 매출은 "입금한 달 +, 환불한 달 -"로 잡힘.
   실제 쓰기는 DB 함수(register_refund / reverse_refund, 마스터만 실행 가능)만 함 — 이 화면을 우회해도 DB가 막음. */

function parseRefundError(err) {
  var msg = '';
  try { var j = JSON.parse(err && err.text); msg = (j && (j.message || j.hint)) || ''; } catch (e) { msg = (err && err.text) || ''; }
  return msg || '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

function newRefundRequestId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) { var r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); });
}

function reopenAfterRefund(c) {
  // 환불 때문에 DB가 고객 칸(합계)·견적서 칸을 바꿨으니, 기기에 남은 결제 임시저장은 지우고 서버 최신값으로 다시 연다.
  // 2026-10-16(이영욱 재결제 사례): 예전엔 여기가 비어 있어서, 환불 뒤 선금 칸이 환불 전에 쓰던 임시저장(옛 입금일 10-05 등)으로 다시 채워졌음 → 임시저장을 실제로 지움
  try { localStorage.removeItem('dah_pay_draft_' + c.id); } catch (e) {}
  if (typeof loadCustomersAsync === 'function') {
    loadCustomersAsync(function () { closeDetail(); openDetail(c.clientName, c.id); }, true);
  } else { closeDetail(); openDetail(c.clientName, c.id); }
}

function appendRefundSection(paySec, est, c) {
  if (!est || !est.id || typeof sbXHR !== 'function') return;
  var isMaster = isMasterUser();
  var rows = est.refundRows || [];
  var reversed = {};
  rows.forEach(function (r) { if (r.entry_type === 'reversal' && r.reverses_id) reversed[r.reverses_id] = true; });
  var refunds = rows.filter(function (r) { return r.entry_type === 'refund'; });
  var dep = Number(est.depositAmount) || 0, bal = Number(est.balanceAmount) || 0;
  if (!isMaster && refunds.length === 0) {
    if (dep + bal > 0) {
      var hint = document.createElement('div');
      hint.style.cssText = 'margin-top:10px;font-size:11px;color:var(--sub);line-height:1.6';
      hint.textContent = '※ 이미 기록된 입금은 줄이거나 지울 수 없어요. 환불·정정이 필요하면 마스터에게 요청해 주세요.';
      paySec.appendChild(hint);
    }
    return;
  }
  var wrap = document.createElement('div');
  wrap.className = 'refund-section';
  wrap.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)';
  var title = document.createElement('div');
  title.style.cssText = 'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.5px;margin-bottom:6px';
  title.textContent = '환불';
  wrap.appendChild(title);

  var fmt = function (n) { return (Number(n) || 0).toLocaleString() + '원'; };
  var slotLabel = function (s) { return s === 'deposit' ? '선금' : '잔금'; };
  if (refunds.length === 0) {
    var none = document.createElement('div');
    none.style.cssText = 'font-size:12px;color:var(--sub);margin-bottom:6px';
    none.textContent = '등록된 환불이 없어요.';
    wrap.appendChild(none);
  }
  refunds.forEach(function (r) {
    var cancelled = !!reversed[r.id];
    var line = document.createElement('div');
    line.className = 'refund-line';
    line.style.cssText = 'font-size:12px;line-height:1.7;color:' + (cancelled ? 'var(--sub)' : '#B3261E') + (cancelled ? ';text-decoration:line-through' : '');
    line.textContent = r.refund_date + ' · ' + slotLabel(r.slot) + ' -' + fmt(r.amount) + ' (원래 입금일 ' + r.paid_date + ') · ' + r.reason + (cancelled ? ' · 환불 취소됨' : '');
    wrap.appendChild(line);
    if (isMaster && !cancelled) {
      var cb = document.createElement('button');
      cb.type = 'button'; cb.textContent = '환불 취소';
      cb.style.cssText = 'margin:2px 0 6px;padding:3px 10px;border:1px solid var(--border);border-radius:8px;background:#fff;font-size:11px;font-weight:700;color:var(--sub);cursor:pointer';
      cb.onclick = function () {
        var reason = prompt('환불을 취소(되돌림)하는 사유를 입력해 주세요.\n환불로 줄었던 ' + slotLabel(r.slot) + ' ' + fmt(r.amount) + '이 다시 입금으로 돌아옵니다.');
        if (reason === null) return;
        if (!reason.trim()) { alert('사유를 입력해야 취소할 수 있어요.'); return; }
        cb.disabled = true; cb.textContent = '처리 중…';
        sbXHR('POST', 'rpc/reverse_refund', { p_refund_id: r.id, p_reason: reason.trim(), p_request_id: newRefundRequestId() }, function (err) {
          if (err) { alert(parseRefundError(err)); cb.disabled = false; cb.textContent = '환불 취소'; return; }
          showToast('환불을 취소했어요');
          reopenAfterRefund(c);
        });
      };
      wrap.appendChild(cb);
    }
  });

  if (isMaster && (dep > 0 || bal > 0)) {
    var openBtn = document.createElement('button');
    openBtn.type = 'button'; openBtn.textContent = '환불 등록';
    openBtn.style.cssText = 'margin-top:4px;padding:6px 12px;border:1px solid #B3261E;border-radius:8px;background:#fff;font-size:12px;font-weight:700;color:#B3261E;cursor:pointer';
    var form = document.createElement('div');
    form.style.cssText = 'display:none;margin-top:8px;padding:10px 12px;background:#FDF6F5;border-radius:10px;font-size:12px';
    var slotSel = document.createElement('select');
    slotSel.style.cssText = 'padding:6px;border:1px solid var(--border);border-radius:8px;margin-right:6px;font-size:12px';
    if (dep > 0) slotSel.appendChild(new Option('선금 ' + fmt(dep) + ' (입금일 ' + (est.depositDate || '-') + ')', 'deposit'));
    if (bal > 0) slotSel.appendChild(new Option('잔금 ' + fmt(bal) + ' (입금일 ' + (est.balanceDate || '-') + ')', 'balance'));
    var amtIn = document.createElement('input');
    amtIn.type = 'text'; amtIn.inputMode = 'numeric'; amtIn.placeholder = '환불 금액';
    amtIn.style.cssText = 'padding:6px;border:1px solid var(--border);border-radius:8px;width:110px;margin-right:6px;font-size:12px';
    var dateIn = document.createElement('input');
    dateIn.type = 'date'; dateIn.value = (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10);
    dateIn.style.cssText = 'padding:6px;border:1px solid var(--border);border-radius:8px;margin-right:6px;font-size:12px';
    var reasonIn = document.createElement('input');
    reasonIn.type = 'text'; reasonIn.placeholder = '환불 사유 (필수) 예: 카드 취소 후 재결제';
    reasonIn.style.cssText = 'padding:6px;border:1px solid var(--border);border-radius:8px;width:100%;box-sizing:border-box;margin-top:6px;font-size:12px';
    var slotMax = function () { return slotSel.value === 'deposit' ? dep : bal; };
    var syncAmt = function () { amtIn.value = slotMax().toLocaleString(); };
    slotSel.addEventListener('change', syncAmt); syncAmt();
    amtIn.addEventListener('input', function () { var v = amtIn.value.replace(/[^0-9]/g, ''); amtIn.value = v ? Number(v).toLocaleString() : ''; });
    var go = document.createElement('button');
    go.type = 'button'; go.textContent = '환불 처리';
    go.style.cssText = 'margin-top:8px;padding:7px 14px;border:none;border-radius:8px;background:#B3261E;color:#fff;font-size:12px;font-weight:700;cursor:pointer';
    var reqId = newRefundRequestId(); // 같은 화면에서 버튼을 두 번 눌러도 한 번만 기록됨
    go.onclick = function () {
      var amount = Number(amtIn.value.replace(/[^0-9]/g, '')) || 0;
      var slot = slotSel.value, reason = reasonIn.value.trim();
      if (amount <= 0) { alert('환불 금액을 입력해 주세요.'); return; }
      if (amount > slotMax()) { alert('환불 금액이 해당 입금액(' + fmt(slotMax()) + ')보다 클 수 없어요.'); return; }
      if (!dateIn.value) { alert('환불일을 입력해 주세요.'); return; }
      if (!reason) { alert('환불 사유를 입력해 주세요.'); return; }
      if (!confirm((c.clientName || '') + ' · ' + slotLabel(slot) + ' ' + fmt(slotMax()) + ' 중 ' + fmt(amount) + '을 ' + dateIn.value + '자로 환불 처리할까요?\n\n'
        + '· ' + slotLabel(slot) + '은 ' + fmt(slotMax() - amount) + '이 됩니다.\n'
        + '· 매출은 원래 입금한 달에는 그대로 남고, 환불한 달에 -' + fmt(amount) + '으로 잡혀요.\n'
        + '· 잘못 등록하면 "환불 취소"로만 되돌릴 수 있어요(기록은 삭제되지 않아요).')) return;
      go.disabled = true; go.textContent = '처리 중…';
      sbXHR('POST', 'rpc/register_refund', { p_estimate_id: est.id, p_slot: slot, p_amount: amount, p_refund_date: dateIn.value, p_reason: reason, p_request_id: reqId }, function (err) {
        if (err) { alert(parseRefundError(err)); go.disabled = false; go.textContent = '환불 처리'; return; }
        showToast('환불을 등록했어요');
        reopenAfterRefund(c);
      });
    };
    form.appendChild(slotSel); form.appendChild(amtIn); form.appendChild(dateIn); form.appendChild(reasonIn); form.appendChild(go);
    openBtn.onclick = function () { form.style.display = form.style.display === 'none' ? '' : 'none'; };
    wrap.appendChild(openBtn); wrap.appendChild(form);
  }
  paySec.appendChild(wrap);
}
