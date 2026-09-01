/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 커튼/블라인드/부자재 계산
   행 추가/복사/삭제, 폭수·레일수 자동계산, 블라인드 옵션,
   부자재 자동추가, 합계 계산. 계산 함수들이 서로 긴밀히
   호출하는 구조라 하나의 파일로 유지함.
   ══════════════════════════════════════════════════ */

function addCurtainRow() {
  var tbody = document.getElementById('curtain-body');
  var tr = document.createElement('tr');
  tr.className = 'row-curtain';
  tr.innerHTML =
    '<td data-label="공간"><input type="text" class="space-inp" placeholder="공간" style="'+INP+';cursor:pointer;caret-color:transparent" readonly onclick="openSpacePicker(this)"></td>'+
    '<td data-label="제품명" style="padding:6px 8px">'+
      '<input type="text" placeholder="제품명 (고객용)" class="c-display-name" style="'+INP+'">'+
      '<div class="inner-fields print-hide">'+
        '<div class="inner-row">'+
          '<input type="text" list="fabric-list" placeholder="원단명" class="c-fabric inner-inp">'+
          '<input type="text" list="vendor-list" placeholder="거래처" class="c-vendor inner-inp" style="width:72px">'+
          '<label style="display:flex;align-items:center;gap:2px;font-size:11px;color:var(--sub);white-space:nowrap;cursor:pointer" title="체크하면 이 거래처 발주서에 보정된 제작사이즈(실측±보정값)가 함께 표시됩니다">'+
            '<input type="checkbox" class="vendor-is-workshop" style="margin:0;width:12px;height:12px">가공소'+
          '</label>'+
          '<input type="text" placeholder="컬러" class="c-color inner-inp" style="width:60px">'+
          '<span class="c-yardage">원단량: —</span>'+
        '</div>'+
        '<div class="inner-row" style="margin-top:2px">'+
          '<input type="text" list="vendor-list" placeholder="레일 거래처 (전동 등)" class="c-rail-vendor inner-inp" style="width:140px">'+
        '</div>'+
      '</div>'+
    '</td>'+
    '<td data-label="주름"><select class="pleat-type" onchange="calcCurtainRow(this)" style="'+SEL+'">'+
      '<option value="나비주름형">나비주름</option><option value="민자형">민자</option></select></td>'+
    '<td data-label="개폐"><select class="open-type" style="'+SEL+'">'+
      '<option value="양개형">양개</option><option value="편개형">편개</option></select></td>'+
    '<td data-label="시접"><select class="hem-type" style="'+SEL+'">'+
      '<option>리드</option><option>5cm</option><option>8cm</option></select></td>'+
    '<td data-label="가로">'+
      '<input type="number" placeholder="cm" class="mw" oninput="calcCurtainRow(this)" style="'+INP+'">'+
    '</td>'+
    '<td data-label="높이">'+
      '<input type="number" placeholder="cm" class="mh" oninput="calcCurtainRow(this)" style="'+INP+'">'+
    '</td>'+
    '<td data-label="폭"><input type="number" class="pnum" value="2" oninput="calcCurtainRow(this)" style="'+INP+'"></td>'+
    '<td data-label="보정" style="padding-top:2px">'+
      '<div style="display:flex;gap:2px">'+
        '<input type="number" placeholder="-3" class="height-adjust" value="-3" oninput="calcCurtainRow(this)" style="width:38px;font-size:11px;padding:1px 2px;border:1px solid var(--border);border-radius:4px;text-align:center" title="제작높이 보정값(cm). 일반레일 -3, 전동레일은 브랜드마다 달라서(솜피 등) -5 근처로 직접 조정하세요">'+
        '<button type="button" onclick="var i=this.parentNode.querySelector(\'.height-adjust\'); i.value=-3; calcCurtainRow(i);" style="font-size:11px;padding:8px 9px;border:1px solid var(--border);border-radius:4px;background:#fff;cursor:pointer;min-width:32px;white-space:nowrap">일반</button>'+
        '<button type="button" onclick="var i=this.parentNode.querySelector(\'.height-adjust\'); i.value=-5; calcCurtainRow(i);" style="font-size:11px;padding:8px 9px;border:1px solid var(--border);border-radius:4px;background:#fff;cursor:pointer;min-width:32px;white-space:nowrap">전동</button>'+
      '</div>'+
    '</td>'+
    '<td data-label="단가"><input type="text" inputmode="numeric" placeholder="단가" class="cprice" oninput="fmtPrice(this);calcCurtainRow(this)" onfocus="fmtPriceFocus(this)" onblur="fmtPriceBlur(this);calcCurtainRow(this)" style="'+INP+'"></td>'+
    '<td class="amt camt" data-label="금액">—</td>'+
    '<td style="white-space:nowrap">'+
      '<span class="row-drag-handle print-hide" title="드래그해서 순서 바꾸기" style="cursor:grab;padding:4px 6px;color:var(--sub);user-select:none;display:inline-block">⠿</span>'+
      '<button class="copy-btn print-hide" onclick="copyCurtainRow(this)" title="복사">⧉</button>'+
      '<button class="del-btn print-hide" onclick="delRow(this)">✕</button>'+
    '</td>';
  tbody.appendChild(tr);
  makeRowDraggable(tr);
  setupRowDragReorder('curtain-body');
  renderEmptyState();

  // 레일 / 레일 시공비는 가로(mw) 입력 시 autoUpdateRail()에서 자동 생성/계산됨
}

function calcCurtainRow(el) {
  var tr = el.closest('tr');
  // 2026-08-24(선혜님 발견 — "폭수를 한 폭 줄이거나 늘릴 때도 있는데 수정이
  // 안 된다"): 폭수(.pnum) 칸 자체를 직접 고쳐도, 곧바로 아래 자동계산 로직이
  // "수동으로 안 고쳤다"고 판단해서 그 값을 도로 자동계산값으로 덮어쓰고
  // 있었음 — 폭수 입력칸을 직접 건드린 게 트리거였을 때만 manual 표시를
  // 남기는 코드가 통째로 빠져있었음. 이제 직접 고치면 그 값이 유지되고,
  // 가로(mw)/세로(mh)/주름(pleat)을 바꾸면 다시 자동계산으로 돌아감(원래
  // 자동계산이 도움이 되는 경우가 더 많아서, 치수를 다시 잡을 땐 새로
  // 제안받는 게 자연스러움).
  if (el.classList && el.classList.contains('pnum')) {
    el.dataset.manual = '1';
  } else if (el.classList && (el.classList.contains('mw') || el.classList.contains('mh') || el.classList.contains('pleat-type'))) {
    var pnumEl0 = tr.querySelector('.pnum');
    if (pnumEl0) delete pnumEl0.dataset.manual;
  }
  var mw = Math.max(0, parseFloat(tr.querySelector('.mw')?.value)||0);
  var mh = Math.max(0, parseFloat(tr.querySelector('.mh')?.value)||0);
  // 2026-08-05: 제작높이 힌트만 레일타입에 따라 다르게 계산 — 일반레일 -3cm / 전동레일 -5cm.
  // 실측/시공 의뢰서 문서(est-documents.js)는 이 보정 없이 원래 실측값 그대로 출력하는 게 맞음(선혜님 확인).
  // 2026-08-05: '일반/전동' 2択 자동판정 대신, 보정값(cm)을 직접 입력받는 방식으로 변경.
  // 이유: 전동레일도 브랜드마다(솜피 등) 실제 보정값이 다르고, 고객이 일부러 길게
  // (푸들스타일) 만들고 싶을 때도 있어서 -3/-5 중 하나로 무작정 고정하면 오히려 방해됨.
  // "일반"/"전동" 버튼은 빠른 기본값 세팅용이고, 언제든 숫자를 직접 고칠 수 있음.
  var heightAdjust = parseFloat(tr.querySelector('.height-adjust')?.value);
  if (isNaN(heightAdjust)) heightAdjust = -3;
  var fw = mw, fh = mh>0 ? mh+heightAdjust : 0;
  // 2026-08-05: 화면에 뜨던 "제작 XXcm" 힌트 제거 — 실측 옆에 계속 떠 있으니
  // 오히려 헷갈린다는 피드백. fw/fh 값 자체는 가공소 발주서(collectVendorGroups)
  // 계산에 계속 쓰이므로 로직은 그대로 두고 화면 표시만 없앰.
  var pleat = tr.querySelector('.pleat-type')?.value||'민자형';
  var ratio = pleat==='나비주름형' ? 2.0 : 1.5;
  // 2026-08-27(선혜님 지시 - "무조건 반올림하니 폭수가 너무 많다"):
  // 예전엔 Math.ceil()로 소수점이 조금만 넘어도(예: 4.015배) 무조건 한
  // 폭 전체를 더 잡았음. 이제 주름형태별로 "이 정도 여유분까지는 그냥
  // 내려도 된다"는 허용 기준을 둠 — 민자형은 소수점 0.2 이하, 나비주름형은
  // 0.1 이하면 올리지 않고 내림. 그 기준을 넘는 소수점은 여전히 올림
  // (원단 부족 방지). 예: 나비주름형 300cm → 4.615배 → 소수점 0.615는
  // 허용범위(0.1) 밖이라 여전히 5폭. 나비주름형 261cm → 4.015배 → 소수점
  // 0.015는 허용범위(0.1) 이내라 4폭으로 내려감(예전엔 5폭이었음).
  var rawP = (mw*ratio)/130;
  var floorP = Math.floor(rawP);
  var decimalP = rawP - floorP;
  var tolerance = pleat==='나비주름형' ? 0.1 : 0.2;
  var sugP = Math.max(0, decimalP <= tolerance ? floorP : Math.ceil(rawP));
  var pnumEl = tr.querySelector('.pnum');
  if(pnumEl && !pnumEl.dataset.manual) pnumEl.value = sugP||1;
  var pnum = Math.max(0, parseFloat(tr.querySelector('.pnum')?.value)||1);
  
  var mhEl = tr.querySelector('.mh');

  // 2026-08-10: 세로(mh) 250/270/290cm 이상이면 금액 추가 검토 안내만 표시
  // (선혜님 확인: 계산에는 반영하지 말고 알림만 띄울 것). 실측 세로값(mh)
  // 기준으로 판단 — 제작높이 보정(fh)이 아니라 원래 실측값 기준.
  var heightFeeWarnEl = tr.querySelector('.height-fee-warn');
  if(!heightFeeWarnEl) {
    heightFeeWarnEl = document.createElement('div');
    heightFeeWarnEl.className = 'height-fee-warn print-hide';
    heightFeeWarnEl.style.cssText = 'display:none;font-size:11px;color:#F06E2D;font-weight:700;margin-top:3px;white-space:nowrap';
    mhEl?.parentNode?.appendChild(heightFeeWarnEl);
  }
  if (mh >= 290) {
    heightFeeWarnEl.textContent = '⚠️ 높이 290cm 이상 30% 추가';
    heightFeeWarnEl.style.display = 'block';
  } else if (mh >= 270) {
    heightFeeWarnEl.textContent = '⚠️ 높이 270cm 이상 20% 추가';
    heightFeeWarnEl.style.display = 'block';
  } else if (mh >= 250) {
    heightFeeWarnEl.textContent = '⚠️ 높이 250cm 이상 10% 추가';
    heightFeeWarnEl.style.display = 'block';
  } else {
    heightFeeWarnEl.style.display = 'none';
  }
  // 2026-08-19: 243cm 초과 "2단 제작 필요" 경고는 선혜님 확인 결과 불필요해서 제거함
  // (250/270/290cm 금액추가검토 경고만 유지).
  
  var price = Math.max(0, getPriceVal(tr.querySelector('.cprice'))||0);
  var amt = Math.round(price*pnum);
  var camtEl = tr.querySelector('.camt');
  if(camtEl) camtEl.textContent = amt>0 ? amt.toLocaleString()+'원' : '—';
  autoUpdateRail(tr);
  calcTotal();
}
function autoUpdateRail(curtainTr) {
  var mw = Math.max(0, parseFloat(curtainTr.querySelector('.mw')?.value)||0);
  if(!mw) return;
  // 2026-08-14: rowIndex(테이블 전체 기준 위치)로 레일을 매칭하던 것을
  // 각 행 고유 ID로 변경(다양한 상황 재검토 중 발견한 심각한 버그).
  // rowIndex는 다른 행이 삭제되면 값이 바뀌는데, 레일 행의 data-rail-src는
  // 그대로 남아있어서, "삭제 후 남은 행을 수정"하면 기존 rowIndex와 안 맞아
  // 레일을 못 찾고 새로 만들어버려 레일이 중복 생성되고 금액이 부풀려졌음
  // (재현: A행 삭제 후 B행 폭 수정 → 기존 B레일은 안 지워지고 새 레일이
  // 추가로 생김). 고유ID는 행이 처음 쓰일 때 그 자리에서 한 번만 부여하고
  // (lazy assignment) 이후 계속 재사용 — 기존 HTML의 첫 행이든 새로 추가한
  // 행이든 동일하게 안전.
  if (!curtainTr.dataset.rowUid) {
    window._curtainRowSeq = (window._curtainRowSeq || 0) + 1;
    curtainTr.dataset.rowUid = 'crow' + window._curtainRowSeq;
  }
  var rowIdx = curtainTr.dataset.rowUid;
  var svcBody = document.getElementById('svc-body');

  // "시공 안함(배송)" 상태(지역 미선택)에서는 레일/레일시공비를 추가하지 않음 —
  // 이미 만들어진 레일/레일시공비 행이 있다면(이전에 지역을 선택했다가 배송으로 바꾼 경우) 제거함
  var regionEl = document.getElementById('c-region');
  if (regionEl && regionEl.value === '') {
    if (svcBody) {
      var oldRail = svcBody.querySelector('[data-rail-src="'+rowIdx+'"]');
      if (oldRail) oldRail.remove();
      var oldRailCost = svcBody.querySelector('[data-railcost-src="'+rowIdx+'"]');
      if (oldRailCost) oldRailCost.remove();
    }
    calcTotal();
    return;
  }

  var space = curtainTr.querySelector('.space-inp')?.value||'';
  var ja = mw/30, jaR = Math.ceil(ja);
  if(jaR%2!==0) jaR++;

  // 2026-08-05: 레일단가(1,600원)를 변수로 추출 — 예전엔 아래 두 분기(기존행 수정/신규행 생성)에
  // 리터럴 '1600'이 각각 따로 있어서, 나중에 단가가 바뀌면 한쪽만 고치고 다른쪽을 놓칠 위험이 있었음.
  var RAIL_UNIT_PRICE = 1600;

  // 레일 (자재) 행: 단가 1,600원 × 레일수
  var existing = svcBody.querySelector('[data-rail-src="'+rowIdx+'"]');
  if(existing) {
    var tds = existing.querySelectorAll('td');
    // 2026-09-01(선혜님 지시 - "조절레일 (타공형) 이 기본이야"): 그냥 "레일"
    // 이라고만 나오던 것을, 실제로 기본으로 쓰는 레일 종류(조절레일/타공형)를
    // 명시하도록 변경 - 시공요청서에도 이 텍스트에서 레일길이를 추출해서
    // 보여주니, 시공기사님이 어떤 레일인지 더 명확히 알 수 있게 됨.
    if(tds[1]) { var inp=tds[1].querySelector('input'); if(inp) inp.value=(space?space+' ':' ')+'조절레일(타공형) '+jaR+'자'; }
    if(tds[2]) { var inp=tds[2].querySelector('input'); if(inp){ inp.setAttribute('data-raw',String(RAIL_UNIT_PRICE)); inp.value=(RAIL_UNIT_PRICE).toLocaleString(); } }
    if(tds[3]) { var inp=tds[3].querySelector('input'); if(inp) inp.value=jaR; }
    calcSvcRow(tds[2]?.querySelector('input'));
  } else {
    addSvcRow();
    var newRow = svcBody.lastElementChild;
    newRow.setAttribute('data-rail-src', rowIdx);
    var tds = newRow.querySelectorAll('td');
    if(tds[0]) { var sel=tds[0].querySelector('select'); if(sel) sel.value='레일'; }
    if(tds[1]) { var inp=tds[1].querySelector('input'); if(inp) inp.value=(space?space+' ':' ')+'조절레일(타공형) '+jaR+'자'; }
    if(tds[2]) { var inp=tds[2].querySelector('input'); if(inp){ inp.setAttribute('data-raw',String(RAIL_UNIT_PRICE)); inp.value=(RAIL_UNIT_PRICE).toLocaleString(); } }
    if(tds[3]) { var inp=tds[3].querySelector('input'); if(inp) inp.value=jaR; }
    calcSvcRow(tds[2]?.querySelector('input'));
  }

  // 2026-08-05: 레일시공비(25,000원)도 동일한 이유로 변수 추출
  var RAIL_INSTALL_FEE = 25000;

  // 레일 시공비 행: 단가 25,000원 × 1개 (레일수와 무관, 창문 1개 시공당 고정)
  var existingCost = svcBody.querySelector('[data-railcost-src="'+rowIdx+'"]');
  if(existingCost) {
    var ctds = existingCost.querySelectorAll('td');
    if(ctds[1]) { var inp=ctds[1].querySelector('input'); if(inp) inp.value=(space?space+' ':' ')+'레일 시공비'; }
    if(ctds[2]) { var inp=ctds[2].querySelector('input'); if(inp){ inp.setAttribute('data-raw',String(RAIL_INSTALL_FEE)); inp.value=(RAIL_INSTALL_FEE).toLocaleString(); } }
    if(ctds[3]) { var inp=ctds[3].querySelector('input'); if(inp) inp.value=1; }
    calcSvcRow(ctds[2]?.querySelector('input'));
  } else {
    addSvcRow();
    var newCostRow = svcBody.lastElementChild;
    newCostRow.setAttribute('data-railcost-src', rowIdx);
    var ctds = newCostRow.querySelectorAll('td');
    if(ctds[0]) { var sel=ctds[0].querySelector('select'); if(sel) sel.value='시공비'; }
    if(ctds[1]) { var inp=ctds[1].querySelector('input'); if(inp) inp.value=(space?space+' ':' ')+'레일 시공비'; }
    if(ctds[2]) { var inp=ctds[2].querySelector('input'); if(inp){ inp.setAttribute('data-raw',String(RAIL_INSTALL_FEE)); inp.value=(RAIL_INSTALL_FEE).toLocaleString(); } }
    if(ctds[3]) { var inp=ctds[3].querySelector('input'); if(inp) inp.value=1; }
    calcSvcRow(ctds[2]?.querySelector('input'));
  }

  calcTotal();
}

function addBlindRow() {
  var tbody = document.getElementById('blind-body');
  var tbl = document.getElementById('blind-table');
  if(tbl) tbl.style.display = 'table';
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td data-label="공간"><input type="text" class="space-inp" placeholder="공간" style="'+INP+';cursor:pointer;caret-color:transparent" readonly onclick="openSpacePicker(this)"></td>'+
    '<td data-label="제품명" style="padding:6px 8px">'+
      '<input type="text" placeholder="제품명 (고객용)" class="b-display-name" style="'+INP+'">'+
      '<div class="inner-fields print-hide">'+
        '<div class="inner-row">'+
          '<input type="text" list="blind-list" placeholder="원단명" class="inner-inp">'+
          '<input type="text" list="vendor-list" placeholder="거래처" class="inner-inp" style="width:72px">'+
          '<input type="text" placeholder="컬러" class="inner-inp" style="width:60px">'+
        '</div>'+
      '</div>'+
    '</td>'+
    '<td data-label="종류"><select class="blind-kind" onchange="calcBlindRow(this)" style="'+SEL+'">'+
      '<option>롤스크린</option><option>알루미늄</option><option>우드</option>'+
      '<option>허니콤</option><option>로만쉐이드</option><option>기타</option>'+
    '</select></td>'+
    '<td data-label="손잡이"><select class="handle-dir" style="'+SEL+'"><option>좌손</option><option>우손</option><option>기타</option></select></td>'+

    '<td data-label="가로"><input type="text" inputmode="numeric" placeholder="cm" class="bmw" oninput="fmtPrice(this);calcBlindRow(this)" style="'+INP+'"></td>'+
    '<td data-label="높이"><input type="text" inputmode="numeric" placeholder="cm" class="bmh" oninput="fmtPrice(this);calcBlindRow(this)" style="'+INP+'"></td>'+
    '<td data-label="옵션"><input type="text" placeholder="옵션" class="blind-opt" style="'+INP+'"></td>'+
    '<td data-label="단가">'+
      '<input type="text" inputmode="numeric" placeholder="단가(원/㎡)" class="blind-price" oninput="fmtPrice(this);calcBlindRow(this)" onfocus="fmtPriceFocus(this)" onblur="fmtPriceBlur(this);calcBlindRow(this)" style="'+INP+'">'+
      '<span class="bsqm">—</span>'+
      '<input type="text" inputmode="numeric" placeholder="옵션추가금" class="blind-extra" oninput="fmtPrice(this);calcBlindRow(this)" onfocus="fmtPriceFocus(this)" onblur="fmtPriceBlur(this);calcBlindRow(this)" style="'+INP+';margin-top:3px;font-size:11px">'+
    '</td>'+
    '<td class="amt bamt" data-label="금액">—</td>'+
    '<td style="white-space:nowrap">'+
      '<span class="row-drag-handle print-hide" title="드래그해서 순서 바꾸기" style="cursor:grab;padding:4px 6px;color:var(--sub);user-select:none;display:inline-block">⠿</span>'+
      '<button class="copy-btn print-hide" onclick="copyBlindRow(this)">⧉</button>'+
      '<button class="del-btn print-hide" onclick="delRow(this)">✕</button>'+
    '</td>';
  tbody.appendChild(tr);
  makeRowDraggable(tr);
  setupRowDragReorder('blind-body');
  autoAddBlindSvc();
  renderEmptyState();
}

// 2026-08-09: 블라인드 최소면적 규칙 — 원래 calcBlindRow/calcTotal 두 곳에
// 각각 따로 정의돼있어서, 규칙이 바뀔 때 한쪽만 고치면 값이 어긋날 위험이
// 있었음. 공용 함수로 통합.
// 전체 규칙(선혜님 확인, 2026-08-09): 모든 블라인드 종류에 최소면적이 있음
// - 로만쉐이드, 롤스크린: 2.0㎡
// - 우드, 허니콤, 알루미늄, 기타: 1.5㎡
function getBlindMinSqm(kind) {
  if (kind === '로만쉐이드' || kind === '롤스크린') return 2.0;
  return 1.5;
}

function calcBlindRow(el) {
  var tr = el.closest('tr');
  var bw = Math.max(0, parseFloat(tr.querySelector('.bmw')?.value)||0);
  var bh = Math.max(0, parseFloat(tr.querySelector('.bmh')?.value)||0);
  var kind = tr.querySelector('.blind-kind')?.value||'';
  var price = Math.max(0, getPriceVal(tr.querySelector('.blind-price'))||0);
  var extra = parseFloat(tr.querySelector('.blind-extra')?.value)||0;
  var sqmRaw = (bw*bh)/10000;
  var minSqm = getBlindMinSqm(kind);
  if(sqmRaw<minSqm && sqmRaw>0) sqmRaw=minSqm;
  
  var sqm = Math.ceil(sqmRaw*10)/10;
  var sqmEl = tr.querySelector('.bsqm');
  if(sqmEl) sqmEl.textContent = sqm>0 ? sqm.toFixed(1)+'㎡'+(sqmRaw===minSqm&&minSqm>0?' (최소)':'') : '—';
  
  var bmwEl = tr.querySelector('.bmw');
  var bwWarnEl = tr.querySelector('.blind-wide-warn');
  if(!bwWarnEl) {
    bwWarnEl = document.createElement('div');
    bwWarnEl.className = 'blind-wide-warn print-hide';
    bwWarnEl.style.cssText = 'display:none;font-size:11px;color:#F06E2D;font-weight:700;margin-top:3px;white-space:nowrap';
    bwWarnEl.textContent = '⚠️ 200cm 초과 — 분할 시공 검토';
    bmwEl?.parentNode?.appendChild(bwWarnEl);
  }
  if(bmwEl) bmwEl.style.borderBottom = bw>200 ? '2px solid #F06E2D' : '';
  if(bwWarnEl) bwWarnEl.style.display = bw>200 ? 'block' : 'none';
  var amt = Math.round(price*sqm);
  tr.querySelector('.bamt').textContent = amt>0 ? amt.toLocaleString()+'원' : '—';
  recalcBlindOptionExtras();
  calcTotal();
}

function recalcBlindOptionExtras() {
  var blindBody = document.getElementById('blind-body');
  var svcBody = document.getElementById('svc-body');
  if (!blindBody || !svcBody) return;
  var extraSum = 0;
  var optNames = [];
  blindBody.querySelectorAll('.blind-extra').forEach(function(inp){
    var v = Math.max(0, parseFloat(inp.value.replace(/[^0-9.-]/g,''))||0);
    extraSum += v;
    if (v > 0) {
      var tr = inp.closest('tr');
      var optName = (tr?.querySelector('.blind-opt')?.value || '').trim();
      if (optName && optNames.indexOf(optName) < 0) optNames.push(optName);
    }
  });
  // 2026-08-15: 옵션추가금(전동 부품비 등)을 지역 시공비 행에 합산하던 방식을
  // 독립된 svc 행으로 완전히 분리(선혜님 확인 — 전동 부품비는 지역/시공
  // 여부와 무관하게 항상 받아야 함, 전동시공비(8~10만원)는 별개의 얘기라
  // 지금은 시스템화하지 않기로 함). 예전엔 지역을 선택 안 하면 옵션추가금을
  // "얹을 곳"(지역시공비 행)이 아예 없어서, 화면에서 사라지고 저장도
  // 막혔었음(validateEstimate가 저장 자체를 차단). 독립 행이라 지역 여부와
  // 무관하게 항상 정확히 표시/저장됨.
  var row = svcBody.querySelector('[data-svc-type="옵션추가금"]');
  if (extraSum <= 0) {
    if (row) row.remove();
    calcTotal();
    return;
  }
  if (!row) {
    addSvcRow();
    row = svcBody.lastElementChild;
    row.setAttribute('data-svc-type','옵션추가금');
  }
  var tds = row.querySelectorAll('td');
  if(tds[0]) { var sel=tds[0].querySelector('select'); if (sel) sel.value='전동'; }
  if(tds[1]) { var inp=tds[1].querySelector('input'); if (inp) inp.value = optNames.length ? optNames.join(', ') : '옵션 추가금'; }
  if(tds[2]) { var inp=tds[2].querySelector('input'); if(inp){ inp.setAttribute('data-raw', String(extraSum)); inp.value=extraSum.toLocaleString(); } }
  if(tds[3]) { var inp=tds[3].querySelector('input'); if (inp) inp.value = 1; }
  calcSvcRow(tds[2]?.querySelector('input'));
}

function autoAddBlindSvc() {
  var svcBody = document.getElementById('svc-body');
  var blindBody = document.getElementById('blind-body');
  if(!svcBody || !blindBody) return;
  var blindCount = blindBody.querySelectorAll('tr').length;
  if(blindCount === 0) return;

  // "시공 안함(배송)" 상태(지역 미선택)에서는 블라인드 시공비를 추가하지 않음
  var regionEl = document.getElementById('c-region');
  if (regionEl && regionEl.value === '') {
    var existingBlindSvc = svcBody.querySelector('[data-svc-type="블라인드시공"]');
    if (existingBlindSvc) existingBlindSvc.remove();
    calcTotal();
    return;
  }

  var row = svcBody.querySelector('[data-svc-type="블라인드시공"]');
  if(!row) {
    addSvcRow();
    row = svcBody.lastElementChild;
    row.setAttribute('data-svc-type','블라인드시공');
  }
  var tds = row.querySelectorAll('td');
  if(tds[0]) { var sel=tds[0].querySelector('select'); if(sel) sel.value='시공비'; }
  if(tds[1]) { var inp=tds[1].querySelector('input'); if(inp) inp.value='블라인드 시공비 ('+blindCount+'개)'; }
  if(tds[2]) { var inp=tds[2].querySelector('input'); if(inp){ inp.setAttribute('data-raw','10000'); inp.value=(10000).toLocaleString(); } }
  if(tds[3]) { var inp=tds[3].querySelector('input'); if(inp) inp.value=blindCount; }
  calcSvcRow(tds[2]?.querySelector('input'));
}

function addSvcRow() {
  var tbody = document.getElementById('svc-body');
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td><select class="svc-kind" style="'+SEL+'"><option value="레일">레일</option><option value="시공비">시공비</option>'+
    '<option value="전동">전동</option><option value="실측비">실측비</option>'+
    '<option value="부자재">부자재</option><option value="기타">기타</option></select></td>'+
    '<td><input type="text" placeholder="내용 입력" class="svc-content" style="'+INP+'"></td>'+
    '<td><input type="text" inputmode="numeric" placeholder="단가" class="sprice" oninput="fmtPrice(this);calcSvcRow(this)" onfocus="fmtPriceFocus(this)" onblur="fmtPriceBlur(this);calcSvcRow(this)" style="'+INP+'"></td>'+
    '<td><input type="number" placeholder="1" class="sqty" value="1" oninput="fmtPrice(this);calcSvcRow(this)" style="'+INP+'"></td>'+
    '<td class="amt samt">0원</td>'+
    '<td style="white-space:nowrap">'+
      '<button class="copy-btn print-hide" onclick="copySvcRow(this)">⧉</button>'+
      '<button class="del-btn print-hide" onclick="delSvcRow(this)">✕</button>'+
    '</td>';
  tbody.appendChild(tr);
}

function calcSvcRow(el) {
  if(!el) return;
  var tr = el.closest('tr');
  // 2026-08-14: 부자재 단가는 "이 항목만 할인" 용도로 마이너스를 실제로
  // 쓰신다고 확인 — 여기만 Math.max(0,...) 제거해서 음수 그대로 반영.
  // toLocaleString()이 음수도 "-50,000원" 형태로 정상 표시해줌.
  var p = getPriceVal(tr.querySelector('.sprice'))||0;
  var q = Math.max(0, parseFloat(tr.querySelector('.sqty')?.value)||1);
  tr.querySelector('.samt').textContent = (p*q).toLocaleString()+'원';
  calcTotal();
}

function autoAddSvcFee() {
  var region = document.getElementById('c-region').value;
  var svcBody = document.getElementById('svc-body');
  var hint = document.getElementById('region-hint');
  var customInp = document.getElementById('c-region-price');
  customInp.style.display = region==='기타' ? 'inline-block' : 'none';
  var customBase = parseFloat(document.getElementById('c-region-price').value)||0;
  var regionFees = (typeof getRegionFees === 'function') ? getRegionFees() : { '서울': {'실측비':40000, '시공비':50000}, '경기': {'실측비':60000, '시공비':80000} };
  var priceMap = {
    '서울': regionFees['서울'] || {'실측비':40000, '시공비':50000},
    '경기': regionFees['경기'] || {'실측비':60000, '시공비':80000},
    '기타': {'실측비':customBase, '시공비':customBase}
  };
  var prices = priceMap[region];
  if(!svcBody) return;
  var rows = svcBody.querySelectorAll('[data-svc-type="실측비"],[data-svc-type="시공비"]');
  rows.forEach(function(r){ r.remove(); });
  if(!prices || (prices['실측비']===0 && prices['시공비']===0)) {
    Array.from(svcBody.querySelectorAll('tr')).forEach(function(r){
      var type=r.querySelector('select')?.value||'';
      if(type==='실측비'||type==='시공비'||type==='레일') r.remove();
    });
    if(hint) hint.textContent='시공 없음 (배송)';
    calcTotal(); return;
  }
  ['실측비','시공비'].forEach(function(type) {
    var typePrice = prices[type];
    addSvcRow();
    var row = svcBody.lastElementChild;
    row.setAttribute('data-svc-type', type);
    var tds = row.querySelectorAll('td');
    if(tds[0]) { var sel=tds[0].querySelector('select'); if(sel) sel.value=type==='실측비'?'실측비':'시공비'; }
    if(tds[1]) { var inp=tds[1].querySelector('input'); if(inp) inp.value=region+(type==='실측비'?' 실측비':' 시공비'); }
    if(tds[2]) { var inp=tds[2].querySelector('input'); if(inp){ inp.setAttribute('data-raw',String(typePrice)); inp.value=typePrice.toLocaleString(); } }
    if(type==='시공비') row.setAttribute('data-install-base', String(typePrice));
    if(tds[3]) { var inp=tds[3].querySelector('input'); if(inp) inp.value=1; }
    calcSvcRow(tds[2]?.querySelector('input'));
  });
  if(hint) hint.textContent='→ 실측 '+prices['실측비'].toLocaleString()+'원 + 시공 '+prices['시공비'].toLocaleString()+'원 자동추가';
  // 2026-08-14: 블라인드를 먼저 입력하고 나중에 지역을 선택하면 블라인드
  // 시공비(10,000원×개수)가 통째로 누락되던 버그 수정(실장님 실사용에서 발견,
  // 재현으로 확인). 지역 미선택 상태에선 autoAddBlindSvc()가 시공비 행을
  // 지우고 끝나는데, 이후 지역을 선택해도 다시 불러주는 곳이 없었음.
  // 2026-08-14 추가: 커튼 레일도 완전히 같은 문제가 있었음(선혜님 지적으로
  // "순서가 달라도 결과는 같아야 한다" 전수검증하다 발견) — 커튼을 먼저
  // 입력하고 나중에 지역을 선택하면 레일 자재비+레일 시공비(41,000원)가
  // 통째로 누락됐음. 지역 선택 시 모든 커튼 행의 레일을 다시 계산해준다.
  document.querySelectorAll('#curtain-body tr').forEach(function(ctr){
    if (typeof autoUpdateRail === 'function') autoUpdateRail(ctr);
  });
  autoAddBlindSvc();
  recalcBlindOptionExtras();
}

function triggerSumPulse(){
  var el=document.querySelector('.summary-total-amount');
  if(!el) return;
  el.classList.remove('updated');
  requestAnimationFrame(function(){ el.classList.add('updated'); });
  setTimeout(function(){ el.classList.remove('updated'); }, 350);
}
// 2026-08-24: 저장된 견적을 다시 열었을 때, 그 사이 할인쿠폰/설정이 바뀌어도
// 저장 당시 금액 그대로 보여주기 위한 함수. restoreLineItemsToForm+
// restoreAppliedDiscounts가 끝난 뒤(내부적으로 calcTotal이 최신 설정으로
// 다시 계산해버린 뒤) 마지막에 호출해서, 화면 표시값만 저장된 스냅샷으로
// 덮어씀 — 실제 입력값(할인쿠폰 체크상태 등)은 그대로 두므로, 이 상태에서
// 사용자가 뭔가 직접 수정하면 그 시점부터는 다시 정상적으로 재계산됨.
function applyFrozenBreakdown(bd) {
  if (!bd) return;
  var setText = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
  if (bd.productSubtotal != null) setText('sum-curtain', bd.productSubtotal.toLocaleString()+'원');
  if (bd.installSubtotal != null) setText('sum-svc', bd.installSubtotal.toLocaleString()+'원');
  if (bd.finalTotal != null) { setText('sum-total', bd.finalTotal.toLocaleString()+'원'); }
  if (bd.discount != null) {
    var discEl = document.getElementById('sum-discount');
    var discRow = discEl && discEl.closest('.sum-row');
    if (discEl) discEl.textContent = bd.discount > 0 ? '-'+bd.discount.toLocaleString()+'원' : '';
    if (discRow) discRow.style.display = bd.discount > 0 ? 'flex' : 'none';
  }
  if (bd.balance != null) setText('sum-balance', bd.balance.toLocaleString()+'원');
  if (bd.performanceRevenue != null) setText('sum-perf', bd.performanceRevenue.toLocaleString()+'원');
  if (bd.deposit != null) {
    setText('sum-deposit-disp', bd.deposit > 0 ? bd.deposit.toLocaleString()+'원' : '—');
    setText('sum-balance-disp', bd.deposit > 0 ? bd.balance.toLocaleString()+'원' : '—');
    var depInp = document.getElementById('deposit-input');
    if (depInp && bd.deposit > 0) {
      depInp.value = bd.deposit.toLocaleString();
      depInp.dataset.raw = String(bd.deposit);
      // 2026-08-28(선혜님 지적 — "선금을 넣으면 선금이 자꾸 바뀌니깐 계속
      // 손이 가서 번거롭네"): 이 함수(불러오기/복사시 저장당시 금액 고정)가
      // 선금 입력창 값만 채우고 "수동입력 보호" 플래그(dataset.manualEdit)는
      // 안 켜주고 있었음 - 그래서 불러온 직후 품목 하나만 살짝 건드려도
      // calcTotal()의 자동 50% 재계산이 그대로 발동해서 애써 불러온(혹은
      // 저장 당시 직접 입력했던) 선금 금액이 조용히 50% 자동값으로
      // 되돌아가고 있었음. 여기서도 같은 플래그를 켜서 보호되게 함.
      depInp.dataset.manualEdit = '1';
    }
  }
  if (Array.isArray(bd.discountDetail)) {
    var breakdownEl = document.getElementById('discount-breakdown');
    if (breakdownEl) {
      breakdownEl.innerHTML = bd.discountDetail.map(function(d){
        return '<div style="display:flex;justify-content:space-between;padding:2px 0">'+
          '<span>'+d.label+'</span><span>-'+d.amount.toLocaleString()+'원</span></div>';
      }).join('');
    }
  }
  window._lastCalcBreakdown = bd; // 이 상태로 저장(재저장)해도 같은 스냅샷 유지
}

function calcTotal() {
  var curtainTotal = 0;
  document.querySelectorAll('#curtain-body tr').forEach(function(tr){
    // 2026-08-19: isOver/.cprice-over(243cm초과 전용단가) 분기 제거 — 애초에
    // .cprice-over 입력창 자체가 화면에 없어 항상 일반단가로 폴백되던 죽은 코드였고,
    // 정책상 243cm 초과는 순수 경고만 필요(가격은 동일). calcCurtainRow의 .over-warn 참고.
    var price = Math.max(0, getPriceVal(tr.querySelector('.cprice'))||0);
    price = Math.max(0, price);
    var qty = Math.max(0, parseFloat(tr.querySelector('.pnum')?.value)||1);
    curtainTotal += price*qty;
  });
  document.querySelectorAll('#blind-body tr').forEach(function(tr){
    var bw=Math.max(0, parseFloat(tr.querySelector('.bmw')?.value)||0);
    var bh=Math.max(0, parseFloat(tr.querySelector('.bmh')?.value)||0);
    var kind=tr.querySelector('.blind-kind')?.value||'';
    var price=Math.max(0, getPriceVal(tr.querySelector('.blind-price'))||0);
    var extra=parseFloat(tr.querySelector('.blind-extra')?.value)||0;
    var sqmRaw=(bw*bh)/10000;
    var minSqm=getBlindMinSqm(kind);
    if(sqmRaw<minSqm&&sqmRaw>0) sqmRaw=minSqm;
    var sqm=Math.ceil(sqmRaw*10)/10;
    curtainTotal+=Math.round(price*sqm);
  });
  var svcTotal=0;
  document.querySelectorAll('#svc-body tr').forEach(function(tr){
    // 2026-08-14: 부자재 단가는 할인성 마이너스 입력을 실제로 쓰신다고
    // 확인(calcSvcRow와 동일 이유) - 여기서도 Math.max(0,...) 제거.
    svcTotal+=(getPriceVal(tr.querySelector('.sprice'))||0)*
              Math.max(0, (parseFloat(tr.querySelector('.sqty')?.value)||1));
  });
  renderSvcSummary();
  // 2026-08-14: 할인 다중선택(쿠폰) 순차적용 방식으로 교체(선혜님 확인).
  // 검증된 공식(기존 견적서 실 데이터로 역산 검증 완료): 각 %할인은 "남은
  // 제품소계"를 기준으로 순차 계산하고(첫 할인 뺀 금액에서 다음 % 계산),
  // 계산된 할인액들의 합을 "제품소계+부자재/시공비" 총합계에서 차감한다.
  var discountRunning = curtainTotal; // 순차 계산용 - 매 쿠폰마다 줄어듦
  var totalDiscount = 0;
  var discountBreakdown = [];
  var appliedCoupons = []; // 저장용 - 쿠폰ID로 불러오기시 정확히 재선택하기 위함
  // 2026-08-14: 쿠폰 적용 순서를 "설정에 등록한 순서"가 아니라 "타입 기준
  // 자동 정렬(원단위 항상 먼저 → %는 나중)"로 변경(선혜님 요청).
  // 수학적으로 증명됨: %할인은 그 시점 "남은 금액"을 기준으로 계산되므로,
  // 원단위를 먼저 빼서 남은 금액을 줄인 뒤 %를 적용해야 %할인액 자체가
  // 작아진다(차이 = 원단위금액 × %비율, 항상 0 이상 — 원단위 금액이
  // 5,000원이든 10만원이든 이 방향은 절대 바뀌지 않음). 즉 이 순서가
  // 쿠폰 금액이 나중에 바뀌어도 항상 총 할인을 최소화(최종 단가를 최대화)한다.
  // 여러 원단위끼리, 여러 %끼리는 순서 무관(덧셈 교환법칙 / 반올림오차 수준).
  // 직접입력도 이 정렬에 함께 포함시킴 — 직접입력을 원단위로 쓰면 등록된
  // %쿠폰들보다 먼저 적용돼야 같은 원칙이 유지되는데, 예전엔 직접입력이
  // 무조건 맨 마지막으로 고정돼 있어서 이 원칙이 깨지는 구멍이 있었음.
  var discType=document.getElementById('discount-type')?.value||'won';
  var discInput=Math.max(0, parseFloat(document.getElementById('discount')?.value)||0);
  var items = Array.from(document.querySelectorAll('.coupon-check:checked')).map(function(cb){
    return { source:'coupon', el: cb, type: cb.dataset.type, value: parseFloat(cb.dataset.value)||0,
             label: cb.dataset.name, id: cb.dataset.id, name: cb.dataset.name };
  });
  if (discInput > 0) {
    items.push({ source:'manual', type: discType, value: discInput, label: '직접입력' });
  }
  items.sort(function(a, b) {
    var aRank = a.type === 'won' ? 0 : 1;
    var bRank = b.type === 'won' ? 0 : 1;
    return aRank - bRank;
  });
  var manualDiscount = null;
  items.forEach(function(item) {
    var amt = item.type === 'pct' ? Math.round(discountRunning * item.value / 100) : Math.min(item.value, discountRunning);
    amt = Math.max(0, amt);
    totalDiscount += amt;
    discountRunning -= amt;
    if (item.source === 'coupon') {
      discountBreakdown.push({ label: item.label + ' ' + item.value + (item.type==='pct'?'%':'원'), amount: amt });
      appliedCoupons.push({ id: item.id, name: item.name, type: item.type, value: item.value, amount: amt });
    } else {
      discountBreakdown.push({ label: '직접입력 '+(item.type==='pct'?item.value+'%':item.value.toLocaleString()+'원'), amount: amt });
      manualDiscount = { type: item.type, value: item.value, amount: amt };
    }
  });
  var discount = totalDiscount;
  var grand=curtainTotal-discount+svcTotal;
  if(grand<0) grand=0;
  // 2026-08-12: 최종 견적금액 천원단위 절사(내림) 적용 - 당일결제5%/마케팅3%/
  // 입주10%/재구매5% 등 % 할인 적용 후 끝자리가 지저분하게 나오는 걸 방지
  // (선혜님 확인: 반올림이 아니라 절사, 천원단위). 계약금/잔금은 이 절사된
  // 금액을 기준으로 계산되므로 자연히 깔끔한 값이 됨.
  // 2026-08-14: 절사분도 기존 견적서 방식대로 할인 내역에 별도 줄로
  // 명시(선혜님 확인) - 예전엔 절사가 최종금액에 조용히 반영만 되고 얼마나
  // 깎였는지 안 보였음. 쿠폰/직접입력 계산이 끝난 뒤(절사 직전) 절사액을
  // 구해서 breakdown 맨 마지막 줄에 추가.
  if (grand > 0) {
    var flooredGrand = Math.floor(grand/1000)*1000;
    var truncAmt = grand - flooredGrand;
    if (truncAmt > 0) {
      discountBreakdown.push({ label: '끝자리 절사', amount: truncAmt });
      discount += truncAmt; // sum-discount(할인 총액) 표시에도 절사분 반영
    }
    grand = flooredGrand;
  }
  window._lastDiscountBreakdown = discountBreakdown; // 영수증 표시용
  window._lastAppliedDiscounts = { coupons: appliedCoupons, manual: manualDiscount }; // 저장용(쿠폰ID 포함) - 절사는 매번 계산되므로 저장 불필요
  var breakdownEl = document.getElementById('discount-breakdown');
  if (breakdownEl) {
    breakdownEl.innerHTML = discountBreakdown.map(function(d){
      return '<div style="display:flex;justify-content:space-between;padding:2px 0">'+
        '<span>'+d.label+'</span><span>-'+d.amount.toLocaleString()+'원</span></div>';
    }).join('');
  }
  var depInp=document.getElementById('deposit-input');
  var depRaw=getPriceVal(depInp)||0;
  if(grand>0 && depInp && !depInp.dataset.manualEdit){
    var auto50=Math.round(grand*0.5);
    depInp.value=''; depInp.removeAttribute('data-raw');
    depInp.value=auto50.toLocaleString();
    depInp.dataset.raw=String(auto50);
    depRaw=auto50;
  }
  // 2026-08-14: "대기업 방식으로 불변조건 점검"하다 발견 — 할인을 크게(100%
  // 초과 등) 입력해서 grand(총액)가 0이 되면, 위 자동갱신 블록이
  // grand>0 조건 때문에 스킵되어 계약금 입력창에 이전 값(예: 10만원)이
  // 그대로 남아있었음. "총액 0원인데 계약금 10만원"이라는 논리적 모순이
  // 사용자에게 그대로 보일 위험이 있었음. grand<=0이면 계약금도 강제로 0.
  // 2026-08-18(선혜님 발견 — 실제로 재현됨): 위 수정이 depRaw(계산용 변수)만
  // 0으로 만들고, 정작 화면에 보이는 입력창(depInp.value) 자체는 안 건드려서
  // "최종금액 0원인데 계약금 입력창엔 5만원"이 그대로 보이는 문제가 여전히
  // 있었음 — depInp.value도 명시적으로 비워야 완전히 해결됨.
  if (grand <= 0) {
    depRaw = 0;
    if (depInp && depInp.value) {
      depInp.value = '';
      depInp.removeAttribute('data-raw');
    }
  }
  var deposit=depRaw>0 ? depRaw : 0;
  // 수동입력 등으로 계약금이 총액보다 큰 경우 잔금이 음수가 되는 것도 함께 방지
  if (deposit > grand) deposit = grand;
  var balance=grand-deposit;
  // 2026-08-05: 성과매출이 할인을 반영 안 하고 있었음(할인 전 curtainTotal 그대로) —
  // 할인해준 만큼은 실제로 못 받은 돈이니 성과에서도 빠져야 함
  var perf=Math.max(0, curtainTotal-discount);
  document.getElementById('sum-curtain').textContent=curtainTotal.toLocaleString()+'원';
  
  var totalEl = document.getElementById('sum-total');
  if(totalEl) totalEl.textContent = grand.toLocaleString()+'원';
  var depDispEl = document.getElementById('sum-deposit-disp');
  if(depDispEl) depDispEl.textContent = deposit>0 ? deposit.toLocaleString()+'원' : (grand>0 ? Math.round(grand*0.5).toLocaleString()+'원 (예상)' : '—');
  var balDispEl = document.getElementById('sum-balance-disp');
  if(balDispEl) balDispEl.textContent = deposit>0 ? balance.toLocaleString()+'원' : '—';
  var discEl=document.getElementById('sum-discount');
  var discRow=discEl?.closest('.sum-row');
  if(discEl) discEl.textContent=discount>0?'-'+discount.toLocaleString()+'원':'';
  if(discRow) discRow.style.display=discount>0?'flex':'none';
  document.getElementById('sum-svc').textContent=svcTotal.toLocaleString()+'원';
  document.getElementById('sum-total').textContent=grand.toLocaleString()+'원';
  
  document.getElementById('sum-balance').textContent=balance.toLocaleString()+'원';
  document.getElementById('sum-perf').textContent=perf.toLocaleString()+'원';
  // 2026-08-24(선혜님 요청 — "저장된 견적서는 저장 당시 금액으로 고정"):
  // 나중에 이 견적을 다시 열었을 때, 그 사이 할인쿠폰/설정이 바뀌어도 저장
  // 당시 금액 그대로 보이게 하려면 이 breakdown을 저장 시점에 DB에 같이
  // 넣어둬야 함(est-save.js에서 이 값을 읽어감). 매번 계산 끝에 최신값으로 갱신.
  window._lastCalcBreakdown = {
    productSubtotal: curtainTotal, discount: discount, installSubtotal: svcTotal,
    finalTotal: grand, deposit: deposit, balance: balance, performanceRevenue: perf,
    discountDetail: discountBreakdown
  };
}

function delRow(btn) {
  var tr = btn.closest('tr');
  // 2026-08-14: autoUpdateRail과 동일하게 rowIndex 대신 rowUid로 매칭 —
  // 삭제할 행 자체의 레일을 정확히 찾아 지우기 위함(위 autoUpdateRail 주석 참고)
  var rowIdx = tr.dataset.rowUid || tr.rowIndex;
  var svcBody = document.getElementById('svc-body');
  if(svcBody) {
    var railRow=svcBody.querySelector('[data-rail-src="'+rowIdx+'"]');
    if(railRow) railRow.remove();
    var railCostRow=svcBody.querySelector('[data-railcost-src="'+rowIdx+'"]');
    if(railCostRow) railCostRow.remove();
  }
  tr.remove();
  var blindBody=document.getElementById('blind-body');
  var blindTbl=document.getElementById('blind-table');
  if(blindBody&&blindTbl) {
    if(blindBody.querySelectorAll('tr').length===0) {
      blindTbl.style.display='none';
      if(svcBody) {
        var bs=svcBody.querySelector('[data-svc-type="블라인드시공"]');
        if(bs) bs.remove();
      }
    } else {
      autoAddBlindSvc();
    }
    // 2026-08-28(선혜님 지적 - 복사시 옵션추가금 누락과 같은 종류): 블라인드
    // 행을 삭제할 때도 옵션추가금 합계를 다시 계산해야 함 - 안 하면 지운
    // 행의 옵션값이 계속 합계에 남아있거나(과다계상), 마지막 블라인드를
    // 지워도 옵션추가금 행이 안 없어지는 문제가 있었음. recalcBlindOptionExtras
    // 자체가 "합계 0이면 행 제거"까지 처리하므로 blindBody 유무 분기와
    // 무관하게 항상 호출하면 됨.
    recalcBlindOptionExtras();
  }
  calcTotal();
}

function delSvcRow(btn) {
  btn.closest('tr').remove();
  calcTotal();
}

// 2026-08-22: 복사본을 원본 바로 다음 자리가 아니라, 같은 공간(space) 그룹의
// 마지막 행 뒤에 붙이도록 변경. 예전엔 tr.nextSibling에 끼워넣기만 해서,
// 같은 공간 안에 다른 행이 더 있으면 그 사이에 끼어들어 "순서가 이상해진다"는
// 지적(선혜님, 2026-08-22)이 있었음. 같은 공간이 없으면(=원본이 그 공간의
// 마지막 행) 기존과 동일하게 원본 바로 다음에 붙음.
function _findSameSpaceInsertPoint(tr) {
  var space = tr.querySelector('.space-inp')?.value || '';
  var insertAfter = tr;
  var sib = tr.nextElementSibling;
  while (sib && (sib.querySelector('.space-inp')?.value || '') === space) {
    insertAfter = sib;
    sib = sib.nextElementSibling;
  }
  return insertAfter;
}
function copyCurtainRow(btn) {
  var tr=btn.closest('tr');
  var clone=tr.cloneNode(true);
  clone.dataset.rowId='c'+Date.now();
  // 2026-08-14: cloneNode가 dataset.rowUid까지 그대로 복사해버려서, 복사한
  // 행을 수정하면 원본 행의 레일을 침범할 위험이 있었음(rowUid 도입 부수
  // 발견). 복사본은 지워서 다음 autoUpdateRail 호출시 새로 부여되게 함.
  delete clone.dataset.rowUid;
  clone.querySelectorAll('input[data-raw]').forEach(function(inp){
    inp.setAttribute('data-raw',inp.getAttribute('data-raw'));
  });
  var insertAfter = _findSameSpaceInsertPoint(tr);
  insertAfter.parentNode.insertBefore(clone,insertAfter.nextSibling);
  makeRowDraggable(clone);
  if (typeof autoUpdateRail === 'function') autoUpdateRail(clone);
  calcTotal();
}
function copyBlindRow(btn) {
  var tr=btn.closest('tr');
  var clone=tr.cloneNode(true);
  clone.dataset.rowId='b'+Date.now();
  clone.querySelectorAll('input[data-raw]').forEach(function(inp){
    inp.setAttribute('data-raw',inp.getAttribute('data-raw'));
  });
  var insertAfter = _findSameSpaceInsertPoint(tr);
  insertAfter.parentNode.insertBefore(clone,insertAfter.nextSibling);
  makeRowDraggable(clone);
  autoAddBlindSvc();
  // 2026-08-28(선혜님 지적 — "옵션칸에 금액을 넣어도 금액 추가가 안되네",
  // 실제로는 블라인드 행을 복사했을 때 재현됨): autoAddBlindSvc(블라인드
  // 시공비)만 다시 계산하고, 옵션추가금 합계를 다시 계산하는
  // recalcBlindOptionExtras()는 안 불러서, 복사된 행에 옵션값이 있어도(또는
  // 원본 행 옵션값이 있는 상태로 복사해도) "레일·시공비·기타"의 옵션추가금
  // 합계가 새로 추가된 행만큼 안 늘어나고 예전 값에 멈춰있었음.
  recalcBlindOptionExtras();
  calcTotal();
}
function copySvcRow(btn) {
  var tr=btn.closest('tr');
  var clone=tr.cloneNode(true);
  clone.dataset.rowId='s'+Date.now();
  clone.querySelectorAll('input[data-raw]').forEach(function(inp){
    inp.setAttribute('data-raw',inp.getAttribute('data-raw'));
  });
  tr.parentNode.insertBefore(clone,tr.nextSibling);
  clone.removeAttribute('data-svc-type');
  clone.removeAttribute('data-rail-src');
  clone.removeAttribute('data-rail-svc-src');
  calcTotal();
}

// 레일/시공비/기타 항목을 그룹으로 묶어 요약카드로 보여줌 (선혜님 피드백: 항목이 너무 많아 한눈에 안 들어옴)
// - 실측+시공비: 지역별 실측비/시공비(레일시공비 제외)
// - 레일 자재비: 레일 자재 + 레일 시공비를 합쳐서 표시, 괄호안에 세부 내역 나열
// - 전동 옵션: 구분이 '전동'인 항목
// - 기타: 위 세 그룹에 안 속하는 나머지(부자재, 블라인드시공, 직접입력한 기타 등)
function renderSvcSummary() {
  var card = document.getElementById('svc-summary-card');
  if (!card) return;
  var rows = Array.from(document.querySelectorAll('#svc-body tr'));
  if (rows.length === 0) { card.innerHTML = '<div style="font-size:11px;color:#B0A99F">레일/시공비/기타 항목이 없습니다</div>'; return; }

  var groups = {
    measureInstall: { label: '실측 + 시공비', sum: 0, details: [] },
    rail: { label: '레일 자재비', sum: 0, details: [] },
    motor: { label: '옵션 추가금', sum: 0, details: [] },
    etc: { label: '기타', sum: 0, details: [] }
  };

  // 2026-08-15: 옵션추가금이 이제 독립된 svc 행(data-svc-type="옵션추가금")으로
  // 분리되어 있으므로, blind-body를 다시 순회해서 재계산할 필요 없이
  // 아래 rows.forEach 루프에서 다른 행들과 동일하게 자연스럽게 그룹핑됨.

  rows.forEach(function(tr) {
    var type = tr.querySelector('td select')?.value || '';
    var priceInp = tr.querySelector('.sprice');
    var qtyInp = tr.querySelector('.sqty');
    var price = Math.max(0, getPriceVal(priceInp) || 0);
    var qty = Math.max(0, parseFloat(qtyInp?.value) || 1);
    var amt = price * qty;
    var label = tr.querySelectorAll('td')[1]?.querySelector('input')?.value || '';
    var isRailMaterial = tr.hasAttribute('data-rail-src');   // 레일 자재(1,600원×레일수)
    var isRailInstall  = tr.hasAttribute('data-railcost-src'); // 레일 시공비(25,000원)
    var isRegionInstall = tr.hasAttribute('data-install-base');

    if (isRailMaterial) {
      groups.rail.sum += amt;
      groups.rail.details.push(label);
    } else if (isRailInstall) {
      // 2026-08-14: 예전엔 레일 시공비도 "레일 자재비" 그룹에 들어가서, 이름은
      // 자재비인데 시공비가 섞여있는 모순이 있었음(선혜님 지적). 시공비 성격이
      // 맞으므로 "실측 + 시공비" 그룹으로 이동.
      groups.measureInstall.sum += amt;
      groups.measureInstall.details.push(label);
    } else if (isRegionInstall) {
      // 2026-08-15: 옵션추가금이 이제 독립된 행으로 분리되어 지역시공비
      // 행에는 순수 지역비만 있으므로, 예전처럼 옵션분을 차감할 필요가 없어짐.
      groups.measureInstall.sum += amt;
      groups.measureInstall.details.push(label);
    } else if (type === '전동') {
      groups.motor.sum += amt;
      groups.motor.details.push(label);
    } else if (type === '실측비' || type === '시공비') {
      groups.measureInstall.sum += amt;
      groups.measureInstall.details.push(label);
    } else {
      groups.etc.sum += amt;
      groups.etc.details.push(label);
    }
  });

  var html = '';
  ['measureInstall', 'rail', 'motor', 'etc'].forEach(function(key) {
    var g = groups[key];
    if (g.details.length === 0) return;
    var detailText = g.details.filter(Boolean).join(', ');
    html += '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0">'
      + '<div><span style="font-size:12px;font-weight:700;color:#282828">' + escHtml(g.label) + '</span>'
      + (detailText ? '<div style="font-size:11px;color:#B0A99F;margin-top:1px">' + escHtml(detailText) + '</div>' : '')
      + '</div>'
      + '<span style="font-size:13px;font-weight:700;color:#282828;white-space:nowrap">' + g.sum.toLocaleString() + '원</span>'
      + '</div>';
  });
  card.innerHTML = html || '<div style="font-size:11px;color:#B0A99F">레일/시공비/기타 항목이 없습니다</div>';
}

function toggleSvcDetail() {
  var wrap = document.getElementById('svc-detail-wrap');
  var btn = document.getElementById('svc-detail-toggle');
  if (!wrap || !btn) return;
  var isHidden = wrap.style.display === 'none';
  wrap.style.display = isHidden ? '' : 'none';
  btn.textContent = isHidden ? '상세 항목 접기 ▴' : '상세 항목 펼치기 ▾';
}

/* ══════════════════════════════════════════════════
   커튼/블라인드 행 드래그 순서변경 (2026-08-05 신규, 2026-08-22 재작성)
   행 오른쪽 끝 ⠿ 핸들을 드래그해서 위/아래로 옮길 수 있음.
   2026-08-22: 기존엔 HTML5 네이티브 드래그앤드롭(draggable+dragstart)으로
   구현돼 있었는데, 이 방식은 iOS Safari 등 터치 화면에서는 애초에
   dragstart 자체가 발생하지 않아 아이패드/갤럭시탭에서 절대 작동하지
   않는 근본적 제약이 있었음(선혜님 PC 확인 결과 PC에서도 안 됨 —
   구버전 브라우저에서 dragover 리스너가 tbody 레벨 1곳에만 걸려있어
   테이블이 가로 스크롤 컨테이너 안에 있을 때 좌표 기준이 어긋나는
   사례도 있었음). Pointer Events(마우스+터치+펜 공통)로 완전히
   재작성해서 PC/태블릿 모두에서 동일하게 동작하도록 함.
   ══════════════════════════════════════════════════ */
function makeRowDraggable(tr) {
  var handle = tr.querySelector('.row-drag-handle');
  if (!handle || handle.dataset.dragBound) return;
  handle.dataset.dragBound = '1';
  handle.style.touchAction = 'none'; // 터치로 핸들을 잡았을 때 화면 스크롤과 충돌하지 않도록

  handle.addEventListener('pointerdown', function(e) {
    e.preventDefault();
    var tbody = tr.parentNode;
    if (!tbody) return;
    tr.classList.add('dragging-row');

    // 2026-08-22: setPointerCapture(handle)를 썼더니, 드래그 중 행이
    // insertBefore로 DOM 안에서 재배치되는 순간(캡처 대상 요소 자신이
    // 옮겨짐) 브라우저가 캡처를 자동으로 풀어버려서 그 이후 pointermove가
    // 더 이상 안 들어오는 문제가 있었음(재현 확인: 첫 재배치까지만 되고
    // 이후 멈춤 — "위치 이동이 안 된다"는 증상과 일치). 리스너를 위치가
    // 안 바뀌는 document에 걸어서 재배치와 무관하게 계속 이벤트를 받도록 수정.
    function onMove(ev) {
      var after = _getDragAfterRow(tbody, ev.clientY);
      if (after == null) { if (tbody.lastElementChild !== tr) tbody.appendChild(tr); }
      else if (after !== tr) { tbody.insertBefore(tr, after); }
    }
    function onUp() {
      tr.classList.remove('dragging-row');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      calcTotal();
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  });
}

// 2026-08-22: pointer 방식은 각 행의 핸들에서 직접 처리하므로 tbody 레벨
// 리스너가 더 이상 필요 없음 — 기존 호출부(addCurtainRow 등)와의 호환을
// 위해 함수 자체는 남겨두되 아무 동작도 하지 않음(no-op).
function setupRowDragReorder(tbodyId) {}

function _getDragAfterRow(tbody, y) {
  var rows = Array.from(tbody.querySelectorAll('tr:not(.dragging-row)'));
  var closest = { offset: -Infinity, element: null };
  rows.forEach(function(row) {
    var box = row.getBoundingClientRect();
    var offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset: offset, element: row };
  });
  return closest.element;
}
