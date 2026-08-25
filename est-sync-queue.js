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
        alert('⚠️ 로그인이 만료됐어요.\n\n대기 중인 견적서 ' + q.length + '건이 아직 저장 안 됐어요.\n로그아웃 후 다시 로그인한 뒤, 이 배너를 다시 눌러 재시도해주세요.\n(대기 중인 내용은 사라지지 않아요)');
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
        failReasons.push('상태코드 ' + xhr.status + (xhr.status === 401 || xhr.status === 403 ? '(로그인 세션 문제로 추정)' : ''));
      }
      if (done === pending) {
        try { localStorage.setItem(EST_PENDING_KEY, JSON.stringify(remaining)); } catch(e) {}
        updateEstSyncBanner();
        if (remaining.length > 0) {
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
