/* ══════════════════════════════════════════════════
   DAH 대시보드 — 순수 유틸리티 함수 모음
   다른 함수를 호출하지 않고 입력값만으로 계산하는 "순수함수"들만 모아둠.
   (날짜/금액 포맷, 전화번호 포맷, HTML 이스케이프 등)
   dah-dashboard.html의 메인 스크립트보다 먼저 로드되어야 함.
   ══════════════════════════════════════════════════ */

function isArchived(c) {
  if (c.stage !== '완료') return false;
  var refDate = c.installDate || c.date || c.createdAt;
  if (!refDate) return false;
  return Math.floor((new Date() - new Date(refDate)) / 86400000) >= 14;
}

// "삭제"(소프트 삭제, 보관 처리)된 고객인지 판단.
// 위 isArchived()와는 완전히 다른 개념(완료 후 14일 경과시 자동 보관)이므로 이름을 분리함.
function isSoftDeleted(c) {
  return c.is_archived === true;
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function fmt(n) { return (Number(n) || 0).toLocaleString() + '원'; }
function fmtMan(n) { return Math.round((Number(n)||0)/10000).toLocaleString() + '만원'; }
function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }
function thisMonthStr() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth()+1); }
function daysDiff(dateStr) { return Math.floor((new Date() - new Date(dateStr)) / 86400000); }
function fmtPhone(v) {
  var d = v.replace(/[^0-9]/g, '');
  if (d.slice(0,2) === '02') {
    if (d.length <= 6) return d.slice(0,2) + '-' + d.slice(2);
    if (d.length <= 9) return d.slice(0,2) + '-' + d.slice(2,5) + '-' + d.slice(5);
    return d.slice(0,2) + '-' + d.slice(2,6) + '-' + d.slice(6,10);
  }
  if (d.length <= 7) return d.slice(0,3) + '-' + d.slice(3);
  return d.slice(0,3) + '-' + d.slice(3,7) + '-' + d.slice(7,11);
}
