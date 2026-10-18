// dash-stale-code.js — 대시보드: "열어 둔 화면의 프로그램(코드)이 옛 버전인지" 알려줌 (2026-10-18 신규)
// 배경: 페이지는 새로 열 때만 최신 코드를 받음. 탭을 계속 열어 둔 화면은 며칠 전 코드로 계속 동작해서,
// 이미 고친 문제(예: 확정/입금 저장 누락)가 그 화면에서만 계속 재현됨. 견적서 앱엔 10/18 먼저 적용(est-stale-watch.js), 대시보드에도 같은 안내.
// 동작: 화면이 다시 보일 때/5분마다 서버의 최신 페이지를 받아 스크립트 ?v= 버전을 비교, 다르면 위쪽에 안내.
//       작성 중 내용이 날아가지 않게 자동 새로고침은 하지 않음. 조회 실패는 조용히 넘어감.
function dashCollectScriptVersions(html) {
  var out = {};
  var re = /<script[^>]+src="([^"?]+)\?v=([A-Za-z0-9]+)"/g, m;
  while ((m = re.exec(html)) !== null) out[m[1]] = m[2];
  return out;
}

function dashFindStaleScripts(running, latest) {
  var diff = [];
  for (var p in running) {
    if (Object.prototype.hasOwnProperty.call(running, p) && Object.prototype.hasOwnProperty.call(latest, p) && running[p] !== latest[p]) diff.push(p);
  }
  return diff;
}

function dashShowCodeStaleBanner(diff) {
  try {
    if (document.getElementById('dash-code-stale-banner')) return;
    var bar = document.createElement('div');
    bar.id = 'dash-code-stale-banner';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999999;background:#FDE3E0;border-bottom:1px solid #D9534F;color:#6B1410;padding:10px 14px;font-size:13px;line-height:1.5;display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    var t = document.createElement('span');
    t.textContent = '🔄 새 버전이 나왔어요. 이 화면은 옛 버전이라 입금·확정 같은 저장이 반영되지 않을 수 있어요. 작성 중인 내용은 먼저 저장한 뒤 새로고침해 주세요.';
    var go = document.createElement('button');
    go.type = 'button'; go.id = 'dash-code-stale-reload';
    go.textContent = '새로고침';
    go.style.cssText = 'padding:6px 12px;border:none;border-radius:8px;background:#282828;color:#fff;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer';
    go.onclick = function () { location.reload(); };
    var close = document.createElement('button');
    close.type = 'button'; close.id = 'dash-code-stale-close';
    close.textContent = '닫기';
    close.style.cssText = 'padding:6px 10px;border:none;background:none;color:#8a3a35;font-size:13px;font-family:inherit;cursor:pointer';
    close.onclick = function () { bar.remove(); };
    bar.appendChild(t); bar.appendChild(go); bar.appendChild(close);
    document.body.appendChild(bar);
    /** @type {any} */ (window)._dashCodeStaleDiff = diff;
  } catch (e) { /* 안내가 안 떠도 동작은 그대로 */ }
}

// 이 파일은 <head>에서 읽힐 수 있어서, 실행 중인 스크립트 목록은 "페이지가 다 열린 뒤" 처음 확인할 때 화면(DOM)에서 읽음
var _dashRunningScriptVersions = null;
function dashReadRunningVersions() {
  var out = {};
  try {
    var list = document.querySelectorAll('script[src]');
    for (var i = 0; i < list.length; i++) {
      var src = list[i].getAttribute('src') || '';
      var m = /^([^?]+)\?v=([A-Za-z0-9]+)$/.exec(src);
      if (m) out[m[1]] = m[2];
    }
  } catch (e) { /* ignore */ }
  return out;
}
var _dashCodeStaleLastCheck = 0;
function dashCheckCodeStale(force) {
  try {
    if (document.getElementById('dash-code-stale-banner')) return;
    if (typeof fetch !== 'function') return;
    if (document.readyState !== 'complete') return; // 페이지가 다 열리기 전엔 비교하지 않음
    if (!_dashRunningScriptVersions) _dashRunningScriptVersions = dashReadRunningVersions();
    var now = Date.now();
    if (!force && now - _dashCodeStaleLastCheck < 60000) return;
    _dashCodeStaleLastCheck = now;
    fetch(location.pathname, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (html) {
        if (!html) return;
        var diff = dashFindStaleScripts(_dashRunningScriptVersions, dashCollectScriptVersions(html));
        if (diff.length) dashShowCodeStaleBanner(diff);
      })
      .catch(function () { /* 조회 실패는 조용히 넘어감 */ });
  } catch (e) { /* ignore */ }
}
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') dashCheckCodeStale(false); });
window.addEventListener('focus', function () { dashCheckCodeStale(false); });
window.addEventListener('pageshow', function () { dashCheckCodeStale(false); });
setInterval(function () { if (document.visibilityState === 'visible') dashCheckCodeStale(true); }, 300000);
