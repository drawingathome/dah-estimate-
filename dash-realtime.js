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

  // 2026-09-15(선혜님 지시 - "계속 파봐": 반복되는 "실시간 동기화 연결
  // 실패" 경고의 진짜 원인 발견): 로그인 토큰은 4분마다 자동 갱신되는데
  // (dash-supabase-auth.js), 그 갱신된 토큰이 "이미 연결된" 실시간 채널
  // 에는 절대 전달되지 않고 있었음 - 아래 "이미 구독 중이면 중복 방지"
  // 가드가 setAuth 호출 자체까지 같이 건너뛰게 만들어서, 최초 로그인 때
  // 받은 토큰 하나로 계속 붙어있다가 그 토큰이 만료되면(보통 1시간) 그
  // 뒤로는 실시간 연결이 계속 실패했음. 채널 "재생성"은 중복 방지가
  // 맞지만, 토큰 갱신(setAuth)은 채널 존재 여부와 무관하게 매번 실행되게
  // 분리.
  var authSession = (typeof getAuthSession === 'function') ? getAuthSession() : null;
  if (authSession && authSession.access_token) {
    client.realtime.setAuth(authSession.access_token);
  }

  if (_realtimeChannel) return; // 채널 자체는 한 번만 생성(위 토큰 갱신은 이미 반영됨)

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
      // 2026-08-28(선혜님 지적 — "이 문구는 왜 또 뜨지??"): 방금 이 탭에서
      // 직접 저장한 것(3초 이내)이면 "다른 곳에서 바꿨다"는 알림이 아니라
      // 그냥 내가 한 저장이 되돌아온 것 - 배너를 띄우지 않음.
      var isSelfWrite = window._lastSelfCustomerWriteId === changedCustomer.id &&
        (Date.now() - (window._lastSelfCustomerWriteTime || 0)) < 3000;
      if (!isSelfWrite) _showRealtimeUpdateBanner(changedCustomer);
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
  banner.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;background:var(--dark);color:#fff;padding:10px 16px;border-radius:10px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:10px;box-shadow:0 4px 16px rgba(0,0,0,0.25)';
  banner.innerHTML = '📡 이 고객 정보가 다른 곳에서 방금 업데이트됐어요' +
    '<button id="realtime-refresh-btn" style="background:#fff;color:var(--dark);border:none;border-radius:10px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">새로고침</button>' +
    '<button id="realtime-dismiss-btn" style="background:none;color:var(--sub);border:none;font-size:15px;cursor:pointer;padding:0 2px">✕</button>';
  document.body.appendChild(banner);
  document.getElementById('realtime-refresh-btn').addEventListener('click', function() {
    banner.remove();
    if (typeof openDetail === 'function' && typeof currentDetailName !== 'undefined') {
      openDetail(currentDetailName, customer.id);
    }
  });
  document.getElementById('realtime-dismiss-btn').addEventListener('click', function() { banner.remove(); });
}

// 2026-09-13(선혜님 - 유경진/황남주/손현영 저장충돌 원인 조사 후 "지금
// 진행해야지"로 결정): 지금까지는 "동시에 같은 고객을 두 곳에서 저장하려다
// 충돌"이 일어난 뒤에야(저장 실패로) 알 수 있었음 - 미리 "지금 누가 이
// 고객을 보고 있는지" 알려주면 애초에 충돌 자체를 줄일 수 있음.
// Supabase Realtime의 Presence 기능(이미 로드된 supabase-js 클라이언트가
// 지원)을 이용 - 고객상세 화면을 열면 그 고객 전용 채널에 "나 지금 보고
// 있음"을 알리고, 같은 채널에 다른 사람이 있으면 배너로 알려줌.
var _presenceChannel = null;
var _presenceCustomerId = null;

function joinCustomerPresence(customerId, onOthersChange) {
  leaveCustomerPresence(); // 이전 고객 화면을 보고 있었다면 먼저 나감
  if (!customerId) return;
  var client = _getSupabaseRealtimeClient();
  if (!client) return;
  _presenceCustomerId = customerId;
  var myName = (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || '알 수 없음';
  var myKey = myName + '-' + Math.random().toString(36).slice(2, 8); // 같은 이름이 여러 탭/기기로 들어와도 각각 구분되게
  var channel = client.channel('customer-presence-' + customerId, { config: { presence: { key: myKey } } });
  channel.on('presence', { event: 'sync' }, function () {
    var state = channel.presenceState();
    var others = [];
    Object.keys(state).forEach(function (key) {
      if (key === myKey) return;
      (state[key] || []).forEach(function (p) { others.push(p.name); });
    });
    if (typeof onOthersChange === 'function') onOthersChange(others);
  });
  channel.subscribe(function (status) {
    if (status === 'SUBSCRIBED') {
      channel.track({ name: myName, joinedAt: Date.now() });
    }
  });
  _presenceChannel = channel;
}

function leaveCustomerPresence() {
  if (_presenceChannel && _supabaseRealtimeClient) {
    _supabaseRealtimeClient.removeChannel(_presenceChannel);
  }
  _presenceChannel = null;
  _presenceCustomerId = null;
  var banner = document.getElementById('presence-warning-banner');
  if (banner) banner.remove();
}

function renderPresenceBanner(others) {
  var existing = document.getElementById('presence-warning-banner');
  if (existing) existing.remove();
  if (!others || others.length === 0) return;
  var body = document.getElementById('detail-body');
  if (!body) return;
  var banner = document.createElement('div');
  banner.id = 'presence-warning-banner';
  banner.style.cssText = 'background:#FBEAE7;border:1px solid #E4483A;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px;font-weight:700;color:#C0392B';
  var names = others.filter(function (v, i) { return others.indexOf(v) === i; }).join(', '); // 중복 이름 제거
  banner.textContent = '⚠️ ' + names + '님도 지금 이 고객을 보고 있어요 — 동시에 저장하면 한쪽 내용이 충돌할 수 있어요';
  body.insertBefore(banner, body.firstChild);
}


// 새로 로그인하는 경우는 dash-supabase-auth.js의 saveAuthSession()에서 시작됨.
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
      var authSession = (typeof getAuthSession === 'function') ? getAuthSession() : null;
      if (authSession) startRealtimeSync();
    }, 1000);
  });
})();
