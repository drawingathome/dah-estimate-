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

// 현재 세션의 access_token 반환 (API 호출시 Authorization 헤더에 사용)
// 세션이 없으면 anon key로 폴백 (RLS가 막고있으면 어차피 서버에서 거부됨)
function getAuthToken() {
  var s = getAuthSession();
  return (s && s.access_token) ? s.access_token : SUPABASE_KEY;
}
