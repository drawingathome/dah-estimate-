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
// 2026-09-21(선혜님 - "그럼 언제 하라는거지??????" → 견적서별 결제
// 관리로 구조 전환): 결제(선금/잔금)가 이제 고객이 아니라 견적서
// 각각에 저장되는데, 이 함수(및 이 함수를 안 쓰고 직접 c.depositAmount/
// c.balanceAmount를 계산하던 dash-kanban.js/dash-customer-alim.js/
// dash-render-search.js)가 전부 "고객 레벨" 필드만 보고 있었음 - 그대로
// 두면 견적서 단위로 결제를 저장하는 순간 미수금 현황판·칸반 받은금액
// 표시·잔금 리마인더가 전부 조용히 0으로 보이는 광범위한 회귀가 될
// 뻔했음(5곳에서 같은 계산이 중복 작성돼 있던 걸 전수 확인). 이 고객의
// 모든 견적서(dah_saved)를 찾아 각각의 결제 합계를 더하고, 견적서가
// 하나도 없으면(신규 고객, 아직 견적서 없음) 예전처럼 고객 레벨
// 필드로 폴백 - "받은 금액"의 유일한 진실 공급원으로 통일.
//
// 2026-09-21(선혜님 발견 - "김은 황남주 입금 확인한거 같은데 왜
// 미입금으로 뜨지??", 실제 서버 데이터로 재현 확인): 위 폴백이
// "견적서가 하나도 없을 때만" 작동하도록 짜여있었는데, 실제 결제
// 저장 화면(dash-customer-pay.js)은 여전히 견적서가 아니라 고객
// 레벨(customers.deposit_amount/balance_amount)에 그대로 쓰고 있음
// - 즉 쓰는 곳과 읽는 곳의 기준이 서로 다른 채 방치돼 있었음. 견적서가
// 1개라도 있는 고객은(거의 전부) 견적서 쪽 금액(대부분 0)만 보고
// 고객 레벨의 진짜 입금액을 완전히 무시해버려서, 실제로는 완납인
// 고객이 전액 미수금으로 잘못 표시되는 광범위한 버그였음. dash-
// customer-pay.js가 견적서 단위 저장으로 전환되기 전까지는, 두 소스
// 중 더 큰 쪽(실제로 기록된 쪽)을 받은 금액으로 인정해야 안전함.
function getReceivedAmount(c) {
  var estSum = 0;
  try {
    var allEsts = JSON.parse(localStorage.getItem('dah_saved')||'[]');
    var myEsts = allEsts.filter(function(e){ return (c.id && e.clientId) ? e.clientId === c.id : e.clientName === c.clientName; });
    myEsts.forEach(function(e){ estSum += (Number(e.depositAmount)||0) + (Number(e.balanceAmount)||0); });
  } catch(e) {}
  var customerLevelSum = (Number(c.depositAmount)||0) + (Number(c.balanceAmount)||0);
  return Math.max(estSum, customerLevelSum);
}
function getUnpaidAmount(c) {
  if (UNPAID_RELEVANT_STAGES.indexOf(c.stage) < 0) return 0;
  var price = Number(c.price) || 0;
  if (price <= 0) return 0;
  var received = getReceivedAmount(c);
  return Math.max(0, price - received);
}

// 2026-09-21: 알림톡의 "계약금 결제 안내"/"잔금 결제 안내"처럼 개별
// 선금/잔금 "금액 하나"가 필요한 곳을 위한 헬퍼 - 이 고객의 견적서가
// 있으면 최신 것의 결제 정보, 없으면 예전처럼 고객 레벨 필드로 폴백.
// 여러 견적서가 있으면 "가장 최근 것"을 대표로 삼음(완벽하진 않지만
// 최소한 0으로 보이는 회귀는 막음 - 어느 견적서인지 명확히 골라야
// 하는 경우엔 이 함수 대신 견적서를 직접 지정해서 써야 함).
// 2026-09-21: 알림톡의 "계약금 결제 안내"/"잔금 결제 안내"처럼 개별
// 선금/잔금 "금액 하나"가 필요한 곳을 위한 헬퍼 - 이 고객의 견적서가
// 있으면 최신 것의 결제 정보, 없으면 예전처럼 고객 레벨 필드로 폴백.
// 여러 견적서가 있으면 "가장 최근 것"을 대표로 삼음(완벽하진 않지만
// 최소한 0으로 보이는 회귀는 막음 - 어느 견적서인지 명확히 골라야
// 하는 경우엔 이 함수 대신 견적서를 직접 지정해서 써야 함).
// 2026-09-21(선혜님 지적 - "구조를 다 짠거 맞아?? 전문업체면 전수
// 검사해야지"로 범위를 넓혀 확인 - getReceivedAmount와 정확히 같은
// 함정이 이 함수에도 그대로 있었음): dash-customer-pay.js가 여전히
// customers 레벨에 결제를 저장하고 있는 한, "견적서가 있으면 무조건
// 견적서만 본다"는 판단은 항상 위험함 - 견적서 쪽 금액이 0인데 고객
// 레벨엔 실제 입금이 있으면, 고객 레벨 쪽을 써야 함.
function getLatestEstPay(c) {
  var estResult = null;
  try {
    var allEsts = JSON.parse(localStorage.getItem('dah_saved')||'[]');
    var myEsts = allEsts.filter(function(e){ return (c.id && e.clientId) ? e.clientId === c.id : e.clientName === c.clientName; });
    if (myEsts.length > 0) {
      myEsts.sort(function(a,b){ return (b.savedAt||b.date||'') > (a.savedAt||a.date||'') ? 1 : -1; });
      var e = myEsts[0];
      estResult = { price: Number(e.price)||0, depositAmount: Number(e.depositAmount)||0, balanceAmount: Number(e.balanceAmount)||0 };
    }
  } catch(err) {}
  var custResult = { price: Number(c.price)||0, depositAmount: Number(c.depositAmount)||0, balanceAmount: Number(c.balanceAmount)||0 };
  if (!estResult) return custResult;
  var estTotal = estResult.depositAmount + estResult.balanceAmount;
  var custTotal = custResult.depositAmount + custResult.balanceAmount;
  return custTotal > estTotal ? { price: estResult.price || custResult.price, depositAmount: custResult.depositAmount, balanceAmount: custResult.balanceAmount } : estResult;
}

// 2026-09-21(선혜님 - "위 내용 코드 정리해줘 버그가 많을꺼 같은데" 요청으로
// 전수 점검 중 발견): 결제를 견적서 단위로 전환(e2c5e63)하면서, 이 고객의
// "모든" 견적서 각각의 결제 내역이 필요한 곳(매출 차트의 월별 배분, 엑셀
// 다운로드, 캘린더 표시 등)이 전부 여전히 customers 레벨 필드만 보고
// 있었음 - getReceivedAmount(합계)/getLatestEstPay(최신 하나)로는 부족한
// 이런 곳들을 위해, 이 고객의 견적서마다 결제 내역을 각각 담은 배열을
// 반환. 견적서가 없으면(신규 고객) customers 레벨 폴백 하나만 담긴
// 배열을 반환해 호출부가 항상 배열을 순회하기만 하면 되게 함.
function getAllEstPays(c) {
  var estList = null;
  try {
    var allEsts = JSON.parse(localStorage.getItem('dah_saved')||'[]');
    var myEsts = allEsts.filter(function(e){ return (c.id && e.clientId) ? e.clientId === c.id : e.clientName === c.clientName; });
    if (myEsts.length > 0) {
      estList = myEsts.map(function(e){
        return {
          price: Number(e.price)||0,
          depositAmount: Number(e.depositAmount)||0, depositDate: e.depositDate||'',
          balanceAmount: Number(e.balanceAmount)||0, balanceDate: e.balanceDate||''
        };
      });
    }
  } catch(err) {}
  var custEntry = {
    price: Number(c.price)||0,
    depositAmount: Number(c.depositAmount)||0, depositDate: c.depositDate||'',
    balanceAmount: Number(c.balanceAmount)||0, balanceDate: c.balanceDate||''
  };
  if (!estList) return [custEntry];
  // 2026-09-21(getLatestEstPay와 같은 이유로 함께 발견): 견적서 목록엔
  // 결제기록이 전혀 없는데(전부 0) 고객 레벨엔 실제 입금이 있으면,
  // 그 견적서 배열 그대로 반환하는 건 "완납인데 0으로 보이는" 회귀가
  // 됨 - 이럴 때만 고객 레벨 결제를 대표 항목 하나로 대신 반환.
  var estTotalSum = estList.reduce(function(s, e){ return s + e.depositAmount + e.balanceAmount; }, 0);
  var custTotal = custEntry.depositAmount + custEntry.balanceAmount;
  if (estTotalSum === 0 && custTotal > 0) {
    var latestPrice = estList.length > 0 ? estList[estList.length - 1].price : custEntry.price;
    return [{ price: latestPrice || custEntry.price, depositAmount: custEntry.depositAmount, depositDate: custEntry.depositDate, balanceAmount: custEntry.balanceAmount, balanceDate: custEntry.balanceDate }];
  }
  return estList;
}

// 2026-09-21: 엑셀 다운로드처럼 "고객 하나당 한 줄"로 압축해야 하는 곳을
// 위한 헬퍼 - 견적서가 여러 건이면 선금/잔금 각각 합계 금액을 내고,
// 날짜는 그중 가장 최근(늦은) 날짜 하나를 대표로 보여줌(완벽하진
// 않지만, 최소한 실제 있는 결제가 0으로 보이는 회귀는 막음).
function getReceivedSummary(c) {
  var allPays = getAllEstPays(c);
  var depositAmount = 0, depositDate = '', balanceAmount = 0, balanceDate = '';
  allPays.forEach(function(p){
    depositAmount += p.depositAmount;
    if (p.depositDate && p.depositDate > depositDate) depositDate = p.depositDate;
    balanceAmount += p.balanceAmount;
    if (p.balanceDate && p.balanceDate > balanceDate) balanceDate = p.balanceDate;
  });
  return { depositAmount: depositAmount, depositDate: depositDate, balanceAmount: balanceAmount, balanceDate: balanceDate };
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

// 2026-09-16(선혜님 - "링크 너가 나한테 준거잖아"): escHtml/fmtPhone은
// shared-common-utils.js로 옮김(두 앱이 동일 파일을 그대로 로드) -
// 이 파일에 있던 정의는 삭제. fmtPhone(v)은 공용 핵심로직
// formatPhoneDigits()를 그대로 감싸는 얇은 래퍼로 유지(대시보드는
// "값 받아서 반환" 방식을 그대로 씀).

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
  return formatPhoneDigits(v.replace(/[^0-9]/g, ''));
}

