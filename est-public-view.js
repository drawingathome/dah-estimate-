/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 고객용 공개보기 모드
   2026-09-14(선혜님 지시 — "결제링크처럼 견적서도 알림톡 버튼으로
   보내야 해"): 로그인 없이 URL(?view=견적ID)만으로 그 고객의 가견적/
   확정견적을 읽기전용으로 볼 수 있게 함. 기존 buildCustomerHTML()이
   만드는 문서 디자인을 그대로 재사용 — 새 디자인 안 만듦.
   보안모델: 견적 id(UUID)는 추측 불가능한 값이라 "링크를 아는 사람만
   볼 수 있음"을 보안경계로 삼음(구글독스 "링크가 있는 사람" 공유와
   동일한 방식) — 별도 비밀번호/토큰 시스템은 안 만듦.
   ══════════════════════════════════════════════════ */

function loadEstimateForPublicView(estId) {
  document.body.classList.add('public-view-mode');
  showPublicViewLoading();

  var xhr = new XMLHttpRequest();
  xhr.open('GET', SUPABASE_URL + '/rest/v1/estimates?id=eq.' + encodeURIComponent(estId) + '&select=*', true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_KEY); // 로그인 없이 anon 키로만 조회(공개 SELECT 정책)
  xhr.onload = function() {
    var rows;
    try { rows = JSON.parse(xhr.responseText); } catch (e) { showPublicViewError('견적서를 불러오는 중 문제가 발생했어요.'); return; }
    var row = rows && rows[0];
    if (!row) { showPublicViewError('견적서를 찾을 수 없어요. 링크를 다시 확인해주세요.'); return; }
    try {
      renderPublicViewFromRow(row);
    } catch (e) {
      showPublicViewError('견적서를 표시하는 중 문제가 발생했어요.');
    }
  };
  xhr.onerror = function() { showPublicViewError('네트워크 연결을 확인해주세요.'); };
  xhr.send();
}

function renderPublicViewFromRow(row) {
  document.getElementById('c-name').value = row.customer_name || '';
  document.getElementById('c-phone').value = row.phone || '';
  document.getElementById('c-staff').value = row.staff_name || '';
  if (document.getElementById('c-install')) document.getElementById('c-install').value = row.install_date || '';

  // 2026-09-14: 이 견적이 확정견적인지 가견적인지에 따라 문서 상단
  // 라벨("가견적서"/"최종 견적서")이 buildCustomerHTML() 안에서
  // currentTab 값으로 갈리므로 동일하게 맞춰줌.
  window.currentTab = (row.contract_status === 'confirmed' || row.estimate_status === '확정') ? 'final' : 'ga';
  var statusFinalEl = document.getElementById('status-final');
  if (statusFinalEl) statusFinalEl.classList[window.currentTab === 'final' ? 'add' : 'remove']('on');

  restoreLineItemsToForm(row.line_items || [], '');

  // restoreLineItemsToForm이 각 행에 값만 채우고 발생시키는 change 이벤트로
  // calcTotal()이 뒤이어 실행되는 구조라, 그 계산이 끝난 다음 프레임에
  // buildCustomerHTML을 호출해야 합계(sum-total 등)가 정확히 반영됨.
  setTimeout(function() {
    if (typeof calcTotal === 'function') calcTotal();
    setTimeout(function() {
      var html = buildCustomerHTML();
      showPublicViewContent(html);
    }, 50);
  }, 250);
}

function showPublicViewLoading() {
  var c = document.getElementById('public-view-container');
  c.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;color:#8E8078;font-size:13px">불러오는 중...</div>';
}

function showPublicViewError(msg) {
  var c = document.getElementById('public-view-container');
  c.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;text-align:center;color:#8E8078;font-size:13px">' + msg.replace(/[<>&]/g, function(ch){ return {'<':'&lt;','>':'&gt;','&':'&amp;'}[ch]; }) + '</div>';
}

function showPublicViewContent(html) {
  var c = document.getElementById('public-view-container');
  c.innerHTML = html;
}
