// dash-whats-new.js — "새 소식" 한 줄 안내 (N-69 ②, 2026-11-02)
// 화면이 바뀌어도 직원이 모르고 지나가는 일을 줄이기 위한 안내. 문구는 이 파일에 고정(DB 변경 없음).
// 새 안내를 내보내려면 WHATS_NEW_VERSION과 WHATS_NEW_LINES만 바꾸면 되고, 사람마다 한 번만 보임(확인을 누르면 이 기기에서 숨김).
// 저장소(localStorage)를 못 쓰는 환경(시크릿 창 등)에서도 오류 없이 동작: 그땐 닫을 때까지만 숨김.
var WHATS_NEW_VERSION = '2026-11-02-stage-auto';
var WHATS_NEW_LINES = [
  '단계가 자동으로 옮겨져요.',
  '선금 + 실측일 확정 → 실측준비중 · 견적서 모두 완납 → 잔금결제 · 필요한 발주 전부 체크 → 시공준비중',
  '뒤로 옮길 때만 직접 옮기고 사유를 적어 주세요.'
];
var _whatsNewDismissed = false;
function _whatsNewSeen() {
  if (_whatsNewDismissed) return true;
  try { return localStorage.getItem('dah_whatsnew_seen') === WHATS_NEW_VERSION; } catch (e) { return false; }
}
function _whatsNewMarkSeen() {
  _whatsNewDismissed = true;
  try { localStorage.setItem('dah_whatsnew_seen', WHATS_NEW_VERSION); } catch (e) { /* 저장 못 해도 이번 화면에서는 숨김 */ }
}
function showWhatsNew() {
  if (_whatsNewSeen()) return false;
  if (document.getElementById('whats-new')) return true;
  if (typeof currentUser === 'undefined' || !currentUser) return false; // 로그인 전에는 안 보임
  var box = document.createElement('div');
  box.id = 'whats-new';
  box.setAttribute('role', 'status');
  box.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:84px;z-index:900;width:min(92vw,520px);box-sizing:border-box;' +
    'background:var(--dark,#3a332c);color:#fff;border-radius:12px;padding:12px 14px;font-size:12px;line-height:1.5;box-shadow:0 6px 24px rgba(0,0,0,.25);display:flex;gap:10px;align-items:flex-start';
  var text = document.createElement('div');
  text.style.cssText = 'flex:1;min-width:0';
  var title = document.createElement('div');
  title.style.cssText = 'font-weight:700;margin-bottom:2px';
  title.textContent = '새 소식 · ' + WHATS_NEW_LINES[0];
  text.appendChild(title);
  for (var i = 1; i < WHATS_NEW_LINES.length; i++) {
    var line = document.createElement('div');
    line.textContent = WHATS_NEW_LINES[i];
    text.appendChild(line);
  }
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'whats-new-ok';
  btn.textContent = '확인';
  btn.style.cssText = 'flex:none;border:1px solid rgba(255,255,255,.5);background:transparent;color:#fff;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;min-height:32px';
  btn.onclick = function () { _whatsNewMarkSeen(); if (box.parentNode) box.parentNode.removeChild(box); };
  box.appendChild(text);
  box.appendChild(btn);
  document.body.appendChild(box);
  return true;
}
// 로그인이 끝나는 시점을 모르므로 1초마다 확인(최대 2분). 보이거나 이미 확인했으면 멈춤.
(function () {
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    var done = false;
    try { done = showWhatsNew() || _whatsNewSeen(); } catch (e) { done = true; }
    if (done || tries > 120) clearInterval(timer);
  }, 1000);
})();
