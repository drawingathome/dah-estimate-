/* ══════════════════════════════════════════════════
   DAH 대시보드 — 데이터 접근 계층 (Supabase / localStorage)
   Supabase 통신, 고객 데이터 읽기/쓰기/변환, 담당자 목록,
   설정 클라우드 동기화 등 "데이터를 가져오고 저장하는" 함수들만 모음.
   화면(DOM)을 직접 그리는 함수는 여기 없음 — 그건 메인 파일에 남아있음.
   ══════════════════════════════════════════════════ */

var SUPABASE_URL = 'https://sradnglutbzbyyunjyah.supabase.co';
var SUPABASE_KEY = 'sb_publishable_9nYjQBzwiyausr7-Cd-elw_S9inJlge';

// 구글드라이브 자동화 허브 웹훅 (배포 후 URL 채워넣을 예정) — 견적서 앱과 공유
var DRIVE_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyyNG-Y6sABngKqk2ttfXUK_LIrQtyqiLLaaEvUnhWs3Yn4YqFtsGTVoug7EQAbig6OgQ/exec';
// 2026-09-16(선혜님 - "링크 너가 나한테 준거잖아"): syncCustomerToSheet는
// shared-common-utils.js로 옮김(DRIVE_WEBHOOK_URL은 위에서 이미 정의됨,
// shared-common-utils.js는 이 파일보다 항상 나중에 로드되도록 배치).

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
    // 2026-09-06(선혜님 지시 - "하자", 스테이징 환경에서 실제로 발견):
    // app_settings 테이블은 로그인된 사용자만 조회/저장 가능(RLS: auth.
    // uid() IS NOT NULL)한데, 아래 "서버에 없으면 로컬값을 올려주는" 로직이
    // 로그인 화면이 뜨기 직전(로그인 여부와 무관하게) 항상 실행되고 있었음
    // - 로그인 전엔 이 저장 시도가 100% 실패할 수밖에 없는 구조라, 매번
    // "설정이 서버에 저장되지 않았어요" 경고가 불필요하게 떴음(실제로는
    // 서버에 정상적으로 값이 있는데도). 로그인 세션이 있을 때만 이 동기화
    // 시도를 하도록 제한.
    if (typeof getAuthSession === 'function' && !getAuthSession()) {
      if (callback) callback();
      return;
    }
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
