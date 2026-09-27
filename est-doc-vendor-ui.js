/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 발주서: 거래처 정보 입력 모달 + 발주서 선택/인쇄
   2026-09-24(선혜님 - "해야하잖아" - 큰 파일 쪼개기 계속): est-doc-
   vendor.js(1,163줄)가 너무 커서, "UI(모달/인쇄)" 부분만 분리함.
   collectVendorGroups/buildVendorHTML/buildVendorDocForOne(데이터
   수집·문서생성)은 est-doc-vendor.js에 그대로 남음 - 순수 전역
   스크립트라 이 파일에서 그 함수들을 자유롭게 호출해도 문제없음.
   ══════════════════════════════════════════════════ */


// 2026-09-11(선혜님 지적 - "견적서 앱에서 하단에 발주서를 누르면 똑같애
// 위에 이미지랑 루트가 완전히 다른데 둘 중 하나만 살리던가 연결되게
// 하던가"): 대시보드 "발주 현황"에서는 카테고리 하나씩 골라 상세 발주서로
// 들어가는데, 견적서 앱 안의 이 버튼만 예전처럼 전부 다 한 번에 보여주는
// 별개 경로로 남아있었음 - 서로 다른 두 입구가 서로 다른 결과를 주는
// 상태였음. 이 버튼도 똑같이 "어떤 발주서를 볼지" 먼저 고르게 해서
// 대시보드 체크리스트와 똑같은 사고방식으로 통일 - 다만 "전체 보기"
// 선택지는 남겨서, 정말 한 번에 다 보고 싶을 때(급한 발주 등)는 여전히
// 가능하게 함.
// ══════════════════════════════════════════════════
// 2026-09-17(GitHub Issue #5 - "다음 세션 작업" 2026-09-09 확정 설계):
// 발주서가 사실상 못 쓰는 구조였음 - 원단/거래처 입력칸(.c-vendor,
// .b-vendor)이 .inner-fields(display:none) 안에 숨어있어서, 행마다
// "펼치기" 버튼을 눌러야만 보이는 아주 작은 칸이었음. 그래서 실제로는
// 아무도 안 채우고 넘어가는 경우가 많았음(이미 발생한 문제: 블라인드에
// 가공소 이름이 잘못 붙던 버그, 원단명 두 개가 헷갈리던 문제 등).
//
// 핵심 설계 원칙(이슈에 명시된 그대로 지킴): 이 팝업은 별도 데이터
// 구조를 만들지 않고, 입력한 값을 그대로 원래 화면의 실제 input
// (.c-vendor/.b-vendor)에 반영만 함 - 그래서 기존 발주서 생성 코드
// (collectVendorGroups/buildVendorHTML/printForVendor)는 한 줄도
// 안 건드려도 그대로 작동함.
// ══════════════════════════════════════════════════
function openVendorInfoInputModal() {
  var curtainRows = Array.from(document.querySelectorAll('#curtain-body tr'));
  var blindRows = Array.from(document.querySelectorAll('#blind-body tr'));

  if (curtainRows.length === 0 && blindRows.length === 0) {
    alert('발주할 커튼/블라인드 항목이 없어요.');
    return;
  }

  var existing = document.getElementById('vendor-info-input-modal');
  if (existing) existing.remove();

  var ov = document.createElement('div');
  ov.id = 'vendor-info-input-modal';
  ov.className = 'print-hide';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#F5F2EE;z-index:10000;overflow-y:auto;display:flex;flex-direction:column';

  var nav = document.createElement('div');
  nav.style.cssText = 'position:sticky;top:0;z-index:10001;background:#282828;padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:52px;flex-shrink:0';
  var navLabel = document.createElement('span');
  navLabel.textContent = '발주 정보 입력';
  navLabel.style.cssText = 'color:rgba(255,255,255,0.9);font-size:13px;font-weight:700;white-space:nowrap';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.onclick = function(){ ov.remove(); };
  closeBtn.style.cssText = 'padding:7px 16px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit;white-space:nowrap';
  nav.appendChild(navLabel); nav.appendChild(closeBtn);

  var content = document.createElement('div');
  content.style.cssText = 'flex:1;padding:20px 16px 60px;display:flex;justify-content:center';
  var wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;max-width:560px';

  var card = document.createElement('div');
  card.style.cssText = 'background:#fff;border-radius:12px;padding:20px;margin-bottom:16px';

  // 가공소(제작)/레일·부자재 자동배정 안내 - 커튼은 예외 없이 항상
  // 제작을 거침(선혜님 확인: "커튼은 무조건 제작을 해애해") - 항목별
  // 체크박스 없이 통째로 자동 배정, 등록된 거래처가 1곳뿐일 때만 자동.
  if (curtainRows.length > 0) {
    var prodName = (typeof getAutoProductionVendorName === 'function') ? getAutoProductionVendorName() : '';
    var materialName = (typeof getAutoMaterialVendorName === 'function') ? getAutoMaterialVendorName() : '';
    var infoBox = document.createElement('div');
    infoBox.style.cssText = 'font-size:12px;color:var(--sub);line-height:1.7;margin-bottom:16px;padding:10px 12px;background:#F5F2EE;border-radius:8px';
    infoBox.innerHTML =
      '제작(가공소): ' + (prodName ? '<b style="color:#282828">'+escHtml(prodName)+'</b> (자동배정)' : '거래처 관리에 production 카테고리 거래처를 등록해주세요') + '<br>' +
      '레일·부자재: ' + (materialName ? '<b style="color:#282828">'+escHtml(materialName)+'</b> (자동배정)' : '해당 항목이 있으면 거래처 관리에서 material 카테고리로 등록해주세요');
    card.appendChild(infoBox);
  }

  var rowInputs = [];

  function addSectionTitle(text) {
    var t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'font-size:13px;font-weight:700;color:#282828;margin:14px 0 8px';
    card.appendChild(t);
  }
  function addRow(labelHtml, inputEl) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)';
    var label = document.createElement('div');
    label.style.cssText = 'flex:1;font-size:12px;color:#282828;min-width:0;line-height:1.4';
    label.innerHTML = labelHtml;
    inputEl.style.cssText += ';width:130px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;flex-shrink:0;box-sizing:border-box';
    row.appendChild(label); row.appendChild(inputEl);
    card.appendChild(row);
  }

  if (curtainRows.length > 0) {
    addSectionTitle('커튼 — 원단 거래처 (항목마다 다를 수 있어요)');
    curtainRows.forEach(function(tr) {
      var space = tr.querySelector('.space-inp')?.value || '';
      var name = tr.querySelector('.c-display-name')?.value || '';
      var mw = tr.querySelector('.mw')?.value || '';
      var mh = tr.querySelector('.mh')?.value || '';
      var currentVendor = tr.querySelector('.c-vendor')?.value || '';
      var labelHtml = '<b>'+escHtml(space||'—')+'</b> ' + escHtml(name||'') + (mw&&mh ? ' <span style="color:var(--sub)">'+escHtml(mw)+'×'+escHtml(mh)+'</span>' : '');
      var input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('list', 'fabric-vendor-list');
      input.placeholder = '원단 거래처';
      input.value = currentVendor;
      addRow(labelHtml, input);
      rowInputs.push({ tr: tr, field: 'c-vendor', input: input });
    });
  }

  if (blindRows.length > 0) {
    addSectionTitle('블라인드 — 거래처 (필수 선택)');
    var blindVendors = (Array.isArray(window._dahVendorListRaw) ? window._dahVendorListRaw : []).filter(function(v) {
      return v && Array.isArray(v.categories) && v.categories.indexOf('blind') >= 0;
    });
    blindRows.forEach(function(tr) {
      var space = tr.querySelector('.space-inp')?.value || '';
      var name = tr.querySelector('.b-display-name')?.value || '';
      var bmw = tr.querySelector('.bmw')?.value || '';
      var bmh = tr.querySelector('.bmh')?.value || '';
      var currentVendor = tr.querySelector('.b-vendor')?.value || '';
      var labelHtml = '<b>'+escHtml(space||'—')+'</b> ' + escHtml(name||'') + (bmw&&bmh ? ' <span style="color:var(--sub)">'+escHtml(bmw)+'×'+escHtml(bmh)+'</span>' : '');
      var select = document.createElement('select');
      select.required = true;
      var optsHtml = '<option value="">거래처 선택</option>';
      blindVendors.forEach(function(v) {
        optsHtml += '<option value="'+escHtml(v.name||'')+'">'+escHtml(v.name||'')+'</option>';
      });
      select.innerHTML = optsHtml;
      if (currentVendor) select.value = currentVendor;
      addRow(labelHtml, select);
      rowInputs.push({ tr: tr, field: 'b-vendor', input: select });
    });
  }

  wrap.appendChild(card);

  var confirmBtn = document.createElement('button');
  confirmBtn.textContent = '확인 → 발주서 만들기';
  confirmBtn.style.cssText = 'width:100%;padding:12px;background:#282828;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer';
  confirmBtn.onclick = function() {
    // 핵심 설계 원칙: 팝업 값을 원래 화면의 실제 input에 그대로 반영.
    // 새 데이터 구조를 만들지 않아서 기존 발주서 생성 코드는 그대로 작동함.
    rowInputs.forEach(function(ri) {
      var realInput = ri.tr.querySelector('.' + ri.field);
      if (realInput) {
        realInput.value = ri.input.value;
        realInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    ov.remove();
    openVendorOrderPicker();
  };
  wrap.appendChild(confirmBtn);

  content.appendChild(wrap);
  ov.appendChild(nav);
  ov.appendChild(content);
  document.body.appendChild(ov);
}

function openVendorOrderPicker() {
  var existing = document.getElementById('vendor-order-picker');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'vendor-order-picker';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:9998;display:flex;align-items:flex-end;justify-content:center';
  ov.onclick = function(e){ if (e.target === ov) ov.remove(); };
  var sheet = document.createElement('div');
  sheet.style.cssText = 'background:#fff;border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px;box-sizing:border-box';
  sheet.innerHTML = '<div style="font-size:15px;font-weight:700;margin-bottom:14px">어떤 발주서를 보시겠어요?</div>';
  var options = [
    { key: 'fabric', label: '원단 발주서' },
    { key: 'production', label: '캔가공소(제작) 발주서' },
    { key: 'material', label: '레일·자재 발주서' },
    { key: 'blind', label: '블라인드 발주서' },
    { key: null, label: '전체 보기 (다 같이)' }
  ];
  options.forEach(function(opt){
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.label;
    btn.style.cssText = 'display:block;width:100%;text-align:left;padding:14px 12px;background:none;border:none;border-bottom:1px solid #EEE6DC;font-size:14px;font-family:inherit;cursor:pointer;color:#282828';
    btn.onclick = function(){ ov.remove(); printForVendor(opt.key || undefined); };
    sheet.appendChild(btn);
  });
  var cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = '취소';
  cancelBtn.style.cssText = 'display:block;width:100%;text-align:center;padding:14px 12px;background:none;border:none;font-size:14px;font-family:inherit;cursor:pointer;color:#B0A99F;margin-top:6px';
  cancelBtn.onclick = function(){ ov.remove(); };
  sheet.appendChild(cancelBtn);
  ov.appendChild(sheet);
  document.body.appendChild(ov);
}

function printForVendor(categoryFilter) {
  calcTotal();
  // 2026-09-09(선혜님 지적 - "이거는 왜 이렇게 미리 알림으로 띄우는거야??
  // ... 니가 디테일하게 보지 않은거 같애!!"): 실측/시공(printRequest)은
  // 큰 팝업으로 개선했으면서, 발주서(printForVendor)는 예전 window.prompt()
  // 방식이 그대로 남아있었음 - 게다가 이미 각 거래처 문서마다 직접 수정
  // 가능한 비고 칸(.pv-vendor-note-editable, 발주서 페이지 자체 수정
  // 개선 때 만듦)이 있어서 이 prompt는 완전히 중복이었음. 미리보기가
  // 뜨기도 전에 불쑥 끼어드는 것도 방금 만든 팝업→미리보기 흐름을
  // 방해했음 - 완전 제거.
  var extraNote = '';
  // 2026-09-11(선혜님 지시 - "화면 자체를 없애고 최종 발주서에서 바로
  // 수정"): 예전엔 "거래처별 희망 도착일" 화면에서 사람이 확인 버튼을
  // 눌러야 기본값이 채워졌는데, 이제 그 화면이 없어졌으니 문서를 만들기
  // 직전에 여기서 바로 기본값을 채움.
  // 2026-09-11(선혜님 지시 - "발주 하는 이 부분이 정말 신경이 많이
  // 쓰이는데 이 방법이 최선인지는 모르겠어" + 대시보드 "발주 현황"
  // 체크리스트와 연결하기로 결정): categoryFilter가 있으면(체크리스트에서
  // "원단 발주"처럼 카테고리 하나를 눌러서 들어온 경우) 그 카테고리만
  // 걸러서 보여줌 - 없으면(견적서 앱 안의 기존 "발주서" 버튼) 전부 다 보여주는
  // 기존 동작 그대로 유지.
  var precollected = collectVendorGroups(categoryFilter);
  applyVendorArrivalDefaults(precollected.groups);
  var html = buildVendorHTML(extraNote, window._vendorArrivalDates || {}, window._vendorArrivalLocations || {}, categoryFilter);
  // 2026-09-09(선혜님 지시 - "발주 페이지 자체를 수정할 수 있게도
  // 적용이 되어있니??" → "이제 발주서도 보기 화면에서 직접 고칠 수
  // 있게(실측/시공과 동일하게)"): 예전엔 미리보기가 뜨기도 전에 이
  // 시점(함수 시작 직후)에 구글드라이브 저장 + order_status 갱신이
  // 이미 끝나버려서, 미리보기에서 비고를 고쳐도 이미 저장된 파일엔
  // 반영이 안 됐음(고칠 수도 없었음 - contenteditable 자체가 없었음).
  // 실측/시공 의뢰서가 이미 8/26에 이렇게 개선됐던 것과 동일하게,
  // 저장을 "인쇄/PDF저장" 버튼을 실제로 눌러 최종 확정하는 시점으로
  // 미룸(아래 printBtn.onclick 참고) - 그때 화면에 떠 있는(수정됐을
  // 수 있는) 최신 내용을 그대로 저장.

  var existing = document.getElementById('pv-overlay');
  if(existing) existing.remove();

  var ov = document.createElement('div');
  ov.id = 'pv-overlay';
  ov.style.cssText = [
    'position:fixed;top:0;left:0;width:100%;height:100%',
    'background:#F5F2EE;z-index:9999;overflow-y:auto;overflow-x:auto',
    'display:flex;flex-direction:column'
  ].join(';');

  var nav = document.createElement('div');
  nav.className = 'print-hide';
  nav.style.cssText = [
    'position:sticky;top:0;z-index:10001',
    'background:#282828;padding:0 24px',
    'display:flex;align-items:center;justify-content:space-between',
    'height:52px;flex-shrink:0'
  ].join(';');
  var navLabel = document.createElement('span');
  var CATEGORY_TITLE = { fabric: '원단 발주서', production: '캔가공소(제작) 발주서', material: '레일·자재 발주서', blind: '블라인드 발주서' };
  navLabel.textContent = categoryFilter ? (CATEGORY_TITLE[categoryFilter] || '발주서') : '발주서 — 거래처별 원단 발주 목록';
  navLabel.style.cssText = 'color:rgba(255,255,255,0.6);font-size:11px;font-weight:600;letter-spacing:0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1 1 auto;margin-right:8px';
  var navBtns = document.createElement('div');
  navBtns.style.cssText = 'display:flex;gap:var(--sp-2);flex-shrink:0';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.onclick = function(){
    document.getElementById('pv-overlay').remove();
    document.body.style.overflow = '';
    document.body.classList.remove('preview-open');
  };
  closeBtn.style.cssText = 'padding:7px 16px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit;white-space:nowrap;flex-shrink:0';
  var printBtn = document.createElement('button');
  printBtn.textContent = '인쇄 / PDF 저장';
  printBtn.onclick = function() {
    try {
      var collected2 = collectVendorGroups(categoryFilter);
      if (collected2.itemCount > 0) {
        inner.querySelectorAll('[data-vendor]').forEach(function(vendorBlock){
          var vendor = vendorBlock.getAttribute('data-vendor');
          saveDocumentToDrive(vendorCategory(vendor), collected2.cName || '미지정고객', vendor, vendorBlock.outerHTML, collected2.cStaff);
        });
        updateOrderStatusFromVendorGroups(collected2.groups);
        // 2026-09-10(선혜님 - "예상되는 부분을 좀 더 파볼까??"로 발견):
        // 발주를 실제로 완료해도 화면의 "업무처리" 카드가 페이지를
        // 새로고침하기 전까지 "아직 없음"으로 그대로 남아있었음 -
        // renderWorkStatusCards()가 페이지 로드시 딱 한 번만 실행되고
        // 있었음. 서버 저장이 비동기라 살짝 지연 후 다시 그림.
        if (typeof renderWorkStatusCards === 'function') setTimeout(renderWorkStatusCards, 800);
      }
    } catch (eSaveVendor) { console.warn('발주서 드라이브 저장 실패:', eSaveVendor); typeof reportClientError==='function' && reportClientError('발주서 드라이브 저장 실패: ' + (eSaveVendor && eSaveVendor.message || eSaveVendor), eSaveVendor && eSaveVendor.stack); }
    openPdfModal();
  };
  printBtn.style.cssText = 'padding:7px 18px;background:#282828;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;white-space:nowrap;flex-shrink:0';
  // 2026-09-11(선혜님 - "근데 발주는 바로 캡쳐해서 처리하는데"로 발견):
  // 방금 "완료 표시는 인쇄/PDF저장 눌렀을 때만 자동으로"라고 통일했는데,
  // 실제로는 이 화면을 캡쳐(스크린샷)해서 카톡 등으로 바로 보내는 게
  // 실제 업무 방식이라 "인쇄/PDF저장" 버튼 자체를 거의 안 쓰는 경우가
  // 많았음 - 그러면 체크박스를 손으로 못 누르게 막아놓은 상태에서
  // 완료 표시할 방법이 아예 없어짐. "인쇄/PDF저장"과 똑같이 완료 처리만
  // 해주는 별도 버튼을 추가 - 캡쳐로 보내고 나서 이 버튼 하나만 누르면 됨.
  var doneBtn = document.createElement('button');
  doneBtn.textContent = '✓ 발주완료 표시';
  doneBtn.onclick = function() {
    var collected3 = collectVendorGroups(categoryFilter);
    if (collected3.itemCount === 0) { if (typeof showToast === 'function') showToast('완료 처리할 항목이 없어요'); return; }
    updateOrderStatusFromVendorGroups(collected3.groups);
    if (typeof renderWorkStatusCards === 'function') setTimeout(renderWorkStatusCards, 800);
    doneBtn.textContent = '✓ 완료 처리됨';
    doneBtn.disabled = true;
    doneBtn.style.opacity = '0.6';
  };
  doneBtn.style.cssText = 'padding:7px 14px;background:none;color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;white-space:nowrap;flex-shrink:0';
  navBtns.appendChild(closeBtn);
  navBtns.appendChild(doneBtn);
  navBtns.appendChild(printBtn);
  nav.appendChild(navLabel);
  nav.appendChild(navBtns);

  var content = document.createElement('div');
  content.style.cssText = 'flex:1;padding:32px 20px 60px;display:flex;flex-direction:column;align-items:center';
  // 2026-09-11(선혜님 지시 - "화면 자체를 없애고 최종 발주서에서 바로
  // 수정"): 예전엔 "원단 거래처 칸에 가공소 이름을 넣었다" 같은 실수를
  // 별도 확인화면에서 confirm()으로 막았는데, 그 화면을 없앤 대신 문서
  // 맨 위에 눈에 띄는 배너로 알려줌 - 막지는 않되(발주서는 그대로 보임)
  // 바로 알아채고 고칠 수 있게.
  var issues = getVendorInfoIssues();
  if (issues.confusedFabricSpaces.length > 0) {
    var warnBanner = document.createElement('div');
    warnBanner.className = 'print-hide';
    warnBanner.style.cssText = 'width:100%;max-width:640px;background:#FBEAE7;border:1px solid #E4483A;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:#C0392B;line-height:1.6';
    warnBanner.textContent = '⚠️ 원단 거래처 칸에 가공소 이름이 들어간 항목이 있어요: ' + issues.confusedFabricSpaces.join(', ') + ' — 가공소는 자동으로 처리되니, 원단 거래처 칸에는 실제 원단 매입처를 입력해주세요.';
    content.appendChild(warnBanner);
  }
  var inner = document.createElement('div');
  inner.style.cssText = 'width:100%;max-width:640px';
  inner.innerHTML = html;
  content.appendChild(inner);
  // 2026-09-11(선혜님 지적 - "미지정을 고쳐도 원본엔 저장이 안 된다" +
  // "이게 베스트니?? 전문업체 기준으로" 평가 후 1순위로 확정): 발주서
  // 문서의 "발주처" 칸을 고치면, 화면(인쇄용)만 바뀌는 게 아니라 그
  // 항목들이 나온 실제 견적서 행(원단/레일 거래처 입력칸, 블라인드
  // 거래처 선택칸)까지 값이 반영되도록 연결. 이래야 다음에 다시 열어도
  // "미지정"으로 되돌아가지 않음.
  wireVendorNameEdit(inner, precollected.groups);

  ov.appendChild(nav);
  ov.appendChild(content);
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  document.body.classList.add('preview-open');
}

// 2026-09-11(선혜님 지적 - "미지정을 고쳐도 원본엔 저장이 안 된다" +
// "전문업체 기준으로 업무효율성 평가해봐" 후 1순위 개선사항으로 확정):
// 발주서 문서의 "발주처" 칸은 지금까지 contenteditable이긴 해도 화면
// 표시만 바뀌고 실제 데이터(견적서의 원단/레일 거래처 입력칸, 블라인드
// 거래처 선택칸)에는 반영이 안 됐음 - 다음에 다시 열면 도로 "미지정"으로
// 나오는 원인이었음. groups(collectVendorGroups가 만든, 각 항목의
// 원본 행(sourceRow)까지 담고 있는 객체)를 받아서, "발주처" 칸을 실제로
// 고치면 그 그룹에 속한 모든 항목의 원본 행까지 값을 밀어넣어줌.
function wireVendorNameEdit(container, groups) {
  // 2026-09-14(선혜님 - "블라인드는 한번 수정해도 다시 초기화 해버리네"로
  // 발견): 재현해보니 편집 자체는 문제없이 반영되고 있었음 - 진짜 원인은
  // 이 편집이 "지금 열려있는 견적서 화면"에만 반영되고, 실제 저장
  // (saveEstimate)은 완전히 별도 단계였다는 것. 저장을 깜빡하고 창을
  // 닫거나 나중에 다시 열면(특히 대시보드 "상세보기"로 새로 열 때마다
  // 서버에서 새로 불러오므로) 당연히 저장 안 된 예전 값(미지정)으로
  // "초기화된 것처럼" 보임 - 이 토스트에 "지금 저장" 버튼을 바로 붙여서
  // 그 자리에서 바로 저장까지 끝낼 수 있게 함.
  function showVendorSavedToast(msg) {
    var toast = document.createElement('div');
    toast.className = 'print-hide';
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#282828;color:#fff;padding:10px 16px;border-radius:20px;font-size:12px;z-index:10001;display:flex;align-items:center;gap:10px';
    var msgSpan = document.createElement('span');
    msgSpan.textContent = msg;
    var saveBtn = document.createElement('button');
    saveBtn.textContent = '지금 저장';
    saveBtn.style.cssText = 'background:#fff;color:#282828;border:none;border-radius:14px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap';
    saveBtn.onclick = function(){
      toast.remove();
      if (typeof saveEstimate === 'function') saveEstimate();
    };
    toast.appendChild(msgSpan);
    toast.appendChild(saveBtn);
    document.body.appendChild(toast);
    setTimeout(function(){ toast.remove(); }, 6000);
  }
  // 2026-09-15(선혜님 - "미지정을 지정해도 계속 뜨잖아... 다단다에서는
  // 블라인드 업체명이 보이는데" 로 발견 — 실제로는 데이터는 정확히
  // 저장되고 있었음(시공의뢰서엔 이미 정확히 나오고 있었던 게 그 증거).
  // 진짜 문제는 발주서 화면 위쪽의 "⚠️ 미지정" 경고 배너가 정적으로
  // 한 번만 그려지고, 그 뒤로 항목을 하나씩 고쳐도 전혀 다시 계산이
  // 안 되고 있었다는 것 - 데이터는 맞는데 화면(배너)만 계속 옛날 상태를
  // 보여주고 있었음. 항목을 고칠 때마다 그 그룹의 배너/헤더를 지금
  // 상태 기준으로 다시 그림.
  function refreshBlockBanner(block, groupItems) {
    var banner = block.querySelector('.pv-unassigned-banner');
    if (!banner) return;
    var vendors = groupItems.map(function(it){ return it.vendor || ''; });
    var allAssigned = vendors.length > 0 && vendors.every(function(v){ return !!v; });
    if (allAssigned) {
      var uniqueVendors = vendors.filter(function(v, i, arr){ return arr.indexOf(v) === i; });
      var label = uniqueVendors.length === 1 ? uniqueVendors[0] : '여러 거래처';
      banner.style.background = '#F5F2EE';
      banner.style.color = '#282828';
      banner.textContent = '거래처: ' + label;
      var headerField = block.querySelector('.pv-vendor-name-field');
      if (headerField) headerField.textContent = label;
    } else {
      banner.style.background = '#FBEAE7';
      banner.style.color = '#C0392B';
      banner.textContent = '⚠️ 일부 항목의 거래처가 아직 안 정해졌어요 — 빨간 글씨나 드롭다운을 확인해주세요';
    }
  }
  // 2026-09-14(선혜님 지적 - "된거니????": 레일/블라인드도 원단과 같은
  // 문제가 있었음 발견): 블라인드는 거래처가 <select>라 직접 타이핑하는
  // 방식(.pv-item-vendor-field)이 아니라 문서 안에 진짜 드롭다운
  // (.pv-item-vendor-select)을 넣었음 - 그 값을 고르면 바로 그 항목의
  // 원본 블라인드 행에 반영.
  container.querySelectorAll('.pv-item-vendor-select').forEach(function(sel){
    var block = sel.closest('[data-vendor]');
    if (!block) return;
    var vendorKey = block.getAttribute('data-vendor');
    var groupItems = groups[vendorKey];
    var idx = parseInt(sel.getAttribute('data-item-idx'), 10);
    var item = groupItems && groupItems[idx];
    if (!item || !item.sourceRow || !item.vendorField) return;
    sel.addEventListener('change', function(){
      var input = item.sourceRow.querySelector(item.vendorField);
      if (!input) return;
      var val = sel.value;
      if (val === '__custom__') {
        // 2026-09-14(선혜님 지적 - "발주처를 직접 안쓰고 선택하게 해야지"
        // 로 material도 드롭다운화 - 다만 등록 안 된 새 거래처를 써야
        // 하는 예외 상황도 있어서 "+ 직접 입력"으로 탈출구를 남김).
        val = prompt('거래처 이름을 입력해주세요:', '') || '';
        if (!val) { sel.value = item.vendor || ''; return; }
        var customOpt = document.createElement('option');
        customOpt.value = val; customOpt.textContent = val; customOpt.selected = true;
        sel.insertBefore(customOpt, sel.lastElementChild);
        // 2026-09-14("코드 모두 정리해" 중 공용 함수로 합치면서 발견):
        // 블라인드의 실제 원본 필드(.b-vendor)는 진짜 <select>라서, 여기
        // 등록 안 된 새 이름을 .value로 바로 넣으면 일치하는 <option>이
        // 없어 조용히 빈 값으로 되돌아감(값이 안 들어간 채 성공한 것처럼
        // 보임) - 원본이 실제 <select>일 때는 그쪽에도 같은 옵션을 먼저
        // 추가해야 함. 원단/레일의 원본 필드(<input>)는 이 문제가 없음.
        if (input.tagName === 'SELECT' && !Array.from(input.options).some(function(o){ return o.value === val; })) {
          var srcCustomOpt = document.createElement('option');
          srcCustomOpt.value = val; srcCustomOpt.textContent = val;
          input.appendChild(srcCustomOpt);
        }
      }
      input.value = val;
      item.vendor = val;
      sel.style.borderColor = val ? '#EEE6DC' : '#E4483A';
      sel.style.color = val ? '#282828' : '#C0392B';
      refreshBlockBanner(block, groupItems);
      showVendorSavedToast('✅ "' + (item.space||'') + '" 항목의 거래처를 반영했어요.');
    });
  });

  // 2026-09-14(선혜님 지시 - "원단도 드롭다운되게끔 해~ 블라인드처럼"):
  // 원단도 드롭다운(.pv-item-vendor-select)으로 바뀌면서 이 자유텍스트
  // 입력칸(.pv-item-vendor-field)을 만드는 코드가 더 이상 없음 - 이걸
  // 연결하던 아래 블록은 이제 아무 대상도 못 찾는 죽은 코드라 제거
  // (체크리스트 29번 - 죽은 코드 삭제 시 재스캔).

  var fields = container.querySelectorAll('.pv-vendor-name-field');
  fields.forEach(function(field){
    var block = field.closest('[data-vendor]');
    if (!block) return;
    var vendorKey = block.getAttribute('data-vendor');
    var groupItems = groups[vendorKey];
    if (!groupItems || !groupItems.length) return;
    // 캔가공소(제작)처럼 거래처가 견적서 행이 아니라 설정에서 오는
    // 항목은 여기서 고쳐도 반영할 곳이 없음 - 편집 자체를 막고 안내.
    var editableItems = groupItems.filter(function(it){ return it.sourceRow && it.vendorField; });
    if (editableItems.length === 0) {
      field.setAttribute('contenteditable', 'false');
      field.style.cursor = 'not-allowed';
      field.title = '이 거래처는 [설정 > 거래처 관리]에서 등록된 값이라 여기서는 못 고쳐요.';
      return;
    }
    field.addEventListener('blur', function(){
      var newVal = field.textContent.trim();
      if (newVal === vendorKey || (vendorKey.indexOf('미지정') === 0 && newVal === '')) return;
      // 2026-09-13(선혜님 - "전문업체 기준으로... 직접 다 확인" 요청 중
      // 직접 재현하다 발견): "미지정(원단)"은 실제로 같은 거래처라서
      // 묶인 게 아니라, 그냥 다들 거래처를 아직 안 정해서 우연히 같은
      // 이름표 아래 묶인 것뿐임 - 예를 들어 거실 커튼은 A업체, 안방
      // 커튼은 B업체로 각각 다르게 정해야 하는데, 여기서 한 번에 이름을
      // 바꾸면 서로 무관한 커튼들에 전부 같은 거래처가 조용히 들어가
      // 버림. 실제 거래처(이미 이름이 있던 경우)를 고칠 때는 상관없지만
      // (원래도 같은 거래처였으니), "미지정"에서 시작해서 여러 항목이
      // 걸려있을 땐 몇 개나 바뀌는지 미리 보여주고 확인받음.
      var distinctRows = editableItems.filter(function(it, i, arr){ return arr.indexOf(it) === arr.findIndex(function(x){ return x.sourceRow === it.sourceRow; }); });
      if (vendorKey.indexOf('미지정') === 0 && distinctRows.length > 1) {
        var spaces = distinctRows.map(function(it){ return it.space; }).join(', ');
        if (!confirm('"' + newVal + '"을(를) ' + distinctRows.length + '개 항목(' + spaces + ')에 한꺼번에 적용할까요?\n각자 다른 거래처라면 여기서 한 번에 바꾸지 말고, 견적서 행마다 따로 입력해주세요.')) {
          field.textContent = '';
          return;
        }
      }
      var applied = 0, rejected = 0;
      editableItems.forEach(function(it){
        var input = it.sourceRow.querySelector(it.vendorField);
        if (!input) return;
        if (it.vendorIsSelect) {
          // 2026-09-11: <select>는 등록된 거래처 중 하나로만 값을 바꿀 수
          // 있음 - 목록에 없는 이름을 적으면 선택이 풀려버려서(빈 값)
          // 오히려 원본을 망칠 수 있으므로, 등록된 옵션과 정확히 일치할
          // 때만 반영하고 아니면 거부.
          var matched = Array.from(input.options).some(function(opt){ return opt.value === newVal; });
          if (matched) { input.value = newVal; it.vendor = newVal; applied++; } else { rejected++; }
        } else {
          input.value = newVal;
          it.vendor = newVal;
          applied++;
        }
      });
      if (rejected > 0 && applied === 0) {
        alert('"' + newVal + '"은(는) 등록된 블라인드 거래처가 아니에요.\n거래처 관리에 먼저 등록하거나, 등록된 이름 그대로 입력해주세요.');
        field.textContent = vendorKey.indexOf('미지정') === 0 ? '' : vendorKey;
        return;
      }
      // 2026-09-11: 여기서 값을 바꾸는 건 "지금 열려있는 견적서 화면"까지만
      // 이고, Supabase 저장은 아직 안 된 상태 - 저장을 깜빡하면 다음에
      // 다시 열었을 때 이전 값으로 보임(2026-09-14 "다시 초기화" 지적으로
      // "지금 저장" 버튼을 토스트에 바로 붙임 - showVendorSavedToast 참고).
      // 2026-09-15(선혜님 - "미지정을 지정해도 계속 뜨잖아"로 발견): 값은
      // 정확히 반영되고 있었는데 경고 배너를 다시 계산 안 해서 계속
      // "미지정"으로 보이고 있었음 - 배너/헤더도 지금 상태로 갱신.
      refreshBlockBanner(block, groupItems);
      showVendorSavedToast('✅ 이 견적서의 거래처 칸에 "' + newVal + '"(으)로 반영했어요.');
    });
  });
}


// 이미 선언되어 있는데(실제 로직도 거기서 관리됨) 여기서도 동일하게
// 중복 선언되고 있었음 - 두 파일이 같은 페이지에서 함께 로드되므로
// 전역 변수가 두 곳에서 따로 초기화되는 혼란스러운 구조였음. 중복 제거.

