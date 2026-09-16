// ══════════════════════════════════════════════════════════
// DAH 공용 — 두 앱(대시보드/견적서)에서 완전히 동일하게 써야 하는
// 순수 유틸 함수 모음.
// 2026-09-16(선혜님 - "링크 너가 나한테 준거잖아"로 재확인 후 결정):
// README에 이미 "escHtml/syncCustomerToSheet 등은 아직 각 앱에
// 복사된 채 tests/cross-app-twin-check.js로만 동기화를 지키고
// 있어, 향후 같은 방식으로 정리할 여지가 있음"이라고 적혀있던
// 항목을 실제로 정리함. shared-optimistic-lock.js/shared-staging-
// guard.js와 똑같은 패턴 - 두 앱 모두 이 파일 하나를 그대로
// 로드하므로, 이 파일 안의 로직을 고치면 양쪽에 동시에 반영됨.
// (완전히 별도 Vercel 프로젝트로 배포되지만, 같은 GitHub 저장소를
// 보고 있어서 정적 파일 하나를 양쪽 다 서빙할 수 있음 - 이미 이
// 패턴으로 shared-optimistic-lock.js가 몇 주째 실제로 작동 중.)
//
// 로드 순서 주의: syncCustomerToSheet는 DRIVE_WEBHOOK_URL/
// fetchWithRetry/reportClientError가, showToast는 #toast 엘리먼트가
// 이미 존재해야 함 - 각 앱의 dash-api.js/est-utils.js와 dah-*.html의
// #toast 마크업이 먼저 로드된 뒤에 이 파일을 불러야 함.
// ══════════════════════════════════════════════════════════

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function openKakaoAddr(targetId) {
  var script = document.createElement('script');
  script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  script.onload = function() {
    new daum.Postcode({
      oncomplete: function(data) {
        var addr = data.roadAddress || data.jibunAddress;
        var el = document.getElementById(targetId);
        if (el) {
          el.value = addr;
          el.dispatchEvent(new Event('input'));
          el.dispatchEvent(new Event('change'));
        }
      }
    }).open();
  };

  if (window.daum && window.daum.Postcode) {
    script.onload = null;
    new daum.Postcode({
      oncomplete: function(data) {
        var addr = data.roadAddress || data.jibunAddress;
        var el = document.getElementById(targetId);
        if (el) {
          el.value = addr;
          el.dispatchEvent(new Event('input'));
          el.dispatchEvent(new Event('change'));
        }
      }
    }).open();
  } else {
    document.head.appendChild(script);
  }
}

function syncCustomerToSheet(customer) {
  if (!DRIVE_WEBHOOK_URL) return;
  try {
    fetchWithRetry(DRIVE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'syncCustomer',
        clientName: customer.clientName, phone: customer.phone, addr: customer.addr,
        staffName: customer.staffName, stage: customer.stage,
        price: customer.price, performanceRevenue: customer.performanceRevenue,
        date: customer.date, measureDate: customer.measureDate, installDate: customer.installDate,
        memo: customer.memo
      })
    }).catch(function(e) { console.warn('고객명단 동기화 실패:', e); typeof reportClientError==='function' && reportClientError('고객명단 동기화 실패(재시도 2회 후에도 실패): ' + (e && e.message || e), e && e.stack); });
  } catch (e) { console.warn('고객명단 동기화 실패:', e); typeof reportClientError==='function' && reportClientError('고객명단 동기화 실패: ' + (e && e.message || e), e && e.stack); }
}

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(function() { t.style.opacity = '0'; }, 2500);
}

// 지역별 실측비/시공비 (2026-07-31 신규, 2026-09-16 공용화)
var DEFAULT_REGION_FEES = { '서울': {'실측비':40000, '시공비':50000}, '경기': {'실측비':60000, '시공비':80000} };
function getRegionFees() {
  try {
    var cached = JSON.parse(localStorage.getItem('dah_region_fees') || 'null');
    return cached || DEFAULT_REGION_FEES;
  } catch(e) { return DEFAULT_REGION_FEES; }
}

// 전화번호 포맷 핵심 로직(숫자만 들어와서 하이픈 포맷 문자열로 반환) -
// 2026-08-28에 이미 한 번 "두 앱 결과가 다르다"는 이유로 로직을
// 맞춘 적이 있는데, 그때도 파일은 각자 유지해서 다시 벌어질 위험이
// 있었음. 이제 핵심 로직 자체를 여기 하나로 두고, 각 앱은 자기
// 방식(값 반환 vs 엘리먼트 직접수정)에 맞게 얇은 래퍼만 유지.
// 3자리 이하일 때 하이픈 없이 그대로 두는 처리 포함(전에는 대시보드
// 버전에 이 처리가 없어서 "010" 입력 시점에 "010-"처럼 하이픈이
// 먼저 붙는 미세한 차이가 있었음 - 이번에 통일).
function formatPhoneDigits(digits) {
  var d = digits;
  if (d.slice(0,2) === '02') {
    if (d.length <= 6) return d.slice(0,2) + '-' + d.slice(2);
    if (d.length <= 9) return d.slice(0,2) + '-' + d.slice(2,5) + '-' + d.slice(5);
    return d.slice(0,2) + '-' + d.slice(2,6) + '-' + d.slice(6,10);
  }
  if (d.length <= 3) return d;
  if (d.length <= 7) return d.slice(0,3) + '-' + d.slice(3);
  return d.slice(0,3) + '-' + d.slice(3,7) + '-' + d.slice(7,11);
}
