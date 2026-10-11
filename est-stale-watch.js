// est-stale-watch.js — 견적서 앱: "내가 열어 둔 화면이 옛날 내용이 됐는지" 미리 알려줌 (2026-10-11 신규)
// 선혜님 지적: 한 사람이 기기를 번갈아 써도(태블릿↔PC) 열어 둔 쪽 화면은 옛 내용이 되는데, 지금은 저장을 눌러야 알게 됨.
// 화면이 다시 보일 때(탭 전환/기기 복귀/앱 복귀) 서버의 마지막 수정 시각만 가볍게 조회해서 내가 연 시점과 다르면,
// 입력 전에 위쪽에 안내를 띄움. 입력 중인 내용은 절대 건드리지 않음(누를 때만 최신 내용을 불러옴).
function estIsStaleLock(lock, fresh) {
  if (!lock || !fresh) return false;
  var a = Date.parse(lock), b = Date.parse(fresh);
  if (isNaN(a) || isNaN(b)) return String(lock) !== String(fresh);
  return b > a;
}

function estShowStaleBanner(estId) {
  try {
    if (document.getElementById('est-stale-banner')) return;
    var bar = document.createElement('div');
    bar.id = 'est-stale-banner';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999998;background:#FFF3D6;border-bottom:1px solid #E0B050;color:#5A3B00;padding:10px 14px;font-size:13px;line-height:1.5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;box-sizing:border-box';
    var t = document.createElement('span');
    t.textContent = '이 견적서가 다른 기기나 창에서 수정됐어요. 이 화면은 이전 내용이에요.';
    var load = document.createElement('button');
    load.type = 'button'; load.id = 'est-stale-load';
    load.textContent = '최신으로 불러오기';
    load.style.cssText = 'padding:6px 12px;border:none;border-radius:8px;background:#282828;color:#fff;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer';
    load.onclick = function () { location.href = location.pathname + '?loadEstDbId=' + encodeURIComponent(estId) + '&mode=edit'; };
    var close = document.createElement('button');
    close.type = 'button'; close.id = 'est-stale-close';
    close.textContent = '닫기';
    close.style.cssText = 'padding:6px 10px;border:none;background:none;color:#7a5a20;font-size:13px;font-family:inherit;cursor:pointer';
    close.onclick = function () { bar.remove(); };
    bar.appendChild(t); bar.appendChild(load); bar.appendChild(close);
    document.body.appendChild(bar);
  } catch (e) { /* 안내가 안 떠도 저장 보호(충돌 선택창)는 그대로 */ }
}

var _estStaleLastCheck = 0;
function estCheckStale(force) {
  try {
    var st = window._estEditState || {};
    var id = st.editingEstDbId, lock = st.editingEstUpdatedAt;
    if (!id || !lock || typeof fetchLatestUpdatedAt !== 'function') return;
    var now = Date.now();
    if (!force && now - _estStaleLastCheck < 15000) return; // 너무 자주 조회하지 않음
    _estStaleLastCheck = now;
    fetchLatestUpdatedAt('estimates', id, function (fresh) {
      var cur = window._estEditState || {};
      if (cur.editingEstDbId !== id) return;
      if (estIsStaleLock(cur.editingEstUpdatedAt, fresh)) estShowStaleBanner(id);
    });
  } catch (e) { /* 조회 실패는 조용히 넘어감 */ }
}

document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') estCheckStale(false); });
window.addEventListener('focus', function () { estCheckStale(false); });
window.addEventListener('pageshow', function () { estCheckStale(false); });

// 화면을 계속 켜 둔 채(탭 전환 없이) 다른 기기에서 먼저 저장하는 경우도 있어서, 보이는 동안 45초마다 한 번 가볍게 확인함.
// 기존 견적서를 열어 둔 때만 동작(새 견적서/안 보일 땐 조회 안 함). 한 번 안내가 뜨면 같은 안내를 또 만들지 않음.
var _estStaleTimer = setInterval(function () {
  if (document.visibilityState !== 'visible') return;
  if (document.getElementById('est-stale-banner')) return;
  estCheckStale(true);
}, 45000);
