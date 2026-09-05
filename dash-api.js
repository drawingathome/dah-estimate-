/* ══════════════════════════════════════════════════
   DAH 대시보드 — 데이터 접근 계층 (Supabase / localStorage)
   Supabase 통신, 고객 데이터 읽기/쓰기/변환, 담당자 목록,
   설정 클라우드 동기화 등 "데이터를 가져오고 저장하는" 함수들만 모음.
   화면(DOM)을 직접 그리는 함수는 여기 없음 — 그건 메인 파일에 남아있음.
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

// 지역별 실측비/시공비 (2026-07-31 신규) — 견적서 앱과 공유하는 설정값
var DEFAULT_REGION_FEES_DASH = { '서울': {'실측비':40000, '시공비':50000}, '경기': {'실측비':60000, '시공비':80000} };
function getRegionFees() {
  try {
    var cached = JSON.parse(localStorage.getItem('dah_region_fees') || 'null');
    return cached || DEFAULT_REGION_FEES_DASH;
  } catch(e) { return DEFAULT_REGION_FEES_DASH; }
}
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

var SUPABASE_URL = 'https://sradnglutbzbyyunjyah.supabase.co';
var SUPABASE_KEY = 'sb_publishable_9nYjQBzwiyausr7-Cd-elw_S9inJlge';

// 구글드라이브 자동화 허브 웹훅 (배포 후 URL 채워넣을 예정) — 견적서 앱과 공유
var DRIVE_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyyNG-Y6sABngKqk2ttfXUK_LIrQtyqiLLaaEvUnhWs3Yn4YqFtsGTVoug7EQAbig6OgQ/exec';
function syncCustomerToSheet(customer) {
  if (!DRIVE_WEBHOOK_URL) return;
  try {
    fetch(DRIVE_WEBHOOK_URL, {
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
    }).catch(function(e) { console.warn('고객명단 동기화 실패:', e); });
  } catch (e) { console.warn('고객명단 동기화 실패:', e); }
}

function sbXHR(method, path, data, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open(method, SUPABASE_URL + '/rest/v1/' + path, true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
  xhr.setRequestHeader('Content-Type', 'application/json');
  // 2026-08-25(선혜님 발견 — "이름 수정도 안된다", 대시보드 전체를 관통하는
  // 심각한 버그): PATCH(수정)를 return=minimal로 보내서, 서버가 실제로
  // 몇 건을 바꿨는지 전혀 확인을 안 하고 있었음. 최근 적용된 보안규칙(담당자
  // 이름이 정확히 일치해야 그 레코드 수정 가능)때문에 조용히 막힌 수정들이
  // 그대로 "성공"으로 보고돼서, 이름을 포함해 sbXHR로 PATCH하는 대시보드
  // 전체 기능(estimates만 고쳤던 것과 같은 원인, 훨씬 넓은 범위)이 전부 이
  // 위험에 노출돼 있었음. PATCH도 항상 return=representation으로 받아서
  // 실제 반영 건수(0건이면 실패)를 확인하도록 수정.
  xhr.setRequestHeader('Prefer', method === 'DELETE' ? 'return=minimal' : 'return=representation');
  // 2026-08-06: 타임아웃이 아예 없어서, 모바일 네트워크가 느리거나 불안정하면
  // 요청이 무한정 걸릴 수 있었음 — 그동안 화면이 데이터를 못 받아 완전히
  // 그려지지 않은 채로 멈춰있을 수 있었음(선혜님이 겪은 "스크롤이 끝까지 안
  // 된다" 문제의 유력한 원인 — 콘텐츠 자체가 덜 그려진 상태였을 가능성).
  // 15초 후엔 실패로 처리해서 로컬 캐시로 폴백되도록 함.
  xhr.timeout = 15000;
  xhr.ontimeout = function() { callback({status: 0, text: 'timeout'}, null); };
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      var result = null;
      try { result = xhr.responseText ? JSON.parse(xhr.responseText) : []; } catch(e) { result = []; }
      // PATCH/PUT인데 반영된 행이 0개면, RLS(권한 불일치) 등으로 서버에
      // 실제로는 아무것도 안 바뀐 것 — 이걸 성공으로 보고하면 안 됨.
      if ((method === 'PATCH' || method === 'PUT') && Array.isArray(result) && result.length === 0) {
        callback({status: xhr.status, text: '0건 반영됨(권한 문제일 수 있음)', zeroRows: true}, null);
        return;
      }
      callback(null, result);
    } else { callback({status: xhr.status, text: xhr.responseText}, null); }
  };
  xhr.onerror = function() { callback({status: 0, text: 'network error'}, null); };
  xhr.send(data ? JSON.stringify(data) : null);
}

// ── 사용 패턴 로깅 (탭 이동/상세보기/단계변경 등 핵심 지점만) ──
// 실패해도 화면 동작에 영향 없어야 하므로 콜백 없이 그냥 보내고 무시함.
// 개인정보 최소화: 고객 이름/전화번호 등은 기록하지 않고, 어떤 "행동"이 일어났는지만 남김.
function logEvent(eventType, detail) {
  try {
    sbXHR('POST', 'analytics_events', {
      event_type: eventType,
      event_detail: detail || {},
      staff_name: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.name : null
    }, function(err) {
      if (err) console.warn('로그 기록 실패(무시 가능):', err);
    });
  } catch (e) { /* 로깅 실패가 실제 기능에 영향 주면 안 되므로 조용히 무시 */ }
}

var _customerCache = [];
var _customerCacheTime = 0;
var _estimateCacheTime = 0;
var CACHE_FRESH_MS = 8000; // 8초 이내 재요청은 재조회 생략(2026-08-04, 탭 빠르게 전환할때 불필요한 중복조회 방지)

// ── 앱 설정 동기화 (담당자목록/월목표매출/계좌정보/웹훅/마스터비번) ──
// 여러 컴퓨터·휴대폰에서 동일한 설정값이 보이도록 Supabase app_settings 테이블과 동기화
function sbSyncSetting(key, value) {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', SUPABASE_URL + '/rest/v1/app_settings?on_conflict=key', true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Prefer', 'resolution=merge-duplicates,return=minimal');
  xhr.onload = function() {
    if (xhr.status < 200 || xhr.status >= 300) {
      console.warn('설정 동기화 실패:', key, xhr.status);
      // 2026-08-25(선혜님 "더 찾아" 요청으로 전수재검사): 설정(할인쿠폰,
      // 지역비, 목표매출 등)이 실패해도 콘솔에만 기록되고 화면엔 전혀 안
      // 보였음 — 저장했다고 믿고 있다가 나중에 값이 그대로인 걸 발견하는
      // 식으로 이어질 수 있었음.
      if (typeof showToast === 'function') showToast('⚠️ 설정이 서버에 저장되지 않았어요(' + key + ') — 다시 시도해주세요');
    }
  };
  xhr.onerror = function() {
    console.warn('설정 동기화 실패(네트워크):', key);
    if (typeof showToast === 'function') showToast('⚠️ 설정 저장 실패(네트워크) — 다시 시도해주세요');
  };
  xhr.send(JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }));
}

function syncStaffGoalsToCloud() {
  var allStaffs = ['마스터'].concat(getStaffList());
  var goals = {};
  allStaffs.forEach(function(staff) {
    var v = Number(localStorage.getItem('dah_goal_'+staff)||0);
    if (v > 0) goals[staff] = v;
  });
  sbSyncSetting('staff_goals', goals);
}

function loadAppSettingsAsync(callback) {
  sbXHR('GET', 'app_settings?select=*', null, function(err, rows) {
    if (err || !rows) { if (callback) callback(); return; }
    var found = {};
    rows.forEach(function(row) { found[row.key] = true;
      if (row.key === 'staff_list') { try { localStorage.setItem('dah_staff_list', JSON.stringify(row.value)); } catch(e){} }
      else if (row.key === 'settings') { try { localStorage.setItem('dah_settings', JSON.stringify(row.value)); } catch(e){} }
      else if (row.key === 'webhook_url') { try { localStorage.setItem('dah_webhook_url', row.value); } catch(e){} }
      // 2026-08-29: master_pw 동기화(MASTER_PW 전역변수 갱신)는 그 변수 자체가
      // 죽은 코드가 되어 제거됨 - 예전 클라우드에 남아있는 master_pw 설정값은
      // 이제 아무 데도 반영 안 되지만, 데이터 자체는 안전하게 그대로 둠.
      else if (row.key === 'staff_goals') { try { Object.keys(row.value||{}).forEach(function(staff){ localStorage.setItem('dah_goal_'+staff, String(row.value[staff])); }); } catch(e){} }
      else if (row.key === 'master_email') { try { localStorage.setItem('dah_master_email', row.value); } catch(e){} }
      else if (row.key === 'staff_emails') { try { localStorage.setItem('dah_staff_emails', JSON.stringify(row.value||{})); } catch(e){} }
      else if (row.key === 'vendor_list') { try { localStorage.setItem('dah_vendor_list', JSON.stringify(row.value||[])); } catch(e){} }
      else if (row.key === 'memo_phrases') { try { localStorage.setItem('dah_memo_phrases', JSON.stringify(row.value||[])); } catch(e){} }
      else if (row.key === 'lead_stale_days') { try { localStorage.setItem('dah_lead_stale_days', String(row.value)); } catch(e){} }
      else if (row.key === 'region_fees') { try { localStorage.setItem('dah_region_fees', JSON.stringify(row.value||{})); } catch(e){} }
    });
    // Supabase에 아직 없는 값은 이 컴퓨터에 있는 값으로 최초 1회 올려줌 (첫 동기화)
    if (!found.staff_list) { try { var sl = JSON.parse(localStorage.getItem('dah_staff_list')||'[]'); if (sl.length) sbSyncSetting('staff_list', sl); } catch(e){} }
    if (!found.settings) { try { var s = JSON.parse(localStorage.getItem('dah_settings')||'{}'); if (Object.keys(s).length) sbSyncSetting('settings', s); } catch(e){} }
    if (!found.webhook_url) { try { var w = localStorage.getItem('dah_webhook_url'); if (w) sbSyncSetting('webhook_url', w); } catch(e){} }
    if (!found.master_pw) { try { var mp = localStorage.getItem('dah_master_pw'); if (mp) sbSyncSetting('master_pw', mp); } catch(e){} }
    if (!found.master_email) { try { var me = localStorage.getItem('dah_master_email'); if (me) sbSyncSetting('master_email', me); } catch(e){} }
    if (!found.staff_emails) { try { var se = JSON.parse(localStorage.getItem('dah_staff_emails')||'{}'); if (Object.keys(se).length) sbSyncSetting('staff_emails', se); } catch(e){} }
    if (!found.staff_goals) { syncStaffGoalsToCloud(); }
    if (!found.vendor_list) { try { var vl = getVendorList(); if (vl.length) sbSyncSetting('vendor_list', vl); } catch(e){} }
    if (!found.memo_phrases) { try { var mp2 = getMempoPhrases(); if (mp2.length) sbSyncSetting('memo_phrases', mp2); } catch(e){} }
    if (!found.lead_stale_days) { try { sbSyncSetting('lead_stale_days', getLeadStaleDays()); } catch(e){} }
    if (!found.region_fees) { try { sbSyncSetting('region_fees', getRegionFees()); } catch(e){} }
    if (callback) callback();
  });
}


function dbRowToCustomer(row) {
  return {
    id:                 row.id,
    clientName:         row.client_name||'',
    phone:              row.phone||'',
    addr:               row.addr||'',
    space:              row.space||'',
    price:              Number(row.price)||0,
    performanceRevenue: Number(row.performance_revenue)||0,
    staffName:          row.staff_name||'마스터',
    stage:              row.stage||'상담',
    date:               row.date||'',
    memo:               row.memo||'',
    visitCount:         Number(row.visit_count)||1,
    measureDate:        row.measure_date||'',
    installDate:        row.install_date||'',
    createdAt:          row.created_at||new Date().toISOString(),
    // 2026-08-31(선혜님 지시 - "만들어줘", 견적서에 이미 있는 동시편집
    // 충돌감지를 고객 레코드에도 적용하기 위해 추가): 이 값을 잠금
    // 기준으로 써서, 저장 직전에 "그 사이 다른 곳에서 먼저 저장했는지"
    // 확인할 수 있게 함.
    updatedAt:          row.updated_at||null,
    is_archived:        row.is_archived === true,
    // 결제 필드
    depositAmount:      Number(row.deposit_amount)||0,
    depositDate:        row.deposit_date||'',
    depositMethod:      row.deposit_method||'',
    depositReceipt:     row.deposit_receipt||false,
    balanceAmount:      Number(row.balance_amount)||0,
    balanceDate:        row.balance_date||'',
    balanceMethod:      row.balance_method||'',
    balanceReceipt:     row.balance_receipt||false,
    orderStatus:        row.order_status||{},
    branch:             row.branch||'반포점',
    leadParked:         row.lead_parked||false,
    confirmDate:        row.confirm_date||'',
    // 2026-08-29: 카카오 알림톡 v3 재작성 시 추가 — #{결제링크} 변수용 저장란.
    // DB에 payment_link 컬럼은 이미 존재했으나(원인 불명, 마이그레이션 파일엔 없음)
    // 코드에서 쓰인 적은 없었음 — 이번에 처음 실제 연결함.
    paymentLink:        row.payment_link||''
  };
}

function customerToDbRow(c) {
  return {
    client_name:         c.clientName||'',
    phone:               c.phone||'',
    addr:                c.addr||'',
    space:               c.space||'',
    price:               Number(c.price)||0,
    performance_revenue: Number(c.performanceRevenue)||0,
    staff_name:          c.staffName||'마스터',
    stage:               c.stage||'상담',
    date:                c.date||'',
    measure_date:        c.measureDate||'',
    install_date:        c.installDate||'',
    memo:                c.memo||'',
    visit_count:         Number(c.visitCount)||1,
    // 결제 필드
    deposit_amount:      Number(c.depositAmount)||0,
    deposit_date:        c.depositDate||'',
    deposit_method:      c.depositMethod||'',
    deposit_receipt:     c.depositReceipt||false,
    balance_amount:      Number(c.balanceAmount)||0,
    balance_date:        c.balanceDate||'',
    balance_method:      c.balanceMethod||'',
    balance_receipt:     c.balanceReceipt||false,
    order_status:        c.orderStatus||{},
    branch:              c.branch||'반포점',
    confirm_date:        c.confirmDate||null,
    payment_link:        c.paymentLink||''
  };
}

function loadCustomers() {
  if (_customerCache.length > 0) return _customerCache;
  try { return JSON.parse(localStorage.getItem('dah_customers') || '[]'); } catch(e) { return []; }
}

// 클라우드(estimates 테이블)에서 견적서를 가져와 로컬(dah_saved) 형식으로 변환 후
// 병합 (2026-08-04 신규) — 예전엔 견적서 목록 화면이 로컬저장소만 보고 있어서,
// 다른 기기에서 저장했거나 관리자가 직접 넣은 견적서가 전혀 안 보이는 문제가 있었음
function estimateDbRowToLocal(row) {
  // 2026-08-05: itemCount/curtainCount/blindCount/거래처목록이 전부 하드코딩(0, [])
  // 되어 있어서, 다른 기기에서 저장돼 클라우드로 동기화된 견적서는 발주현황이
  // "저장된 견적서 없음"으로 뜨고 거래처 자동완성도 안 되던 버그 — line_items가
  // 있으면 실제로 세서 정확한 값을 넣도록 수정
  var liArr = row.line_items || [];
  var curtainItems = liArr.filter(function(li){ return li && li.type === 'curtain'; });
  var blindItems = liArr.filter(function(li){ return li && li.type === 'blind'; });
  var curtainVendors = curtainItems.map(function(li){ return li.vendor; }).filter(Boolean);
  var blindVendors = blindItems.map(function(li){ return li.vendor; }).filter(Boolean);
  return {
    id: row.id,
    dbId: row.id,
    // 2026-08-31(선혜님 지적 — "신화정 견적서를 확인해봐", 실제로는
    // 신화경 오타 - 동명이인 2명 중 한 명(오지은 실장 담당, id=165)이
    // 다른 한 명(마스터 담당, id=150)의 견적서를 이력탭에서 잘못 보고
    // 확정을 시도했다가 권한 없음으로 조용히 실패했던 사건으로 발견):
    // clientId를 매핑하는 줄 자체가 이 함수에 통째로 빠져있었음! 그래서
    // 클라우드에서 동기화된 모든 견적서는 로컬 객체에 clientId가 항상
    // undefined였음 - renderDetailEstTab의 매칭 로직(var mine = ... e.clientId
    // ? id매칭 : 이름매칭)이 이 경우 무조건 "이름매칭"으로 폴백하니까,
    // 동명이인이 있는 모든 고객에게서 서로 다른 사람의 견적서가 섞여
    // 보이고 있었음 - 오늘 하루 종일 발견한 것 중 가장 심각한 버그.
    clientId: row.client_id,
    // 2026-08-24(전수재검사 발견): renderEstimateHistory()(고객상세 "정보" 탭)는
    // "열어서 수정"/"복사해서 새로 만들기" 버튼을 e.dbId 존재 여부로 띄우는데,
    // 클라우드에서 동기화된 항목은 .id만 있고 .dbId가 없어서 이 버튼들이 실제
    // 고객 대부분(클라우드 동기화된 진짜 견적)에게는 안 뜨고 있었을 것.
    no: row.id ? String(row.id).slice(0,8) : '',
    clientName: row.customer_name || '',
    phone: row.phone || '',
    addr: '',
    space: row.space || '',
    fabric: row.product || '',
    itemCount: liArr.length, curtainCount: curtainItems.length, blindCount: blindItems.length,
    curtainVendors: curtainVendors, blindVendors: blindVendors,
    price: Number(row.price) || 0,
    performanceRevenue: Number(row.performance_revenue) || 0,
    staffName: row.staff_name || '',
    status: row.estimate_status || 'ga',
    // 2026-08-24(선혜님 질문 — 계약 안 하는 경우 처리): 서버에 실제로 저장된
    // contract_status가 있으면 그대로 쓰고("미계약"이 새로고침해도 유지됨),
    // 없는(예전) 레코드만 estimate_status로 추정하는 기존 방식으로 폴백.
    contractStatus: row.contract_status || (row.estimate_status === 'final' ? 'contracted' : 'pending'),
    savedAt: row.date || row.created_at || '',
    date: row.date || '',
    installDate: '',
    memo: row.memo || '',
    confirmedAt: row.confirmed_at || null,
    branch: row.branch || '반포점',
    clientId: row.client_id || null,
    lineItems: row.line_items || [],
    custType: row.cust_type || 'new',
    region: row.region || '',
    asFeeType: row.as_fee_type || 'free',
    // 2026-08-24: isArchived 하나만 빠진 게 아니라, 컬럼 전체를 다시 대조해보니
    // 6개가 더 빠져있었음(같은 종류의 실수가 더 있는지 전수 재검사 — 선혜님
    // 프로젝트 원칙). A/S 관련 4개는 A/S 항목이 클라우드 동기화되면 증상/사진
    // 메모가 통째로 사라져 보였을 것이고, price_breakdown 누락은 "저장 당시
    // 금액 고정" 기능이 dah_saved 캐시 경유 화면에서는 안 먹혔을 수 있음.
    asInstallDate: row.as_install_date || null,
    asType: row.as_type || null,
    asSymptom: row.as_symptom || null,
    asPhotoMemo: row.as_photo_memo || null,
    appliedDiscounts: row.applied_discounts || null,
    priceBreakdown: row.price_breakdown || null,
    updatedAt: row.updated_at || null,
    isArchived: !!row.is_archived,
    _fromCloud: true
  };
}

function loadEstimatesAsync(callback, force) {
  var now = Date.now();
  if (!force && _estimateCacheTime > 0 && (now - _estimateCacheTime) < CACHE_FRESH_MS) {
    var cached = [];
    try { cached = JSON.parse(localStorage.getItem('dah_saved') || '[]'); } catch(e) {}
    if (callback) callback(cached);
    return;
  }
  sbXHR('GET', 'estimates?select=*&order=date.desc.nullslast', null, function(err, data) {
    var local = [];
    try { local = JSON.parse(localStorage.getItem('dah_saved') || '[]'); } catch(e) {}
    if (err) { if (callback) callback(local); return; }
    var cloudLocalFormat = (data || []).map(estimateDbRowToLocal);
    var cloudIds = cloudLocalFormat.map(function(e){ return e.id; });
    // 클라우드에서 온 항목은 매번 최신값으로 덮어씀(예전엔 이미 로컬에 캐시된
    // id가 있으면 무시해서, 클라우드에서 나중에 수정해도 브라우저엔 예전 캐시가
    // 계속 남아있는 버그가 있었음). 이 브라우저에서 직접 만든(클라우드기원이
    // 아닌) 로컬전용 항목만 그대로 유지.
    // 2026-08-24(선혜님 요청 — "니가 정리해", 매번 삭제버튼 누르게 하지 말고
    // 자동으로 처리하라는 지적): 오늘 여러 버그로 이미 만들어진 "로컬전용
    // 유령"들(서버 id를 한 번도 못 받은 채 남은 것)을 매번 손으로 지우게
    // 하는 대신, 같은 고객(clientId)+같은 금액(price)의 진짜 클라우드 기록이
    // 이미 있으면 그 유령은 100% 예전 버그의 잔재로 보고 동기화 시점에
    // 자동으로 제거함(사용자에게 보이지도 않고 조용히 정리됨).
    var cloudSig = {};
    cloudLocalFormat.forEach(function(e){ if(e.clientId) cloudSig[e.clientId+'|'+e.price] = true; });
    var localOnly = local.filter(function(e){
      if (e._fromCloud) return false;
      if (cloudIds.indexOf(e.id) !== -1) return false;
      if (!e.dbId && e.clientId && cloudSig[e.clientId+'|'+e.price]) return false; // 자동 정리 대상
      return true;
    });
    var merged = localOnly.concat(cloudLocalFormat);
    _estimateCacheTime = Date.now();
    try { localStorage.setItem('dah_saved', JSON.stringify(merged)); } catch(e) {}
    if (callback) callback(merged);
  });
}

function loadCustomersAsync(callback, force) {
  var now = Date.now();
  if (!force && _customerCache.length > 0 && (now - _customerCacheTime) < CACHE_FRESH_MS) {
    if (callback) callback(_customerCache);
    return;
  }
  // 2026-08-04: is_archived 서버필터 제거 — 삭제된(보관) 고객까지 가져와야
  // "보관 고객 포함" 체크박스로 복구할 수 있음. 예전엔 서버에서부터 삭제된
  // 고객을 걸러서 안 가져오니, 화면에서 "보관 고객 포함"을 켜도 실수로
  // 삭제한 고객이 영영 안 보이는(사실상 복구 불가능한) 심각한 문제였음.
  // 화면단에서는 isSoftDeleted()로 여전히 기본은 숨김 처리됨.
  sbXHR('GET', 'customers?select=*&order=created_at.desc', null, function(err, data) {
    hideLoading();
    if (err) { try { _customerCache = JSON.parse(localStorage.getItem('dah_customers') || '[]'); } catch(e) {} }
    else {
      var fresh = (data || []).map(dbRowToCustomer);
      // 2026-08-05: 오프라인 동기화 큐 — 서버 저장이 아직 안 된(대기중인) 고객은
      // 서버의 옛날 데이터로 덮어쓰지 않고 로컬 버전을 그대로 유지.
      // 이게 없으면 오프라인에서 바꾼 내용이 네트워크 복구 후 재조회 한 번에
      // 조용히 사라지는 문제가 있었음(실제로 발견된 버그).
      if (typeof getPendingSyncQueue === 'function') {
        var pendingKeys = getPendingSyncQueue().map(function(p){ return p.customerKey; });
        if (pendingKeys.length > 0) {
          var localMap = {};
          _customerCache.forEach(function(c){ localMap[c.id || c.clientName] = c; });
          fresh = fresh.map(function(c) {
            var key = c.id || c.clientName;
            return (pendingKeys.indexOf(key) >= 0 && localMap[key]) ? localMap[key] : c;
          });
        }
      }
      _customerCache = fresh; _customerCacheTime = Date.now();
      try { localStorage.setItem('dah_customers', JSON.stringify(_customerCache)); } catch(e) {}
    }
    if (callback) callback(_customerCache);
  });
}

function saveCustomers(arr) { _customerCache = arr; try { localStorage.setItem('dah_customers', JSON.stringify(arr)); } catch(e) {} }

function saveCustomerToDb(customer, callback) {
  // 2026-08-31(선혜님 지적 — "본인이 쓴것도 인지하는거야??"로 발견): 방금
  // 만든 동시편집 충돌감지(updated_at 잠금)가, 같은 사람이 같은 고객을
  // 빠르게 연달아 두 번 저장(예: 단계변경 changeStage처럼 중복클릭
  // 방지가 없는 저장 버튼들)하면 오히려 자기 자신과 충돌한 것으로
  // 오판할 위험이 있었음 - 1차 저장이 서버 응답을 받아 최신 updated_at을
  // 반영하기 전에 2차 저장이 이미 낡은 잠금값으로 시작하면, 2차 저장이
  // "누군가 먼저 저장했다"고 잘못 판단함. 6곳(메모/결제링크/날짜/단계변경
  // 등) 저장버튼 하나하나에 중복클릭 방지를 붙이는 대신, 이 함수 한 곳
  // 에서 같은 고객(id)에 대한 저장을 직렬화(진행중이면 대기했다가 최신
  // updated_at으로 이어서 실행)해서 근본적으로 막음.
  if (customer && customer.id) {
    if (!window._custSaveInFlight) window._custSaveInFlight = {};
    if (window._custSaveInFlight[customer.id]) {
      // 이미 이 고객에 대한 저장이 진행 중 - 그 저장이 끝난 뒤(최신
      // updated_at 반영된 뒤) 이어서 실행되도록 대기열에 추가.
      if (!window._custSaveQueue) window._custSaveQueue = {};
      window._custSaveQueue[customer.id] = { customer: customer, callback: callback };
      return;
    }
    window._custSaveInFlight[customer.id] = true;
  }
  var _origCallback = callback;
  callback = function(err, data) {
    if (customer && customer.id) {
      window._custSaveInFlight[customer.id] = false;
      var queued = window._custSaveQueue && window._custSaveQueue[customer.id];
      if (queued) {
        window._custSaveQueue[customer.id] = null;
        // 대기하던 요청은 이제 최신 customer.updatedAt(방금 갱신됨)을
        // 가진 객체로 이어서 실행 - queued.customer가 같은 참조라면
        // 이미 최신값을 갖고 있고, 다른 참조라도 갱신된 값을 넘겨줌.
        queued.customer.updatedAt = customer.updatedAt;
        saveCustomerToDb(queued.customer, queued.callback);
      }
    }
    if (_origCallback) _origCallback(err, data);
  };
  // 2026-08-28(선혜님 지적 — "이 문구는 왜 또 뜨지??", 배재연을 방금 등록한
  // 직후 본인 화면에서 "다른 곳에서 방금 업데이트됐어요" 배너가 뜬 사례):
  // Realtime 구독은 "누가" 바꿨는지 구분 안 하고 이 브라우저 자신의 저장도
  // 그대로 되돌아와서 알려줌 - 그래서 본인이 방금 한 행동인데도 "다른 곳에서"
  // 바꾼 것처럼 잘못 알림. 이 탭에서 방금 저장 중인 고객 id+시각을 표시해두고,
  // 실시간 이벤트 쪽(dash-realtime.js)에서 "방금 나 자신이 한 것"이면
  // 배너를 건너뛰도록 함.
  if (customer && customer.id) {
    window._lastSelfCustomerWriteId = customer.id;
    window._lastSelfCustomerWriteTime = Date.now();
  }
  var row = customerToDbRow(customer);
  syncCustomerToSheet(customer);
  var key = customer.id || customer.clientName;
  var method = customer.id ? 'PATCH' : 'POST';
  var path = customer.id ? ('customers?id=eq.' + customer.id) : 'customers';
  // 2026-08-31(선혜님 지시 - "만들어줘", 견적서엔 이미 있는 "동시편집
  // 충돌감지"가 고객 레코드엔 없다는 걸 발견해 추가): 수정(PATCH)일 때,
  // 이 화면을 열었던 시점의 updated_at을 잠금조건으로 함께 보내서,
  // 그 사이 다른 사람이 먼저 저장했으면(=updated_at이 달라졌으면)
  // 이번 PATCH가 0건 매칭되어 조용히 실패함 - sbXHR이 이미 감지하는
  // err.zeroRows로 구분해서 사용자에게 명확히 알림.
  var lockUpdatedAt = (method === 'PATCH' && customer.updatedAt) ? customer.updatedAt : null;
  if (lockUpdatedAt) path += '&updated_at=eq.' + encodeURIComponent(lockUpdatedAt);
  sbXHR(method, path, row, function(err, data) {
    if (err) {
      if (err.zeroRows) {
        // 견적서 저장실패 백업(est-save.js)과 정확히 같은 안전망 - 재시도는
        // 위험하니 안 하되, 그 내용은 로컬(기한없이)+서버(다른 기기에서도
        // 확인 가능) 이중으로 백업해서 절대 사라지지 않게 함.
        showToast(lockUpdatedAt
          ? '⚠️ 이 고객 정보가 방금 다른 곳에서 먼저 저장됐어요 — 새로고침해서 최신 내용을 확인해주세요 (내 변경사항은 안전하게 백업됐어요)'
          : '⚠️ 저장이 서버에 반영되지 않았어요 (권한 문제일 수 있어요) — 마스터님께 알려주세요. 내 변경사항은 안전하게 백업됐어요');
        try {
          var failedCustSaves = JSON.parse(localStorage.getItem('dah_failed_customer_saves')||'[]');
          failedCustSaves.push({
            savedAt: new Date().toISOString(),
            reason: lockUpdatedAt ? '동시저장충돌' : '권한문제(담당자불일치 추정)',
            customerId: customer.id,
            payload: row
          });
          if (failedCustSaves.length > 50) failedCustSaves = failedCustSaves.slice(-50);
          localStorage.setItem('dah_failed_customer_saves', JSON.stringify(failedCustSaves));
        } catch(eBackup) { /* 백업 실패해도 저장 흐름엔 영향 안 줌 */ }
        if (typeof reportClientError === 'function') {
          reportClientError('고객정보 저장 실패(권한문제 또는 동시저장충돌) - 내용 백업됨', null,
            { customerPayload: row, reason: lockUpdatedAt ? '동시저장충돌' : '권한문제' });
        }
        // 2026-09-05(선혜님 지시 - "쌍둥이함수"로 발견, 실제 client_error_logs
        // 데이터에서 "김 은"/"유경진" 고객정보가 짧은 간격으로 반복 저장
        // 실패한 패턴 확인): est-save.js에 방금 고친 것과 정확히 같은
        // 쌍둥이 버그 - 동시저장충돌 감지 후 락값(customer.updatedAt)을
        // 갱신하는 코드가 없어서, 재시도해도 계속 예전(불일치) 락값 그대로
        // 재시도해 매번 같은 이유로 반복 실패하고 있었음. 최신 updated_at을
        // 자동으로 다시 조회해서, 로컬스토리지의 해당 고객 레코드에 반영 -
        // 다음 저장 시도(loadCustomers()로 다시 불러온 데이터 기준)가
        // 최신 락값을 쓰게 되어 무의미한 반복 실패를 막음.
        // 2026-09-05(선혜님 지적 - "전문업체라면 이 경우 어떻게 처리할까"):
        // est-save.js와 이 파일에 각각 복사돼 있던 로직을
        // shared-optimistic-lock.js 공용 함수로 뽑아냄.
        if (lockUpdatedAt && customer && customer.id && typeof fetchLatestUpdatedAt === 'function') {
          fetchLatestUpdatedAt('customers', customer.id, function(freshUpdatedAt) {
            if (freshUpdatedAt && typeof loadCustomers === 'function' && typeof saveCustomers === 'function') {
              var arr = loadCustomers();
              var target = arr.find(function(c){ return c.id === customer.id; });
              if (target) {
                target.updatedAt = freshUpdatedAt;
                saveCustomers(arr);
              }
            }
          });
        }
        if (callback) callback(err, data);
        return;
      }
      console.error((customer.id?'수정':'추가') + ' 오류:', err.text);
      // 2026-08-05: 실패를 콘솔에만 남기고 조용히 무시하던 것 수정 —
      // 대기 큐에 기록해서 화면에 경고 배너가 뜨고, 네트워크 복구시 자동 재시도됨
      if (typeof addToPendingSyncQueue === 'function') addToPendingSyncQueue(key, method, path, row);
    } else if (typeof removeFromPendingSyncQueue === 'function') {
      removeFromPendingSyncQueue(key);
    }
    // 저장 성공시, 다음 저장을 위해 최신 updated_at을 반영해둠 - 이걸
    // 안 하면 이 화면을 안 벗어나고 연속으로 두 번 저장할 때, 두 번째
    // 저장이 (이미 낡은) 첫 저장 이전 잠금값을 써서 스스로와 충돌하는
    // 오탐이 날 수 있음.
    if (!err && data && data[0] && data[0].updated_at) {
      customer.updatedAt = data[0].updated_at;
    }
    // 신규 생성(POST)이면 저장 전엔 id를 몰라서 위에서 못 찍었음 - 서버가
    // 응답으로 준 진짜 id로 지금 찍어야 방금 만든 신규 고객도 배너에서 제외됨.
    if (!err && !customer.id && data && data[0] && data[0].id) {
      window._lastSelfCustomerWriteId = data[0].id;
      window._lastSelfCustomerWriteTime = Date.now();
    }
    if (callback) callback(err, data);
  });
}

// 견적서 삭제 — 2026-08-05: 예전엔 견적서를 삭제/숨길 방법이
// 앱 어디에도 없었음(estimates.is_archived 컬럼은 있는데 쓰는 코드가 없었음)
//
// 2026-08-28(선혜님 지시 — "한번 삭제를 하면 보관하지 않아도 돼 괜히 다
// 있으니 헷갈리잖아"): 보관처리(소프트삭제) 방식은 고객상세 화면의
// "견적서" 목록에 지운 것까지 계속 쌓여서 오히려 헷갈리게 만든다는
// 지적으로, 진짜 완전삭제(DB에서 실제로 지움)로 변경. DB쪽
// estimates_delete RLS도 실장이 본인 담당 견적을 지울 수 있게 함께 확장함
// (예전엔 마스터 전용이라 "오지은 실장으로 삭제가 안 된다"는 문제의
// 실제 원인이었을 가능성이 있음 - 8/25엔 "서버가 거부해도 성공했다고
// 뜨는" 거짓성공 증상만 고쳐졌고 근본 권한 문제는 안 고쳐져 있었음).
function archiveEstimate(est, callback) {
  var all = [];
  try { all = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e) {}
  // 2026-08-24(선혜님 발견 — "DAH-20260824-02 눌러도 없다고 나온다"): est.id가
  // null/undefined인 로컬 전용 유령 견적(서버에 한 번도 저장 안 된 것)은
  // x.id===est.id로 찾으면 null끼리 매칭돼서 엉뚱한 것이 지워지거나, 배열에
  // id:null 항목이 여러개면 어느 것도 정확히 못 찾는 문제가 있었음. id가 없으면
  // 대신 no(견적번호, 로컬에서 고유하게 발급됨)로 정확히 찾도록 보강.
  var idx = est.id
    ? all.findIndex(function(x){ return x.id === est.id; })
    : all.findIndex(function(x){ return !x.id && x.no === est.no; });
  if (idx >= 0) all.splice(idx, 1); // 완전삭제 - 로컬 캐시에서도 그냥 제거(보관 플래그 대신)
  localStorage.setItem('dah_saved', JSON.stringify(all));
  if (typeof est.id === 'string' && est.id.length > 20) { // UUID면 서버(client_id 있는 정식 견적서)에도 반영
    sbXHR('DELETE', 'estimates?id=eq.' + est.id, null, function(err){ if(callback) callback(err); });
  } else if (callback) callback(null);
}

// 2026-08-28(선혜님 요청 - "코드 정리, 제대로 하자"로 발견): 이 함수(보관
// 처리용 소프트삭제)는 오늘 삭제 정책을 완전삭제로 전환하면서
// permanentlyDeleteCustomerFromDb로 대체됐고, 더 이상 어디서도 호출되지
// 않는 죽은 코드였음 - 제거함.
// 2026-08-05: 진짜 완전 삭제(되돌릴 수 없음) — 이미 보관(소프트삭제) 처리된
// 고객에게만 노출됨(2단계 안전장치). RLS의 customers_delete 정책상 master
// 역할만 실제로 성공함.
// 2026-08-28(선혜님 지시 - "삭제하면 보관처리 하지마"): 고객을 완전삭제하기
// 전에, 연결된 견적서를 먼저 지워야 함 - estimates.client_id가 customers.id를
// 참조하는 외래키 제약(NO ACTION)이 있어서, 견적서가 남아있으면 고객
// 삭제 자체가 서버에서 거부됨. 순서를 지켜서 삭제.
function permanentlyDeleteCustomerFromDb(customer, callback) {
  var filter = customer && customer.id
    ? 'id=eq.' + customer.id
    : 'client_name=eq.' + encodeURIComponent(typeof customer === 'string' ? customer : (customer && customer.clientName) || '');
  var doDeleteCustomer = function() {
    sbXHR('DELETE', 'customers?' + filter, null, function(err, data) { if(err) console.error('완전삭제 오류:', err.text); if(callback) callback(err, data); });
  };
  if (customer && customer.id) {
    sbXHR('DELETE', 'estimates?client_id=eq.' + customer.id, null, function(estErr) {
      if (estErr) console.warn('연결된 견적서 삭제 중 오류(계속 진행):', estErr.text);
      doDeleteCustomer();
    });
  } else {
    doDeleteCustomer(); // id가 없는 예전 데이터는 이름 매칭이라 견적서 client_id와 못 엮음 - 그대로 진행
  }
}

// 소프트 삭제(보관 처리)된 고객을 다시 되돌림 (동일하게 id 우선, 없으면 이름 폴백)
function restoreCustomerFromDb(customer, callback) {
  var filter = customer && customer.id
    ? 'id=eq.' + customer.id
    : 'client_name=eq.' + encodeURIComponent(typeof customer === 'string' ? customer : (customer && customer.clientName) || '');
  sbXHR('PATCH', 'customers?' + filter, { is_archived: false }, function(err, data) { if(err) console.error('복구 오류:', err.text); if(callback) callback(err, data); });
}

// 놓친 리드(상담 후 오래 진행없음)를 "대기 중인 리드"로 보관 처리 (2026-08-02 신규)
// — is_archived(고객목록에서 삭제)와는 완전히 다른 개념. 삭제가 아니라, 홈 화면
// "처리 필요" 목록에서만 안 보이게 하되 고객목록에서는 계속 찾아볼 수 있게 함.
function parkLead(customer, callback) {
  var filter = customer && customer.id
    ? 'id=eq.' + customer.id
    : 'client_name=eq.' + encodeURIComponent(typeof customer === 'string' ? customer : (customer && customer.clientName) || '');
  sbXHR('PATCH', 'customers?' + filter, { lead_parked: true }, function(err, data) { if(err) console.error('리드 보관 오류:', err.text); if(callback) callback(err, data); });
}

// 대기 중이던 리드가 다시 연락이 와서 활성 상태로 복귀
function unparkLead(customer, callback) {
  var filter = customer && customer.id
    ? 'id=eq.' + customer.id
    : 'client_name=eq.' + encodeURIComponent(typeof customer === 'string' ? customer : (customer && customer.clientName) || '');
  sbXHR('PATCH', 'customers?' + filter, { lead_parked: false }, function(err, data) { if(err) console.error('리드 복귀 오류:', err.text); if(callback) callback(err, data); });
}


// ══════════════════════════════════════════════════
// 2026-08-25: 자동 에러 수집 (선혜님 요청 — "대기업처럼 에러를 자동으로 받아보자")
// 화면에서 나는 JS 에러/처리안된 오류를 자동으로 Supabase에 기록.
// 캡처 없이도 Claude가 바로 정확한 원인을 조회할 수 있게 함.
// ══════════════════════════════════════════════════
(function () {
  function reportClientError(message, stack, extra) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', SUPABASE_URL + '/rest/v1/client_error_logs', true);
      xhr.setRequestHeader('apikey', SUPABASE_KEY);
      xhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Prefer', 'return=minimal');
      var role = null, name = null;
      try {
        var u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : (typeof window._estCurrentUser !== 'undefined' ? window._estCurrentUser : null);
        if (u) { role = u.role || null; name = u.name || null; }
      } catch (e) {}
      xhr.send(JSON.stringify({
        app: (location.pathname.indexOf('dashboard') >= 0 ? 'dashboard' : 'estimate'),
        message: String(message || '').slice(0, 2000),
        stack: String(stack || '').slice(0, 4000),
        url: location.href,
        user_role: role,
        user_name: name,
        build: (typeof window.DAH_BUILD !== 'undefined' ? window.DAH_BUILD : null),
        extra: extra || null
      }));
    } catch (e) { /* 에러 리포팅 자체가 실패해도 화면엔 절대 영향 없게 조용히 무시 */ }
  }

  window.addEventListener('error', function (ev) {
    reportClientError(ev.message, ev.error && ev.error.stack, { filename: ev.filename, lineno: ev.lineno, colno: ev.colno });
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var reason = ev.reason;
    reportClientError(
      '(Promise rejection) ' + (reason && reason.message ? reason.message : String(reason)),
      reason && reason.stack
    );
  });
  window.reportClientError = reportClientError; // 수동으로도 기록 가능(예: catch 블록에서)
})();
