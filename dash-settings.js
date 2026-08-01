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

  // 아코디언 그룹 컨테이너 생성 헬퍼 — 헤더 클릭시 펼침/접힘, 기본은 접힌 상태
  function makeGroup(id, title, cards, openByDefault) {
    var group = div('background:#fff;margin-bottom:10px;border-radius:12px;border:1px solid var(--border);overflow:hidden', []);
    group.id = id;
    var body = div('padding:0 16px 16px', []);
    body.style.display = openByDefault ? 'block' : 'none';
    cards.forEach(function(c){ body.appendChild(c); });
    var chevron = span('font-size:11px;color:var(--sub);transition:transform 0.15s', openByDefault ? '▾' : '▸');
    var header = div('display:flex;align-items:center;justify-content:space-between;padding:14px 16px;cursor:pointer', [
      span('font-size:12px;font-weight:700;color:var(--dark);letter-spacing:0.02em', title),
      chevron
    ]);
    header.addEventListener('click', function(){
      var isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      chevron.textContent = isOpen ? '▸' : '▾';
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
      '<input id="set-monthly-goal" type="text" value="' + (s.monthlyGoal || '5000') + '" placeholder="5000" onchange="saveSettings()" style="text-align:right;border:none;outline:none;font-size:11px;color:var(--dark);background:transparent;font-family:inherit;width:70px">' +
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
    pwCard.appendChild(btn('width:100%;padding:11px;background:var(--dark);color:#fff;border:none;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;border-radius:10px', '비밀번호 재설정 이메일 받기', function() {
      if (typeof sendPasswordResetEmail !== 'function') { showToast('재설정 기능을 불러오지 못했어요'); return; }
      showToast('발송 중...');
      sendPasswordResetEmail(_masterEmailNow, function(err) {
        if (err) { showToast('발송 실패: ' + (err.message || '잠시 후 다시 시도해주세요')); return; }
        showToast(_masterEmailNow + '로 재설정 이메일을 보냈어요. 메일함을 확인해주세요');
      });
    }));
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

  // ── 거래처 관리 (2026-07-31 신규) ──
  // 발주탭 자동완성 목록을 여기서 직접 관리. 새 업체 생기면 여기서 바로 추가.
  var vendorCard = div('padding-top:4px', [
    span('font-size:11px;color:var(--sub);display:block;margin-bottom:10px', '발주탭에서 업체명을 고를 때 자동완성으로 뜨는 목록입니다. 새 업체가 생기면 여기서 바로 추가해주세요.')
  ]);
  var vendorList = getVendorList();
  vendorList.forEach(function(name) {
    var row = div('padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center', [
      span('font-size:12px;font-weight:700', name),
      btn('font-size:11px;color:#E4483A;background:none;border:none;cursor:pointer;font-family:inherit', '삭제', function() {
        if (!confirm(name + ' 거래처를 목록에서 삭제할까요? (이미 저장된 견적서/발주기록엔 영향 없어요)')) return;
        var list = getVendorList().filter(function(v){ return v !== name; });
        setVendorList(list);
        renderSettings(); showToast(name + ' 거래처가 삭제됐습니다');
      })
    ]);
    vendorCard.appendChild(row);
  });
  var addVendorWrap = div('display:flex;gap:var(--sp-2);margin-top:10px', []);
  var vendorInput = el('input', {type:'text', placeholder:'새 거래처 이름', style:'flex:1;padding:9px 10px;border:1px solid var(--border);font-size:11px;font-family:inherit;outline:none'});
  addVendorWrap.appendChild(vendorInput);
  addVendorWrap.appendChild(btn('padding:9px 14px;background:var(--dark);color:#fff;border:none;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;min-height:32px', '추가', function() {
    var name = vendorInput.value.trim();
    if (!name) return;
    var list = getVendorList();
    if (list.indexOf(name) >= 0) { showToast('이미 있는 거래처입니다'); return; }
    list.push(name);
    setVendorList(list);
    vendorInput.value = '';
    renderSettings(); showToast(name + ' 거래처가 추가됐습니다');
  }));
  vendorCard.appendChild(addVendorWrap);

  var groupVendor = makeGroup('sec-set-vendor', '거래처 관리', [vendorCard], false);
  wrap.appendChild(groupVendor);

  // ── 빠른 메모 문구 관리 (2026-07-31 신규) ──
  var memoPhraseCard = div('padding-top:4px', [
    span('font-size:11px;color:var(--sub);display:block;margin-bottom:10px', '고객 메모 입력할 때 탭 한 번으로 넣을 수 있는 문구 버튼입니다.')
  ]);
  var memoPhrases = (typeof getMempoPhrases === 'function') ? getMempoPhrases() : [];
  memoPhrases.forEach(function(phrase) {
    var row = div('padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center', [
      span('font-size:12px;font-weight:700', phrase),
      btn('font-size:11px;color:#E4483A;background:none;border:none;cursor:pointer;font-family:inherit', '삭제', function() {
        if (!confirm('"' + phrase + '" 문구를 삭제할까요?')) return;
        var list = getMempoPhrases().filter(function(p){ return p !== phrase; });
        setMemoPhrasesList(list);
        renderSettings(); showToast('문구가 삭제됐습니다');
      })
    ]);
    memoPhraseCard.appendChild(row);
  });
  var addPhraseWrap = div('display:flex;gap:var(--sp-2);margin-top:10px', []);
  var phraseInput = el('input', {type:'text', placeholder:'새 문구', style:'flex:1;padding:9px 10px;border:1px solid var(--border);font-size:11px;font-family:inherit;outline:none'});
  addPhraseWrap.appendChild(phraseInput);
  addPhraseWrap.appendChild(btn('padding:9px 14px;background:var(--dark);color:#fff;border:none;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;min-height:32px', '추가', function() {
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

  
  // ── 계좌 정보 ──
  var acctCard = div('padding-top:4px', []);
  acctCard.innerHTML = '<div style="display:flex;align-items:center;border-bottom:1px solid #F5F2EE;padding-bottom:10px;margin-bottom:10px">' +
      '<div style="font-size:12px;font-weight:600;color:var(--dark);flex:1">계좌번호</div>' +
      '<input id="set-account" type="text" value="' + (s.account || '015401-04-258798') + '" onchange="saveSettings()" style="text-align:right;border:none;outline:none;font-size:11px;color:var(--dark);background:transparent;font-family:inherit">' +
    '</div>' +
    '<div style="display:flex;align-items:center">' +
      '<div style="font-size:12px;font-weight:600;color:var(--dark);flex:1">예금주</div>' +
      '<input id="set-holder" type="text" value="' + (s.holder || '장선혜') + '" onchange="saveSettings()" style="text-align:right;border:none;outline:none;font-size:11px;color:var(--dark);background:transparent;font-family:inherit">' +
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

  var logoutCard = div('padding-top:12px;border-top:1px solid #F5F2EE;margin-top:var(--sp-3)', []);
  logoutCard.appendChild(btn('width:100%;padding:11px;background:#fff;color:#E4483A;border:1px solid var(--border);border-radius:10px;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer', '로그아웃', function() {
    if (confirm('로그아웃 하시겠습니까?')) logout();
  }));

  var groupData = makeGroup('sec-set-data', '데이터 관리', [dataCard, logoutCard], false);
  wrap.appendChild(groupData);

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
