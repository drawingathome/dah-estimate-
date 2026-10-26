/* ══════════════════════════════════════════════════
   고객상세 - 결제 탭의 "추가 결제" 영역 (2026-10-19)
   ══════════════════════════════════════════════════
   선혜님 지시("추가결제칸으로 해"): 선금·잔금으로 완납된 뒤 금액이 늘어(증액) 더 받는 돈을 기록하는 칸.
   - 선금·잔금 두 칸 밖의 입금 한 건을 한 줄로 쌓음(estimate_extra_payments 표, 견적서에 소속). 줄마다 금액·입금일·수단·메모.
   - 받은 돈·미수금·월 매출은 모두 getAllEstPays(dash-utils.js)가 이 줄을 합산해서 계산하므로 이 화면은 "입력·표시"만 담당함.
   - 직원은 추가·조회, 수정·삭제는 마스터만(DB 권한도 같은 규칙). 잘못 넣은 줄은 마스터가 삭제 후 다시 입력.
   - 환불은 아직 선금·잔금 칸만 가능(추가 결제 환불은 다음 단계) - 안내 문구로 알림. */

function newExtraPayRequestId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) { var r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); });
}

function reopenAfterExtraPay(c) {
  // 추가 결제는 매출·미수금·칸반 숫자가 바뀌므로 견적서(추가 결제 포함)와 고객을 서버 최신값으로 다시 불러온 뒤 상세를 다시 연다.
  function done() { closeDetail(); openDetail(c.clientName, c.id); }
  function loadCust() {
    if (typeof loadCustomersAsync === 'function') loadCustomersAsync(done, true); else done();
  }
  if (typeof loadEstimatesAsync === 'function') loadEstimatesAsync(loadCust, true); else loadCust();
}

// 2026-10-20(이상옥 사례): 같은 고객의 "다른 견적서"가 받아야 할 돈(선금 50% / 남은 금액)과 입력 금액이 같으면 그 견적서를 알려줌.
// 침구 견적서 화면에서 커튼 선금 1,559,000원을 추가결제로 넣으려다 경고가 떴던 상황을 막기 위한 안내(입금은 견적서마다 따로 기록되므로).
function findOtherEstimateForAmount(c, est, amount) {
  var all = [];
  try { all = JSON.parse(localStorage.getItem('dah_saved') || '[]'); } catch (e) {}
  var mine = all.filter(function (e) { return (c.id && e.clientId) ? e.clientId === c.id : e.clientName === c.clientName; });
  for (var i = 0; i < mine.length; i++) {
    var o = mine[i];
    if (!o || o.id === est.id) continue;
    var price = Number(o.price) || 0, dep = Number(o.depositAmount) || 0, bal = Number(o.balanceAmount) || 0;
    if (price <= 0) continue;
    var nm = String(o.fabric || o.product || '').trim();
    var label = (nm ? nm.slice(0, 18) + ' ' : '') + (o.confirmedAt ? '확정견적서' : '가견적서') + ' · ' + price.toLocaleString() + '원';
    if (!(dep > 0) && Math.abs(Math.round(price * 0.5) - amount) <= 10) return { label: label, kind: '선금(50%)' };
    var remain = price - dep - bal;
    if (dep > 0 && !(bal > 0) && remain > 0 && Math.abs(remain - amount) <= 10) return { label: label, kind: '잔금(남은 금액)' };
  }
  return null;
}

// est: 이 견적서(est.id, est.price, est.depositAmount, est.balanceAmount, est.extraPayRows), c: 고객
function appendExtraPaySection(paySec, est, c) {
  if (!est || !est.id || typeof sbXHR !== 'function') return;
  var isMaster = (typeof isMasterUser === 'function') && isMasterUser();
  var rows = getEstExtraRows(est);
  var extraTotal = rows.reduce(function (s, x) { return s + x.amount; }, 0);
  var basePaid = (Number(est.depositAmount) || 0) + (Number(est.balanceAmount) || 0);
  var price = Number(est.price) || 0;

  var box = document.createElement('div');
  box.className = 'extra-pay-box';
  box.style.cssText = 'margin-top:var(--sp-2);padding:var(--sp-3);background:var(--ivory1);border-radius:12px;border:1px solid var(--border)';
  var title = document.createElement('div');
  title.style.cssText = 'font-size:12px;font-weight:700;color:var(--dark);margin-bottom:4px';
  title.textContent = (rows.length ? '✔ ' : '') + '추가 결제' + (rows.length ? ' · 합계 ' + extraTotal.toLocaleString() + '원' : '');
  box.appendChild(title);
  var hint = document.createElement('div');
  hint.style.cssText = 'font-size:11px;color:#6B6B6B;margin-bottom:8px;line-height:1.5';
  hint.textContent = '선금·잔금을 받은 뒤 금액이 늘어(증액) 더 받은 돈을 한 건씩 기록해요. 받은 금액·미수금·월 매출에 자동으로 합산돼요.';
  box.appendChild(hint);

  rows.forEach(function (x) {
    var line = document.createElement('div');
    line.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--border);font-size:11px;color:var(--dark)';
    var left = document.createElement('div');
    left.style.cssText = 'flex:1;min-width:0;line-height:1.5';
    var amt = document.createElement('div');
    amt.style.cssText = 'font-weight:800';
    amt.textContent = x.amount.toLocaleString() + '원';
    var meta = document.createElement('div');
    meta.style.cssText = 'color:#6B6B6B;word-break:break-all';
    meta.textContent = (x.method || '') + ' · ' + x.date + (x.receipt ? ' · 현금영수증 ✔' : '') + (x.memo ? ' · ' + x.memo : '');
    left.appendChild(amt); left.appendChild(meta);
    line.appendChild(left);
    if (isMaster) {
      var del = document.createElement('button');
      del.type = 'button'; del.textContent = '삭제';
      del.style.cssText = 'font-size:11px;color:#B3261E;background:none;border:1px solid #E5A19A;border-radius:10px;padding:2px 8px;cursor:pointer;font-family:inherit';
      del.onclick = function () {
        if (!confirm('이 추가 결제 ' + x.amount.toLocaleString() + '원(' + x.date + ')을 삭제할까요?\n잘못 입력한 경우에만 삭제하세요. 실제로 돌려준 돈은 삭제가 아니라 환불로 기록해야 해요.')) return;
        if (typeof logEvent === 'function') logEvent('extra_payment_delete', { estimateId: est.id, customerId: c.id, amount: x.amount });
        sbXHR('DELETE', 'estimate_extra_payments?id=eq.' + encodeURIComponent(x.id), null, function (err) {
          if (err) {
            var _cmD = (typeof closedMonthRejectMessage === 'function') ? closedMonthRejectMessage(err.status, err.text) : '';
            showToast(_cmD ? ('🔒 ' + _cmD) : '⚠️ 삭제되지 않았어요 - 잠시 후 다시 시도해 주세요'); return; // 2026-10-26(H-17)
          }
          showToast('삭제했어요');
          reopenAfterExtraPay(c);
        });
      };
      line.appendChild(del);
    }
    box.appendChild(line);
  });

  // 입력 폼
  var form = document.createElement('div');
  form.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px';
  var inputCss = 'padding:6px;border:1px solid var(--border);border-radius:12px;font-size:11px;font-family:inherit';
  var method = document.createElement('select');
  method.style.cssText = 'flex:1;min-width:80px;background:#fff;' + inputCss;
  ['카드', '현금'].forEach(function (m) { var o = document.createElement('option'); o.value = m; o.textContent = m; method.appendChild(o); });
  var amtIn = document.createElement('input');
  amtIn.type = 'text'; amtIn.setAttribute('inputmode', 'numeric'); amtIn.placeholder = '추가 결제 금액';
  amtIn.style.cssText = 'flex:2;min-width:90px;' + inputCss;
  var dateIn = document.createElement('input');
  dateIn.type = 'date'; dateIn.value = (typeof todayStr === 'function') ? todayStr() : '';
  dateIn.style.cssText = 'flex:2;min-width:110px;' + inputCss;
  var memoIn = document.createElement('input');
  memoIn.type = 'text'; memoIn.placeholder = '메모 (예: 블라인드 1개 추가)';
  memoIn.style.cssText = 'width:100%;' + inputCss;
  var rcWrap = document.createElement('label');
  rcWrap.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;color:#6B6B6B;cursor:pointer;width:100%';
  var rc = document.createElement('input'); rc.type = 'checkbox';
  rcWrap.appendChild(rc); rcWrap.appendChild(document.createTextNode('현금영수증'));
  var save = document.createElement('button');
  save.type = 'button'; save.textContent = '추가 결제 저장';
  save.style.cssText = 'width:100%;padding:9px;background:var(--dark);color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:var(--sp-1)';
  var requestId = newExtraPayRequestId(); // 같은 입력을 두 번 눌러도 한 건만 저장되게(화면을 다시 열 때까지 같은 번호 유지)
  var saving = false;
  save.onclick = function () {
    if (saving) return;
    var amount = Number(String(amtIn.value).replace(/[^0-9]/g, '')) || 0;
    if (amount <= 0) { alert('추가 결제 금액을 입력해 주세요.'); amtIn.focus(); return; }
    if (!dateIn.value) { alert('입금 날짜를 입력해 주세요.'); dateIn.focus(); return; }
    var otherEst = findOtherEstimateForAmount(c, est, amount);
    if (otherEst) {
      if (!confirm('⚠️ 이 금액(' + amount.toLocaleString() + '원)은 같은 고객의 "' + otherEst.label + '" 견적서의 ' + otherEst.kind + ' 금액과 같아요.\n입금은 견적서마다 따로 기록돼요. 그 견적서의 돈이라면 [취소]를 누르고 그 견적서 탭의 ' + (otherEst.kind.indexOf('선금') === 0 ? '선금' : '잔금') + ' 칸에 입력해 주세요.\n이 견적서(' + (est.estimateLabel || '현재') + ')의 추가 결제가 맞다면 [확인]을 눌러 주세요.')) return;
    }
    if (price > 0) {
      var remain = price - basePaid - extraTotal; // 아직 더 받아야 할 금액(0 이하면 이미 채워진 상태)
      if (remain > 0 && !(Number(est.balanceAmount) > 0)) {
        // 잔금 칸이 비어 있음 = 아직 잔금을 안 받은 상태 → 잔금 칸으로 입력해야 단계 자동 이동·캘린더·알림톡이 따라옴
        if (!confirm('⚠️ 이 견적서는 아직 잔금을 받은 기록이 없어요(남은 금액 ' + remain.toLocaleString() + '원).\n잔금을 받은 거라면 "추가 결제"가 아니라 위 잔금 칸에 입력해야 해요(단계 자동 이동·캘린더 표시가 잔금 칸을 기준으로 해요).\n그래도 추가 결제로 저장할까요?')) return;
      } else if (amount > Math.max(remain, 0)) {
        // 남은 금액보다 많이 입력함(증액이거나 입력 실수)
        var over = amount - Math.max(remain, 0);
        if (!confirm('⚠️ 추가 결제까지 합치면 받은 돈(' + (basePaid + extraTotal + amount).toLocaleString() + '원)이 견적금액(' + price.toLocaleString() + '원)보다 ' + (basePaid + extraTotal + amount - price).toLocaleString() + '원 많아져요.\n증액했다면 견적서 금액을 먼저 올렸는지 확인해 주세요. 그래도 저장할까요?')) return;
      }
      // 잔금이 이미 들어와 있고 남은 금액 이하면(나눠 받은 잔금) 확인 없이 저장 - 기존 입금 기록은 바꾸지 않고 한 줄 더 쌓는 처리
    }
    saving = true; save.disabled = true; save.textContent = '저장 중...';
    var body = {
      estimate_id: est.id, client_id: c.id || null, amount: amount, paid_date: dateIn.value,
      method: method.value, receipt: rc.checked, memo: String(memoIn.value || '').trim(), request_id: requestId
    };
    if (typeof logEvent === 'function') logEvent('extra_payment_save', { estimateId: est.id, customerId: c.id, customerName: c.clientName, amount: amount });
    sbXHR('POST', 'estimate_extra_payments', body, function (err) {
      saving = false; save.disabled = false; save.textContent = '추가 결제 저장';
      // 같은 request_id가 이미 저장돼 있으면(중복 클릭·재시도) 중복 오류(409)로 오는데, 이미 저장된 것이므로 성공으로 취급함.
      var dup = err && (err.status === 409 || /duplicate key|23505/.test(String(err.text || '')));
      if (err && !dup) {
        var _cmX = (typeof closedMonthRejectMessage === 'function') ? closedMonthRejectMessage(err.status, err.text) : '';
        if (_cmX) { showToast('🔒 ' + _cmX); return; } // 2026-10-26(H-17): 마감된 달 = 영구 거절(다시 눌러도 같음)
        showToast('⚠️ 추가 결제가 서버에 저장되지 않았어요 - 잠시 후 다시 눌러 주세요');
        return;
      }
      showToast('✅ 추가 결제를 저장했어요');
      reopenAfterExtraPay(c);
    });
  };
  form.appendChild(method); form.appendChild(amtIn); form.appendChild(dateIn); form.appendChild(memoIn); form.appendChild(rcWrap);
  box.appendChild(form); box.appendChild(save);
  var note = document.createElement('div');
  note.style.cssText = 'font-size:10px;color:#9A9A9A;margin-top:6px;line-height:1.5';
  note.textContent = '※ 추가 결제의 환불은 아직 화면에서 지원하지 않아요(선금·잔금 환불만 가능). 필요하면 마스터에게 알려 주세요.';
  box.appendChild(note);
  paySec.appendChild(box);
}
