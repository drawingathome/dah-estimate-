/* ══════════════════════════════════════════════════
   DAH 대시보드 — 앱 핵심 진입점 함수
   화면 전환(탭 이동), 토스트 알림 — 다른 모든 모듈이 공통으로 사용.
   ══════════════════════════════════════════════════ */

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(function() { t.style.opacity = '0'; }, 2500);
}

/** @param {string} t 탭ID (home|pipe|search|est-list|cal|chart|settings) */
function goTab(t) {
  ['home','pipe','est-list','search','cal','chart','settings'].forEach(function(id) { var el2 = document.getElementById(id); if(el2) el2.style.display = id === t ? 'block' : 'none'; });
  document.querySelectorAll('.tab').forEach(function(b) { b.className = b.getAttribute('data-tab') === t ? 'tab on' : 'tab'; });
  if (t !== 'home' && t !== 'settings' && typeof hideQuickNav === 'function') hideQuickNav();
  if (t === 'home') loadCustomersAsync(renderHome);
  if (t === 'pipe') loadCustomersAsync(renderPipe);
  if (t === 'est-list') renderEstList();
  if (t === 'search') loadCustomersAsync(renderSearch);
  if (t === 'cal') loadCustomersAsync(renderCal);
  if (t === 'settings') renderSettings();
  if (t === 'chart') loadCustomersAsync(function(){ renderChart(currentChartPeriod); });

  if (typeof window.updateMobNav === 'function') window.updateMobNav(t);
}
