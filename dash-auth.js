/* ══════════════════════════════════════════════════
   DAH 대시보드 — 로그인/세션/권한 기능
   마스터/스태프 로그인, 권한별 UI 노출제어, 로그아웃,
   로그인화면 담당자 목록 표시.
   ══════════════════════════════════════════════════ */

function loginAs(who) {
  if (who === 'master') { currentUser = {name:'마스터', role:'master'}; }
  else { currentUser = {name:who, role:'staff'}; }
  try { currentUser.loginAt = Date.now(); localStorage.setItem('dah_session', JSON.stringify(currentUser)); } catch(e){}
  
  document.body.classList.remove('role-master','role-staff');
  document.body.classList.add(currentUser.role==='master'?'role-master':'role-staff');
  var loginScreen = document.getElementById('login-screen');
  if (loginScreen) loginScreen.style.display = 'none';
  var badge = document.getElementById('current-user-badge');
  if (badge) badge.textContent = currentUser.name;
  // 모바일 앱헤더/탭바/FAB — 모바일에서만 표시
  var _mobHd = document.getElementById('mob-app-header');
  if (_mobHd) {
    _mobHd.style.display = (window.innerWidth <= 640) ? 'flex' : 'none';
  }
  var _mobNav = document.getElementById('mob-bottom-nav');
  if (_mobNav) { _mobNav.style.cssText = (window.innerWidth <= 640 ? 'display:flex' : 'display:none') + ' !important; position:fixed !important; bottom:0 !important; width:100% !important; z-index:200 !important; background:#fff !important; border-top:1px solid var(--border) !important;'; }
  var _mobFab = document.querySelector('.mob-fab');
  if (_mobFab) { _mobFab.style.display = (window.innerWidth <= 640) ? 'flex' : 'none'; }
  applyPermissions();
  // 2026-08-05: loadCustomersAsync(renderHome) 직접 전달 금지 — 콜백 인자(고객배열)가
  // renderHome의 skipServerFetch 자리로 들어가는 시그니처 불일치 패턴(7-2 규칙 위반).
  // 지금까진 엄격비교(=== true)로 오작동은 막았지만, 내부에서 loadCustomersAsync를
  // 한 번 더 호출하는 redundant 구조였음. 여기서 이미 최신 데이터를 받았으니
  // skipServerFetch=true로 명시 호출해 재요청 없이 바로 렌더링.
  loadCustomersAsync(function(){ renderHome(true); });
}

function applyPermissions() {
  var isMaster = currentUser && currentUser.role === 'master';
  
  setTimeout(function(){
    // 2026-08-05: 매출 탭의 실제 data-tab/data-mob-tab 값은 'chart'뿐이라
    // '매출' 문자열로도 조회하던 건 존재하지 않는 셀렉터라 항상 no-op이었음(죽은 코드) — 제거
    ['chart'].forEach(function(t){
      var salesTab = document.querySelector('[data-tab="'+t+'"]');
      if (salesTab) salesTab.style.display = isMaster ? '' : 'none';
      var mobSalesTab = document.querySelector('[data-mob-tab="'+t+'"]');
      if (mobSalesTab) mobSalesTab.style.display = isMaster ? '' : 'none';
    });
    
    var perfCards = document.querySelectorAll('.perf-card, [data-perf]');
    perfCards.forEach(function(el){ el.style.display = isMaster ? '' : 'none'; });
  }, 300);
}

function logout() {
  currentUser = null;
  try { localStorage.removeItem('dah_session'); } catch(e){}
  if (typeof clearAuthSession === 'function') clearAuthSession();
  var ls = document.getElementById('login-screen');
  if(ls) ls.style.display = 'flex';
  var pw = document.getElementById('master-pw-wrap');
  if(pw) pw.style.display = 'none';
  var staffPw = document.getElementById('staff-pw-wrap');
  if(staffPw) staffPw.style.display = 'none';
  renderStaffLoginList();
}

function renderStaffLoginList() {
  var list = document.getElementById('staff-login-list');
  if (!list) return;
  var staffs = getStaffList();
  list.innerHTML = '';
  var filtered = [];
  for (var i = 0; i < staffs.length; i++) {
    if (staffs[i] && staffs[i] !== '마스터') filtered.push(staffs[i]);
  }
  for (var j = 0; j < filtered.length; j++) {
    var name = filtered[j];
    var btn = document.createElement('button');
    btn.className = 'staff-grid-btn';
    btn.type = 'button';
    btn.innerHTML = '<div class="staff-avatar-sm">'+escHtml(name.charAt(0))+'</div><span>'+escHtml(name)+'</span>';
    (function(n){ btn.onclick = function(){
      if (typeof window.selectStaffForLogin === 'function') window.selectStaffForLogin(n);
    }; })(name);
    list.appendChild(btn);
  }
  if (filtered.length === 0) {
    list.innerHTML = '<div style="grid-column:1/-1;text-align:center;font-size:13px;color:var(--sub);padding:8px 0">설정에서 담당자를 추가해주세요</div>';
  }
}
