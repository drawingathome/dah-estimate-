/* ══════════════════════════════════════════════════
   DAH 대시보드 — 검색 / 날짜필터 기능
   고객명 초성검색, 통합검색 매칭, 매출차트 기간필터.
   ══════════════════════════════════════════════════ */

var CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

function getChosung(str) {
  return str.split('').map(function(ch) {
    var code = ch.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return ch;
    return CHOSUNG[Math.floor(code / 588)];
  }).join('');
}

function searchMatch(customer, query) {
  if (!query) return true;
  var q = query.trim().toLowerCase();
  var name  = (customer.clientName || '').toLowerCase();
  var phone = (customer.phone || '').replace(/-/g, '');
  var addr  = (customer.addr || '').toLowerCase();

  // 일반 검색
  if (name.includes(q) || phone.includes(q) || addr.includes(q)) return true;

  // 2026-09-06(선혜님 지적 - "김 은 외자이름일 경우 김은 으로 하면 검색이
  // 안되고 김 은 으로 띄워야 검색이 되는데 둘 다 뜨게 해야 하는거 아니야??"):
  // 외자 이름(예: "김 은")을 등록할 때 성과 이름 사이에 공백을 넣어
  // 저장한 경우, "김은"(공백없이)으로 검색하면 단순 포함검사(includes)가
  // 정확히 안 맞아서 못 찾고 있었음 - 이름/검색어 양쪽에서 공백을 제거한
  // 버전으로도 비교해서, 공백을 넣든 안 넣든 항상 찾아지도록 함.
  var nameNoSpace = name.replace(/\s/g, '');
  var qNoSpace = q.replace(/\s/g, '');
  if (qNoSpace && nameNoSpace.includes(qNoSpace)) return true;

  // 초성 검색
  if (/^[ㄱ-ㅎ]+$/.test(q)) {
    var nameChosung = getChosung(customer.clientName || '');
    if (nameChosung.includes(q)) return true;
  }
  return false;
}

/* ── 날짜 필터 ── */
var _currentDateFilter = 'all';

function setDateFilter(period) {
  _currentDateFilter = period;
  document.querySelectorAll('.date-filter-btn').forEach(function(b) {
    b.classList.toggle('on', b.getAttribute('data-period') === period);
  });
  loadCustomersAsync(function(){ renderChart(); });
}

function getDateFilterRange() {
  var now = new Date();
  var start, end = new Date(now);
  
  switch(_currentDateFilter) {
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'last_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end   = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case '3months':
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
    case '6months':
      start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      break;
    default:
      return null; // 전체
  }
  return { start: start, end: end };
}

// 2026-08-28: filterByDate(날짜범위로 고객 거르는 헬퍼)도 어디서도 호출
// 안 되고 있어서 제거 - getDateFilterRange() 자체는 계속 사용중(날짜필터
// 버튼들이 그 범위를 직접 매출계산 함수에 넘기는 방식으로 씀).

