/* ══════════════════════════════════════════════════
   DAH 대시보드 — 설정 접근자 (담당자/거래처/리드기준/지역비/쿠폰/담당자 이메일)
   2026-09-24(선혜님 - "나눌수 있는건 다 나눠보자" - 큰 파일 쪼개기 4차): dash-api.js(829줄)에서
   설정값(localStorage 캐시 + app_settings 동기화)을 읽고 쓰는 함수들만 분리함.
   코드 내용은 한 줄도 안 바꾸고 위치만 옮김(전역 함수/변수 지문 비교로 확인).
   이 파일은 dash-api.js 바로 뒤에 로드돼야 함(SUPABASE_URL/sbXHR 등 핵심은 dash-api.js에 있음).
   ══════════════════════════════════════════════════ */


function getStaffList() {
  try { var list = JSON.parse(localStorage.getItem('dah_staff_list') || '[]'); return list.length > 0 ? list : []; } catch(e) { return []; }
}

// 거래처 목록 관리 (2026-07-31 신규, 2026-08-01 카테고리 추가) — 발주탭 자동완성용.
// 카테고리: 'fabric'(원단)/'production'(제작)/'blind'(블라인드)/'material'(자재)/
// 'install'(실측·시공)/''(미분류 — 모든 항목에 다 보임, 안전한 기본값)
var VENDOR_CATEGORIES = [
  { key: 'fabric', label: '원단' },
  { key: 'production', label: '제작' },
  { key: 'blind', label: '블라인드' },
  { key: 'material', label: '자재' },
  { key: 'install', label: '실측·시공' }
];
var DEFAULT_VENDOR_LIST = ['캔가공소','디테라','아이엔티','예원','크바드라트','이지패브릭','리더스','유니밋','지오데코','윈텍','덱스터','헌터더글라스','솜피','목성']
  .map(function(name) { return { name: name, categories: [] }; });
function getVendorList() {
  try {
    var raw = localStorage.getItem('dah_vendor_list');
    if (raw === null) return DEFAULT_VENDOR_LIST.slice();
    var list = JSON.parse(raw);
    if (!Array.isArray(list)) return DEFAULT_VENDOR_LIST.slice();
    // 마이그레이션: 문자열배열(가장 예전) -> {name,category}(예전) -> {name,categories}(현재, 2026-08-02
    // 한 거래처가 여러 카테고리를 겸할 수 있도록(예: 제작+시공을 같이 하는 업체) 배열로 변경함
    return list.map(function(v) {
      if (typeof v === 'string') return { name: v, categories: [] };
      if (Array.isArray(v.categories)) return v;
      // 예전 category(단일 문자열) 필드가 있으면 배열로 변환, 빈 문자열(미분류)이면 빈 배열
      return { name: v.name, categories: v.category ? [v.category] : [] };
    });
  } catch(e) { return DEFAULT_VENDOR_LIST.slice(); }
}
function setVendorList(list) {
  try { localStorage.setItem('dah_vendor_list', JSON.stringify(list)); } catch(e){}
  sbSyncSetting('vendor_list', list);
}

// 놓친 리드 기준일수 (2026-07-31 신규) — 예전엔 코드에 7일로 고정. 설정탭에서 조정 가능.
function getLeadStaleDays() {
  try {
    var v = Number(localStorage.getItem('dah_lead_stale_days'));
    return (v && v > 0) ? v : 7;
  } catch(e) { return 7; }
}
function setLeadStaleDays(days) {
  try { localStorage.setItem('dah_lead_stale_days', String(days)); } catch(e){}
  sbSyncSetting('lead_stale_days', days);
}

// 2026-09-16(선혜님 - "링크 너가 나한테 준거잖아"): getRegionFees/
// DEFAULT_REGION_FEES는 shared-common-utils.js로 옮김 - 이 파일의
// 정의는 삭제. setRegionFees(설정화면 전용, 견적서 앱엔 없음)는 그대로 유지.
function setRegionFees(fees) {
  try { localStorage.setItem('dah_region_fees', JSON.stringify(fees)); } catch(e){}
  sbSyncSetting('region_fees', fees);
}

// 2026-08-14: 할인 쿠폰 관리(선혜님 확인) - 당일결제5%/마케팅3%/입주10%/재구매5% 등
// 견적서 앱에서 체크박스로 여러개 동시 선택 가능한 할인 항목들. 지역출장비와 동일 패턴.
function getDiscountCoupons() {
  try {
    var cached = JSON.parse(localStorage.getItem('dah_discount_coupons') || 'null');
    return cached || [];
  } catch(e) { return []; }
}
function setDiscountCoupons(coupons) {
  try { localStorage.setItem('dah_discount_coupons', JSON.stringify(coupons)); } catch(e){}
  sbSyncSetting('discount_coupons', coupons);
}

// 2026-08-14: "한번 쓰인 쿠폰은 값 수정 자체를 막고, 바꾸려면 새로 만들게"
// 방식으로 변경(선혜님 요청) — 값이 바뀌면 과거 견적서 재계산이 달라지는
// 혼란 자체를 원천 차단. 실제로 견적서에 적용된 적 있는 쿠폰ID 목록을
// estimates.applied_discounts에서 조회해서, 설정화면에서 그 쿠폰들의
// 값/단위 입력을 잠그는 데 사용.
function fetchUsedCouponIdsFromCloud(callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', SUPABASE_URL + '/rest/v1/estimates?select=applied_discounts&applied_discounts=not.is.null', true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
  xhr.onload = function() {
    var usedIds = {};
    try {
      if (xhr.status === 200) {
        var rows = JSON.parse(xhr.responseText);
        rows.forEach(function(r) {
          var coupons = (r.applied_discounts && r.applied_discounts.coupons) || [];
          coupons.forEach(function(c) { if (c && c.id) usedIds[c.id] = true; });
        });
      }
    } catch(e) {}
    if (callback) callback(usedIds);
  };
  xhr.onerror = function() { if (callback) callback({}); };
  xhr.send();
}

// 담당자 이름 -> 로그인용 이메일 매핑 (Supabase Auth 연동용, 별도 저장)
function getStaffEmailMap() {
  try { return JSON.parse(localStorage.getItem('dah_staff_emails') || '{}'); } catch(e) { return {}; }
}
function getStaffEmail(name) {
  var map = getStaffEmailMap();
  return map[name] || '';
}
function setStaffEmail(name, email) {
  var map = getStaffEmailMap();
  if (email) { map[name] = email; } else { delete map[name]; }
  try { localStorage.setItem('dah_staff_emails', JSON.stringify(map)); } catch(e){}
  sbSyncSetting('staff_emails', map);
}
function removeStaffEmail(name) {
  var map = getStaffEmailMap();
  delete map[name];
  try { localStorage.setItem('dah_staff_emails', JSON.stringify(map)); } catch(e){}
  sbSyncSetting('staff_emails', map);
}
