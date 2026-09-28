/* ══════════════════════════════════════════════════
   DAH 대시보드 — 설정 화면 구역별 렌더링 (거래처/메모/지역비/쿠폰/연동/데이터)
   2026-09-24(선혜님 - "나눌수 있는건 다 나눠보자" - 큰 파일 쪼개기 3차):
   dash-settings.js의 renderSettings()가 718줄짜리 함수 하나(파일의 79%)
   였는데, 각 구역이 wrap/makeGroup(+연동 구역만 s)만 공유하고 서로의
   지역변수는 안 쓰는 걸 스크립트로 확인해서, 코드 한 줄도 안 바꾸고
   함수로 뽑아냄. renderSettings()가 원래 순서 그대로 이 함수들을 호출함.
   ══════════════════════════════════════════════════ */

function renderSettingsVendorGroup(wrap, makeGroup) {
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
    // 2026-08-26(선혜님 발견 — "거래처 등록을 했는데 왜 수기로 다 써야 하지"):
    // 거래처 항목에 연락처 필드 자체가 없어서, 실측·시공 의뢰서 만들 때마다
    // 담당 설치기사 연락처를 매번 손으로 입력해야 했음. 연락처를 여기서
    // 관리하면, '실측·시공' 담당 거래처가 1곳으로 특정될 때 견적서 앱에서
    // 자동으로 채워줄 수 있음(est-doc-request.js printRequest() 참고).
    var phoneRow = div('display:flex;align-items:center;gap:8px;margin-top:8px', [
      span('font-size:11px;color:var(--sub);flex-shrink:0', '연락처')
    ]);
    var phoneInput = el('input', {
      type: 'tel', placeholder: '010-0000-0000', value: v.phone || '',
      style: 'flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;outline:none;box-sizing:border-box'
    });
    phoneInput.addEventListener('change', function() {
      var list = getVendorList();
      var target = list.find(function(x){ return x.name === v.name; });
      if (!target) return;
      target.phone = phoneInput.value.trim();
      setVendorList(list);
      showToast(v.name + ' 연락처가 저장됐습니다');
    });
    phoneRow.appendChild(phoneInput);
    row.appendChild(phoneRow);
    // 2026-09-11(선혜님 지시 - "도착일/도착장소는 조율을 해야 해... 기본
    // 세트는 내가 하나하나 정리해주고 수정도 되게 할까?? 보통은 잘
    // 안바뀌는데 바뀌는 경우도 있어서"): 연락처와 정확히 같은 이유(매번
    // 손으로 입력하지 않아도 되게) - 거래처마다 기본 도착 소요일수/기본
    // 도착장소를 여기서 한 번만 등록해두면, 발주정보 팝업에서 자동으로
    // 채워지고, 그때그때 바뀌면 팝업에서 그대로 수정 가능.
    var arrivalRow = div('display:flex;align-items:center;gap:8px;margin-top:8px', [
      span('font-size:11px;color:var(--sub);flex-shrink:0;white-space:nowrap', '기본 도착')
    ]);
    var leadDaysInput = el('input', {
      type: 'number', placeholder: '소요일수(예: 5)', value: v.defaultArrivalDays || '',
      style: 'width:110px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;outline:none;box-sizing:border-box'
    });
    leadDaysInput.addEventListener('change', function() {
      var list = getVendorList();
      var target = list.find(function(x){ return x.name === v.name; });
      if (!target) return;
      target.defaultArrivalDays = leadDaysInput.value.trim();
      setVendorList(list);
      showToast(v.name + ' 기본 도착 소요일수가 저장됐습니다');
    });
    var locationInput = el('input', {
      type: 'text', placeholder: '기본 도착장소(비우면 회사주소)', value: v.defaultLocation || '',
      style: 'flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;outline:none;box-sizing:border-box'
    });
    locationInput.addEventListener('change', function() {
      var list = getVendorList();
      var target = list.find(function(x){ return x.name === v.name; });
      if (!target) return;
      target.defaultLocation = locationInput.value.trim();
      setVendorList(list);
      showToast(v.name + ' 기본 도착장소가 저장됐습니다');
    });
    arrivalRow.appendChild(leadDaysInput);
    arrivalRow.appendChild(locationInput);
    row.appendChild(arrivalRow);
    // 2026-09-11(선혜님 확인 - "우리는 거의 모든 제품이 형상가공 들어가기
    // 때문에 기본이 O 야"): 캔가공소(제작) 거래처에만 의미 있는 설정이라
    // production 카테고리가 켜진 거래처에만 노출. 기본은 항상 O(체크됨) -
    // 예외적으로 형상가공을 안 하는 경우가 생기면 여기서 꺼두면 됨.
    if (v.categories.indexOf('production') >= 0) {
      var shapeProcessRow = div('display:flex;align-items:center;gap:8px;margin-top:8px', []);
      var shapeProcessLabel = el('label', {
        style: 'display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dark);cursor:pointer'
      });
      var shapeProcessCheckbox = el('input', {
        type: 'checkbox',
        style: 'width:16px;height:16px'
      });
      shapeProcessCheckbox.checked = v.defaultShapeProcess !== false;
      shapeProcessCheckbox.addEventListener('change', function() {
        var list = getVendorList();
        var target = list.find(function(x){ return x.name === v.name; });
        if (!target) return;
        target.defaultShapeProcess = shapeProcessCheckbox.checked;
        setVendorList(list);
        showToast(v.name + ' 기본 형상가공이 ' + (shapeProcessCheckbox.checked ? 'O' : 'X') + '로 저장됐습니다');
      });
      shapeProcessLabel.appendChild(shapeProcessCheckbox);
      shapeProcessLabel.appendChild(span('', '커튼 추가 시 기본 형상가공 O'));
      shapeProcessRow.appendChild(shapeProcessLabel);
      row.appendChild(shapeProcessRow);
    }
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
}

function renderSettingsMemoLeadGroup(wrap, makeGroup) {
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
}

function renderSettingsRegionFeesGroup(wrap, makeGroup) {
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
}

function renderSettingsCouponGroup(wrap, makeGroup) {
  // ── 할인 쿠폰 관리 (2026-08-14 신규) — 견적서 앱에서 다중선택 가능한 할인 항목 ──
  // 2026-08-14 개편: "한번 쓰인 쿠폰은 값 수정 자체를 막고, 바꾸려면 새로
  // 만들게" 방식으로 변경(선혜님 요청) — 값이 바뀌면 과거 견적서 재계산이
  // 달라지는 혼란 자체를 원천 차단. 실제 견적서에 적용된 적 있는 쿠폰은
  // 값/단위 입력을 잠그고(이름만 수정 가능), 안 쓰인 쿠폰은 자유롭게(확인창
  // 없이) 수정 가능 — 리스크 자체가 없으므로 확인창도 불필요해짐.
  var couponCard = div('padding-top:4px', [
    span('font-size:11px;color:var(--sub);display:block;margin-bottom:10px', '견적서 작성시 체크박스로 여러개 동시 선택 가능한 할인 항목입니다. 선택한 순서대로(위→아래) 순차 적용돼요.')
  ]);
  // 2026-08-14: 쿠폰 시작일/종료일 추가 + 기간만료 자동삭제(선혜님 요청 —
  // "어차피 재사용 안 되니 자동삭제"). 설정화면을 열 때마다 종료일이 지난
  // 쿠폰을 자동으로 찾아서 삭제. 이미 견적서에 사용된 적 있는 쿠폰이어도
  // 안전함 — 삭제된 쿠폰의 과거 적용 금액은 이미 만든 보정장치
  // (restoreAppliedDiscounts의 missingAmount 자동채움)로 옛 견적서 금액이
  // 그대로 유지되므로.
  var todayStr = new Date().toISOString().slice(0,10);
  var allCouponsRaw = (typeof getDiscountCoupons === 'function') ? getDiscountCoupons() : [];
  var expiredNames = [];
  var curCoupons = allCouponsRaw.filter(function(c) {
    if (c.endDate && c.endDate < todayStr) { expiredNames.push(c.name); return false; }
    return true;
  });
  if (expiredNames.length > 0) {
    setDiscountCoupons(curCoupons);
    if (typeof showToast === 'function') showToast(expiredNames.join(', ') + ' 쿠폰이 기간 만료되어 자동 삭제됐어요');
  }
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
    // 시작일/종료일 - 날짜는 계산에 영향 없으므로 사용여부와 무관하게 항상 자유롭게 수정 가능
    var dateRow = div('display:flex;gap:6px;align-items:center;margin-top:2px', []);
    dateRow.appendChild(span('font-size:10px;color:var(--sub);white-space:nowrap', '기간'));
    var startInput = el('input', { type:'date', value: c.startDate || '', style:'flex:1;padding:5px 7px;border:1px solid var(--border);border-radius:6px;font-size:10px;font-family:inherit;outline:none;box-sizing:border-box' });
    var endInput = el('input', { type:'date', value: c.endDate || '', style:'flex:1;padding:5px 7px;border:1px solid var(--border);border-radius:6px;font-size:10px;font-family:inherit;outline:none;box-sizing:border-box' });
    startInput.addEventListener('change', function(){
      var arr = getDiscountCoupons();
      arr[idx].startDate = startInput.value || null;
      setDiscountCoupons(arr);
      showToast('쿠폰 시작일이 설정됐습니다');
    });
    endInput.addEventListener('change', function(){
      var arr = getDiscountCoupons();
      arr[idx].endDate = endInput.value || null;
      setDiscountCoupons(arr);
      showToast('쿠폰 종료일이 설정됐습니다 — 이 날짜가 지나면 자동으로 삭제돼요');
    });
    dateRow.appendChild(startInput);
    dateRow.appendChild(span('font-size:10px;color:var(--sub)', '~'));
    dateRow.appendChild(endInput);
    row.appendChild(dateRow);
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
    // 2026-08-29(선혜님 지적 - "그럼 이부분은 다 했다는거야????" 정리 완료 요청):
    // renderSettings()로 재렌더링되기 전에 두 번째 클릭이 처리되면 같은
    // 쿠폰이 중복 추가될 수 있었음(로컬저장이라 심각하진 않지만 성가심) -
    // 클릭 즉시 입력값부터 비워서, 혹시 재렌더링 전에 두번째 클릭이 와도
    // "쿠폰명을 입력해주세요"로 자연스럽게 막히게 함.
    newCouponName.value = '';
    var arr = getDiscountCoupons();
    arr.push({ id: 'c' + Date.now(), name: name, type: newCouponType.value, value: value });
    setDiscountCoupons(arr);
    renderSettings(); showToast('쿠폰이 추가됐습니다');
  }));
  couponCard.appendChild(addCouponWrap);
  var groupCoupons = makeGroup('sec-set-coupons', '할인 쿠폰', [couponCard], false);
  wrap.appendChild(groupCoupons);
}

function renderSettingsIntegrationGroup(wrap, makeGroup, s) {
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
}

function renderSettingsDataGroup(wrap, makeGroup) {
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
          // 2026-08-29(선혜님 지시 - "코드 다 봤니"로 발견): 복원이 확인창
          // 없이 바로 전체 고객목록을 덮어쓰고 있었음 - 오래된 백업파일을
          // 실수로 올리면 최신 데이터가 조용히 전부 사라질 수 있는 위험한
          // 동작이었음. 몇 건짜리 파일인지 미리 보여주고 명시적으로 확인받음.
          if (!confirm('이 백업파일엔 고객 ' + data.customers.length + '건이 들어있어요.\n\n지금 복원하면 현재 저장된 고객 데이터가 이 파일 내용으로 전부 바뀝니다.\n계속할까요?')) {
            restoreInput.value = '';
            return;
          }
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
}

