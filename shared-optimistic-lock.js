// ══════════════════════════════════════════════════════════
// DAH 공용 — 낙관적 잠금(동시저장충돌) 락값 갱신
// 2026-09-05(선혜님 지적 — "전문업체라면 이 경우 어떻게 처리할까"):
// 이 파일이 생기기 전엔, "저장이 동시저장충돌로 실패하면 최신
// updated_at을 다시 조회해서 락값을 갱신한다"는 로직이 est-save.js
// (견적서)와 dash-api.js(대시보드) 두 곳에 거의 똑같이 복사돼 있었고,
// 실제로 한쪽만 고치고 다른 쪽을 깜빡할 뻔한 사고가 있었음(cross-app-
// twin-check.js 테스트도 "문자 그대로 동일한 함수"만 잡아내지, 이렇게
// 구현 디테일이 조금씩 다른 같은 개념까지는 못 잡음).
//
// 해결책: "특정 테이블의 특정 id에 대해 최신 updated_at을 서버에서
// 조회한다"는 핵심 로직 자체를 이 파일 하나로 뽑아냄. 각 앱은 그
// 결과를 자기 방식(견적서=window 전역변수, 대시보드=로컬스토리지
// 객체)으로 반영하기만 하면 됨 - 이러면 "조회 로직 자체의 버그"는
// 고칠 곳이 한 곳뿐이라, 앞으로 한쪽만 고치고 깜빡하는 실수 자체가
// 구조적으로 불가능해짐.
//
// 사용법: 이 스크립트는 SUPABASE_URL/SUPABASE_KEY가 이미 정의된
// 뒤에 로드되어야 함(각 앱의 dash-api.js/est-utils.js가 먼저 로드됨).
//
//   fetchLatestUpdatedAt('estimates', estId, function(updatedAt) {
//     if (updatedAt) window._estEditState.editingEstUpdatedAt = updatedAt;
//   });
//
//   fetchLatestUpdatedAt('customers', custId, function(updatedAt) {
//     if (updatedAt) { target.updatedAt = updatedAt; saveCustomers(arr); }
//   });
// ══════════════════════════════════════════════════════════

function fetchLatestUpdatedAt(table, id, callback) {
  if (!table || !id || typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_KEY === 'undefined') {
    callback(null);
    return;
  }
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id) + '&select=updated_at', true);
    xhr.setRequestHeader('apikey', SUPABASE_KEY);
    xhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
    xhr.onload = function() {
      try {
        var rows = JSON.parse(xhr.responseText);
        callback(rows[0] && rows[0].updated_at ? rows[0].updated_at : null);
      } catch (e) { callback(null); }
    };
    xhr.onerror = function() { callback(null); };
    xhr.send();
  } catch (e) { callback(null); }
}

// 2026-09-12(선혜님 지적 - "오류를 너한테 줘도 니가 고칠 생각을 안하는거
// 같아서" - 구글드라이브/시트 저장 "Failed to fetch" 반복 실패의 실제
// 원인을 조사해서 발견): fetch가 단 한 번만 시도하고 실패하면 그걸로
// 끝이라, 모바일 네트워크 순간 끊김이나 Apps Script 콜드스타트 지연
// 같은 일시적 문제에도 곧바로 영구 실패로 기록됐음 - 최대 2번(1초 간격)
// 재시도. 두 앱(견적서/대시보드) 다 이 파일을 로드하므로 여기 한 곳에만
// 정의해서 쌍둥이 함수가 되지 않게 함.
function fetchWithRetry(url, options, retriesLeft) {
  if (retriesLeft === undefined) retriesLeft = 2;
  return fetch(url, options).catch(function (e) {
    if (retriesLeft > 0) {
      return new Promise(function (resolve) { setTimeout(resolve, 1000); })
        .then(function () { return fetchWithRetry(url, options, retriesLeft - 1); });
    }
    throw e;
  });
}

// ══════════════════════════════════════════════════════════
// 2026-10-11(선혜님 - "시간차가 나도 자꾸 충돌한다"): 같은 브라우저에서 견적서 앱이 고객 행을 갱신하면 DB가 고객 수정 시각(잠금값)을
// 새로 찍는데, 열려 있는 대시보드 화면은 예전 시각을 들고 있어 가짜 충돌이 났음. "내가 이 브라우저에서 직접 한 갱신"을 공용 장부에
// 적어두고, 대시보드가 저장 직전에 그 장부를 보고(잠금값이 장부의 '시작 시각'과 정확히 같을 때만) 이어받음.
// 다른 기기가 끼어들었으면 장부와 안 맞아 이어받지 않고 서버 잠금이 진짜 충돌로 막음.
// 장부는 별도 키(dah_self_lock_ledger)라 고객 목록 캐시가 통째로 다시 저장돼도 지워지지 않음. 두 앱이 이 파일을 같이 쓰므로 한 곳에만 정의.
// ══════════════════════════════════════════════════════════
var SELF_LOCK_LEDGER_KEY = 'dah_self_lock_ledger';

function _readSelfLockLedger() {
  try { return JSON.parse(localStorage.getItem(SELF_LOCK_LEDGER_KEY) || '{}') || {}; } catch (e) { return {}; }
}

// fromLock = 이 갱신을 하기 직전 서버 시각, toLock = 갱신 후 서버가 돌려준 새 시각, fields = 이 갱신이 함께 바꾼 견적 소유 필드(price/performanceRevenue)
function recordSelfLockAdvance(customerId, fromLock, toLock, fields) {
  if (!customerId || !toLock) return;
  try {
    var ledger = _readSelfLockLedger();
    var key = String(customerId);
    var prev = ledger[key];
    // 연달아 내가 갱신한 경우(직전 장부의 끝 시각 = 이번 시작 시각)엔 처음 시작 시각을 유지
    var start = (prev && prev.to === fromLock) ? prev.from : fromLock;
    if (!start) return;
    var entry = { from: start, to: toLock, at: Date.now() };
    var f = fields || (prev && prev.to === fromLock ? prev.fields : null);
    if (f) entry.fields = f;
    ledger[key] = entry;
    // 장부가 무한정 커지지 않게 오래된(1일 이상) 항목 정리
    Object.keys(ledger).forEach(function (k) { if (!ledger[k] || Date.now() - (ledger[k].at || 0) > 86400000) delete ledger[k]; });
    localStorage.setItem(SELF_LOCK_LEDGER_KEY, JSON.stringify(ledger));
  } catch (e) { /* 장부 실패는 저장 흐름에 영향 없게 */ }
}

// 고객 객체의 잠금값이 장부의 시작 시각과 정확히 같으면 최신 시각(과 견적 소유 필드)을 이어받음. 이어받았으면 true.
function adoptSelfLock(customer) {
  try {
    if (!customer || !customer.id || !customer.updatedAt) return false;
    var entry = _readSelfLockLedger()[String(customer.id)];
    if (!entry || entry.from !== customer.updatedAt) return false;
    if (!(Date.parse(entry.to) > Date.parse(customer.updatedAt))) return false;
    customer.updatedAt = entry.to;
    if (entry.fields) {
      if (entry.fields.price !== undefined) customer.price = entry.fields.price;
      if (entry.fields.performanceRevenue !== undefined) customer.performanceRevenue = entry.fields.performanceRevenue;
    }
    return true;
  } catch (e) { return false; }
}
