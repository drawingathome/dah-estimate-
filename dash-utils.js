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

// 2026-08-28(선혜님 요청 — "잔금 리마인더"): 미수금(전체금액-받은금액)
// 계산을 공용함수로 분리 - 고객목록의 "미수금" 필터와 홈화면 "처리 필요"
// 알림 둘 다 이 함수 하나를 재사용함(체크리스트 24번). 결제가 실제로
// 시작된 단계(선금결제~시공완료)만 대상 - 가견적/상담처럼 아직 청구
// 전인 단계는 "미수금"이 아니라 "아직 청구 전"이므로 0을 반환.
var UNPAID_RELEVANT_STAGES = ['선금결제','실측준비중','확정견적','잔금결제','시공준비중','시공완료'];
function getUnpaidAmount(c) {
  if (UNPAID_RELEVANT_STAGES.indexOf(c.stage) < 0) return 0;
  var price = Number(c.price) || 0;
  if (price <= 0) return 0;
  var received = (Number(c.depositAmount)||0) + (Number(c.balanceAmount)||0);
  return Math.max(0, price - received);
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

// 2026-09-15(선혜님 지시 - 침구/카펫/쿠션처럼 시공 없이 배송만 하는
// 주문이 늘어날 수 있어서, 그 판단 기준을 "품목 종류"가 아니라 이미
// 있던 "시공 지역: 시공 안함(배송)" 선택(c.region === '')으로 통일하기로
// 결정): 내부 저장값(단계 이름 자체)은 절대 안 건드림 - 알림톡/칸반/
// 결제자동전환 등 8개 파일의 자동화가 이 정확한 문자열에 의존하고
// 있어서, 값을 바꾸면 그 자동화를 전부 다시 만들어야 함. 대신 "화면에
// 보여주는 글자"만 바꿔주는 함수 하나를 만들어서, 단계 이름이 뜨는
// 모든 화면이 이 함수를 거치게 함. region이 늦은 단계(실측/시공 관련)
// 까지 비어있다는 건 그 시점엔 이미 지역선택을 거쳤을 가능성이 높아
// "명시적으로 배송 선택함"으로 봐도 안전함(초기 단계는 애초에 이 3개
// 단계에 해당 안 되므로 영향 없음).
var DELIVERY_STAGE_LABELS = { '실측준비중': '제작준비중', '시공준비중': '발송준비중', '시공완료': '발송완료' };
function getDisplayStageLabel(customer) {
  if (!customer) return '';
  var stage = customer.stage;
  if ((customer.region === '' || customer.region == null) && DELIVERY_STAGE_LABELS[stage]) {
    return DELIVERY_STAGE_LABELS[stage];
  }
  return stage;
}

// 2026-09-15(선혜님 - "쌍둥이함수까지 다 본거야??"로 점검 중 발견): 미배정
// 고객을 직원 권한 필터의 예외로 통과시키는 한 줄짜리 필터가 홈화면/검색/
// 캘린더/칸반보드 4곳에 각각 따로 복사돼 있었음 - 오늘 claimCustomer를
// 공용함수로 합쳤던 것과 같은 이유로 여기도 합침. 나중에 5번째 화면이
// 필요해지거나 "미배정" 문자열 자체가 바뀔 때, 한 곳만 고치면 되게 함.
function filterForStaffWithUnassigned(allCustomers, currentUser) {
  if (!currentUser || currentUser.role !== 'staff') return allCustomers;
  var unassignedPool = allCustomers.filter(function(c) { return c.staffName === '미배정'; });
  return allCustomers.filter(function(c) { return (c.staffName||'마스터') === currentUser.name; }).concat(unassignedPool);
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
// 2026-08-29(선혜님 지시 - "코드정리 누락없이 다했니" 재점검으로 발견):
// fmtMan(만원단위 포맷 헬퍼)도 어디서도 안 불리고 있었음 - 오늘 만든
// KPI 카드들(현재매출/이번달매출)이 이 함수를 쓰지 않고 각자 직접
// Math.round(n/10000).toLocaleString()으로 계산하고 있어서 제거함.

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
