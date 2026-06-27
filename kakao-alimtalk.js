// ════════════════════════════════════════════════
// 드로잉엣홈 DAH — 카카오 알림톡 연동
// dah-dashboard.html 의 <script> 안에 추가하거나
// 별도 kakao-noti.js 로 import 하세요
// ════════════════════════════════════════════════

// ⚠️ 실제 사용 시 비즈메시지 API 키로 교체 필요
var KAKAO_BIZ_KEY  = 'YOUR_BIZ_API_KEY';
var KAKAO_SENDER   = 'YOUR_SENDER_KEY'; // 카카오채널 발신프로필
var KAKAO_SERVER   = 'https://api-alimtalk.kakao.com/v2/services/';

/* ── 템플릿 코드 (카카오 비즈메시지 등록 후 발급) ── */
var KAKAO_TEMPLATES = {
  welcome:  'DAH_WELCOME_01',   // 예약 확인
  measure:  'DAH_MEASURE_01',   // 실측 예약
  install:  'DAH_INSTALL_01',   // 시공 확정 + 잔금
};

/* ── 알림톡 발송 (비즈메시지 파트너사 API 경유) ── */
function sendAlimtalk(templateCode, phone, params) {
  // 실제 구현 시 파트너사 API 문서에 따라 수정
  var payload = {
    senderKey:    KAKAO_SENDER,
    templateCode: templateCode,
    to:           phone.replace(/-/g, ''),
    params:       params,
  };
  
  // fetch 방식 (CORS 이슈로 서버사이드 처리 권장)
  return fetch(KAKAO_SERVER + KAKAO_BIZ_KEY + '/messages', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + KAKAO_BIZ_KEY,
    },
    body: JSON.stringify(payload),
  }).then(function(r) { return r.json(); });
}

/* ── 1. 예약 확인 알림톡 ── */
function sendWelcomeNoti(customer) {
  if (!customer.phone) { showToast('연락처가 없습니다'); return; }
  var params = {
    '#{고객명}':  customer.clientName,
    '#{방문일}':  formatKorDate(customer.date),
    '#{설문URL}': 'https://dah-estimate.vercel.app/survey',
  };
  return sendAlimtalk(KAKAO_TEMPLATES.welcome, customer.phone, params)
    .then(function() { showToast('예약 확인 알림톡 발송 완료'); })
    .catch(function(e) { showToast('알림톡 발송 실패: ' + e.message); });
}

/* ── 2. 실측 예약 알림톡 ── */
function sendMeasureNoti(customer) {
  if (!customer.phone) { showToast('연락처가 없습니다'); return; }
  var params = {
    '#{고객명}':  customer.clientName,
    '#{실측일}':  formatKorDate(customer.measureDate),
    '#{주소}':    customer.addr || '주소 미입력',
    '#{담당자}':  customer.staffName || '장선혜',
  };
  return sendAlimtalk(KAKAO_TEMPLATES.measure, customer.phone, params)
    .then(function() { showToast('실측 예약 알림톡 발송 완료'); })
    .catch(function(e) { showToast('알림톡 발송 실패: ' + e.message); });
}

/* ── 3. 시공 확정 + 잔금 알림톡 ── */
function sendInstallNoti(customer) {
  if (!customer.phone) { showToast('연락처가 없습니다'); return; }
  var params = {
    '#{고객명}':  customer.clientName,
    '#{시공일}':  formatKorDate(customer.installDate),
    '#{잔금액}':  Number(customer.balanceAmount || 0).toLocaleString(),
  };
  return sendAlimtalk(KAKAO_TEMPLATES.install, customer.phone, params)
    .then(function() { showToast('시공 확정 알림톡 발송 완료'); })
    .catch(function(e) { showToast('알림톡 발송 실패: ' + e.message); });
}

/* ── 날짜 포맷 ── */
function formatKorDate(dateStr) {
  if (!dateStr) return '미정';
  var d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  var days = ['일','월','화','수','목','금','토'];
  return (d.getMonth()+1) + '월 ' + d.getDate() + '일 ' + days[d.getDay()] + '요일';
}
