/* ══════════════════════════════════════════════════
   DAH 대시보드 — 설정 화면 기능
   월목표매출/계좌정보 불러오기·저장, 고객추가모달 칩 초기화,
   설정탭 전체 렌더링.
   ══════════════════════════════════════════════════ */

// 비밀번호 재설정 흐름 공용 헬퍼 (2026-08-02 신규) — 마스터/스태프 둘 다 재사용.
// 이메일 발송 버튼 누르면 바로 아래에 "인증코드+새비밀번호" 입력창이 나타남.
// 링크를 눌러야 하는 방식이 아니라 코드를 직접 타이핑하는 방식이라, 메일
// 앱이 링크를 미리 스캔해서 토큰을 조기 소진시키는 문제가 아예 발생 안 함.
function appendPasswordResetFlow(card, email) {
  var codeSection = div('display:none;margin-top:12px;padding-top:12px;border-top:1px solid #F5F2EE', [
    span('font-size:11px;color:var(--sub);display:block;margin-bottom:10px', email + '로 6자리 인증코드를 보냈어요. 코드와 새 비밀번호를 입력해주세요.')
  ]);
  var codeInput = el('input', {type:'text', inputmode:'numeric', placeholder:'인증코드 6자리', style:'width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:10px;font-size:13px;font-family:inherit;outline:none;margin-bottom:8px;box-sizing:border-box'});
  var newPwInput = el('input', {type:'password', placeholder:'새 비밀번호 (6자 이상)', autocomplete:'new-password', style:'width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:10px;font-size:13px;font-family:inherit;outline:none;margin-bottom:8px;box-sizing:border-box'});
  var confirmPwInput = el('input', {type:'password', placeholder:'새 비밀번호 확인', autocomplete:'new-password', style:'width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:10px;font-size:13px;font-family:inherit;outline:none;margin-bottom:8px;box-sizing:border-box'});
  var codeError = span('font-size:11px;color:#E4483A;display:none;margin-bottom:8px', '');
  var confirmBtn = btn('width:100%;padding:11px;background:var(--dark);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer', '비밀번호 변경 확인', function() {
    var code = codeInput.value.trim();
    var pw1 = newPwInput.value;
    var pw2 = confirmPwInput.value;
    codeError.style.display = 'none';
    if (!code) { codeError.textContent = '인증코드를 입력해주세요'; codeError.style.display = 'block'; return; }
    if (pw1.length < 6) { codeError.textContent = '새 비밀번호는 6자 이상이어야 합니다'; codeError.style.display = 'block'; return; }
    if (pw1 !== pw2) { codeError.textContent = '새 비밀번호가 일치하지 않습니다'; codeError.style.display = 'block'; return; }
    confirmBtn.disabled = true; confirmBtn.textContent = '확인 중...';
    verifyRecoveryCode(email, code, function(err, accessToken) {
      if (err) {
        confirmBtn.disabled = false; confirmBtn.textContent = '비밀번호 변경 확인';
        codeError.textContent = err.message || '코드가 올바르지 않습니다';
        codeError.style.display = 'block';
        return;
      }
      updatePasswordWithRecoveryToken(accessToken, pw1, function(err2) {
        confirmBtn.disabled = false; confirmBtn.textContent = '비밀번호 변경 확인';
        if (err2) {
          codeError.textContent = err2.message || '변경에 실패했습니다';
          codeError.style.display = 'block';
          return;
        }
        codeSection.style.display = 'none';
        codeInput.value = ''; newPwInput.value = ''; confirmPwInput.value = '';
        showToast('비밀번호가 변경됐습니다. 새 비밀번호로 로그인해주세요');
      });
    });
  });
  codeSection.appendChild(codeInput);
  codeSection.appendChild(newPwInput);
  codeSection.appendChild(confirmPwInput);
  codeSection.appendChild(codeError);
  codeSection.appendChild(confirmBtn);

  var sendBtn = btn('width:100%;padding:11px;background:var(--dark);color:#fff;border:none;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;border-radius:10px', '비밀번호 재설정 이메일 받기', function() {
    if (typeof sendPasswordResetEmail !== 'function') { showToast('재설정 기능을 불러오지 못했어요'); return; }
    sendBtn.disabled = true; sendBtn.textContent = '발송 중...';
    sendPasswordResetEmail(email, function(err) {
      sendBtn.disabled = false; sendBtn.textContent = '비밀번호 재설정 이메일 받기';
      if (err) { showToast('발송 실패: ' + (err.message || '잠시 후 다시 시도해주세요')); return; }
      showToast(email + '로 인증코드를 보냈어요. 메일함을 확인해주세요');
      codeSection.style.display = 'block';
    });
  });
  card.appendChild(sendBtn);
  card.appendChild(codeSection);
}

function loadSettings() {
  try {
    var s = JSON.parse(localStorage.getItem('dah_settings') || '{}');
    if (s.monthlyGoal) {
      var el = document.getElementById('set-monthly-goal');
      if (el) el.value = s.monthlyGoal;
    }
    if (s.bank) {
      var el = document.getElementById('set-bank');
      if (el) el.value = s.bank;
    }
    if (s.account) {
      var el = document.getElementById('set-account');
      if (el) el.value = s.account;
    }
    if (s.holder) {
      var el = document.getElementById('set-holder');
      if (el) el.value = s.holder;
    }
  } catch(e) {}
}

function saveSettings() {
  try {
    var s = {
      monthlyGoal: document.getElementById('set-monthly-goal')?.value || '5,000만원',
      bank:        document.getElementById('set-bank')?.value || '',
      account:     document.getElementById('set-account')?.value || '015401-04-258798',
      holder:      document.getElementById('set-holder')?.value || '장선혜',
      savedAt:     new Date().toISOString(),
    };
    localStorage.setItem('dah_settings', JSON.stringify(s));
    sbSyncSetting('settings', s);
    showToast('설정이 저장되었습니다');
  } catch(e) { showToast('저장 실패'); }
}

function getSettings() {
  try { return JSON.parse(localStorage.getItem('dah_settings') || '{}'); } catch(e) { return {}; }
}

function initAddModalChips() {
  // 스테이지 칩
  document.querySelectorAll('.add-stage-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      document.querySelectorAll('.add-stage-chip').forEach(function(c) {
        c.classList.remove('on');
      });
      this.classList.add('on');
      var stageEl = document.getElementById('add-stage');
      if (stageEl) stageEl.value = this.getAttribute('data-stage') || this.textContent.trim();
    });
  });

  // 담당자 칩
  document.querySelectorAll('.add-staff-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      document.querySelectorAll('.add-staff-chip').forEach(function(c) {
        c.classList.remove('on');
      });
      this.classList.add('on');
    });
  });
}

// 설정화면 아코디언 중 현재 열려있는 섹션 id를 기억 (2026-08-02 버그수정) —
// 예전엔 renderSettings()가 재호출될 때마다(거래처 카테고리 배지 클릭 등으로
// 화면 전체가 다시 그려질 때) 모든 아코디언이 코드에 박힌 초기값으로 리셋돼서,
// 사용자가 방금 열어둔 "거래처 관리"가 갑자기 닫히고 엉뚱하게 "매출·목표"가
// 열리는 매우 혼란스러운 버그가 있었음. 이 변수로 마지막 상태를 기억해둠.
var _openSettingsGroupId = null;

function renderSettings() {
  var wrap = document.getElementById('settings');
  wrap.innerHTML = '';
  var isMaster = currentUser && currentUser.role === 'master';
  if (!isMaster) {
    // 2026-08-01: 예전엔 스태프가 설정탭에 아예 접근 못 해서, 비밀번호를
    // 바꾸고 싶어도 방법이 전혀 없었음(로그아웃밖에 못 함). 사업설정
    // 전체는 마스터 전용으로 유지하되, 본인 계정 비밀번호 재설정만은 열어줌.
    var myEmail = (typeof getStaffEmail === 'function' && currentUser) ? getStaffEmail(currentUser.name) : '';
    var staffAcctCard = div('padding:24px 16px', [
      span('font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.2px;display:block;margin-bottom:10px', '내 계정'),
      span('font-size:11px;color:var(--sub);display:block;margin-bottom:14px', myEmail ? myEmail + ' 계정으로 로그인 중이에요.' : '계정 정보를 불러오는 중이에요.')
    ]);
    if (myEmail) {
      appendPasswordResetFlow(staffAcctCard, myEmail);
    }
    var staffAcctWrap = div('', [staffAcctCard]);
    staffAcctWrap.appendChild(span('font-size:11px;color:var(--sub);display:block;text-align:center;padding:16px 0', '그 외 설정은 마스터만 접근할 수 있습니다'));
    wrap.appendChild(staffAcctWrap);
    var staffLogoutCard = div('background:#fff;margin-bottom:10px;border-radius:12px;border:1px solid var(--border);padding:16px', [
      btn('width:100%;padding:12px;background:#fff;color:#E4483A;border:1px solid #F3D9D5;border-radius:10px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer', '로그아웃', function() {
        if (confirm('로그아웃 하시겠습니까?')) logout();
      })
    ]);
    staffLogoutCard.className = 'settings-acc-group';
    wrap.appendChild(staffLogoutCard);
    return;
  }

  // 아코디언 그룹 컨테이너 생성 헬퍼 — 헤더 클릭시 펼침/접힘, 기본은 접힌 상태
  function makeGroup(id, title, cards, openByDefault) {
    // 이 화면을 처음 그릴 때(_openSettingsGroupId가 아직 아무것도 안 정해졌을 때)만
    // openByDefault를 기준으로 삼고, 그 이후엔 사용자가 마지막으로 연 섹션을 기억해서 그대로 유지
    var isOpen = (_openSettingsGroupId === null) ? !!openByDefault : (_openSettingsGroupId === id);
    var group = div('background:#fff;margin-bottom:10px;border-radius:12px;border:1px solid var(--border);overflow:hidden', []);
    group.className = 'settings-acc-group';
    group.id = id;
    var body = div('padding:0 16px 16px', []);
    body.style.display = isOpen ? 'block' : 'none';
    cards.forEach(function(c){ body.appendChild(c); });
    var chevron = span('font-size:11px;color:var(--sub);transition:transform 0.15s', isOpen ? '▾' : '▸');
    var header = div('display:flex;align-items:center;justify-content:space-between;padding:14px 16px;cursor:pointer', [
      span('font-size:12px;font-weight:700;color:var(--dark);letter-spacing:0.02em', title),
      chevron
    ]);
    header.addEventListener('click', function(){
      var nowOpen = body.style.display !== 'none';
      body.style.display = nowOpen ? 'none' : 'block';
      chevron.textContent = nowOpen ? '▸' : '▾';
      _openSettingsGroupId = nowOpen ? null : id;
    });
    group.appendChild(header);
    group.appendChild(body);
    return group;
  }

  
  // ── 월목표 설정 카드 ──
  var s = getSettings ? getSettings() : {};
  var goalCard = div('padding-top:4px', []);
  goalCard.innerHTML = '<div style="display:flex;align-items:center;padding-bottom:12px;border-bottom:1px solid #F5F2EE;margin-bottom:var(--sp-3)">' +
      '<div style="flex:1"><div style="font-size:12px;font-weight:600;color:var(--dark)">월 목표 매출</div>' +
      '<div style="font-size:11px;color:var(--sub);margin-top:2px">홈 화면 목표 달성률 기준</div></div>' +
      '<input id="set-monthly-goal" type="text" value="' + escHtml(String(s.monthlyGoal || '5000')) + '" placeholder="5000" onchange="saveSettings()" style="text-align:right;border:none;outline:none;font-size:11px;color:var(--dark);background:transparent;font-family:inherit;width:70px">' +
      '<span style="font-size:11px;color:#8E8078;margin-left:4px">만원</span>' +
    '</div>';

  // ── 담당자별 월 목표 ──
  var staffGoalCard = div('', []);
  var allStaffs = ['마스터'].concat(getStaffList());
  allStaffs.forEach(function(staff) {
    var goalKey = 'dah_goal_'+staff;
    var curGoal = Number(localStorage.getItem(goalKey)||0);
    var gRow = div('margin-bottom:10px', [
      span('font-size:12px;font-weight:700;display:block;margin-bottom:var(--sp-1)', staff)
    ]);
    var gInput = el('input', {type:'number', 'data-staff-goal':staff, placeholder:'목표 금액 (원)', value:curGoal>0?String(curGoal):'', style:'width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:10px;font-size:11px;font-family:inherit;outline:none;box-sizing:border-box'});
    (function(k, s) {
      gInput.addEventListener('change', function() {
        var v = Number(this.value.replace(/[^0-9]/g,''));
        if(v>0) { localStorage.setItem(k, String(v)); syncStaffGoalsToCloud(); showToast(s+' 목표 설정됐습니다'); }
      });
    })(goalKey, staff);
    gRow.appendChild(gInput);
    staffGoalCard.appendChild(gRow);
  });


  // ── 전체 저장 (항상 최상단 고정) ──
  var saveAllBtn = btn('width:100%;padding:14px;background:var(--terra);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;margin-bottom:10px', '전체 저장', function() {
    saveSettings();
    document.querySelectorAll('[data-staff-goal]').forEach(function(inp) {
      var v = Number(inp.value.replace(/[^0-9]/g,''));
      if (v > 0) { try { localStorage.setItem('dah_goal_'+inp.getAttribute('data-staff-goal'), String(v)); } catch(e){} }
    });
    syncStaffGoalsToCloud();
    var wh = document.getElementById('set-webhook-url');
    if (wh) {
      var url = wh.value.trim();
      try { localStorage.setItem('dah_webhook_url', url); } catch(e){}
      sbSyncSetting('webhook_url', url);
    }
    var leadDaysInput = document.getElementById('set-lead-stale-days');
    if (leadDaysInput) {
      var days = Number(leadDaysInput.value);
      if (days > 0) setLeadStaleDays(days);
    }
    var newRegionFees = {};
    document.querySelectorAll('[data-region][data-field]').forEach(function(inp) {
      var region = inp.getAttribute('data-region');
      var field = inp.getAttribute('data-field');
      if (!newRegionFees[region]) newRegionFees[region] = {};
      newRegionFees[region][field] = Number(inp.value) || 0;
    });
    if (Object.keys(newRegionFees).length > 0) setRegionFees(newRegionFees);
    showToast('전체 설정이 저장되고 클라우드에 동기화됐습니다');
  });
  wrap.appendChild(saveAllBtn);

  var groupGoal = makeGroup('sec-set-goal', '매출 · 목표', [goalCard, labelDiv('담당자별 월 목표'), staffGoalCard], true);
  wrap.appendChild(groupGoal);

  // ── 마스터 로그인 이메일 ──
  var masterEmailCard = div('padding-top:4px', [
    span('font-size:11px;color:var(--sub);display:block;margin-bottom:10px', 'Supabase 대시보드(Authentication)에서 먼저 마스터 계정을 이메일+비밀번호로 만든 뒤, 그 이메일을 여기에 등록해주세요.')
  ]);
  var masterEmailInput = el('input', {type:'email', id:'set-master-email', placeholder:'마스터 로그인 이메일', value: getMasterEmail(), style:'width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:10px;font-size:11px;font-family:inherit;outline:none;box-sizing:border-box'});
  masterEmailInput.addEventListener('change', function(){
    setMasterEmail(masterEmailInput.value.trim());
    showToast('마스터 로그인 이메일이 저장됐습니다');
  });
  masterEmailCard.appendChild(masterEmailInput);

  // ── 비밀번호 변경 ──
  // 2026-08-01 수정: 예전엔 이메일 등록 후에도 "비밀번호 변경" 입력창+버튼이
  // 그대로 남아있어서, 눌러도 "변경됐습니다" 토스트가 떠서 실제로 바뀐 줄
  // 착각하기 쉬웠음(실제로는 로그인에 안 쓰이는 예전 필드만 바뀜). 이제
  // 이메일이 등록된 상태면 그 UI 자체를 숨기고, 진짜 비밀번호를 바꾸는
  // 정확한 방법(재설정 이메일)으로 교체함.
  var pwCard;
  var _masterEmailNow = (typeof getMasterEmail === 'function') ? getMasterEmail() : '';
  if (_masterEmailNow) {
    pwCard = div('padding-top:12px;border-top:1px solid #F5F2EE;margin-top:var(--sp-3)', [
      span('font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.2px;display:block;margin-bottom:var(--sp-1)', '비밀번호 변경'),
      span('font-size:11px;color:var(--sub);display:block;margin-bottom:10px', '실제 로그인 비밀번호는 "' + _masterEmailNow + '" 계정의 비밀번호입니다. 아래 버튼을 누르면 그 이메일로 재설정 링크가 발송돼요.')
    ]);
    appendPasswordResetFlow(pwCard, _masterEmailNow);
  } else {
  pwCard = div('padding-top:12px;border-top:1px solid #F5F2EE;margin-top:var(--sp-3)', [
    span('font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.2px;display:block;margin-bottom:var(--sp-1)', '비밀번호 변경'),
    span('font-size:11px;color:var(--sub);display:block;margin-bottom:10px', '마스터 이메일을 등록하면 더 안전한 로그인 방식으로 전환돼요.')
  ]);
  [['change-pw-current2','현재 비밀번호'],['change-pw-new2','새 비밀번호 (4자 이상)'],['change-pw-confirm2','새 비밀번호 확인']].forEach(function(row) {
    var inp = el('input', {type:'password', id:row[0], placeholder:row[1], style:'width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:10px;font-size:11px;font-family:inherit;outline:none;margin-bottom:6px;box-sizing:border-box'});
    pwCard.appendChild(inp);
  });
  pwCard.appendChild(btn('width:100%;padding:11px;background:var(--dark);color:#fff;border:none;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;border-radius:10px', '비밀번호 변경', function() {
    var cur = document.getElementById('change-pw-current2');
    var nw = document.getElementById('change-pw-new2');
    var con = document.getElementById('change-pw-confirm2');
    if(cur.value !== MASTER_PW) { alert('현재 비밀번호가 틀렸습니다.'); cur.value=''; return; }
    if(nw.value.length < 4) { alert('새 비밀번호는 4자 이상이어야 합니다.'); return; }
    if(nw.value !== con.value) { alert('새 비밀번호가 일치하지 않습니다.'); con.value=''; return; }
    MASTER_PW = nw.value;
    try { localStorage.setItem('dah_master_pw', MASTER_PW); } catch(e){}
    sbSyncSetting('master_pw', MASTER_PW);
    cur.value=''; nw.value=''; con.value='';
    showToast('비밀번호가 변경됐습니다');
  }));
  }

  
  // ── 담당자 관리 ──
  var staffCard = div('padding-top:12px;border-top:1px solid #F5F2EE;margin-top:var(--sp-3)', [
    span('font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.2px;display:block;margin-bottom:var(--sp-1)', '담당자 관리'),
    span('font-size:11px;color:var(--sub);display:block;margin-bottom:10px', '로그인용 이메일과 비밀번호는 Supabase 대시보드(Authentication)에서 먼저 계정을 만든 뒤, 아래에 그 이메일을 연결해주세요.')
  ]);
  var staffList = getStaffList();
  staffList.forEach(function(name) {
    var emailInput = el('input', {type:'email', placeholder:'로그인용 이메일', value: getStaffEmail(name), style:'width:100%;padding:6px 8px;border:1px solid var(--border);font-size:11px;font-family:inherit;outline:none;margin-top:var(--sp-1);box-sizing:border-box'});
    emailInput.addEventListener('change', function(){
      setStaffEmail(name, emailInput.value.trim());
      showToast(name + '의 로그인 이메일이 저장됐습니다');
    });
    var row = div('padding:8px 0;border-bottom:1px solid var(--border)', [
      div('display:flex;justify-content:space-between;align-items:center', [
        span('font-size:12px;font-weight:700', name),
        btn('font-size:11px;color:#E4483A;background:none;border:none;cursor:pointer;font-family:inherit', '삭제', function() {
          if(!confirm(name + ' 담당자를 삭제할까요?')) return;
          var list = getStaffList().filter(function(s){ return s !== name; });
          try { localStorage.setItem('dah_staff_list', JSON.stringify(list)); } catch(e){}
          sbSyncSetting('staff_list', list);
          removeStaffEmail(name);
          renderSettings(); showToast(name + ' 담당자가 삭제됐습니다');
        })
      ]),
      emailInput
    ]);
    staffCard.appendChild(row);
  });
  var addStaffWrap = div('display:flex;gap:var(--sp-2);margin-top:10px', []);
  var staffInput = el('input', {type:'text', placeholder:'새 담당자 이름', style:'flex:1;padding:9px 10px;border:1px solid var(--border);font-size:11px;font-family:inherit;outline:none'});
  addStaffWrap.appendChild(staffInput);
  addStaffWrap.appendChild(btn('padding:9px 14px;background:var(--dark);color:#fff;border:none;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer', '추가', function() {
    var name = staffInput.value.trim();
    if(!name) return;
    var list = getStaffList();
    if(list.indexOf(name) >= 0) { showToast('이미 있는 담당자입니다'); return; }
    list.push(name);
    try { localStorage.setItem('dah_staff_list', JSON.stringify(list)); } catch(e){}
    sbSyncSetting('staff_list', list);
    staffInput.value = '';
    renderSettings(); showToast(name + ' 담당자가 추가됐습니다 — 로그인하려면 이메일도 등록해주세요');
  }));
  staffCard.appendChild(addStaffWrap);

  var groupAccount = makeGroup('sec-set-account', '계정 · 보안', [masterEmailCard, pwCard, staffCard], false);
  wrap.appendChild(groupAccount);

  // ── 거래처 관리 (2026-07-31 신규, 2026-08-01 카테고리 추가, 2026-08-02 다중분류 지원) ──
  // 발주탭 자동완성 목록을 여기서 직접 관리. 카테고리는 여러 개 겸할 수 있음(예:
  // 제작도 하고 시공도 하는 업체는 둘 다 켜두면 됨). 아무 카테고리도 안 켜면
  // "미분류"로 취급되어 모든 항목에 다 나옴(안전한 기본값).
  var vendorCard = div('padding-top:4px', [
    span('font-size:11px;color:var(--sub);display:block;margin-bottom:12px', '발주탭에서 업체명을 고를 때 자동완성으로 뜨는 목록입니다. 아래 태그를 탭해서 이 업체가 담당하는 분야를 켜고 끌 수 있어요(여러 개 겸해도 되고, 하나도 안 켜면 모든 항목에 다 나와요).')
  ]);
  var vendorListWrap = div('display:flex;flex-direction:column;gap:10px;margin-bottom:14px', []);
  var vendorList = getVendorList();
  vendorList.forEach(function(v) {
    if (!Array.isArray(v.categories)) v.categories = [];
    var row = div('background:var(--ivory1);border:1px solid var(--border);border-radius:14px;padding:10px 12px', []);
    var topLine = div('display:flex;align-items:center;justify-content:space-between;margin-bottom:8px', [
      span('font-size:13px;font-weight:700;color:var(--dark)', v.name)
    ]);
    var removeBtn = btn('width:32px;height:32px;min-width:32px;border-radius:50%;background:transparent;color:var(--sub);border:none;cursor:pointer;font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0', '\u00D7', function() {
      if (!confirm(v.name + ' 거래처를 목록에서 삭제할까요? (이미 저장된 견적서/발주기록엔 영향 없어요)')) return;
      var list = getVendorList().filter(function(x){ return x.name !== v.name; });
      setVendorList(list);
      renderSettings(); showToast(v.name + ' 거래처가 삭제됐습니다');
    });
    topLine.appendChild(removeBtn);
    row.appendChild(topLine);
    var tagWrap = div('display:flex;flex-wrap:wrap;gap:6px', []);
    VENDOR_CATEGORIES.forEach(function(c) {
      var isOn = v.categories.indexOf(c.key) >= 0;
      var tag = btn(
        'font-size:11px;font-weight:700;border-radius:20px;padding:6px 12px;cursor:pointer;font-family:inherit;min-height:32px;border:1px solid ' +
        (isOn ? 'var(--terra)' : 'var(--border)') + ';background:' + (isOn ? 'var(--terra)' : '#fff') + ';color:' + (isOn ? '#fff' : 'var(--sub)'),
        c.label,
        function() {
          var list = getVendorList();
          var target = list.find(function(x){ return x.name === v.name; });
          if (!target) return;
          if (!Array.isArray(target.categories)) target.categories = [];
          var idx = target.categories.indexOf(c.key);
          if (idx >= 0) target.categories.splice(idx, 1); else target.categories.push(c.key);
          setVendorList(list);
          renderSettings();
        }
      );
      tagWrap.appendChild(tag);
    });
    row.appendChild(tagWrap);
    vendorListWrap.appendChild(row);
  });
  if (vendorList.length === 0) {
    vendorListWrap.appendChild(span('font-size:12px;color:var(--sub)', '등록된 거래처가 없어요'));
  }
  vendorCard.appendChild(vendorListWrap);
  var addVendorWrap = div('display:flex;gap:var(--sp-2)', []);
  var vendorInput = el('input', {type:'text', placeholder:'새 거래처 이름', style:'flex:1;padding:9px 12px;border:1px solid var(--border);border-radius:10px;font-size:12px;font-family:inherit;outline:none;box-sizing:border-box'});
  addVendorWrap.appendChild(vendorInput);
  addVendorWrap.appendChild(btn('padding:9px 16px;background:var(--dark);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;min-height:32px', '추가', function() {
    var name = vendorInput.value.trim();
    if (!name) return;
    var list = getVendorList();
    if (list.some(function(v){ return v.name === name; })) { showToast('이미 있는 거래처입니다'); return; }
    list.push({ name: name, categories: [] });
    setVendorList(list);
    vendorInput.value = '';
    renderSettings(); showToast(name + ' 거래처가 추가됐습니다 — 아래에서 담당 분야를 켜주세요');
  }));
  vendorCard.appendChild(addVendorWrap);


  var groupVendor = makeGroup('sec-set-vendor', '거래처 관리', [vendorCard], false);
  wrap.appendChild(groupVendor);

  // ── 빠른 메모 문구 관리 (2026-07-31 신규, 2026-08-01 디자인 개선) ──
  var memoPhraseCard = div('padding-top:4px', [
    span('font-size:11px;color:var(--sub);display:block;margin-bottom:12px', '고객 메모 입력할 때 탭 한 번으로 넣을 수 있는 문구 버튼입니다.')
  ]);
  var memoChipWrap = div('display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px', []);
  var memoPhrases = (typeof getMempoPhrases === 'function') ? getMempoPhrases() : [];
  memoPhrases.forEach(function(phrase) {
    var chip = div('display:inline-flex;align-items:center;gap:6px;background:var(--ivory1);border:1px solid var(--border);border-radius:20px;padding:7px 8px 7px 14px', [
      span('font-size:12px;font-weight:600;color:var(--dark)', phrase)
    ]);
    var removeBtn = btn('width:32px;height:32px;min-width:32px;border-radius:50%;background:transparent;color:var(--sub);border:none;cursor:pointer;font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0', '\u00D7', function() {
      if (!confirm('"' + phrase + '" 문구를 삭제할까요?')) return;
      var list = getMempoPhrases().filter(function(p){ return p !== phrase; });
      setMemoPhrasesList(list);
      renderSettings(); showToast('문구가 삭제됐습니다');
    });
    chip.appendChild(removeBtn);
    memoChipWrap.appendChild(chip);
  });
  if (memoPhrases.length === 0) {
    memoChipWrap.appendChild(span('font-size:12px;color:var(--sub)', '등록된 문구가 없어요'));
  }
  memoPhraseCard.appendChild(memoChipWrap);
  var addPhraseWrap = div('display:flex;gap:var(--sp-2)', []);
  var phraseInput = el('input', {type:'text', placeholder:'새 문구', style:'flex:1;padding:9px 12px;border:1px solid var(--border);border-radius:10px;font-size:12px;font-family:inherit;outline:none;box-sizing:border-box'});
  addPhraseWrap.appendChild(phraseInput);
  addPhraseWrap.appendChild(btn('padding:9px 16px;background:var(--dark);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;min-height:32px', '추가', function() {
    var phrase = phraseInput.value.trim();
    if (!phrase) return;
    var list = getMempoPhrases();
    if (list.indexOf(phrase) >= 0) { showToast('이미 있는 문구입니다'); return; }
    list.push(phrase);
    setMemoPhrasesList(list);
    phraseInput.value = '';
    renderSettings(); showToast('문구가 추가됐습니다');
  }));
  memoPhraseCard.appendChild(addPhraseWrap);


  // ── 놓친 리드 기준일수 ──
  var leadDaysCard = div('padding-top:12px;border-top:1px solid #F5F2EE;margin-top:var(--sp-3)', []);
  leadDaysCard.innerHTML = '<div style="display:flex;align-items:center">' +
      '<div style="flex:1"><div style="font-size:12px;font-weight:600;color:var(--dark)">놓친 리드 기준일수</div>' +
      '<div style="font-size:11px;color:var(--sub);margin-top:2px">상담 후 이 기간 이상 진행없으면 홈화면에 알림</div></div>' +
      '<input id="set-lead-stale-days" type="number" value="' + ((typeof getLeadStaleDays === 'function') ? getLeadStaleDays() : 7) + '" style="text-align:right;border:none;outline:none;font-size:11px;color:var(--dark);background:transparent;font-family:inherit;width:50px">' +
      '<span style="font-size:11px;color:#8E8078;margin-left:4px">일</span>' +
    '</div>';

  var groupMemo = makeGroup('sec-set-memo', '빠른문구 · 리드알림', [memoPhraseCard, leadDaysCard], false);
  wrap.appendChild(groupMemo);

  // ── 지역별 실측비·시공비 (2026-07-31 신규) — 견적서 앱과 공유 ──
  var regionFeesCard = div('padding-top:4px', [
    span('font-size:11px;color:var(--sub);display:block;margin-bottom:10px', '견적서 작성시 지역 선택하면 자동으로 붙는 실측비·시공비입니다. 여기서 바꾸면 견적서 앱에도 바로 반영돼요.')
  ]);
  var curRegionFees = getRegionFees();
  ['서울', '경기'].forEach(function(region) {
    var rf = curRegionFees[region] || { '실측비': 0, '시공비': 0 };
    var row = div('padding:10px 0;border-bottom:1px solid var(--border)', [
      span('font-size:12px;font-weight:700;display:block;margin-bottom:6px', region)
    ]);
    var inputRow = div('display:flex;gap:8px', []);
    var measureWrap = div('flex:1', [ span('font-size:11px;color:var(--sub);display:block;margin-bottom:2px', '실측비') ]);
    var measureInput = el('input', { type: 'number', 'data-region': region, 'data-field': '실측비', value: rf['실측비'] || 0, style: 'width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:10px;font-size:11px;font-family:inherit;outline:none;box-sizing:border-box' });
    measureWrap.appendChild(measureInput);
    var installWrap = div('flex:1', [ span('font-size:11px;color:var(--sub);display:block;margin-bottom:2px', '시공비') ]);
    var installInput = el('input', { type: 'number', 'data-region': region, 'data-field': '시공비', value: rf['시공비'] || 0, style: 'width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:10px;font-size:11px;font-family:inherit;outline:none;box-sizing:border-box' });
    installWrap.appendChild(installInput);
    inputRow.appendChild(measureWrap);
    inputRow.appendChild(installWrap);
    row.appendChild(inputRow);
    regionFeesCard.appendChild(row);
  });
  var groupRegionFees = makeGroup('sec-set-regionfees', '지역별 출장비', [regionFeesCard], false);
  wrap.appendChild(groupRegionFees);

  // ── 할인 쿠폰 관리 (2026-08-14 신규) — 견적서 앱에서 다중선택 가능한 할인 항목 ──
  // 2026-08-14 개편: "한번 쓰인 쿠폰은 값 수정 자체를 막고, 바꾸려면 새로
  // 만들게" 방식으로 변경(선혜님 요청) — 값이 바뀌면 과거 견적서 재계산이
  // 달라지는 혼란 자체를 원천 차단. 실제 견적서에 적용된 적 있는 쿠폰은
  // 값/단위 입력을 잠그고(이름만 수정 가능), 안 쓰인 쿠폰은 자유롭게(확인창
  // 없이) 수정 가능 — 리스크 자체가 없으므로 확인창도 불필요해짐.
  var couponCard = div('padding-top:4px', [
    span('font-size:11px;color:var(--sub);display:block;margin-bottom:10px', '견적서 작성시 체크박스로 여러개 동시 선택 가능한 할인 항목입니다. 선택한 순서대로(위→아래) 순차 적용돼요.')
  ]);
  var curCoupons = (typeof getDiscountCoupons === 'function') ? getDiscountCoupons() : [];
  var usedCouponIds = {};
  try { usedCouponIds = JSON.parse(localStorage.getItem('dah_used_coupon_ids') || '{}'); } catch(e) {}
  var couponListWrap = div('display:flex;flex-direction:column;gap:6px;margin-bottom:10px', []);
  curCoupons.forEach(function(c, idx) {
    var isUsed = !!usedCouponIds[c.id];
    var row = div('display:flex;flex-direction:column;gap:4px;padding:8px;background:var(--ivory1);border-radius:10px', []);
    var inputRow = div('display:flex;gap:6px;align-items:center', []);
    var nameInput = el('input', { type:'text', value: c.name, 'data-coupon-idx': idx, 'data-field':'name', style:'flex:1;padding:7px 9px;border:1px solid var(--border);border-radius:8px;font-size:11px;font-family:inherit;outline:none;box-sizing:border-box;min-width:0' });
    var valueInput = el('input', { type:'number', value: c.value, 'data-coupon-idx': idx, 'data-field':'value', style:'width:56px;padding:7px 9px;border:1px solid var(--border);border-radius:8px;font-size:11px;font-family:inherit;outline:none;box-sizing:border-box;text-align:right'+(isUsed?';background:#F0EDE8;color:var(--sub)':'') });
    if (isUsed) valueInput.disabled = true;
    var typeSelect = el('select', { 'data-coupon-idx': idx, 'data-field':'type', style:'padding:7px 6px;border:1px solid var(--border);border-radius:8px;font-size:11px;font-family:inherit;outline:none'+(isUsed?';background:#F0EDE8;color:var(--sub)':'') });
    if (isUsed) typeSelect.disabled = true;
    ['pct','won'].forEach(function(t){
      var opt = el('option', { value:t }, [t === 'pct' ? '%' : '원']);
      if (c.type === t) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    var delBtn = btn('padding:7px 10px;background:#fff;color:#C0392B;border:1px solid #F5D6D0;border-radius:8px;font-size:11px;font-family:inherit;cursor:pointer;min-height:32px', '삭제', function(){
      var arr = getDiscountCoupons();
      arr.splice(idx, 1);
      setDiscountCoupons(arr);
      renderSettings(); showToast('쿠폰이 삭제됐습니다');
    });
    nameInput.addEventListener('change', function(){
      // 이름은 표시 텍스트일 뿐 계산에 영향 없음 - 사용 이력과 무관하게 항상 자유롭게 수정 가능
      var arr = getDiscountCoupons();
      arr[idx].name = nameInput.value;
      setDiscountCoupons(arr);
      showToast('쿠폰이 수정됐습니다');
    });
    if (!isUsed) {
      valueInput.addEventListener('change', function(){
        var arr = getDiscountCoupons();
        arr[idx].value = parseFloat(valueInput.value) || 0;
        setDiscountCoupons(arr);
        showToast('쿠폰이 수정됐습니다');
      });
      typeSelect.addEventListener('change', function(){
        var arr = getDiscountCoupons();
        arr[idx].type = typeSelect.value;
        setDiscountCoupons(arr);
        renderSettings(); showToast('쿠폰이 수정됐습니다');
      });
    }
    inputRow.appendChild(nameInput); inputRow.appendChild(valueInput); inputRow.appendChild(typeSelect); inputRow.appendChild(delBtn);
    row.appendChild(inputRow);
    if (isUsed) {
      row.appendChild(span('font-size:10px;color:#B0764F', '🔒 이미 견적서에 사용된 쿠폰이라 값/단위 수정이 잠겼어요. 바꾸려면 아래에서 새 쿠폰을 만들어주세요.'));
    }
    couponListWrap.appendChild(row);
  });
  if (curCoupons.length === 0) {
    couponListWrap.appendChild(span('font-size:12px;color:var(--sub)', '등록된 쿠폰이 없어요'));
  }
  couponCard.appendChild(couponListWrap);
  // 사용이력 조회(비동기) - 오면 잠금상태 갱신을 위해 재렌더링
  if (typeof fetchUsedCouponIdsFromCloud === 'function') {
    fetchUsedCouponIdsFromCloud(function(ids) {
      try {
        var prevJson = localStorage.getItem('dah_used_coupon_ids') || '{}';
        var newJson = JSON.stringify(ids);
        localStorage.setItem('dah_used_coupon_ids', newJson);
        if (prevJson !== newJson && document.getElementById('sec-set-coupons')) renderSettings();
      } catch(e) {}
    });
  }
  var addCouponWrap = div('display:flex;gap:8px', []);
  var newCouponName = el('input', { type:'text', placeholder:'쿠폰명 (예: 재구매)', style:'flex:1;padding:9px 12px;border:1px solid var(--border);border-radius:10px;font-size:12px;font-family:inherit;outline:none;box-sizing:border-box;min-width:0' });
  var newCouponValue = el('input', { type:'number', placeholder:'5', style:'width:64px;padding:9px 10px;border:1px solid var(--border);border-radius:10px;font-size:12px;font-family:inherit;outline:none;box-sizing:border-box' });
  var newCouponType = el('select', { style:'padding:9px 8px;border:1px solid var(--border);border-radius:10px;font-size:12px;font-family:inherit;outline:none' });
  newCouponType.appendChild(el('option', {value:'pct'}, ['%']));
  newCouponType.appendChild(el('option', {value:'won'}, ['원']));
  addCouponWrap.appendChild(newCouponName); addCouponWrap.appendChild(newCouponValue); addCouponWrap.appendChild(newCouponType);
  addCouponWrap.appendChild(btn('padding:9px 16px;background:var(--dark);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;min-height:32px', '추가', function(){
    var name = newCouponName.value.trim();
    var value = parseFloat(newCouponValue.value) || 0;
    if (!name) { showToast('쿠폰명을 입력해주세요'); return; }
    var arr = getDiscountCoupons();
    arr.push({ id: 'c' + Date.now(), name: name, type: newCouponType.value, value: value });
    setDiscountCoupons(arr);
    renderSettings(); showToast('쿠폰이 추가됐습니다');
  }));
  couponCard.appendChild(addCouponWrap);
  var groupCoupons = makeGroup('sec-set-coupons', '할인 쿠폰', [couponCard], false);
  wrap.appendChild(groupCoupons);

  
  // ── 계좌 정보 ──
  var acctCard = div('padding-top:4px', []);
  acctCard.innerHTML = '<div style="display:flex;align-items:center;border-bottom:1px solid #F5F2EE;padding-bottom:10px;margin-bottom:10px">' +
      '<div style="font-size:12px;font-weight:600;color:var(--dark);flex:1">은행명</div>' +
      '<input id="set-bank" type="text" value="' + escHtml(s.bank || '') + '" placeholder="예: 국민은행" onchange="saveSettings()" style="text-align:right;border:none;outline:none;font-size:11px;color:var(--dark);background:transparent;font-family:inherit">' +
    '</div>' +
    '<div style="display:flex;align-items:center;border-bottom:1px solid #F5F2EE;padding-bottom:10px;margin-bottom:10px">' +
      '<div style="font-size:12px;font-weight:600;color:var(--dark);flex:1">계좌번호</div>' +
      '<input id="set-account" type="text" value="' + escHtml(s.account || '015401-04-258798') + '" onchange="saveSettings()" style="text-align:right;border:none;outline:none;font-size:11px;color:var(--dark);background:transparent;font-family:inherit">' +
    '</div>' +
    '<div style="display:flex;align-items:center">' +
      '<div style="font-size:12px;font-weight:600;color:var(--dark);flex:1">예금주</div>' +
      '<input id="set-holder" type="text" value="' + escHtml(s.holder || '장선혜') + '" onchange="saveSettings()" style="text-align:right;border:none;outline:none;font-size:11px;color:var(--dark);background:transparent;font-family:inherit">' +
    '</div>';

  // ── Make.com 웹훅 ──
  var webhookCard = div('padding-top:12px;border-top:1px solid #F5F2EE;margin-top:var(--sp-3)', [
    span('font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.2px;display:block;margin-bottom:var(--sp-1)', 'Make.com 웹훅 URL'),
    span('font-size:11px;color:var(--sub);display:block;margin-bottom:10px', '알림톡 자동 발송 연동 (검수 완료 후 입력) · 입력 후 다른 곳을 클릭하면 자동 저장됩니다')
  ]);
  var curWebhook = localStorage.getItem('dah_webhook_url') || '';
  var webhookInput = el('input', {type:'text', id:'set-webhook-url', placeholder:'https://hook.make.com/...', value:curWebhook, style:'width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:10px;font-size:11px;font-family:inherit;outline:none;box-sizing:border-box'});
  webhookInput.addEventListener('change', function() {
    var url = this.value.trim();
    try { localStorage.setItem('dah_webhook_url', url); } catch(e){}
    sbSyncSetting('webhook_url', url);
    showToast('웹훅 URL이 저장됐습니다');
  });
  webhookCard.appendChild(webhookInput);

  var groupIntegration = makeGroup('sec-set-integration', '계좌 · 연동', [acctCard, webhookCard], false);
  wrap.appendChild(groupIntegration);

  
  // ── 데이터 관리 ──
  var dataCard = div('padding-top:4px', []);
  dataCard.appendChild(btn('width:100%;padding:11px;background:var(--dark);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;margin-bottom:var(--sp-2)', '고객목록 엑셀 내보내기', exportExcel));
  dataCard.appendChild(btn('width:100%;padding:11px;background:var(--dark);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;margin-bottom:var(--sp-2)', '견적서목록 엑셀 내보내기', exportEstimatesExcel));
  dataCard.appendChild(btn('width:100%;padding:11px;background:var(--ivory1);border:none;border-radius:10px;font-size:11px;font-family:inherit;cursor:pointer;margin-bottom:var(--sp-2);color:var(--dark)', '백업 (JSON 다운로드)', backupData));
  var lastBackupIso = null;
  try { lastBackupIso = localStorage.getItem('dah_last_backup'); } catch(e){}
  var lastBackupLabel = '마지막 백업: 없음';
  if (lastBackupIso) {
    var lbDate = new Date(lastBackupIso);
    lastBackupLabel = '마지막 백업: ' + lbDate.getFullYear() + '.' + pad2(lbDate.getMonth()+1) + '.' + pad2(lbDate.getDate()) + ' ' + pad2(lbDate.getHours()) + ':' + pad2(lbDate.getMinutes());
  }
  dataCard.appendChild(el('span', {id:'last-backup-time', style:'font-size:11px;color:var(--sub);display:block;margin:-4px 0 8px;text-align:right', text:lastBackupLabel}));
  var restoreInput = el('input', {type:'file', accept:'.json', style:'display:none', id:'restore-input'});
  restoreInput.addEventListener('change', function(e) {
    var file = e.target.files[0]; if(!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if(data.customers) {
          saveCustomers(data.customers);
          showToast('복원 완료! ' + data.customers.length + '건');
          renderHome();
        }
      } catch(err) { alert('파일 형식이 올바르지 않습니다'); }
    };
    reader.readAsText(file);
  });
  dataCard.appendChild(restoreInput);
  dataCard.appendChild(btn('width:100%;padding:11px;background:var(--ivory1);border:none;border-radius:10px;font-size:11px;font-family:inherit;cursor:pointer;color:var(--dark)', '복원 (JSON 업로드)', function() { document.getElementById('restore-input').click(); }));

  var groupData = makeGroup('sec-set-data', '데이터 관리', [dataCard], false);
  wrap.appendChild(groupData);

  // 로그아웃 — 2026-08-02: 접힌 그룹 안에 숨어있어서 찾기 불편하다는 피드백으로,
  // 어떤 아코디언에도 속하지 않는 독립 카드로 분리해서 설정 화면 맨 아래에
  // 항상(접지 않고) 보이게 함
  var logoutStandalone = div('background:#fff;margin-bottom:10px;border-radius:12px;border:1px solid var(--border);padding:16px', [
    btn('width:100%;padding:12px;background:#fff;color:#E4483A;border:1px solid #F3D9D5;border-radius:10px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer', '로그아웃', function() {
      if (confirm('로그아웃 하시겠습니까?')) logout();
    })
  ]);
  wrap.appendChild(logoutStandalone);

  // 빠른이동 내비게이션 (PC 전용) — 그룹 단위로 축소
  if (typeof renderQuickNav === 'function') {
    renderQuickNav([
      {id:'sec-set-goal', label:'매출목표'},
      {id:'sec-set-account', label:'계정보안'},
      {id:'sec-set-integration', label:'계좌연동'},
      {id:'sec-set-data', label:'데이터관리'}
    ]);
  }
}

function labelDiv(text) { return span('font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.2px;display:block;margin-bottom:var(--sp-2)', text); }
