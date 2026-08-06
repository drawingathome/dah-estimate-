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

function addToEstPendingQueue(payload) {
  var q = getEstPendingQueue();
  q.push({ payload: payload, addedAt: new Date().toISOString() });
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
  if (typeof showToast === 'function') showToast('견적서 동기화 재시도 중…');
  // 성공한 것만 제거하고 나머지는 큐에 남김
  var remaining = [];
  var pending = q.length;
  var done = 0;
  q.forEach(function(item) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', SUPABASE_URL + '/rest/v1/estimates', true);
    xhr.setRequestHeader('apikey', SUPABASE_KEY);
    xhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Prefer', 'return=minimal');
    xhr.onload = function() {
      done++;
      // 2026-08-05: 409(idempotency key 중복)도 성공으로 취급 — 이전 시도가
      // 실제로는 서버에 이미 저장됐었다는 뜻(응답만 유실됐던 것)
      if ((xhr.status < 200 || xhr.status >= 300) && xhr.status !== 409) remaining.push(item);
      if (done === pending) { try { localStorage.setItem(EST_PENDING_KEY, JSON.stringify(remaining)); } catch(e) {} updateEstSyncBanner(); }
    };
    xhr.onerror = function() {
      done++;
      remaining.push(item);
      if (done === pending) { try { localStorage.setItem(EST_PENDING_KEY, JSON.stringify(remaining)); } catch(e) {} updateEstSyncBanner(); }
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
