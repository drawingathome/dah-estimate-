/* ══════════════════════════════════════════════════
   DAH 대시보드 — 순수 유틸리티 함수 모음
   다른 함수를 호출하지 않고 입력값만으로 계산하는 "순수함수"들만 모아둠.
   (날짜/금액 포맷, 전화번호 포맷, HTML 이스케이프 등)
   dah-dashboard.html의 메인 스크립트보다 먼저 로드되어야 함.
   ══════════════════════════════════════════════════ */

// 2026-08-28(선혜님 지시 — "마스터 담당인지 오지은 실장 담당인지 확인이
// 안되는데 견적서 일정 등등 포함해서 제안해봐"): 담당자를 한눈에 구분할
// 수 있는 작은 원형 뱃지(이름 첫 글자 + 담당자별 고정 색상)를 만들어서,
// 칸반카드/견적서목록/일정 3곳에서 전부 이 함수 하나를 재사용함(각자
// 따로 비슷한 코드를 짜지 않기 위함 - 체크리스트 24번). 담당자가 늘어나도
// (마스터/오지은 실장 외에 새 실장이 추가돼도) 이름 해시 기반으로 자동으로
// 고유한 색이 배정되어 하드코딩 없이 동작함.
var STAFF_BADGE_COLORS = ['#2F6690','#C0392B','#8E6E53','#5C8A5C','#9B59B6','#D68910','#1F8A8C'];
function getStaffBadgeColor(staffName) {
  var name = staffName || '마스터';
  var hash = 0;
  for (var i = 0; i < name.length; i++) { hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff; }
  return STAFF_BADGE_COLORS[Math.abs(hash) % STAFF_BADGE_COLORS.length];
}
function renderStaffBadge(staffName, sizePx) {
  var name = staffName || '마스터';
  var size = sizePx || 18;
  var initial = name.charAt(0);
  var color = getStaffBadgeColor(name);
  return '<span class="staff-badge" title="' + escHtml(name) + '" style="' +
    'display:inline-flex;align-items:center;justify-content:center;' +
    'width:' + size + 'px;height:' + size + 'px;border-radius:50%;' +
    'background:' + color + ';color:#fff;font-size:' + Math.round(size*0.55) + 'px;' +
    'font-weight:700;flex-shrink:0;line-height:1">' + escHtml(initial) + '</span>';
}

function isArchived(c) {
  if (c.stage !== '시공완료') return false;
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
