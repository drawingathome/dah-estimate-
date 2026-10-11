/* ══════════════════════════════════════════════════
   고객상세 - 결제 탭의 "입금 내역 보기" (읽기 전용)
   ══════════════════════════════════════════════════
   2026-10-11(선혜님 - "입금 장부" 대신 이미 쌓이는 이력을 활용하기로 결정): DB에는 견적서가
   바뀔 때마다 "바뀌기 직전 상태"를 저장하는 이력(estimate_history)이 이미 있음(2026-09-15~).
   이 이력의 선금/잔금 변화를 읽어서 "언제 얼마가 바뀌었는지"를 보여줌.
   - 화면 전용: DB에 아무것도 쓰지 않음.
   - 이력 한 줄 = "그 시각에 직전 상태가 저장됨" → 직전 상태 → 다음 상태로 바뀐 시각이 그 줄의 시각.
   - 이력이 시작되기(2026-09-15) 전의 변동은 알 수 없음. 누가 바꿨는지도 기록되지 않음.
   - 금액이 줄어든 건 환불인지 정정인지 알 수 없어서 "감액"으로만 표시.
*/

// snaps: [{changed_at, snapshot:{deposit_amount,deposit_date,balance_amount,balance_date}}] (오래된 순)
// cur: 지금 상태 {deposit_amount, deposit_date, balance_amount, balance_date}
// 반환: [{at, kind:'start'|'add'|'cut', field:'선금'|'잔금', amount, date, total}]
function buildPayHistoryEntries(snaps, cur) {
  var out = [];
  function n(v) { return Number(v) || 0; }
  var list = (snaps || []).slice().sort(function (a, b) { return a.changed_at < b.changed_at ? -1 : (a.changed_at > b.changed_at ? 1 : 0); });
  if (list.length > 0) {
    var f = list[0].snapshot || {};
    if (n(f.deposit_amount) > 0) out.push({ at: null, kind: 'start', field: '선금', amount: n(f.deposit_amount), date: f.deposit_date || '' });
    if (n(f.balance_amount) > 0) out.push({ at: null, kind: 'start', field: '잔금', amount: n(f.balance_amount), date: f.balance_date || '' });
  }
  for (var i = 0; i < list.length; i++) {
    var before = list[i].snapshot || {};
    var after = (i + 1 < list.length) ? (list[i + 1].snapshot || {}) : (cur || {});
    [['선금', 'deposit_amount', 'deposit_date'], ['잔금', 'balance_amount', 'balance_date']].forEach(function (k) {
      var b = n(before[k[1]]), a = n(after[k[1]]);
      if (a !== b) {
        out.push({
          at: list[i].changed_at, kind: a > b ? 'add' : 'cut', field: k[0],
          amount: a - b, date: after[k[2]] || '', total: a
        });
      }
    });
  }
  return out;
}

function formatPayHistoryLine(e) {
  var fmtN = function (v) { return Math.abs(v).toLocaleString() + '원'; };
  if (e.kind === 'start') return '이력 시작 전부터 있던 ' + e.field + ' ' + fmtN(e.amount) + (e.date ? ' (입금일 ' + e.date + ')' : '');
  var t = '';
  if (e.at) {
    var d = new Date(e.at);
    if (!isNaN(d.getTime())) {
      var kst = new Date(d.getTime() + 9 * 3600 * 1000);
      var p2 = function (x) { return (x < 10 ? '0' : '') + x; };
      t = (kst.getUTCMonth() + 1) + '/' + kst.getUTCDate() + ' ' + p2(kst.getUTCHours()) + ':' + p2(kst.getUTCMinutes()) + ' · ';
    }
  }
  if (e.kind === 'add') return t + e.field + ' +' + fmtN(e.amount) + ' (합계 ' + fmtN(e.total) + ')' + (e.date ? ' · 입금일 ' + e.date : ' · 입금일 없음');
  return t + e.field + ' 감액 -' + fmtN(e.amount) + ' (합계 ' + fmtN(e.total) + ') · 환불 또는 정정';
}

// 결제 섹션 아래에 접힌 "입금 내역 보기"를 붙임. 누르면 그때 서버에서 읽음(화면이 느려지지 않게).
function appendPayHistory(paySec, est) {
  if (!est || !est.id || typeof sbXHR !== 'function') return;
  var wrap = document.createElement('div');
  wrap.className = 'pay-history';
  wrap.style.cssText = 'margin-top:10px';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '입금 내역 보기';
  btn.style.cssText = 'padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:#fff;font-size:12px;font-weight:700;color:var(--sub);cursor:pointer';
  var box = document.createElement('div');
  box.className = 'pay-history-box';
  box.style.cssText = 'display:none;margin-top:8px;padding:10px 12px;background:#FAF8F5;border-radius:10px;font-size:12px;line-height:1.7;color:var(--dark)';
  var loaded = false;
  btn.addEventListener('click', function () {
    var open = box.style.display !== 'none';
    if (open) { box.style.display = 'none'; btn.textContent = '입금 내역 보기'; return; }
    box.style.display = '';
    btn.textContent = '입금 내역 닫기';
    if (loaded) return;
    box.textContent = '불러오는 중…';
    sbXHR('GET', 'estimate_history?estimate_id=eq.' + encodeURIComponent(est.id) + '&select=changed_at,snapshot&order=changed_at.asc', null, function (err, rows) {
      box.innerHTML = '';
      if (err) { box.textContent = '내역을 불러오지 못했어요. 잠시 후 다시 눌러주세요.'; return; }
      loaded = true;
      var cur = {
        deposit_amount: est.depositAmount, deposit_date: est.depositDate,
        balance_amount: est.balanceAmount, balance_date: est.balanceDate
      };
      var entries = buildPayHistoryEntries(rows || [], cur);
      if (entries.length === 0) {
        box.textContent = '기록된 입금 변동이 아직 없어요.';
      } else {
        entries.forEach(function (e) {
          var line = document.createElement('div');
          line.textContent = formatPayHistoryLine(e);
          if (e.kind === 'cut') line.style.color = '#B3261E';
          box.appendChild(line);
        });
      }
      var note = document.createElement('div');
      note.style.cssText = 'margin-top:6px;font-size:11px;color:var(--sub)';
      note.textContent = '※ 2026-09-15 이후 변경만 기록돼요. 누가 바꿨는지는 기록되지 않아요.';
      box.appendChild(note);
    });
  });
  wrap.appendChild(btn); wrap.appendChild(box);
  paySec.appendChild(wrap);
}
