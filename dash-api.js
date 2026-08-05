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
  xhr.setRequestHeader('Prefer', method === 'POST' ? 'return=representation' : 'return=minimal');
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      var result = null;
      try { result = xhr.responseText ? JSON.parse(xhr.responseText) : []; } catch(e) { result = []; }
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
  xhr.onload = function() { if (xhr.status < 200 || xhr.status >= 300) { console.warn('설정 동기화 실패:', key, xhr.status); } };
  xhr.onerror = function() { console.warn('설정 동기화 실패(네트워크):', key); };
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
      else if (row.key === 'master_pw') { try { localStorage.setItem('dah_master_pw', row.value); MASTER_PW = row.value; } catch(e){} }
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
    leadParked:         row.lead_parked||false
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
    branch:              c.branch||'반포점'
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
  return {
    id: row.id,
    no: row.id ? String(row.id).slice(0,8) : '',
    clientName: row.customer_name || '',
    phone: row.phone || '',
    addr: '',
    space: row.space || '',
    fabric: row.product || '',
    itemCount: 0, curtainCount: 0, blindCount: 0,
    curtainVendors: [], blindVendors: [],
    price: Number(row.price) || 0,
    performanceRevenue: Number(row.performance_revenue) || 0,
    staffName: row.staff_name || '',
    status: row.estimate_status || 'ga',
    // 2026-08-04: 여기서 무조건 'pending'으로 고정돼서, 최종견적서(final)로
    // 저장된 견적도 화면엔 "가견적" 배지로 보이던 진짜 원인이었음
    contractStatus: row.estimate_status === 'final' ? 'contracted' : 'pending',
    savedAt: row.date || row.created_at || '',
    date: row.date || '',
    installDate: '',
    memo: row.memo || '',
    confirmedAt: row.confirmed_at || null,
    branch: row.branch || '반포점',
    clientId: row.client_id || null,
    lineItems: row.line_items || [],
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
    var localOnly = local.filter(function(e){ return !e._fromCloud && cloudIds.indexOf(e.id) === -1; });
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
    else { _customerCache = (data || []).map(dbRowToCustomer); _customerCacheTime = Date.now(); try { localStorage.setItem('dah_customers', JSON.stringify(_customerCache)); } catch(e) {} }
    if (callback) callback(_customerCache);
  });
}

function saveCustomers(arr) { _customerCache = arr; try { localStorage.setItem('dah_customers', JSON.stringify(arr)); } catch(e) {} }

function saveCustomerToDb(customer, callback) {
  var row = customerToDbRow(customer);
  syncCustomerToSheet(customer);
  if (customer.id) {
    sbXHR('PATCH', 'customers?id=eq.' + customer.id, row, function(err, data) { if(err) console.error('수정 오류:', err.text); if(callback) callback(err, data); });
  } else {
    sbXHR('POST', 'customers', row, function(err, data) { if(err) console.error('추가 오류:', err.text); if(callback) callback(err, data); });
  }
}

// 견적서 보관(소프트 삭제) — 2026-08-05: 예전엔 견적서를 삭제/숨길 방법이
// 앱 어디에도 없었음(estimates.is_archived 컬럼은 있는데 쓰는 코드가 없었음)
function archiveEstimate(est, callback) {
  var all = [];
  try { all = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e) {}
  var target = all.find(function(x){ return x.id === est.id; });
  if (target) target.isArchived = true;
  localStorage.setItem('dah_saved', JSON.stringify(all));
  if (typeof est.id === 'string' && est.id.length > 20) { // UUID면 서버(client_id 있는 정식 견적서)에도 반영
    sbXHR('PATCH', 'estimates?id=eq.' + est.id, { is_archived: true }, function(err){ if(callback) callback(err); });
  } else if (callback) callback(null);
}

// customer 객체(id 포함 가능)를 받아 삭제. id가 있으면 id로 정확히 지정,
// 없는 예전 데이터는 부득이 이름으로 폴백(이 경우에만 동명이인 위험이 남음).
function deleteCustomerFromDb(customer, callback) {
  var filter = customer && customer.id
    ? 'id=eq.' + customer.id
    : 'client_name=eq.' + encodeURIComponent(typeof customer === 'string' ? customer : (customer && customer.clientName) || '');
  // 실제 DELETE는 RLS에서 master 역할만 허용됨(customers_delete 정책) → 여기선 안전하게 소프트 삭제(is_archived=true)만 함
  sbXHR('PATCH', 'customers?' + filter, { is_archived: true }, function(err, data) { if(err) console.error('삭제 오류:', err.text); if(callback) callback(err, data); });
}

// 2026-08-05: 진짜 완전 삭제(되돌릴 수 없음) — 이미 보관(소프트삭제) 처리된
// 고객에게만 노출됨(2단계 안전장치). RLS의 customers_delete 정책상 master
// 역할만 실제로 성공함.
function permanentlyDeleteCustomerFromDb(customer, callback) {
  var filter = customer && customer.id
    ? 'id=eq.' + customer.id
    : 'client_name=eq.' + encodeURIComponent(typeof customer === 'string' ? customer : (customer && customer.clientName) || '');
  sbXHR('DELETE', 'customers?' + filter, null, function(err, data) { if(err) console.error('완전삭제 오류:', err.text); if(callback) callback(err, data); });
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

