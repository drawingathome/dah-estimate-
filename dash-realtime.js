/* ══════════════════════════════════════════════════
   실시간 동기화 (Supabase Realtime)
   ══════════════════════════════════════════════════
   다른 기기/사용자가 고객 데이터를 바꾸면, 새로고침 없이도
   화면에 자동으로 반영되도록 함.

   ⚠️ 안전 설계 원칙 (오늘 하루 종일 고친 "경쟁조건" 버그를
   다시 만들지 않기 위해):
   - 목록 화면(홈/검색/칸반/캘린더)은 실시간으로 안전하게 갱신 가능
     (사용자가 입력 중인 폼이 없는, 그냥 "보여주는" 화면이므로)
   - 고객상세 화면이 열려있고, 마침 그 고객이 실시간으로 변경됐다면
     → 자동으로 다시 그리지 않는다(입력 중이던 내용이 사라질 수 있음).
     대신 "다른 곳에서 정보가 업데이트됐어요" 알림만 띄우고,
     사용자가 직접 "새로고침" 버튼을 눌러야 반영됨.
   - 실시간 이벤트가 와도 로컬 배열 전체를 덮어쓰지 않고,
     해당 레코드 하나만 찾아서 병합(추가/갱신/보관표시)한다.
*/

var _realtimeChannel = null;
var _supabaseRealtimeClient = null;

function _getSupabaseRealtimeClient() {
  if (_supabaseRealtimeClient) return _supabaseRealtimeClient;
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) return null;
  _supabaseRealtimeClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false } // 로그인 세션 관리는 기존 dash-supabase-auth.js가 이미 담당
  });
  return _supabaseRealtimeClient;
}

function startRealtimeSync() {
  var client = _getSupabaseRealtimeClient();
  if (!client) { console.warn('실시간 동기화: Supabase 클라이언트를 초기화할 수 없습니다'); return; }
  if (_realtimeChannel) return; // 이미 구독 중이면 중복 방지

  // Realtime도 RLS(로그인 필요) 적용대상이므로, 로그인된 사용자의 access_token을 함께 실어보냄
  var authSession = (typeof getAuthSession === 'function') ? getAuthSession() : null;
  if (authSession && authSession.access_token) {
    client.realtime.setAuth(authSession.access_token);
  }

  _realtimeChannel = client
    .channel('dah-customers-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, function(payload) {
      _handleRealtimeCustomerChange(payload);
    })
    .subscribe(function(status) {
      if (status === 'SUBSCRIBED') {
        console.log('실시간 동기화 연결됨');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('실시간 동기화 연결 실패 — 목록은 계속 "탭 전환 시 최신화" 방식으로 동작합니다');
      }
    });
}

function stopRealtimeSync() {
  if (_realtimeChannel && _supabaseRealtimeClient) {
    _supabaseRealtimeClient.removeChannel(_realtimeChannel);
  }
  _realtimeChannel = null;
}

function _handleRealtimeCustomerChange(payload) {
  try {
    var changedRow = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
    if (!changedRow || !changedRow.id) return;
    var changedCustomer = (typeof dbRowToCustomer === 'function') ? dbRowToCustomer(changedRow) : changedRow;

    // 1) 로컬 배열에 안전하게 병합 (전체 덮어쓰기 절대 금지 — 해당 id 레코드만 갱신/추가)
    var arr = (typeof loadCustomers === 'function') ? loadCustomers() : [];
    var idx = arr.findIndex(function(c) { return c.id === changedCustomer.id; });
    if (payload.eventType === 'DELETE') {
      if (idx >= 0) arr.splice(idx, 1);
    } else if (idx >= 0) {
      arr[idx] = Object.assign({}, arr[idx], changedCustomer);
    } else {
      arr.unshift(changedCustomer);
    }
    if (typeof saveCustomers === 'function') saveCustomers(arr);

    // 2) 지금 보고 있는 목록 화면만 안전하게 다시 그림 (로컬전용 렌더링 — 서버 재조회 없음)
    _reRenderVisibleListScreen();

    // 3) 하필 지금 열려있는 상세화면이 "이 고객"이면, 자동으로 덮어쓰지 않고 알림만 띄움
    if (typeof currentDetailId !== 'undefined' && currentDetailId === changedCustomer.id) {
      _showRealtimeUpdateBanner(changedCustomer);
    }
  } catch (e) {
    console.warn('실시간 동기화 처리 중 오류:', e);
  }
}

function _reRenderVisibleListScreen() {
  var activeTab = document.querySelector('.tab-btn.active, .nav-item.active');
  var tabId = activeTab ? activeTab.getAttribute('data-tab') : null;
  // 화면에 지금 보이는 탭 요소를 기준으로 판단 (탭 버튼 구조가 프로젝트마다 다를 수 있어 방어적으로 처리)
  if (document.getElementById('home') && document.getElementById('home').offsetParent !== null) {
    if (typeof renderHome === 'function') renderHome(true);
  }
  if (document.getElementById('search') && document.getElementById('search').offsetParent !== null) {
    if (typeof renderSearch === 'function') renderSearch();
  }
  if (document.getElementById('pipe') && document.getElementById('pipe').offsetParent !== null) {
    if (typeof renderPipe === 'function') renderPipe(loadCustomers());
  }
  if (document.getElementById('cal') && document.getElementById('cal').offsetParent !== null) {
    if (typeof renderCal === 'function') renderCal();
  }
}

function _showRealtimeUpdateBanner(customer) {
  var existing = document.getElementById('realtime-update-banner');
  if (existing) existing.remove();
  var banner = document.createElement('div');
  banner.id = 'realtime-update-banner';
  banner.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;background:#282828;color:#fff;padding:10px 16px;border-radius:10px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:10px;box-shadow:0 4px 16px rgba(0,0,0,0.25)';
  banner.innerHTML = '📡 이 고객 정보가 다른 곳에서 방금 업데이트됐어요' +
    '<button id="realtime-refresh-btn" style="background:#fff;color:#282828;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">새로고침</button>' +
    '<button id="realtime-dismiss-btn" style="background:none;color:#B0A99F;border:none;font-size:14px;cursor:pointer;padding:0 2px">✕</button>';
  document.body.appendChild(banner);
  document.getElementById('realtime-refresh-btn').addEventListener('click', function() {
    banner.remove();
    if (typeof openDetail === 'function' && typeof currentDetailName !== 'undefined') {
      openDetail(currentDetailName, customer.id);
    }
  });
  document.getElementById('realtime-dismiss-btn').addEventListener('click', function() { banner.remove(); });
}

// 로그인 상태가 이미 있으면(새로고침 등) 페이지 로드시 바로 실시간 동기화 시작.
// 새로 로그인하는 경우는 dash-supabase-auth.js의 saveAuthSession()에서 시작됨.
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
      var authSession = (typeof getAuthSession === 'function') ? getAuthSession() : null;
      if (authSession) startRealtimeSync();
    }, 1000);
  });
})();
