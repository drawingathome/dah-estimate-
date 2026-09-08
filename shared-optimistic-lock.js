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
//     if (updatedAt) window._editingEstUpdatedAt = updatedAt;
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
