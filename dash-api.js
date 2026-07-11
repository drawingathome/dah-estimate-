/* ══════════════════════════════════════════════════
   DAH 대시보드 — 데이터 접근 계층 (Supabase / localStorage)
   Supabase 통신, 고객 데이터 읽기/쓰기/변환, 담당자 목록,
   설정 클라우드 동기화 등 "데이터를 가져오고 저장하는" 함수들만 모음.
   화면(DOM)을 직접 그리는 함수는 여기 없음 — 그건 메인 파일에 남아있음.
   ══════════════════════════════════════════════════ */

function getStaffList() {
  try { var list = JSON.parse(localStorage.getItem('dah_staff_list') || '[]'); return list.length > 0 ? list : []; } catch(e) { return []; }
}

var SUPABASE_URL = 'https://sradnglutbzbyyunjyah.supabase.co';
var SUPABASE_KEY = 'sb_publishable_9nYjQBzwiyausr7-Cd-elw_S9inJlge';

// 구글드라이브 자동화 허브 웹훅 (배포 후 URL 채워넣을 예정) — 견적서 앱과 공유
var DRIVE_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyPGuFy8etPQUb3R8AnHFUtTRGnB2gnCc98m9JXCt1o8Sjbfj4wlEQb3MGpYEXDJ4sKGw/exec';
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
  xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_KEY);
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

var _customerCache = [];

// ── 앱 설정 동기화 (담당자목록/월목표매출/계좌정보/웹훅/마스터비번) ──
// 여러 컴퓨터·휴대폰에서 동일한 설정값이 보이도록 Supabase app_settings 테이블과 동기화
function sbSyncSetting(key, value) {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', SUPABASE_URL + '/rest/v1/app_settings?on_conflict=key', true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_KEY);
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
    });
    // Supabase에 아직 없는 값은 이 컴퓨터에 있는 값으로 최초 1회 올려줌 (첫 동기화)
    if (!found.staff_list) { try { var sl = JSON.parse(localStorage.getItem('dah_staff_list')||'[]'); if (sl.length) sbSyncSetting('staff_list', sl); } catch(e){} }
    if (!found.settings) { try { var s = JSON.parse(localStorage.getItem('dah_settings')||'{}'); if (Object.keys(s).length) sbSyncSetting('settings', s); } catch(e){} }
    if (!found.webhook_url) { try { var w = localStorage.getItem('dah_webhook_url'); if (w) sbSyncSetting('webhook_url', w); } catch(e){} }
    if (!found.master_pw) { try { var mp = localStorage.getItem('dah_master_pw'); if (mp) sbSyncSetting('master_pw', mp); } catch(e){} }
    if (!found.staff_goals) { syncStaffGoalsToCloud(); }
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
    // 결제 필드
    depositAmount:      Number(row.deposit_amount)||0,
    depositDate:        row.deposit_date||'',
    depositMethod:      row.deposit_method||'',
    depositReceipt:     row.deposit_receipt||false,
    balanceAmount:      Number(row.balance_amount)||0,
    balanceDate:        row.balance_date||'',
    balanceMethod:      row.balance_method||'',
    balanceReceipt:     row.balance_receipt||false
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
    balance_receipt:     c.balanceReceipt||false
  };
}

function loadCustomers() {
  if (_customerCache.length > 0) return _customerCache;
  try { return JSON.parse(localStorage.getItem('dah_customers') || '[]'); } catch(e) { return []; }
}

function loadCustomersAsync(callback) {
  sbXHR('GET', 'customers?select=*&is_archived=eq.false&order=created_at.desc', null, function(err, data) {
    hideLoading();
    if (err) { try { _customerCache = JSON.parse(localStorage.getItem('dah_customers') || '[]'); } catch(e) {} }
    else { _customerCache = (data || []).map(dbRowToCustomer); try { localStorage.setItem('dah_customers', JSON.stringify(_customerCache)); } catch(e) {} }
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

function deleteCustomerFromDb(clientName, callback) {
  // 실제 DELETE는 RLS에서 막혀있음(데이터 보호) → 소프트 삭제(is_archived=true)로 처리
  sbXHR('PATCH', 'customers?client_name=eq.' + encodeURIComponent(clientName), { is_archived: true }, function(err, data) { if(err) console.error('삭제 오류:', err.text); if(callback) callback(err, data); });
}

