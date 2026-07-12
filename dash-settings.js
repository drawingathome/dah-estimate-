/* ══════════════════════════════════════════════════
   DAH 대시보드 — 설정 화면 기능
   월목표매출/계좌정보 불러오기·저장, 고객추가모달 칩 초기화,
   설정탭 전체 렌더링.
   ══════════════════════════════════════════════════ */

function loadSettings() {
  try {
    var s = JSON.parse(localStorage.getItem('dah_settings') || '{}');
    if (s.monthlyGoal) {
      var el = document.getElementById('set-monthly-goal');
      if (el) el.value = s.monthlyGoal;
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

function renderSettings() {
  var wrap = document.getElementById('settings');
  wrap.innerHTML = '';
  var isMaster = currentUser && currentUser.role === 'master';
  if (!isMaster) {
    wrap.appendChild(span('font-size:11px;color:var(--sub);display:block;text-align:center;padding:40px 0', '마스터만 접근할 수 있습니다'));
    return;
  }

  
  // ── 월목표 설정 카드 ──
  var s = getSettings ? getSettings() : {};
  var goalCard = div('background:#fff;margin-bottom:10px;padding:16px;border-radius:12px;border:1px solid #EEE6DC', []);
  goalCard.innerHTML = '<div style="font-size:12px;font-weight:700;color:#B0A99F;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:12px">매출 목표</div>' +
    '<div style="display:flex;align-items:center">' +
      '<div style="flex:1"><div style="font-size:12px;font-weight:600;color:#282828">월 목표 매출</div>' +
      '<div style="font-size:11px;color:#B0A99F;margin-top:2px">홈 화면 목표 달성률 기준</div></div>' +
      '<input id="set-monthly-goal" type="text" value="' + (s.monthlyGoal || '5000') + '" placeholder="5000" onchange="saveSettings()" style="text-align:right;border:none;outline:none;font-size:11px;color:#282828;background:transparent;font-family:inherit;width:70px">' +
      '<span style="font-size:11px;color:#8E8078;margin-left:4px">만원</span>' +
    '</div>';
  wrap.appendChild(goalCard);

  // ── 계좌 설정 카드 ──
  var acctCard = div('background:#fff;margin-bottom:10px;padding:16px;border-radius:12px;border:1px solid #EEE6DC', []);
  acctCard.innerHTML = '<div style="font-size:12px;font-weight:700;color:#B0A99F;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:12px">입금 계좌</div>' +
    '<div style="display:flex;align-items:center;border-bottom:1px solid #F5F2EE;padding-bottom:10px;margin-bottom:10px">' +
      '<div style="font-size:12px;font-weight:600;color:#282828;flex:1">계좌번호</div>' +
      '<input id="set-account" type="text" value="' + (s.account || '015401-04-258798') + '" onchange="saveSettings()" style="text-align:right;border:none;outline:none;font-size:11px;color:#282828;background:transparent;font-family:inherit">' +
    '</div>' +
    '<div style="display:flex;align-items:center">' +
      '<div style="font-size:12px;font-weight:600;color:#282828;flex:1">예금주</div>' +
      '<input id="set-holder" type="text" value="' + (s.holder || '장선혜') + '" onchange="saveSettings()" style="text-align:right;border:none;outline:none;font-size:11px;color:#282828;background:transparent;font-family:inherit">' +
    '</div>';
  wrap.appendChild(acctCard);

  var pwCard = div('background:#fff;margin-bottom:10px;padding:16px', [
    span('font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.2px;display:block;margin-bottom:12px', '🔐 비밀번호 변경')
  ]);
  [['change-pw-current2','현재 비밀번호'],['change-pw-new2','새 비밀번호 (4자 이상)'],['change-pw-confirm2','새 비밀번호 확인']].forEach(function(row) {
    var inp = el('input', {type:'password', id:row[0], placeholder:row[1], style:'width:100%;padding:9px 10px;border:1px solid #EEE6DC;border-radius:8px;font-size:11px;font-family:inherit;outline:none;margin-bottom:6px;box-sizing:border-box'});
    pwCard.appendChild(inp);
  });
  pwCard.appendChild(btn('width:100%;padding:12px;background:#F06E2D;color:#fff;border:none;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;border-radius:4px', '비밀번호 변경', function() {
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
  wrap.appendChild(pwCard);

  
  var staffCard = div('background:#fff;margin-bottom:10px;padding:16px', [
    span('font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.2px;display:block;margin-bottom:12px', '👤 담당자 관리')
  ]);
  var staffList = getStaffList();
  staffList.forEach(function(name) {
    var row = div('display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #EEE6DC', [
      span('font-size:12px;font-weight:700', name),
      btn('font-size:11px;color:#F06E2D;background:none;border:1px solid #F06E2D;padding:3px 8px;cursor:pointer;font-family:inherit', '삭제', function() {
        if(!confirm(name + ' 담당자를 삭제할까요?')) return;
        var list = getStaffList().filter(function(s){ return s !== name; });
        try { localStorage.setItem('dah_staff_list', JSON.stringify(list)); } catch(e){}
        sbSyncSetting('staff_list', list);
        renderSettings(); showToast(name + ' 담당자가 삭제됐습니다');
      })
    ]);
    staffCard.appendChild(row);
  });
  var addStaffWrap = div('display:flex;gap:8px;margin-top:10px', []);
  var staffInput = el('input', {type:'text', placeholder:'새 담당자 이름', style:'flex:1;padding:9px 10px;border:1px solid #EEE6DC;font-size:11px;font-family:inherit;outline:none'});
  addStaffWrap.appendChild(staffInput);
  addStaffWrap.appendChild(btn('padding:9px 14px;background:#282828;color:#fff;border:none;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer', '추가', function() {
    var name = staffInput.value.trim();
    if(!name) return;
    var list = getStaffList();
    if(list.indexOf(name) >= 0) { showToast('이미 있는 담당자입니다'); return; }
    list.push(name);
    try { localStorage.setItem('dah_staff_list', JSON.stringify(list)); } catch(e){}
    sbSyncSetting('staff_list', list);
    staffInput.value = '';
    renderSettings(); showToast(name + ' 담당자가 추가됐습니다');
  }));
  staffCard.appendChild(addStaffWrap);
  wrap.appendChild(staffCard);

  
  var goalCard = div('background:#fff;margin-bottom:10px;padding:16px', [
    span('font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.2px;display:block;margin-bottom:12px', '🎯 담당자별 월 목표 매출')
  ]);
  var allStaffs = ['마스터'].concat(getStaffList());
  allStaffs.forEach(function(staff) {
    var goalKey = 'dah_goal_'+staff;
    var curGoal = Number(localStorage.getItem(goalKey)||0);
    var gRow = div('margin-bottom:10px', [
      span('font-size:12px;font-weight:700;display:block;margin-bottom:4px', staff)
    ]);
    var gInput = el('input', {type:'number', 'data-staff-goal':staff, placeholder:'목표 금액 (원)', value:curGoal>0?String(curGoal):'', style:'width:100%;padding:9px 10px;border:1px solid #EEE6DC;border-radius:8px;font-size:11px;font-family:inherit;outline:none;box-sizing:border-box'});
    (function(k, s) {
      gInput.addEventListener('change', function() {
        var v = Number(this.value.replace(/[^0-9]/g,''));
        if(v>0) { localStorage.setItem(k, String(v)); syncStaffGoalsToCloud(); showToast(s+' 목표 설정됐습니다'); }
      });
    })(goalKey, staff);
    gRow.appendChild(gInput);
    goalCard.appendChild(gRow);
  });
  wrap.appendChild(goalCard);

  
  var webhookCard = div('background:#fff;margin-bottom:10px;padding:16px', [
    span('font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.2px;display:block;margin-bottom:4px', '⚙️ Make.com 웹훅 URL'),
    span('font-size:11px;color:var(--sub);display:block;margin-bottom:10px', '알림톡 자동 발송 연동 (검수 완료 후 입력) · 입력 후 다른 곳을 클릭하면 자동 저장됩니다')
  ]);
  var curWebhook = localStorage.getItem('dah_webhook_url') || '';
  var webhookInput = el('input', {type:'text', id:'set-webhook-url', placeholder:'https://hook.make.com/...', value:curWebhook, style:'width:100%;padding:9px 10px;border:1px solid #EEE6DC;border-radius:8px;font-size:11px;font-family:inherit;outline:none;box-sizing:border-box'});
  webhookInput.addEventListener('change', function() {
    var url = this.value.trim();
    try { localStorage.setItem('dah_webhook_url', url); } catch(e){}
    sbSyncSetting('webhook_url', url);
    showToast('웹훅 URL이 저장됐습니다');
  });
  webhookCard.appendChild(webhookInput);
  wrap.appendChild(webhookCard);

  var saveAllCard = div('background:#fff;margin-bottom:10px;padding:16px', []);
  saveAllCard.appendChild(btn('width:100%;padding:14px;background:#F06E2D;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:800;font-family:inherit;cursor:pointer', '💾 전체 저장', function() {
    // 매출목표/계좌정보
    saveSettings();
    // 담당자별 월목표
    document.querySelectorAll('[data-staff-goal]').forEach(function(inp) {
      var v = Number(inp.value.replace(/[^0-9]/g,''));
      if (v > 0) { try { localStorage.setItem('dah_goal_'+inp.getAttribute('data-staff-goal'), String(v)); } catch(e){} }
    });
    syncStaffGoalsToCloud();
    // 웹훅
    var wh = document.getElementById('set-webhook-url');
    if (wh) {
      var url = wh.value.trim();
      try { localStorage.setItem('dah_webhook_url', url); } catch(e){}
      sbSyncSetting('webhook_url', url);
    }
    showToast('전체 설정이 저장되고 클라우드에 동기화됐습니다');
  }));
  wrap.appendChild(saveAllCard);


  
  var dataCard = div('background:#fff;margin-bottom:10px;padding:16px', [
    span('font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.2px;display:block;margin-bottom:12px', '💾 데이터 관리')
  ]);
  dataCard.appendChild(btn('width:100%;padding:11px;background:#282828;color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-bottom:8px', '📊 고객목록 엑셀 내보내기', exportExcel));
  dataCard.appendChild(btn('width:100%;padding:11px;background:#282828;color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-bottom:8px', '📋 견적서목록 엑셀 내보내기', exportEstimatesExcel));
  dataCard.appendChild(btn('width:100%;padding:11px;background:#fff;border:1px solid #EEE6DC;font-size:11px;font-family:inherit;cursor:pointer;margin-bottom:8px', '💾 백업 (JSON 다운로드)', backupData));
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
  dataCard.appendChild(btn('width:100%;padding:11px;background:#fff;border:1px solid #EEE6DC;font-size:11px;font-family:inherit;cursor:pointer', '📂 복원 (JSON 업로드)', function() { document.getElementById('restore-input').click(); }));
  wrap.appendChild(dataCard);

  var logoutCard = div('background:#fff;padding:16px', []);
  logoutCard.appendChild(btn('width:100%;padding:12px;background:#fff;color:#E4483A;border:1px solid #EEE6DC;border-radius:12px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer', '🚪 로그아웃', function() {
    if (confirm('로그아웃 하시겠습니까?')) logout();
  }));
  wrap.appendChild(logoutCard);
}
