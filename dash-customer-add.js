// ══════════════════════════════════════════════════
// DAH 고객 추가/수정 모달 (openAdd/closeAdd/saveCustomer)
// dash-customer-detail.js에서 분리됨 (2026-07-19, 책임 분리)
// ══════════════════════════════════════════════════

// 주소(도로명) + 상세주소(동/호수 등)를 하나로 합침 — 저장은 항상 합쳐서 한 필드(addr)로
function getCombinedAddr() {
  var base = (document.getElementById('add-addr').value || '').trim();
  var detail = (document.getElementById('add-addr-detail').value || '').trim();
  return detail ? (base + ' ' + detail) : base;
}

function openAdd(editName) {
  editingCustomerName = editName || null;
  editingCustomerId = editName ? currentDetailId : null; // 상세화면에서 열렸다면 그 정확한 id를 이어받음
  document.getElementById('add-modal-title').textContent = editName ? '고객 정보 수정' : '고객 추가';
  if (editName) {
    
    document.getElementById('add-modal-title').textContent = '고객 정보 수정';
    var arr = loadCustomers(); var c = editingCustomerId ? arr.find(function(x) { return String(x.id) === String(editingCustomerId); }) : arr.find(function(x) { return x.clientName === editName; });
    if (c) { document.getElementById('add-name').value = c.clientName; document.getElementById('add-phone').value = c.phone || ''; document.getElementById('add-addr').value = c.addr || ''; document.getElementById('add-addr-detail').value = ''; document.getElementById('add-space').value = c.space || ''; document.getElementById('add-stage').value = c.stage || '상담'; document.getElementById('add-date').value = c.date || todayStr(); document.getElementById('add-memo').value = c.memo || ''; document.getElementById('add-measure').value = c.measureDate || ''; document.getElementById('add-install').value = c.installDate || ''; }
  } else { document.getElementById('add-name').value = ''; document.getElementById('add-phone').value = ''; document.getElementById('add-addr').value = ''; document.getElementById('add-addr-detail').value = ''; document.getElementById('add-space').value = ''; document.getElementById('add-stage').value = '상담'; document.getElementById('add-date').value = todayStr(); document.getElementById('add-memo').value = ''; document.getElementById('add-measure').value = ''; document.getElementById('add-install').value = ''; }
  var defaultStaff = editName ? (function() { var arr = loadCustomers(); var c = editingCustomerId ? arr.find(function(x) { return x.id === editingCustomerId; }) : arr.find(function(x) { return x.clientName === editName; }); return c ? (c.staffName || '마스터') : '마스터'; })() : (currentUser ? currentUser.name : '마스터');
  var isStaffUser = currentUser && currentUser.role === 'staff';
  
  var staffWrap = document.getElementById('staff-btn-wrap');
  if (staffWrap) {
    staffWrap.innerHTML = '';
    var staffList2 = ['마스터'].concat(getStaffList());
    staffList2.forEach(function(sn) {
      var isActive = sn === defaultStaff;
      var sb = document.createElement('button');
      sb.setAttribute('data-staff', sn);
      sb.className = 'staff-btn';
      sb.textContent = sn;
      sb.style.cssText = 'padding:6px 12px;border-radius:10px;border:1px solid '+(isActive?'var(--terra)':'var(--border)')+';font-size:11px;font-weight:'+(isActive?'700':'500')+';font-family:inherit;cursor:pointer;background:'+(isActive?'var(--terra)':'#fff')+';color:'+(isActive?'#fff':'var(--sub)');
      staffWrap.appendChild(sb);
    });
  }
  document.querySelectorAll('.staff-btn').forEach(function(b) {
    var isActive = b.getAttribute('data-staff') === defaultStaff;
    b.classList.toggle('active', isActive); b.style.background = isActive ? 'var(--terra)' : '#fff'; b.style.color = isActive ? '#fff' : '#8E8078'; b.style.borderRadius = 'var(--r-btn)'; b.style.border = '1.5px solid ' + (isActive ? 'var(--terra)' : 'var(--border)'); b.style.fontWeight = isActive ? '700' : '400';
    if (isStaffUser) { b.style.pointerEvents = 'none'; b.style.opacity = isActive ? '1' : '0.3'; } else { b.style.pointerEvents = ''; b.style.opacity = ''; }
  });
  var _ov = document.getElementById('add-overlay');

  // 최근 사용 주소 자동완성 — 카카오 주소검색(팝업 열기->검색->선택 3단계)을
  // 반복 지역(같은 아파트 단지 등) 고객에 한해 원클릭으로 줄여줌
  var recentWrap = document.getElementById('add-addr-recent');
  if (recentWrap) {
    recentWrap.innerHTML = '';
    var allC = loadCustomers();
    var seen = {};
    var recentAddrs = [];
    allC.slice().reverse().forEach(function(cust) {
      var a = (cust.addr || '').trim();
      if (a && !seen[a]) { seen[a] = true; recentAddrs.push(a); }
    });
    recentAddrs = recentAddrs.slice(0, 5);
    if (recentAddrs.length > 0) {
      recentWrap.style.display = 'flex';
      recentAddrs.forEach(function(a) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.textContent = a.length > 16 ? a.slice(0, 16) + '…' : a;
        chip.title = a;
        chip.style.cssText = 'font-size:11px;color:var(--dark);background:var(--ivory1);border:1px solid var(--border);border-radius:var(--r-btn);padding:5px 10px;cursor:pointer;font-family:inherit;white-space:nowrap';
        chip.addEventListener('click', function() {
          var addrInput = document.getElementById('add-addr');
          addrInput.value = a;
          addrInput.dispatchEvent(new Event('change'));
        });
        recentWrap.appendChild(chip);
      });
    } else {
      recentWrap.style.display = 'none';
    }
  }

  _ov.className = 'overlay open';
  _ov.style.display = 'flex';
  // 2026-08-05: 여기서 style.alignItems='flex-end'를 인라인으로 강제하고 있어서,
  // CSS의 PC 반응형 규칙(1024px 이상에서 화면 중앙정렬)이 전혀 먹히지 않던 버그
  // 발견(선혜님이 실제 화면에서 모달이 잘려보인다고 알려주심). 인라인 스타일은
  // CSS보다 항상 우선하기 때문. 이 속성들은 전부 CSS #add-overlay 기본규칙에
  // 이미 정의돼 있어 중복이었어서, 전체 제거하고 CSS가 담당하도록 함.
}
function closeAdd() {
  var _ov = document.getElementById('add-overlay');
  _ov.className = 'overlay';
  _ov.style.display = 'none';
}

function saveCustomer() {
  var name = document.getElementById('add-name').value.trim();
  var phone = document.getElementById('add-phone').value.trim();
  if (!name || !phone) { alert('이름과 연락처는 필수입니다.'); return; }
  var arr = loadCustomers();
  if (editingCustomerName) {
    var matched = false;
    arr = arr.map(function(c) {
      // editingCustomerId가 있으면 정확히 그 레코드만, 없으면(예전 id없는 데이터) 이름 매칭 중 첫 건만 수정
      var isTarget = editingCustomerId ? (c.id === editingCustomerId) : (!matched && c.clientName === editingCustomerName);
      if (isTarget) {
        matched = true;
        var staffName2; if (currentUser && currentUser.role === 'staff') { staffName2 = currentUser.name; } else { var asb2 = document.querySelector('.staff-btn.active'); staffName2 = asb2 ? asb2.getAttribute('data-staff') : (c.staffName||'마스터'); }
        return Object.assign({}, c, { clientName:name, phone:phone, addr:getCombinedAddr(), space:document.getElementById('add-space').value.trim(), staffName:staffName2, stage:document.getElementById('add-stage').value, date:document.getElementById('add-date').value, measureDate:document.getElementById('add-measure').value, installDate:document.getElementById('add-install').value, memo:document.getElementById('add-memo').value.trim() });
      } return c;
    });
    saveCustomers(arr);
    var savedTarget = editingCustomerId ? arr.find(function(c){ return c.id === editingCustomerId; }) : arr.find(function(c){ return c.clientName === name; });
    closeAdd(); renderHome(true); openDetail(name, savedTarget && savedTarget.id);
    if (savedTarget) {
      saveCustomerToDb(savedTarget, function(err){
        showToast(err ? '⚠️ 고객정보: 로컬엔 저장됨(서버 재시도 대기)' : '고객 정보가 수정됐습니다');
      });
    } else {
      showToast('고객 정보가 수정됐습니다');
    }
  } else {
    // 2026-08-27(선혜님 발견 — "고객명단에 중복이 너무 많다", 김작미/조승희
    // 실제 중복 사례): 아래 로컬 중복확인(samePersonExisting)이 이 브라우저의
    // loadCustomers()(로컬 저장소) 기준으로만 판단되고 있었음 - 오늘 견적서
    // 중복생성 버그를 고칠 때와 정확히 같은 사각지대(다른 기기/세션에서 방금
    // 등록한 고객을 이 브라우저가 모르면 못 걸러냄). 저장 버튼을 누른 시점에
    // 서버에 직접 "이 전화번호로 이미 등록된 고객이 있는지" 한 번 더 확인한
    // 뒤에 진행하도록 함.
    var phoneNorm = (phone||'').replace(/\D/g,'');
    if (typeof sbXHR === 'function' && phoneNorm) {
      sbXHR('GET', 'customers?phone=eq.' + encodeURIComponent(phone) + '&is_archived=eq.false&select=id,client_name,phone', null, function(err, rows) {
        var serverMatch = null;
        if (!err && Array.isArray(rows)) {
          serverMatch = rows.find(function(r) { return (r.phone||'').replace(/\D/g,'') === phoneNorm; });
        }
        _saveNewCustomerActual(name, phone, arr, serverMatch);
      });
      return;
    }
    _saveNewCustomerActual(name, phone, arr, null);
  }
}

function _saveNewCustomerActual(name, phone, arr, serverMatch) {
    // 재구매 판단은 이름만으로 하지 않고 전화번호까지 같아야 "같은 사람"으로 봄.
    // 이름만 같고 전화번호가 다르면 동명이인일 가능성이 높으므로, 기존 사람을
    // 덮어쓰지 않고 명확히 안내한 뒤 완전히 별도의 새 레코드로 등록함.
    // 2026-08-27: 로컬(arr) 확인에 더해, 저장 직전 서버에서 직접 확인한
    // serverMatch도 함께 반영 - 로컬 캐시가 모르는(다른 기기/세션에서 방금
    // 등록된) 기존 고객도 "이미 있음" 판단에 걸리게 함.
    var samePersonExisting = arr.find(function(c) { return c.clientName === name && (c.phone||'').replace(/\D/g,'') === (phone||'').replace(/\D/g,''); })
      || (serverMatch ? { clientName: serverMatch.client_name, phone: serverMatch.phone, visitCount: 1 } : null);
    var sameNameDiffPhone = !samePersonExisting && arr.find(function(c) { return c.clientName === name; });
    if (samePersonExisting) {
      if (!confirm('"' + name + '"(' + phone + ') 고객이 이미 있습니다.\n재구매 고객으로 업데이트할까요?')) return;
    } else if (sameNameDiffPhone) {
      if (!confirm('"' + name + '" 이름의 다른 고객이 이미 있습니다(연락처: ' + (sameNameDiffPhone.phone||'미입력') + ').\n동명이인으로 보이는데, 별도의 새 고객으로 등록할까요?')) return;
    }
    var existing = samePersonExisting;
    var visitCount = existing ? (existing.visitCount||1)+1 : 1;
    if (existing) arr = arr.filter(function(c) { return !(c.clientName === name && (c.phone||'').replace(/\D/g,'') === (phone||'').replace(/\D/g,'')); });
    var staffName; if (currentUser && currentUser.role === 'staff') { staffName = currentUser.name; } else { var asb = document.querySelector('.staff-btn.active'); staffName = asb ? asb.getAttribute('data-staff') : '마스터'; }
    var newCustomer = { clientName:name, phone:phone, addr:getCombinedAddr(), space:document.getElementById('add-space').value.trim(), price:0, performanceRevenue:0, staffName:staffName, stage:document.getElementById('add-stage').value, date:document.getElementById('add-date').value, measureDate:document.getElementById('add-measure').value, installDate:document.getElementById('add-install').value, memo:document.getElementById('add-memo').value.trim(), visitCount:visitCount, createdAt:new Date().toISOString(), branch:'반포점' };
    arr.unshift(newCustomer); saveCustomers(arr);
    saveCustomerToDb(newCustomer, function(err, data) { if(!err && data && data[0]) { newCustomer.id = data[0].id; saveCustomers(arr); } });
    closeAdd(); renderHome(true); openDetail(name, newCustomer.id);
    showToast('고객이 추가됐습니다');
}
