// ══════════════════════════════════════════════════════════
// 데이터 점검 카드 (2026-10-11, 선혜님 "전문업체 기준 보완" 요청)
// DB의 data_integrity_issues 뷰(견적서 없는 고객, 입금 초과, 담당자 없음, 확정견적 중복 등 이상 데이터 목록)를 읽어
// 이상이 있을 때만 홈 상단에 카드로 보여줌. 뷰는 로그인한 사람의 권한(RLS)대로만 보이므로 실장은 본인 고객 것만 보임.
// "확인함"을 누르면 그 항목은 이 브라우저에서 숨김(내용이 바뀌면 다시 뜸). DB는 건드리지 않음(읽기 전용).
// ══════════════════════════════════════════════════════════
var _integrityCache = { at: 0, rows: null };
var INTEGRITY_DISMISS_KEY = 'dah_integrity_dismissed';

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

function _integrityKey(r) { return [r.code, r.customer_id || '', r.client_name || '', r.detail || ''].join('|'); }

function _integrityDismissed() {
  try { return JSON.parse(localStorage.getItem(INTEGRITY_DISMISS_KEY) || '[]') || []; } catch (e) { return []; }
}

var INTEGRITY_LABELS = {
  NO_ESTIMATE: '견적서 없음', PAID_STAGE_NO_DEPOSIT: '입금 기록 없음', DONE_NO_INSTALL_DATE: '시공일 없음',
  OVERPAID: '입금 초과', NO_STAFF: '담당자 없음', MULTI_FINAL: '확정견적 중복', ORPHAN_ESTIMATE: '고객 없는 견적서', PRICE_DIFF: '금액 다름'
};

function renderIntegrityBanner(forceFetch) {
  var wrap = document.getElementById('home');
  if (!wrap || typeof sbXHR !== 'function') return;
  var draw = function (rows) {
    var old = document.getElementById('integrity-banner');
    if (old) old.remove();
    var hidden = _integrityDismissed();
    var shown = (rows || []).filter(function (r) { return hidden.indexOf(_integrityKey(r)) < 0; });
    if (!shown.length) return;
    var warnCount = shown.filter(function (r) { return r.severity === 'warn'; }).length;
    var box = document.createElement('div');
    box.id = 'integrity-banner';
    var color = warnCount ? '#C0392B' : '#8A6D1D';
    box.style.cssText = 'background:' + (warnCount ? '#FBEAE7' : '#FBF4DF') + ';border-bottom:2px solid ' + (warnCount ? '#E4483A' : '#D9B44A') + ';padding:12px 20px';
    var head = '<div id="integrity-head" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer"><span style="font-size:13px;font-weight:700;color:' + color + '">🔎 데이터 점검: 확인할 항목 ' + shown.length + '건' + (warnCount ? ' (중요 ' + warnCount + ')' : '') + '</span><span style="font-size:12px;font-weight:700;color:' + color + '">펼치기 ▾</span></div>';
    var list = shown.map(function (r, i) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid rgba(0,0,0,0.08);font-size:12px;color:#333">' +
        '<span><b>' + _integrityEsc(r.client_name || '(이름 없음)') + '</b> · ' + _integrityEsc(INTEGRITY_LABELS[r.code] || r.code) + ' — ' + _integrityEsc(_integrityDetail(r)) + '</span>' +
        '<button data-i="' + i + '" class="integrity-ok" style="flex:none;background:#fff;border:1px solid #bbb;border-radius:8px;padding:3px 8px;font-size:11px;cursor:pointer;font-family:inherit">확인함</button></div>';
    }).join('');
    box.innerHTML = head + '<div id="integrity-list" style="display:none;margin-top:8px">' + list + '</div>';
    wrap.insertBefore(box, wrap.firstChild);
    document.getElementById('integrity-head').onclick = function () {
      var l = document.getElementById('integrity-list');
      l.style.display = l.style.display === 'none' ? 'block' : 'none';
    };
    Array.prototype.forEach.call(box.querySelectorAll('.integrity-ok'), function (b) {
      b.onclick = function () {
        var r = shown[Number(b.getAttribute('data-i'))];
        var h = _integrityDismissed(); h.push(_integrityKey(r));
        try { localStorage.setItem(INTEGRITY_DISMISS_KEY, JSON.stringify(h)); } catch (e) {}
        draw(rows);
      };
    });
  };
  // 5분 안에 이미 조회했으면 다시 조회하지 않고 그 결과로 그림(홈이 자주 다시 그려져도 서버 부담 없게)
  if (!forceFetch && _integrityCache.rows && Date.now() - _integrityCache.at < 300000) { draw(_integrityCache.rows); return; }
  sbXHR('GET', 'data_integrity_issues?select=code,severity,customer_id,client_name,staff_name,detail&limit=200', null, function (err, rows) {
    if (err || !Array.isArray(rows)) return; // 점검 카드는 보조 기능 - 실패해도 홈 화면에 영향 없게 조용히 넘김
    _integrityCache = { at: Date.now(), rows: rows };
    draw(rows);
  });
}
