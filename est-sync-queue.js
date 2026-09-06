/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 오프라인/네트워크 실패 재시도 큐 (2026-08-05 신규)
   ══════════════════════════════════════════════════
   대시보드(dash-sync-queue.js)와 같은 목적, 다른 파일인 이유:
   dah-dashboard.vercel.app / dah-estimate.vercel.app이 서로 다른
   서브도메인이라 localStorage가 공유되지 않음 — 각 앱에 따로 둬야 함.

   estimates 테이블은 POST 전용(매번 새 행)이라, 만에 하나 "서버는 실제로
   저장에 성공했는데 응답을 못 받아서 실패로 오판"한 경우 재시도가 중복
   행을 만들 수 있음(드문 엣지케이스). 완전한 멱등성 처리까진 안 했고,
   "데이터 유실"보다 "가끔 중복행"이 훨씬 나은 선택이라 이렇게 둠 —
   중복행이 걱정되면 매출탭에서 눈으로 걸러내기 쉬움(같은 고객+같은 금액
   +같은 날짜가 연속으로 있으면 중복 의심).
   ══════════════════════════════════════════════════ */

var EST_PENDING_KEY = 'dah_pending_estimate_sync';

function getEstPendingQueue() {
  try { return JSON.parse(localStorage.getItem(EST_PENDING_KEY) || '[]'); } catch(e) { return []; }
}

function addToEstPendingQueue(payload, isEditMode, dbId) {
  var q = getEstPendingQueue();
  // 2026-08-12: 재시도 큐가 항상 POST로만 재시도해서, "열어서 수정" 중
  // 네트워크가 끊긴 경우 재시도 시 PATCH(기존 견적서 갱신)가 아니라
  // POST(신규생성)가 나가 중복 견적서가 생기던 버그. isEditMode/dbId를
  // 큐 항목에 같이 저장해서 재시도시 정확한 method를 쓰도록 함.
  q.push({ payload: payload, addedAt: new Date().toISOString(), isEditMode: !!isEditMode, dbId: dbId || null });
  if (q.length > 200) q = q.slice(-200); // 무한정 쌓이는 것 방지
  try { localStorage.setItem(EST_PENDING_KEY, JSON.stringify(q)); } catch(e) {}
  updateEstSyncBanner();
}

function updateEstSyncBanner() {
  var q = getEstPendingQueue();
  var existing = document.getElementById('est-sync-pending-banner');
  if (q.length === 0) { if (existing) existing.remove(); return; }
  if (!existing) {
    existing = document.createElement('div');
    existing.id = 'est-sync-pending-banner';
    existing.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:99998;background:#C0392B;color:#fff;padding:9px 16px;border-radius:12px;font-size:12px;font-weight:700;display:flex;align-items:center;gap:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);cursor:pointer;font-family:inherit';
    existing.onclick = function(){ retryEstPendingSync(); };
    document.body.appendChild(existing);
  }
  existing.textContent = '⚠️ 견적서 ' + q.length + '건 서버 저장 대기중 — 탭해서 재시도';
}

function retryEstPendingSync() {
  var q = getEstPendingQueue();
  if (q.length === 0) return;
  // 2026-08-29(선혜님 지시 - "코드 다 봤니"로 이어서 발견): online 이벤트,
  // 30초 주기 타이머, 페이지로드 2초뒤 재시도 - 이 3가지 트리거가 동시에
  // 겹치면 같은 큐 항목이 중복으로 재전송될 수 있었음(진행중 플래그가
  // 전혀 없었음). 오늘 고친 idempotency key 재사용 덕분에 DB 유니크
  // 인덱스가 최종적으로는 막아주지만, 애초에 중복 호출 자체를 막는 게
  // 더 안전하고 서버 부하도 줄임.
  if (window._estRetrySyncInProgress) return;
  window._estRetrySyncInProgress = true;
  // 2026-08-25(선혜님 발견 — 재시도해도 계속 403): 이 재시도 함수는
  // refreshAuthSessionIfNeeded를 아예 호출하지 않고 있었음 — 저장 직전에는
  // 이미 갱신 체크를 넣었는데(est-save.js), 이 "재시도 큐" 경로는 완전히
  // 별개 코드라 그 수정이 적용 안 됐음. 그래서 처음 저장이 토큰 만료로
  // 실패해서 큐에 쌓인 뒤, 재시도할 때도 갱신 없이 그 만료된 토큰을 그대로
  // 다시 써서 매번 똑같이 403이 났음. 재시도 시작 전에 먼저 갱신부터
  // 확인하도록 수정 — 갱신 자체가 실패하면(로그아웃된 상태) 재시도를
  // 시도하지 않고 명확히 재로그인을 안내함.
  if (typeof refreshAuthSessionIfNeeded === 'function') {
    refreshAuthSessionIfNeeded(function(ok) {
      if (ok) { _doRetryEstPendingSync(q); }
      else {
        // 2026-08-29(선혜님 지시 - "코드 다 봤니"로 발견): 여기서
        // _doRetryEstPendingSync가 실행 안 되는 경로들(재로그인 프롬프트를
        // 그냥 닫거나 응답 안 함, showReloginPrompt 함수 자체가 없는 경우)엔
        // 위에서 세운 진행중 플래그를 해제할 기회가 전혀 없어서, 한 번 이
        // 상황을 겪으면 그 이후 30초 자동재시도/online 이벤트 재시도가
        // 전부 조용히 무시되는 심각한 회귀가 될 뻔했음 - 즉시 해제.
        window._estRetrySyncInProgress = false;
        // 2026-08-25(선혜님 요청): alert 안내만 하고 끝내던 걸, 그 자리에서
        // 비밀번호만 다시 넣으면 재시도까지 자동으로 이어지도록 변경.
        if (typeof showReloginPrompt === 'function') {
          showReloginPrompt(function() { window._estRetrySyncInProgress = true; _doRetryEstPendingSync(getEstPendingQueue()); });
        } else {
          alert('⚠️ 로그인이 만료됐어요.\n\n대기 중인 견적서 ' + q.length + '건이 아직 저장 안 됐어요.\n로그아웃 후 다시 로그인한 뒤, 이 배너를 다시 눌러 재시도해주세요.\n(대기 중인 내용은 사라지지 않아요)');
        }
      }
    });
  } else {
    _doRetryEstPendingSync(q);
  }
}

function _doRetryEstPendingSync(q) {
  if (typeof showToast === 'function') showToast('견적서 동기화 재시도 중…');
  // 2026-08-20(선혜님 발견 — 태블릿에서 계속 대기중으로 남던 문제): 재시도가
  // 실패해도 왜 실패했는지 전혀 안 보여줘서 원인 파악이 불가능했음. 인증 세션
  // 유무와 실패 상태코드를 명확히 alert로 보여주도록 개선.
  var hasSession = (typeof getAuthSession === 'function') ? !!getAuthSession() : null;
  var remaining = [];
  var pending = q.length;
  var done = 0;
  var failReasons = [];
  q.forEach(function(item) {
    var xhr = new XMLHttpRequest();
    var isEdit = item.isEditMode && item.dbId;
    if (isEdit) {
      xhr.open('PATCH', SUPABASE_URL + '/rest/v1/estimates?id=eq.' + encodeURIComponent(item.dbId), true);
    } else {
      xhr.open('POST', SUPABASE_URL + '/rest/v1/estimates', true);
    }
    xhr.setRequestHeader('apikey', SUPABASE_KEY);
    xhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Prefer', isEdit ? 'return=minimal' : 'return=minimal');
    xhr.onload = function() {
      done++;
      if ((xhr.status < 200 || xhr.status >= 300) && xhr.status !== 409) {
        remaining.push(item);
        // 2026-08-25(선혜님 지적 — "니 테스트가 어떤방식인지 궁금해"): 지금까지
        // 제가 몇 번을 "이게 원인이다" 추측해서 고쳤는데도 똑같은 403이
        // 반복됐음. 더 이상 추측하지 않기 위해, 서버가 실제로 뭐라고 응답
        //했는지(정확한 에러 메시지 본문) 그대로 남겨서, 다음에 또 안 되면
        // 추측이 아니라 이 정확한 문구로 바로 원인을 알 수 있게 함.
        var serverMsg = '';
        try { var eb = JSON.parse(xhr.responseText); serverMsg = eb.message || eb.msg || eb.error || xhr.responseText; } catch(eParse) { serverMsg = (xhr.responseText||'').slice(0,200); }
        failReasons.push('상태코드 ' + xhr.status + (xhr.status === 401 || xhr.status === 403 ? '(로그인 세션 문제로 추정)' : '') + ' — 서버응답: ' + serverMsg);
        // 2026-08-25(선혜님 발견 — 재시도해도 계속 같은 403): "토큰이 아직
        // 안 만료됐을 시간"이라는 이 기기의 시계 계산만 믿고 갱신을 건너뛰는
        // 경우가 있었음(예: 이미 서버에서 거부된 토큰인데 로컬 계산상으론
        // 아직 유효해 보이는 경우) — 그러면 갱신 없이 그대로 재시도해서 또
        // 같은 403이 남. 이젠 서버가 실제로 401/403을 준 순간을 최우선으로
        // 믿어서, 로컬 시계 계산과 무관하게 즉시 재로그인 팝업을 띄움.
        if ((xhr.status === 401 || xhr.status === 403) && typeof showReloginPrompt === 'function' && !window._reloginPromptShown) {
          // 재로그인해도 또 실패하는 걸 무한반복하지 않도록 횟수 제한 — 2번째부터는
          // 팝업 대신 서버가 준 정확한 메시지를 그대로 보여줘서 추측을 멈춤.
          window._reloginRetryCount = (window._reloginRetryCount || 0) + 1;
          if (window._reloginRetryCount > 2) {
            alert('⚠️ 재로그인해도 계속 저장이 거부돼요.\n\n서버 응답: ' + serverMsg + '\n\n이 화면을 캡처해서 보내주세요 — 이번엔 추측이 아니라 이 메시지로 정확한 원인을 확인할 수 있어요.');
            return;
          }
          window._reloginPromptShown = true;
          showReloginPrompt(function() {
            window._reloginPromptShown = false;
            _doRetryEstPendingSync(getEstPendingQueue());
          });
        }
      }
      if (done === pending) {
        try { localStorage.setItem(EST_PENDING_KEY, JSON.stringify(remaining)); } catch(e) {}
        updateEstSyncBanner();
        window._estRetrySyncInProgress = false;
        // 2026-08-25: 401/403이었던 건은 위에서 이미 재로그인 팝업으로 안내
        // 중이므로, 여기서 또 alert까지 뜨면 팝업 두 개가 겹쳐서 혼란스러움.
        // 재로그인 관련 실패가 아닌 다른 이유(400 등)로 남은 게 있을 때만 alert.
        var nonAuthFail = failReasons.some(function(r){ return r.indexOf('401') === -1 && r.indexOf('403') === -1; });
        if (remaining.length > 0 && nonAuthFail) {
          alert('⚠️ 서버 저장 재시도 실패\n\n로그인 세션 있음: ' + hasSession + '\n실패 사유: ' + failReasons.join(', ') + '\n\n이 화면을 캡처해서 보내주세요.');
        }
      }
    };
    xhr.onerror = function() {
      done++;
      remaining.push(item);
      failReasons.push('네트워크 연결 실패(요청 자체가 서버에 도달 못함)');
      if (done === pending) {
        try { localStorage.setItem(EST_PENDING_KEY, JSON.stringify(remaining)); } catch(e) {}
        updateEstSyncBanner();
        window._estRetrySyncInProgress = false;
        alert('⚠️ 서버 저장 재시도 실패\n\n로그인 세션 있음: ' + hasSession + '\n실패 사유: ' + failReasons.join(', ') + '\n\n이 화면을 캡처해서 보내주세요.');
      }
    };
    xhr.send(JSON.stringify(item.payload));
  });
}

window.addEventListener('online', function(){ retryEstPendingSync(); });
setInterval(function(){ if (getEstPendingQueue().length > 0) retryEstPendingSync(); }, 30000);

document.addEventListener('DOMContentLoaded', function(){
  updateEstSyncBanner();
  if (getEstPendingQueue().length > 0) setTimeout(retryEstPendingSync, 2000);
});
