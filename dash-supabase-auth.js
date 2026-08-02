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

// Supabase의 app_settings 테이블에서 직접 master_email을 가져와 localStorage에 캐싱.
// dash-api.js(loadAppSettingsAsync)를 로드하지 않는 페이지(예: 견적서 앱의 URL직접접근 게이트)에서
// 다른 기기에 등록된 마스터 이메일을 가져오기 위해 사용. callback(email) 형태로 결과 전달.
function fetchAndCacheMasterEmail(callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', SUPABASE_URL + '/rest/v1/app_settings?key=eq.master_email&select=value', true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_KEY);
  xhr.onload = function() {
    try {
      if (xhr.status >= 200 && xhr.status < 300) {
        var rows = JSON.parse(xhr.responseText);
        if (rows && rows[0] && rows[0].value) {
          try { localStorage.setItem('dah_master_email', rows[0].value); } catch(e){}
          callback(rows[0].value);
          return;
        }
      }
    } catch(e) {}
    callback(getMasterEmail());
  };
  xhr.onerror = function() { callback(getMasterEmail()); };
  xhr.send();
}

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
  var redirectTo = window.location.origin + '/dah-dashboard';
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

// 현재 세션의 access_token 반환 (API 호출시 Authorization 헤더에 사용)
// 세션이 없으면 anon key로 폴백 (RLS가 막고있으면 어차피 서버에서 거부됨)
function getAuthToken() {
  var s = getAuthSession();
  return (s && s.access_token) ? s.access_token : SUPABASE_KEY;
}
