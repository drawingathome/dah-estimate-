/* ══════════════════════════════════════════════════
   DAH 대시보드 — Supabase Auth 연동
   이메일+비밀번호 기반 진짜 서버 인증. 화면(이름 클릭 방식)은
   그대로 두고, 뒤에서 Supabase Auth 세션을 발급/관리한다.
   ══════════════════════════════════════════════════ */

// 마스터 로그인 이메일 (Supabase Auth 연동용) — 대시보드/견적서 앱 공용
function getMasterEmail() {
  try { return localStorage.getItem('dah_master_email') || ''; } catch(e) { return ''; }
}
function setMasterEmail(email) {
  try { localStorage.setItem('dah_master_email', email); } catch(e){}
  if (typeof sbSyncSetting === 'function') sbSyncSetting('master_email', email);
}
// 2026-08-25(선혜님 발견 — "탭으로 하면 틀린비번이라 뜬다", 진짜 원인):
// 오늘 앞서 setMasterEmail을 "진짜 마스터일 때만" 부르도록 고치면서, 그
// 대가로 직원 본인의 이메일이 재로그인 팝업에 자동으로 안 채워지게
// 됐음(getMasterEmail이 비거나 옛날 값을 줌) — 그 상태로 비밀번호만 정확히
// 입력하면 이메일+비번 조합 자체가 안 맞아서 "틀린 비번"으로 보였음. 역할과
// 무관하게 "가장 최근 로그인 성공한 이메일"만 따로 기억해서, 편의상
// 자동채움 용도로만 씀(마스터 여부 판단 로직과는 완전히 분리).
// 2026-08-28: getLastLoginEmail(마지막 로그인 이메일 자동채움용)도 호출하는
// 곳이 없어서 함께 제거.

function setLastLoginEmail(email) {
  try { localStorage.setItem('dah_last_login_email', email); } catch(e) {}
}

// Supabase의 app_settings 테이블에서 직접 master_email을 가져와 localStorage에 캐싱.
// dash-api.js(loadAppSettingsAsync)를 로드하지 않는 페이지(예: 견적서 앱의 URL직접접근 게이트)에서
// 다른 기기에 등록된 마스터 이메일을 가져오기 위해 사용. callback(email) 형태로 결과 전달.
// 2026-08-28(선혜님 지시 - "3번만 지우고" 죽은코드 정리로 발견): 아래
// fetchAndCacheMasterEmail은 다른 기기 등록 마스터 이메일을 견적서 앱
// URL직접접근 게이트용으로 가져오려던 함수였으나, 그 게이트 자체가 현재
// 구현에 안 남아있어서 어디서도 호출 안 되고 있었음 - 제거함.


// 로그인: 이메일+비밀번호로 Supabase Auth 토큰 발급
// 성공시 { ok:true, session:{access_token, refresh_token, user} } 반환
// 실패시 { ok:false, msg:'...' } 반환
function supabaseAuthLogin(email, password, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', SUPABASE_URL + '/auth/v1/token?grant_type=password', true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onload = function () {
    try {
      var data = JSON.parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && data.access_token) {
        saveAuthSession(data);
        callback({ ok: true, session: data });
      } else {
        callback({ ok: false, msg: data.error_description || data.msg || '이메일 또는 비밀번호가 올바르지 않습니다' });
      }
    } catch (e) {
      callback({ ok: false, msg: '로그인 중 오류가 발생했습니다' });
    }
  };
  xhr.onerror = function () {
    callback({ ok: false, msg: '네트워크 오류로 로그인에 실패했습니다' });
  };
  xhr.send(JSON.stringify({ email: email, password: password }));
}

// 비밀번호 재설정 이메일 발송 (2026-08-01 신규) — 설정탭 "비밀번호 재설정
// 이메일 받기" 버튼에서 사용. 예전엔 마스터 이메일 등록 후에도 로컬 비밀번호
// 변경 UI가 남아있어서, 눌러도 실제 로그인 비밀번호는 안 바뀌는 혼란이 있었음.
function sendPasswordResetEmail(email, callback) {
  var xhr = new XMLHttpRequest();
  // redirect_to를 명시하지 않으면 Supabase 프로젝트의 기본 Site URL로 가버림
  // 2026-09-06(선혜님 지시 - "해결해야지", 스테이징(GitHub Pages) 환경에서
  // 발견): window.location.origin을 그대로 쓰면, Vercel(사이트가 도메인
  // 루트에 있음)에선 정확히 맞지만, 스테이징(사이트가 저장소명 하위경로
  // /dah-estimate-/에 있음)에서 실행되면 '/dah-dashboard'가 저장소명
  // 없이 붙어서 실제로 존재하지 않는 경로를 가리키게 됨 - 비밀번호
  // 재설정은 어차피 실사용 계정 복구용 기능이라, 어느 도메인에서
  // 버튼을 눌렀든 항상 실제 서비스 주소로 보내는 게 맞음(스테이징
  // 환경으로 돌아가게 할 이유가 없음). vercel.app 도메인일 때만
  // window.location.origin을 그대로 쓰고, 그 외(스테이징 등)는 실제
  // 서비스 주소로 고정.
  var isKnownProductionDomain = /\.vercel\.app$/.test(window.location.hostname);
  var redirectTo = (isKnownProductionDomain ? window.location.origin : 'https://dah-dashboard.vercel.app') + '/dah-dashboard';
  xhr.open('POST', SUPABASE_URL + '/auth/v1/recover?redirect_to=' + encodeURIComponent(redirectTo), true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onload = function () {
    if (xhr.status >= 200 && xhr.status < 300) {
      callback(null);
    } else {
      try {
        var data = JSON.parse(xhr.responseText);
        callback({ message: data.error_description || data.msg || '발송 실패' });
      } catch (e) {
        callback({ message: '발송 실패' });
      }
    }
  };
  xhr.onerror = function () { callback({ message: '네트워크 오류' }); };
  xhr.send(JSON.stringify({ email: email }));
}

// 비밀번호 재설정 이메일의 링크를 눌러서 돌아왔을 때, 그 링크에 담긴 access_token으로
// 재설정 이메일에 담긴 6자리 인증코드를 직접 입력받아 검증하는 함수
// (2026-08-02 신규) — 링크 클릭 방식은 메일 앱이 보안상 링크를 미리
// 스캔/방문해서 토큰을 조기 소진시키는 문제가 있었음(실제로 겪음). 코드
// 직접입력 방식은 "클릭"이라는 동작 자체가 없어서 이 문제가 원천적으로
// 발생 안 함. 성공하면 access_token을 반환하고, 그걸로
// updatePasswordWithRecoveryToken을 그대로 이어서 호출하면 됨.
function verifyRecoveryCode(email, code, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', SUPABASE_URL + '/auth/v1/verify', true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onload = function () {
    try {
      var data = JSON.parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && data.access_token) {
        callback(null, data.access_token);
      } else {
        callback({ message: data.error_description || data.msg || '코드가 올바르지 않거나 만료됐습니다' });
      }
    } catch (e) {
      callback({ message: '처리 중 오류가 발생했습니다' });
    }
  };
  xhr.onerror = function () { callback({ message: '네트워크 오류' }); };
  xhr.send(JSON.stringify({ type: 'recovery', email: email, token: code }));
}

// 실제 새 비밀번호를 저장하는 함수 (2026-08-01 신규 — 예전엔 재설정 이메일만
// 보내고, 링크를 눌러도 새 비밀번호를 입력할 화면 자체가 없어서 비밀번호가
// 실제로는 한 번도 안 바뀌고 있었음)
function updatePasswordWithRecoveryToken(recoveryToken, newPassword, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('PUT', SUPABASE_URL + '/auth/v1/user', true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.setRequestHeader('Authorization', 'Bearer ' + recoveryToken);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onload = function () {
    if (xhr.status >= 200 && xhr.status < 300) {
      callback(null);
    } else {
      try {
        var data = JSON.parse(xhr.responseText);
        callback({ message: data.error_description || data.msg || '변경 실패' });
      } catch (e) {
        callback({ message: '변경 실패' });
      }
    }
  };
  xhr.onerror = function () { callback({ message: '네트워크 오류' }); };
  xhr.send(JSON.stringify({ password: newPassword }));
}

// URL의 #access_token=...&type=recovery 를 파싱 — 비밀번호 재설정 이메일의
// 링크를 누르면 Supabase가 이 형태로 리다이렉트시켜줌
function parseRecoveryTokenFromUrl() {
  var hash = window.location.hash;
  if (!hash || hash.indexOf('type=recovery') === -1) return null;
  var params = new URLSearchParams(hash.slice(1));
  var token = params.get('access_token');
  return token || null;
}

// 세션 저장 (localStorage)
function saveAuthSession(session) {
  try {
    localStorage.setItem('dah_auth_session', JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Date.now() + (session.expires_in ? session.expires_in * 1000 : 3600 * 1000),
      user_id: session.user ? session.user.id : null,
      email: session.user ? session.user.email : null
    }));
  } catch (e) { /* ignore */ }
  if (typeof startAuthAutoRefresh === 'function') startAuthAutoRefresh();
  if (typeof startRealtimeSync === 'function') startRealtimeSync();
}

// 저장된 세션 조회 (없으면 null)
function getAuthSession() {
  try {
    var raw = localStorage.getItem('dah_auth_session');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// 세션 삭제 (로그아웃)
function clearAuthSession() {
  try { localStorage.removeItem('dah_auth_session'); } catch (e) { /* ignore */ }
  if (typeof stopAuthAutoRefresh === 'function') stopAuthAutoRefresh();
  if (typeof stopRealtimeSync === 'function') stopRealtimeSync();
}

// 토큰 만료 임박시 refresh_token으로 재발급
function refreshAuthSessionIfNeeded(callback) {
  var s = getAuthSession();
  if (!s) { callback(false); return; }
  // 만료 5분 이내면 갱신 시도
  if (s.expires_at - Date.now() > 5 * 60 * 1000) { callback(true); return; }

  var xhr = new XMLHttpRequest();
  xhr.open('POST', SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onload = function () {
    try {
      var data = JSON.parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && data.access_token) {
        saveAuthSession(data);
        callback(true);
      } else {
        clearAuthSession();
        callback(false);
      }
    } catch (e) { clearAuthSession(); callback(false); }
  };
  xhr.onerror = function () { callback(false); };
  xhr.send(JSON.stringify({ refresh_token: s.refresh_token }));
}

// 백그라운드 자동 토큰 갱신 — 로그인 상태로 오래 작업해도(1시간 이상) 세션이 조용히
// 만료되어 저장이 실패하는 일이 없도록, 주기적으로 만료 임박 여부를 확인해 미리 갱신한다.
// startAuthAutoRefresh()는 로그인 성공 직후, 그리고 페이지 로드시 기존 세션이 있으면
// 자동으로 호출되어야 한다(아래 즉시실행 부분 참고).
var _authAutoRefreshTimer = null;
function startAuthAutoRefresh() {
  if (_authAutoRefreshTimer) return; // 중복 시작 방지
  _authAutoRefreshTimer = setInterval(function () {
    if (!getAuthSession()) return; // 로그아웃 상태면 아무것도 안 함
    refreshAuthSessionIfNeeded(function () {});
  }, 4 * 60 * 1000); // 4분마다 확인 (만료 5분 전 기준보다 촘촘하게)
}
function stopAuthAutoRefresh() {
  if (_authAutoRefreshTimer) { clearInterval(_authAutoRefreshTimer); _authAutoRefreshTimer = null; }
}

// 페이지를 새로고침하거나 다시 열었을 때, 이미 로그인 세션이 남아있다면
// 자동 갱신 타이머를 즉시 시작해 그 이후로도 계속 갱신되게 한다.
(function () {
  if (getAuthSession()) startAuthAutoRefresh();
})();

// 2026-08-25(오지은 실장님 사례 — 403 "서버 저장 재시도 실패"): 태블릿에서
// 다른 앱으로 전환하면(브라우저 탭이 백그라운드로 가면) 모바일 브라우저가
// setInterval 타이머 자체를 멈추거나 크게 늦추는 게 흔한 동작이라, 4분마다
// 갱신 체크하는 startAuthAutoRefresh만으로는 오래 백그라운드에 있다 돌아왔을
// 때 토큰이 이미 만료된 채로 방치될 수 있었음(타이머가 안 돌았으니 갱신 자체가
// 안 일어남). 탭이 다시 화면에 보이는 순간 즉시 한 번 더 확인/갱신하도록 보강.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && getAuthSession()) {
      refreshAuthSessionIfNeeded(function () {});
    }
  });
}

// 현재 세션의 access_token 반환 (API 호출시 Authorization 헤더에 사용)
// 세션이 없으면 anon key로 폴백 (RLS가 막고있으면 어차피 서버에서 거부됨)
function getAuthToken() {
  var s = getAuthSession();
  return (s && s.access_token) ? s.access_token : SUPABASE_KEY;
}
