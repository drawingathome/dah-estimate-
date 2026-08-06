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
  if (typeof logEvent === 'function') logEvent('tab_view', { tab: t });
  ['home','pipe','est-list','search','cal','chart','settings'].forEach(function(id) { var el2 = document.getElementById(id); if(el2) el2.style.display = id === t ? 'block' : 'none'; });
  document.querySelectorAll('.tab').forEach(function(b) { b.className = b.getAttribute('data-tab') === t ? 'tab on' : 'tab'; });
  if (t !== 'home' && t !== 'settings' && typeof hideQuickNav === 'function') hideQuickNav();
  // 2026-08-05: 콜백에 함수를 그대로 넘기면 로드된 배열이 함수의 첫 매개변수 자리로
  // 들어가는 시그니처 불일치 위험이 있어(7-2 규칙), 실제로 인자를 쓰는지 여부와 무관하게
  // 전부 명시적으로 래핑. renderHome은 이미 로드된 데이터를 skipServerFetch=true로 재사용.
  if (t === 'home') loadCustomersAsync(function(){ renderHome(true); });
  if (t === 'pipe') loadCustomersAsync(function(customers){ renderPipe(customers); });
  if (t === 'est-list') loadEstimatesAsync(function(){ renderEstList(); });
  if (t === 'search') loadCustomersAsync(function(){ renderSearch(); });
  if (t === 'cal') loadCustomersAsync(function(){ renderCal(); });
  if (t === 'settings') renderSettings();
  if (t === 'chart') loadCustomersAsync(function(){ renderChart(currentChartPeriod); });

  if (typeof window.updateMobNav === 'function') window.updateMobNav(t);
}
