// ══════════════════════════════════════════════════════════
// 데이터 점검 카드 (2026-10-11, 선혜님 "전문업체 기준 보완" 요청)
// DB의 data_integrity_issues 뷰(견적서 없는 고객, 입금 초과, 담당자 없음, 확정견적 중복 등 이상 데이터 목록)를 읽어
// 이상이 있을 때 홈 상단에 카드로 보여줌. 뷰는 로그인한 사람의 권한(RLS)대로만 보이므로 실장은 본인 고객 것만 보임.
// "확인함" 기록은 이 기기가 아니라 DB(integrity_acks: 누가/언제/메모)에 저장 - 마스터와 실장이 같은 상태를 봄.
// 점검이 조용히 실패하면 "문제없음"처럼 보여 더 위험하므로, 항상 "마지막 점검 시각"을 보여주고 조회 실패는 눈에 띄게 알림.
// 이 기능은 DB를 읽기만 하고(확인 기록 제외) 고객/견적 데이터는 절대 고치지 않음.
// ══════════════════════════════════════════════════════════
var _integrityCache = { at: 0, rows: null, acks: null };

function _integrityEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

// 금액이 들어간 항목만 천 단위 쉼표로 보기 좋게(견적서 번호 같은 다른 숫자는 건드리지 않음)
function _integrityDetail(r) {
  var d = String(r.detail == null ? '' : r.detail);
  if (r.code === 'OVERPAID' || r.code === 'PRICE_DIFF') d = d.replace(/\d{4,}/g, function (n) { return Number(n).toLocaleString(); });
  return d;
}

// 항목의 고유키 - 내용(금액 등)이 바뀌면 키가 달라져서 이미 확인한 항목도 다시 뜸
function _integrityKey(r) { return [r.code, r.customer_id || '', r.detail || ''].join('|'); }

var INTEGRITY_LABELS = {
  NO_ESTIMATE: '견적서 없음', PAID_STAGE_NO_DEPOSIT: '입금 기록 없음', DONE_NO_INSTALL_DATE: '시공일 없음',
  OVERPAID: '입금 초과', NO_STAFF: '담당자 없음', MULTI_FINAL: '확정견적 중복', ORPHAN_ESTIMATE: '고객 없는 견적서', PRICE_DIFF: '금액 다름', HIDDEN_ESTIMATE: '숨김 견적서'
};

function _integrityTime(ts) {
  var d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function renderIntegrityBanner(forceFetch) {
  var wrap = document.getElementById('home');
  if (!wrap || typeof sbXHR !== 'function') return;
  var draw = function (rows, acks, checkedAt, failed) {
    var old = document.getElementById('integrity-banner');
    if (old) old.remove();
    var box = document.createElement('div');
    box.id = 'integrity-banner';
    if (failed) {
      // 점검 실패를 숨기면 "이상 없음"으로 오해하므로 눈에 띄게 알림(이전 결과가 있으면 그 시각도 함께)
      box.style.cssText = 'background:#EEE;border-bottom:1px solid #CCC;padding:6px 20px;font-size:11px;color:#666;cursor:pointer';
      box.textContent = '⚠️ 데이터 점검을 불러오지 못했어요 (이상이 없다는 뜻이 아니에요) — 눌러서 다시 시도' + (_integrityCache.at ? ' · 마지막 성공 ' + _integrityTime(_integrityCache.at) : '');
      box.onclick = function () { renderIntegrityBanner(true); };
      wrap.insertBefore(box, wrap.firstChild);
      return;
    }
    var shown = (rows || []).filter(function (r) { return !acks[_integrityKey(r)]; });
    var timeLabel = '마지막 점검 ' + _integrityTime(checkedAt);
    if (!shown.length) {
      box.style.cssText = 'background:#F1F6EE;border-bottom:1px solid #D5E3CC;padding:6px 20px;font-size:11px;color:#4C6B3C';
      box.textContent = '✅ 데이터 점검 정상 · ' + timeLabel;
      wrap.insertBefore(box, wrap.firstChild);
      return;
    }
    var warnCount = shown.filter(function (r) { return r.severity === 'warn'; }).length;
    var color = warnCount ? '#C0392B' : '#8A6D1D';
    box.style.cssText = 'background:' + (warnCount ? '#FBEAE7' : '#FBF4DF') + ';border-bottom:2px solid ' + (warnCount ? '#E4483A' : '#D9B44A') + ';padding:12px 20px';
    var head = '<div id="integrity-head" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer"><span style="font-size:13px;font-weight:700;color:' + color + '">🔎 데이터 점검: 확인할 항목 ' + shown.length + '건' + (warnCount ? ' (중요 ' + warnCount + ')' : '') + '</span><span style="font-size:12px;font-weight:700;color:' + color + '">펼치기 ▾</span></div>';
    var list = shown.map(function (r, i) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid rgba(0,0,0,0.08);font-size:12px;color:#333">' +
        '<span><b>' + _integrityEsc(r.client_name || '(이름 없음)') + '</b> · ' + _integrityEsc(INTEGRITY_LABELS[r.code] || r.code) + ' — ' + _integrityEsc(_integrityDetail(r)) + '</span>' +
        '<button data-i="' + i + '" class="integrity-ok" style="flex:none;background:#fff;border:1px solid #bbb;border-radius:8px;padding:3px 8px;font-size:11px;cursor:pointer;font-family:inherit">확인함</button></div>';
    }).join('');
    box.innerHTML = head + '<div id="integrity-list" style="display:none;margin-top:8px">' + list +
      '<div style="margin-top:6px;font-size:10px;color:#777">' + timeLabel + ' · "확인함"은 누가 언제 확인했는지 기록되고 모두에게 반영돼요</div></div>';
    wrap.insertBefore(box, wrap.firstChild);
    document.getElementById('integrity-head').onclick = function () {
      var l = document.getElementById('integrity-list');
      l.style.display = l.style.display === 'none' ? 'block' : 'none';
    };
    Array.prototype.forEach.call(box.querySelectorAll('.integrity-ok'), function (b) {
      b.onclick = function () {
        var r = shown[Number(b.getAttribute('data-i'))];
        var note = prompt((r.client_name || '') + ' — ' + _integrityDetail(r) + '\n\n확인 메모를 남겨주세요 (예: 환불 예정, 10/20 처리). 비워도 돼요.');
        if (note === null) return; // 취소
        b.disabled = true;
        sbXHR('POST', 'integrity_acks', {
          ack_key: _integrityKey(r), code: r.code, customer_id: r.customer_id || null, client_name: r.client_name || null,
          note: (note || '').trim() || null, acked_by_name: (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || null
        }, function (err) {
          // 이미 누가 확인한 항목(중복 키 409)도 성공으로 취급. 그 외 실패면 숨기지 않고 알림.
          if (err && err.status !== 409) { b.disabled = false; if (typeof showToast === 'function') showToast('⚠️ 확인 기록을 저장하지 못했어요 — 다시 눌러주세요'); return; }
          acks[_integrityKey(r)] = true;
          _integrityCache.acks = acks;
          draw(rows, acks, checkedAt, false);
        });
      };
    });
  };
  // 5분 안에 이미 조회했으면 다시 조회하지 않고 그 결과로 그림(홈이 자주 다시 그려져도 서버 부담 없게)
  if (!forceFetch && _integrityCache.rows && Date.now() - _integrityCache.at < 300000) { draw(_integrityCache.rows, _integrityCache.acks || {}, _integrityCache.at, false); return; }
  sbXHR('GET', 'data_integrity_issues?select=code,severity,customer_id,client_name,staff_name,detail&limit=200', null, function (err, rows) {
    if (err || !Array.isArray(rows)) { draw(null, {}, Date.now(), true); return; }
    sbXHR('GET', 'integrity_acks?select=ack_key&limit=1000', null, function (err2, ackRows) {
      if (err2 || !Array.isArray(ackRows)) { draw(null, {}, Date.now(), true); return; }
      var acks = {};
      ackRows.forEach(function (a) { acks[a.ack_key] = true; });
      _integrityCache = { at: Date.now(), rows: rows, acks: acks };
      draw(rows, acks, _integrityCache.at, false);
    });
  });
}
