/* ══════════════════════════════════════════════════
   DAH — 오프라인/네트워크 실패 동기화 큐 (2026-08-05 신규)
   ══════════════════════════════════════════════════
   문제였던 것: saveCustomerToDb()가 서버 저장 성공 여부와 무관하게
   항상 "저장됐습니다" 토스트를 띄웠음. 네트워크가 끊긴 상태에서
   단계변경/메모/결제 등을 저장하면 로컬(localStorage)엔 반영되지만
   서버(Supabase)엔 하나도 안 올라가는데, 화면은 계속 성공한 것처럼
   보였음 — 심지어 나중에 네트워크가 복구된 후 아무 화면이나 전환하면
   loadCustomersAsync()가 서버의 "옛날" 데이터로 로컬 전체를 덮어써서
   그 변경사항이 조용히 사라지기까지 했음.

   이 파일이 하는 일:
   1. 서버 저장이 실패하면 "대기 큐"(dah_pending_sync)에 기록
   2. 화면 하단에 "N건 저장 대기중" 배너를 띄워서 눈에 보이게 함
   3. 네트워크 복구(online 이벤트) + 30초마다 자동 재시도
   4. 대기중인 고객은 loadCustomersAsync()가 서버 데이터로 새로고침할 때
      덮어쓰지 않고 로컬 버전을 그대로 유지(핵심 — 이게 없으면 큐를
      만드는 의미가 없음)
   ══════════════════════════════════════════════════ */

var PENDING_SYNC_KEY = 'dah_pending_sync';

function getPendingSyncQueue() {
  try { return JSON.parse(localStorage.getItem(PENDING_SYNC_KEY) || '[]'); } catch(e) { return []; }
}

function _savePendingSyncQueue(q) {
  try { localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(q)); } catch(e) {}
  updateSyncBanner();
}

// customerKey: 가능하면 customer.id, 없으면(신규생성 실패) clientName으로 폴백
function addToPendingSyncQueue(customerKey, method, path, payload) {
  var q = getPendingSyncQueue();
  var idx = q.findIndex(function(x){ return x.customerKey === customerKey; });
  var entry = { customerKey: customerKey, method: method, path: path, payload: payload, addedAt: new Date().toISOString() };
  if (idx >= 0) { entry.addedAt = q[idx].addedAt; q[idx] = entry; } // 같은 고객이면 최신 내용으로 교체(큐에 중복 안 쌓이게)
  else q.push(entry);
  _savePendingSyncQueue(q);
}

function removeFromPendingSyncQueue(customerKey) {
  var q = getPendingSyncQueue().filter(function(x){ return x.customerKey !== customerKey; });
  _savePendingSyncQueue(q);
}

// 2026-08-28: isPendingSync(특정 고객이 동기화 대기중인지 확인하는 헬퍼)도
// 어디서도 호출 안 되고 있어서 제거. getPendingSyncQueue() 자체는 계속 사용중.


function updateSyncBanner() {
  var q = getPendingSyncQueue();
  var existing = document.getElementById('sync-pending-banner');
  if (q.length === 0) { if (existing) existing.remove(); return; }
  if (!existing) {
    existing = document.createElement('div');
    existing.id = 'sync-pending-banner';
    existing.style.cssText = 'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);z-index:99998;background:#C0392B;color:#fff;padding:9px 16px;border-radius:12px;font-size:12px;font-weight:700;display:flex;align-items:center;gap:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);cursor:pointer;font-family:inherit';
    existing.onclick = function(){ retryPendingSync(); };
    document.body.appendChild(existing);
  }
  existing.textContent = '⚠️ ' + q.length + '건 서버 저장 대기중 — 탭해서 재시도';
}

// 2026-11-07(N-142 ⑤): 서버가 '이 요청은 안 된다'고 확정해서 거절한 오류(400/403/409/422 등)인지.
// 이런 요청은 몇 번을 다시 보내도 같은 이유로 거절되므로 재시도 대기열에 넣지 않는다.
// 제외: 401(로그인 만료 — 갱신 후 재시도), 408/429(일시적), 0(네트워크 끊김), 5xx(서버 일시 오류).
function isPermanentRejection(err) {
  if (!err || typeof err.status !== 'number') return false;
  if (err.zeroRows) return false;
  return err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 408 && err.status !== 429;
}
// 서버가 준 한글 거절 이유(예: '마감된 달(2026-09)의 입금 기록은 수정할 수 없습니다...')를 꺼내 사용자에게 보여줄 문장으로.
function describeServerRejection(err) {
  var msg = '';
  try { var j = JSON.parse(String(err && err.text || '{}')); msg = String(j.message || j.hint || ''); } catch (e) { msg = String((err && err.text) || ''); }
  if (/[가-힣]/.test(msg)) return '⚠️ 서버가 저장을 거절했어요 — ' + msg;
  if (err && (err.status === 403 || /42501/.test(String(err.text || '')))) return '⚠️ 권한이 없어 저장되지 않았어요 — 마스터님께 알려주세요';
  return '⚠️ 서버가 저장을 거절했어요 (오류 ' + (err && err.status) + ') — 입력한 내용을 확인해주세요';
}

function retryPendingSync() {
  var q = getPendingSyncQueue();
  if (q.length === 0) return;
  // 2026-08-25(선혜님 발견 — 견적서쪽과 동일한 원인, 대시보드 재시도 큐도
  // 같은 문제): 토큰 갱신 확인 없이 바로 재시도해서, 만료된 토큰으로 계속
  // 똑같이 실패할 수 있었음. 재시도 전에 먼저 갱신부터 확인.
  function doRetry() {
    if (typeof showToast === 'function') showToast('동기화 재시도 중…');
    q.forEach(function(item) {
      sbXHR(item.method, item.path, item.payload, function(err) {
        if (!err) { removeFromPendingSyncQueue(item.customerKey); return; }
        // 서버가 확정 거절한 요청은 영원히 재시도하지 않고 대기열에서 빼되, 내용은 백업에 남기고 이유를 알린다.
        if (isPermanentRejection(err)) {
          try {
            var fails = JSON.parse(localStorage.getItem('dah_failed_customer_saves') || '[]');
            fails.push({ savedAt: new Date().toISOString(), reason: '서버 확정 거절(' + err.status + ')', customerId: item.customerKey, payload: item.payload });
            if (fails.length > 50) fails = fails.slice(-50);
            localStorage.setItem('dah_failed_customer_saves', JSON.stringify(fails));
          } catch (eB) { /* 백업 실패해도 흐름엔 영향 없음 */ }
          removeFromPendingSyncQueue(item.customerKey);
          if (typeof showToast === 'function') showToast(describeServerRejection(err));
        }
      });
    });
  }
  if (typeof refreshAuthSessionIfNeeded === 'function') {
    refreshAuthSessionIfNeeded(function(ok) { if (ok) doRetry(); });
  } else {
    doRetry();
  }
}

window.addEventListener('online', function(){ retryPendingSync(); });
// 브라우저가 "온라인"이라고 해도 실제로 Supabase에 붙는지는 별개라 주기적으로도 재시도
setInterval(function(){ if (getPendingSyncQueue().length > 0) retryPendingSync(); }, 30000);

// 페이지 로드 시 이전 세션에서 남은 대기 큐가 있으면 배너부터 띄우고 한 번 시도
document.addEventListener('DOMContentLoaded', function(){
  updateSyncBanner();
  if (getPendingSyncQueue().length > 0) setTimeout(retryPendingSync, 2000);
});
