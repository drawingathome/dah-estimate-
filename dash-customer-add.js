/* ══════════════════════════════════════════════════
   고객 추가/수정 모달 (React 전환 2호)
   ⚠️ 2026-09-29(선혜님 최종 결정): React 전환은 이 파일과 dash-customer-as.js 2곳에서 중단됨 -
   앞으로 다른 화면을 이 방식(React.createElement)으로 새로 바꾸지 말 것. 이 프로젝트는 빌드
   도구(JSX/번들러) 없이 <script> 태그로 바로 실행되는 구조라, React를 쓰면 JSX 없이 손으로
   React.createElement를 써야 해서 장점은 못 살리고 실수(컨트롤드 인풋 함정 등)만 늘어남 -
   실제로 이 2개 파일을 만드는 과정에서 같은 유형의 실수가 반복돼 신뢰 문제가 생김. 이 2개
   파일은 이미 배포되고 검증됐으니 안정성을 위해 그대로 유지(되돌리지 않음) - 앞으로 다른
   화면은 React 없이 "로직 통합 + 기록 테스트"만 함.
   2026-09-29(선혜님 - "고객추가모달은 어떻게 해야하니" → React 재작성 진행): 이전 단계(로직 통합
   25ab379, 버튼 정리 68d1cb8)로 흩어진 로직을 이미 한 곳으로 모아둔 상태에서 재작성.
   바깥 인터페이스(openAdd(editName)/closeAdd())는 그대로 유지 - 다른 파일(dash-customer-detail.js,
   dash-render.js)이 이 이름으로 호출하므로 그쪽은 한 글자도 안 바꿔도 됨.

   구조: #add-overlay(열림/닫힘 className은 지금처럼 순수 JS가 관리) 안의 #add-modal-box를
   React root로 삼아, 폼 전체(헤더/네이버붙여넣기/입력칸/담당자칩/주소/저장버튼)를 그 안에 그림.
   전환 전 동작은 tests/customer-add-golden-master-check.js(10개 시나리오)에 기록해뒀음.

   재작성 중 발견한, 이번에 함께 정리한 것들:
   - "저장 + 예약확인 알림톡 발송"/"저장만 하기" 중복 버튼(알림톡 미구현) → 이미 68d1cb8에서 정리됨.
   - initAddModalChips()(dash-settings.js): .add-staff-chip/.add-stage-chip 클래스를 찾는데, 이
     클래스를 가진 엘리먼트가 코드베이스 전체에 하나도 없음 - 완전히 죽은 함수. 지금 폼의 담당자
     칩은 클래스가 .staff-btn이라 애초에 이 함수와 무관.
   - loadSettings()(dash-settings.js): 설정화면 전용 엘리먼트(set-bank 등)를 채우는 함수라, 고객
     추가 모달이 열려있는 시점에 불러도 아무 효과 없음(엉뚱한 곳에서 호출되고 있었음).
   - 계좌 힌트 표시: add-account-hint 엘리먼트 자체가 HTML에 없어 원래부터 죽은 코드(2026-09-29
     로직 통합 때 이미 발견, 이번에도 동일).
   - 담당자칩 활성 색상이 두 곳에서 다르게 구현돼 있었음: openAdd()가 처음 그릴 때는
     var(--terra)(주황), document 레벨 클릭 위임 리스너(dah-dashboard.html)는 클릭 시 #282828
     (검정)을 칠해서 실제로는 클릭 후 색이 바뀌는 미스매치가 있었음 - React로 통합하며 하나로
     고정(클릭 위임 리스너가 사실상 "최종적으로 보이는 색"이었으므로 #282828 활성색으로 통일,
     동작 결과 자체는 동일).
   위 죽은 코드/무관한 호출들은 React 컴포넌트로 옮기지 않음(호출해도 원래 아무 효과 없었으므로
   빠뜨려도 화면·데이터 동작에 차이 없음 - tests/customer-add-golden-master-check.js로 확인).
   ══════════════════════════════════════════════════ */

var _addModalApi = null;

function openAdd(editName) {
  var _ov = document.getElementById('add-overlay');
  if (!document.getElementById('add-modal-box')._reactRoot) {
    document.getElementById('add-modal-box')._reactRoot = ReactDOM.createRoot(document.getElementById('add-modal-box'));
  }
  document.getElementById('add-modal-box')._reactRoot.render(
    React.createElement(AddCustomerModal, { editName: editName || null, registerApi: function (api) { _addModalApi = api; } })
  );
  _ov.className = 'overlay open';
  _ov.style.display = 'flex';
}
function closeAdd() {
  var _ov = document.getElementById('add-overlay');
  _ov.className = 'overlay';
  _ov.style.display = 'none';
  if (_addModalApi && _addModalApi.reset) _addModalApi.reset();
}

// 오버레이 배경(자기 자신) 클릭시 닫기 - 예전엔 dah-dashboard.html의 document 리스너가 담당
document.addEventListener('DOMContentLoaded', function () {
  var ov = document.getElementById('add-overlay');
  if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) closeAdd(); });
});

function AddCustomerModal({ editName, registerApi }) {
  const e = React.createElement;
  const isEdit = !!editName;

  // 수정모드용 숨김 필드(memo/stage/measureDate/installDate) - 화면엔 없지만 저장시 그대로 실려야 함
  const initial = React.useMemo(function () {
    editingCustomerName = editName || null;
    if (isEdit) {
      var arr = loadCustomers();
      var c = editingCustomerId ? arr.find(function (x) { return String(x.id) === String(editingCustomerId); }) : arr.find(function (x) { return x.clientName === editName; });
      if (c) editingCustomerId = c.id;
      return {
        name: c ? c.clientName : '', phone: c ? (c.phone || '') : '',
        date: c ? (c.date || todayStr()) : todayStr(), addr: c ? (c.addr || '') : '', addrDetail: '', space: c ? (c.space || '') : '',
        staffName: c ? (c.staffName || '마스터') : '마스터',
        stage: c ? (c.stage || '상담') : '상담', memo: c ? (c.memo || '') : '', measureDate: c ? (c.measureDate || '') : '', installDate: c ? (c.installDate || '') : ''
      };
    }
    editingCustomerId = null;
    // 2026-09-29(원본과 동일하게 유지): role 구분 없이 로그인한 사람 이름이 기본값 - 마스터로 로그인하면 currentUser.name도 '마스터'라 결과는 같음
    return { name: '', phone: '', date: todayStr(), addr: '', addrDetail: '', space: '', staffName: currentUser ? currentUser.name : '마스터', stage: '상담', memo: '', measureDate: '', installDate: '' };
  }, [editName]);

  const [name, setName] = React.useState(initial.name);
  const [phone, setPhone] = React.useState(initial.phone);
  const [date, setDate] = React.useState(initial.date);
  const [addr, setAddr] = React.useState(initial.addr);
  const [addrDetail, setAddrDetail] = React.useState(initial.addrDetail);
  const [addrManual, setAddrManual] = React.useState(false); // 2026-10-05: "직접입력" 탈출구(검색에 안 나오는 신축용)
  const [space, setSpace] = React.useState(initial.space);
  const [naverPaste, setNaverPaste] = React.useState('');
  const [staffName, setStaffName] = React.useState(initial.staffName);
  const [stage] = React.useState(initial.stage); // 화면엔 안 나오지만 저장시 그대로 실림(수정모드에서 기존 단계 유지)
  const [memo, setMemo] = React.useState(initial.memo);
  const [measureDate] = React.useState(initial.measureDate);
  const [installDate] = React.useState(initial.installDate);
  const [fieldErrors, setFieldErrors] = React.useState(/** @type {Record<string, string>} */ ({}));
  const [saving, setSaving] = React.useState(false);

  const isStaffUser = currentUser && currentUser.role === 'staff';
  const staffList = React.useMemo(function () { return ['마스터'].concat(getStaffList()).concat(['미배정']); }, []);

  const recentAddrs = React.useMemo(function () {
    // 2026-10-02(선혜님 - "검색을 항상 눌러서 적은거야" 지적으로 재조사해 발견): 직접
    // 타이핑(readOnly로 이미 막음)뿐 아니라, 이 "최근 주소" 칩을 클릭해서 과거에 저장된
    // 주소를 그대로 재사용하는 경로가 있었음 - 한 번 짧게(도로명주소 없이) 저장된 주소가
    // 같은 단지의 다음 고객 등록시 칩으로 다시 뜨고, 그걸 클릭하면 그 짧은 값이 그대로
    // 복제·전파됨(트리니원 단지에 사흘 연속 3명이 똑같이 깨진 패턴으로 등록된 것이 이
    // 경로로 설명됨). 도로명주소의 필수요소(로/길, 또는 시/도 이름)가 전혀 없는 과거
    // 주소는 애초에 칩 후보에서 제외해 재전파를 막음.
    function looksLikeRealAddr(a) {
      if (/(로|길)\s*[0-9]/.test(a)) return true;
      if (/(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)/.test(a)) return true;
      return false;
    }
    var allC = loadCustomers();
    var seen = {}; var out = [];
    allC.slice().reverse().forEach(function (cust) {
      var a = (cust.addr || '').trim();
      if (a && !seen[a] && looksLikeRealAddr(a)) { seen[a] = true; out.push(a); }
    });
    return out.slice(0, 5);
  }, []);

  React.useEffect(function () {
    if (registerApi) registerApi({ reset: function () { setSaving(false); } });
  }, [registerApi]);

  function getCombinedAddr() { return (addr.trim() + (addrDetail.trim() ? ' ' + addrDetail.trim() : '')).trim(); }

  function handlePhoneInput(v) { setPhone(fmtPhone(v)); }

  function handleNaverParse() {
    var raw = naverPaste;
    if (!raw.trim()) { showToast('붙여넣은 내용이 없어요'); return; }
    var filled = [];
    var phoneMatch = raw.match(/01[0-9]-?\s*\d{3,4}-?\s*\d{4}/);
    var newPhone = phone, newName = name, newDate = date, newStaff = staffName;
    if (phoneMatch) {
      var digits = phoneMatch[0].replace(/[^0-9]/g, '');
      newPhone = digits.length === 11 ? digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') : digits.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
      filled.push('전화번호');
    }
    var nameMatch = raw.match(/예약자\s*[\r\n:]+\s*([가-힣]{2,5})/);
    if (nameMatch) { newName = nameMatch[1]; filled.push('이름'); }
    var dtMatch = raw.match(/(\d{4})\s*[.\-]\s*(\d{1,2})\s*[.\-]\s*(\d{1,2})\.?\s*\([가-힣]\)\s*(오전|오후)?\s*(\d{1,2}):(\d{2})/);
    var newMemo = memo;
    if (dtMatch) {
      var y = dtMatch[1], m = ('0' + dtMatch[2]).slice(-2), d = ('0' + dtMatch[3]).slice(-2);
      newDate = y + '-' + m + '-' + d;
      filled.push('날짜');
      var ampm = dtMatch[4] || '', hh = dtMatch[5], mm = dtMatch[6];
      var timeNote = '네이버예약 방문시간: ' + ampm + ' ' + hh + ':' + mm;
      newMemo = memo ? (memo + '\n' + timeNote) : timeNote;
    }
    if (filled.length === 0) { showToast('자동으로 못 찾았어요, 직접 입력해주세요'); return; }
    setPhone(newPhone); setName(newName); setDate(newDate); setMemo(newMemo);
    // 2026-09-14 선혜님 확정: 네이버 붙여넣기로 채운 경우만 담당자를 "미배정"으로
    newStaff = '미배정';
    setStaffName(newStaff);
    showToast(filled.join('·') + ' 자동으로 채웠어요, 확인 후 저장해주세요');
  }

  function handleSave() {
    var nameResult = validateName(name);
    var phoneResult = validatePhone(phone);
    var errs = /** @type {Record<string, string>} */ ({});
    if (!nameResult.ok) errs.name = nameResult.msg;
    if (!phoneResult.ok) errs.phone = phoneResult.msg;
    // 2026-10-05(선혜님 - 김유진 고객 주소 재발 신고): 기본주소는 비었는데 상세주소만 있으면 저장이
    // 맨 앞 공백 + 도로명 없는 주소로 되던 것을 차단(est-save.js와 동일 규칙). 둘 다 빈 건 정상.
    if (!addr.trim() && addrDetail.trim()) errs.addr = '기본주소가 비어있어요 - [주소 검색]으로 먼저 선택해주세요. 검색에 안 나오는 신축이면 [직접 입력]을 눌러 적어주세요.';
    var finalPhone = phone;
    if (phoneResult.ok) finalPhone = formatPhone(phone);
    if (date) {
      var dateResult = validateDate(date);
      if (!dateResult.ok) errs.date = dateResult.msg;
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (nameResult.ok && phoneResult.ok) {
      var dupCheck = checkDuplicate(name, finalPhone);
      var isEditingSelf = editingCustomerName && dupCheck.customer && dupCheck.customer.clientName === editingCustomerName;
      if (dupCheck.isDup && !isEditingSelf) {
        if (!confirm(dupCheck.msg)) return;
      }
    }
    if (saving) { if (typeof reportClientError === 'function') reportClientError('고객추가-버튼-이미비활성-무시'); return; }
    setSaving(true);
    setTimeout(function () { setSaving(false); }, 3000); // 콜백을 못 타는 예외상황 대비 안전장치(원본과 동일)

    var trimmedName = name.trim();
    var arr = loadCustomers();
    if (editingCustomerName) {
      var matched = false;
      arr = arr.map(function (c) {
        var isTarget = editingCustomerId ? (c.id === editingCustomerId) : (!matched && c.clientName === editingCustomerName);
        if (isTarget) {
          matched = true;
          return Object.assign({}, c, { clientName: trimmedName, phone: finalPhone, addr: getCombinedAddr(), space: space.trim(), staffName: staffName, stage: stage, date: date, measureDate: measureDate, installDate: installDate, memo: memo.trim() });
        }
        return c;
      });
      saveCustomers(arr);
      var savedTarget = editingCustomerId ? arr.find(function (c) { return c.id === editingCustomerId; }) : arr.find(function (c) { return c.clientName === trimmedName; });
      closeAdd(); renderHome(true); openDetail(trimmedName, savedTarget && savedTarget.id);
      if (savedTarget) {
        saveCustomerToDb(savedTarget, function (err) { showToast(err ? '⚠️ 고객정보: 로컬엔 저장됨(서버 재시도 대기)' : '고객 정보가 수정됐습니다'); });
      } else { showToast('고객 정보가 수정됐습니다'); }
    } else {
      var phoneNorm = (finalPhone || '').replace(/\D/g, '');
      if (typeof sbXHR === 'function' && phoneNorm) {
        sbXHR('POST', 'rpc/check_phone_duplicate', { phone_input: finalPhone }, function (err, rows) {
          var serverMatch = (!err && Array.isArray(rows) && rows[0] && rows[0].exists_flag) ? { client_name: trimmedName, phone: finalPhone, staff_name: rows[0].staff_name } : null;
          saveNewCustomerActual(trimmedName, finalPhone, arr, serverMatch);
        });
        return;
      }
      saveNewCustomerActual(trimmedName, finalPhone, arr, null);
    }
  }

  function saveNewCustomerActual(nm, ph, arr, serverMatch) {
    var samePersonExisting = arr.find(function (c) { return !c.is_archived && c.clientName === nm && (c.phone || '').replace(/\D/g, '') === (ph || '').replace(/\D/g, ''); })
      || (serverMatch ? { clientName: serverMatch.client_name, phone: serverMatch.phone, staffName: serverMatch.staff_name, visitCount: 1 } : null);
    var sameNameDiffPhone = !samePersonExisting && arr.find(function (c) { return !c.is_archived && c.clientName === nm; });
    if (samePersonExisting) {
      var myName = (currentUser && currentUser.role === 'staff') ? currentUser.name : '마스터';
      var otherStaffNote = (samePersonExisting.staffName && samePersonExisting.staffName !== myName) ? ('\n\n⚠️ 현재 담당자: ' + samePersonExisting.staffName) : '';
      if (!confirm('"' + nm + '"(' + ph + ') 고객이 이미 있습니다.' + otherStaffNote + '\n재구매 고객으로 업데이트할까요?')) { setSaving(false); return; }
    } else if (sameNameDiffPhone) {
      if (!confirm('"' + nm + '" 이름의 다른 고객이 이미 있습니다(연락처: ' + (sameNameDiffPhone.phone || '미입력') + ').\n동명이인으로 보이는데, 별도의 새 고객으로 등록할까요?')) { setSaving(false); return; }
    }
    var existing = samePersonExisting;
    var visitCount = existing ? (existing.visitCount || 1) + 1 : 1;
    if (existing) arr = arr.filter(function (c) { return !(c.clientName === nm && (c.phone || '').replace(/\D/g, '') === (ph || '').replace(/\D/g, '')); });
    var newCustomer = { clientName: nm, phone: ph, addr: getCombinedAddr(), space: space.trim(), price: 0, performanceRevenue: 0, staffName: staffName, stage: stage, date: date, measureDate: measureDate, installDate: installDate, memo: memo.trim(), visitCount: visitCount, createdAt: new Date().toISOString(), branch: '반포점' };
    arr.unshift(newCustomer); saveCustomers(arr);
    saveCustomerToDb(newCustomer, function (err, data) { if (!err && data && data[0]) { newCustomer.id = data[0].id; saveCustomers(arr); } });
    closeAdd(); renderHome(true); openDetail(nm, newCustomer.id);
    showToast('고객이 추가됐습니다');
  }

  const inputStyle = { width: '100%', boxSizing: 'border-box' };

  return e(React.Fragment, {},
    e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 16px', background: '#fff', borderRadius: '14px 14px 0 0', borderBottom: '1px solid #EEE6DC' } },
      e('div', { style: { fontSize: '12px', fontWeight: 700, color: '#282828' }, id: 'add-modal-title' }, isEdit ? '고객 정보 수정' : '고객 추가'),
      e('button', { id: 'add-close-btn', 'aria-label': '닫기', onClick: closeAdd, style: { background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--light)', lineHeight: '1.2', padding: '2px 4px', minWidth: '32px', minHeight: '32px' } }, '✕')
    ),
    e('div', { style: { padding: '20px 20px 0' } },
      e('div', { style: { background: '#FAF7F5', border: '1px solid #EEE6DC', borderRadius: '12px', padding: '10px 14px', marginBottom: '14px', fontSize: '11px', color: '#6B6B6B', lineHeight: '1.6' } },
        '네이버 예약 정보만 입력하세요', e('br'), '나머지 정보는 상담 후 고객 상세에서 추가할 수 있어요'),
      e('div', { style: { background: 'var(--ivory1)', borderRadius: '12px', padding: '12px 14px', marginBottom: '14px' } },
        e('div', { style: { fontSize: '11px', fontWeight: 700, color: 'var(--terra)', marginBottom: '6px' } }, '📋 네이버 예약 화면 붙여넣기'),
        e('textarea', { id: 'add-naver-paste', value: naverPaste, onChange: function (ev) { setNaverPaste(ev.target.value); }, placeholder: '네이버 예약 상세화면 내용을 통째로 복사해서 여기 붙여넣으면 이름/전화번호/일시가 자동으로 채워져요', style: { width: '100%', minHeight: '52px', padding: '8px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '11px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', marginBottom: '6px' } }),
        e('button', { type: 'button', onClick: handleNaverParse, style: { width: '100%', padding: '8px', background: 'var(--dark)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' } }, '자동 채우기')
      ),
      e('div', { style: { background: '#fff', borderRadius: '12px', padding: '16px 16px 4px', marginBottom: '12px', border: '1px solid #EEE6DC' } },
        e('div', { style: { fontSize: '11px', fontWeight: 700, color: 'var(--sub)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '14px' } }, '예약 정보'),
        e('div', { className: 'form-row' },
          e('label', { className: 'form-label' }, '고객명 ', e('span', { className: 'form-required' }, '*')),
          e('input', { className: 'form-input', id: 'add-name', 'aria-label': '고객명', placeholder: '홍길동', value: name, onChange: function (ev) { setName(ev.target.value); }, style: fieldErrors.name ? { borderColor: 'var(--danger)' } : {} }),
          fieldErrors.name ? e('div', { className: 'field-err', style: { fontSize: '11px', color: 'var(--danger)', marginTop: 'var(--sp-1)', fontWeight: 600 } }, fieldErrors.name) : null
        ),
        e('div', { className: 'form-row' },
          e('label', { className: 'form-label' }, '연락처 ', e('span', { className: 'form-required' }, '*')),
          e('input', { className: 'form-input', id: 'add-phone', 'aria-label': '연락처', placeholder: '010-0000-0000', inputMode: 'numeric', value: phone, onChange: function (ev) { handlePhoneInput(ev.target.value); }, onBlur: function (ev) { var r = validatePhone(ev.target.value); setFieldErrors(function (prev) { var next = Object.assign({}, prev); if (!r.ok && ev.target.value) next.phone = r.msg; else delete next.phone; return next; }); }, style: fieldErrors.phone ? { borderColor: 'var(--danger)' } : {} }),
          fieldErrors.phone ? e('div', { className: 'field-err', style: { fontSize: '11px', color: 'var(--danger)', marginTop: 'var(--sp-1)', fontWeight: 600 } }, fieldErrors.phone) : null
        ),
        e('div', { className: 'form-row' },
          e('label', { className: 'form-label' }, '방문 예정일 ', e('span', { className: 'form-required' }, '*')),
          e('input', { className: 'form-input', type: 'date', id: 'add-date', 'aria-label': '방문예정일', value: date, onChange: function (ev) { setDate(ev.target.value); }, style: Object.assign({ padding: '10px 8px', fontSize: '11px' }, fieldErrors.date ? { borderColor: 'var(--danger)' } : {}) }),
          fieldErrors.date ? e('div', { className: 'field-err', style: { fontSize: '11px', color: 'var(--danger)', marginTop: 'var(--sp-1)', fontWeight: 600 } }, fieldErrors.date) : null
        )
      ),
      e('div', { style: { marginBottom: '16px' } },
        e('label', { style: { fontSize: '11px', fontWeight: 700, color: 'var(--sub)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: '8px' } }, '담당자'),
        e('div', { id: 'staff-btn-wrap', style: { display: 'flex', gap: '8px' } },
          staffList.map(function (sn) {
            var isActive = sn === staffName;
            return e('button', {
              key: sn, 'data-staff': sn, className: 'staff-btn' + (isActive ? ' active' : ''),
              onClick: function () { if (!isStaffUser) setStaffName(sn); },
              style: {
                padding: '6px 12px', borderRadius: '10px', border: isActive ? '1px solid #282828' : '1.5px solid #EEE6DC',
                fontSize: '11px', fontWeight: isActive ? '700' : '400', background: isActive ? '#282828' : '#fff', color: isActive ? '#fff' : '#8E8078',
                cursor: isStaffUser ? 'default' : 'pointer', pointerEvents: isStaffUser ? 'none' : '', opacity: isStaffUser ? (isActive ? '1' : '0.3') : ''
              }
            }, sn);
          })
        )
      ),
      e('div', { style: { marginBottom: '16px' } },
        e('label', { style: { fontSize: '11px', fontWeight: 700, color: 'var(--sub)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: '8px' } }, '주소 (선택)'),
        recentAddrs.length > 0 ? e('div', { id: 'add-addr-recent', style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' } },
          recentAddrs.map(function (a) {
            return e('button', { key: a, type: 'button', title: a, onClick: function () { setAddr(a); }, style: { fontSize: '11px', color: 'var(--dark)', background: 'var(--ivory1)', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', padding: '5px 10px', cursor: 'pointer' } }, a.length > 16 ? a.slice(0, 16) + '…' : a);
          })
        ) : null,
        e('div', { style: { display: 'flex', gap: '6px', marginBottom: '6px' } },
          e('input', { className: 'form-input', id: 'add-addr', 'aria-label': '주소', placeholder: addrManual ? '시/구/도로명부터 입력 (예: 경기 안산시 단원구 ...)' : '주소 검색을 눌러주세요', readOnly: !addrManual, value: addr, onChange: function (ev) { setAddr(ev.target.value); }, onClick: addrManual ? undefined : function () { openKakaoAddr('add-addr', 'add-addr-detail'); }, style: { flex: 1, background: addrManual ? '#fff' : 'var(--ivory1)', cursor: addrManual ? 'text' : 'pointer' } }),
          e('button', { type: 'button', onClick: function () { openKakaoAddr('add-addr', 'add-addr-detail'); }, style: { flexShrink: 0, padding: '0 16px', background: 'var(--dark)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '11px', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' } }, '주소 검색')
        ),
        // 2026-10-05: 같은 줄에 두면 모바일에서 기본주소 칸이 264px→188px로 줄어(긴 도로명주소가 더 잘림) 입력줄 밖으로 분리
        e('div', { style: { textAlign: 'right', marginBottom: '6px' } },
          e('button', { type: 'button', id: 'add-addr-manual-btn', onClick: function () { setAddrManual(true); }, style: { padding: '6px 10px', minHeight: '32px', background: '#fff', color: '#8E8078', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '11px', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' } }, '검색에 안 나오면 직접 입력')
        ),
        e('input', { className: 'form-input', id: 'add-addr-detail', 'aria-label': '상세주소', placeholder: '상세주소 (동/호수 등)', value: addrDetail, onChange: function (ev) { setAddrDetail(ev.target.value); }, style: inputStyle }),
        fieldErrors.addr ? e('div', { className: 'field-err', style: { fontSize: '11px', color: 'var(--danger)', marginTop: 'var(--sp-1)', fontWeight: 600 } }, fieldErrors.addr) : null
      ),
      e('div', { style: { marginBottom: '16px' } },
        e('label', { style: { fontSize: '11px', fontWeight: 700, color: 'var(--sub)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: '8px' } }, '공간 (선택)'),
        e('input', { className: 'form-input', id: 'add-space', 'aria-label': '공간', placeholder: '예: 거실, 안방 (견적서 저장 시 자동으로 채워져요)', value: space, onChange: function (ev) { setSpace(ev.target.value); }, style: inputStyle })
      ),
      e('button', { id: 'add-save-btn', disabled: saving, onClick: handleSave, style: { width: '100%', padding: '14px', background: 'var(--terra)', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', borderRadius: '10px', marginBottom: '16px', letterSpacing: '0.5px', opacity: saving ? 0.6 : 1 } }, '저장하기'),
      // 화면엔 안 보이지만 원본(정적 HTML 시절)과 같은 DOM 인터페이스를 유지 - 다른 코드가 참조할 수 있음
      e('input', { type: 'hidden', id: 'add-memo', value: memo, readOnly: true }),
      e('input', { type: 'hidden', id: 'add-stage', value: stage, readOnly: true }),
      e('input', { type: 'hidden', id: 'add-measure', value: measureDate, readOnly: true }),
      e('input', { type: 'hidden', id: 'add-install', value: installDate, readOnly: true })
    )
  );
}
