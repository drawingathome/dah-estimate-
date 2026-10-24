/* ══════════════════════════════════════════════════
   DAH 대시보드 — 앱 핵심 진입점 함수
   화면 전환(탭 이동) — 다른 모든 모듈이 공통으로 사용.
   ══════════════════════════════════════════════════ */

// 2026-09-16(선혜님 - "링크 너가 나한테 준거잖아"): showToast는
// shared-common-utils.js로 옮김(#toast 마크업이 이 파일보다 먼저
// 로드되는 dah-dashboard.html에 이미 있음) - 이 파일의 정의는 삭제.

/** @param {string} t 탭ID (home|pipe|search|est-list|cal|chart|settings) */
function goTab(t) {
  // 2026-08-14: 설정 화면은 마스터 전용(선혜님 지적) — 버튼을 숨기는 것만으론
  // 개발자도구나 코드로 goTab('settings')를 직접 호출하면 들어가지므로,
  // 진입점 자체에서 차단. 거래처목록/지역출장비 등 가게 전체 설정 보호 +
  // 마스터 비밀번호 재설정 메일 오발송 방지.
  if (t === 'settings' && !(isMasterUser())) {
    if (typeof showToast === 'function') showToast('설정은 마스터만 접근할 수 있어요');
    return;
  }
  if (typeof logEvent === 'function') logEvent('tab_view', { tab: t });
  ['home','pipe','est-list','search','cal','chart','settings'].forEach(function(id) { var el2 = document.getElementById(id); if(el2) el2.style.display = id === t ? 'block' : 'none'; });
  document.querySelectorAll('.tab').forEach(function(b) { b.className = b.getAttribute('data-tab') === t ? 'tab on' : 'tab'; });
  if (t !== 'home' && t !== 'settings' && typeof hideQuickNav === 'function') hideQuickNav();
  // 2026-08-05: 콜백에 함수를 그대로 넘기면 로드된 배열이 함수의 첫 매개변수 자리로
  // 들어가는 시그니처 불일치 위험이 있어(7-2 규칙), 실제로 인자를 쓰는지 여부와 무관하게
  // 전부 명시적으로 래핑. renderHome은 이미 로드된 데이터를 skipServerFetch=true로 재사용.
  // 2026-10-24: 이 기기의 견적서 복사본(dah_saved)이 낡아 알림톡 금액·일정 체크·엑셀 등이 어긋나지 않도록, 탭을 열 때마다 (8초 이내 중복 제외) 최신으로 갱신.
  if (t !== 'est-list' && t !== 'settings' && typeof loadEstimatesAsync === 'function') loadEstimatesAsync(function() {});
  if (t === 'home') loadCustomersAsync(function(){ renderHome(true); });
  if (t === 'pipe') loadCustomersAsync(function(customers){ renderPipe(customers); });
  if (t === 'est-list') loadEstimatesAsync(function(){ renderEstList(); });
  if (t === 'search') loadCustomersAsync(function(){ renderSearch(); });
  if (t === 'cal') loadCustomersAsync(function(){ renderCal(); });
  if (t === 'settings') renderSettings();
  // 2026-10-24: 받은 금액/미수금은 DB 값을 쓰므로, 칸반·고객목록·일정은 열 때 서버값을 받아오고 달라졌으면 한 번 더 그린다.
  if ((t === 'pipe' || t === 'search' || t === 'cal') && typeof refreshServerMoney === 'function') {
    refreshServerMoney(function(changed) {
      var el3 = document.getElementById(t);
      if (!changed || !el3 || el3.style.display !== 'block') return;
      if (t === 'pipe') renderPipe(loadCustomers()); else if (t === 'search') renderSearch(); else renderCal();
    });
  }
  if (t === 'chart') loadCustomersAsync(function(){ renderChart(currentChartPeriod); });

  if (typeof window.updateMobNav === 'function') window.updateMobNav(t);
}
