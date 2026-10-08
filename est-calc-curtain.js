/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 커튼 행 계산 (추가/폭수·금액 계산/레일 자동/복사)
   2026-09-28(선혜님 - "밑에 세개를 그러면 놔두는게 베스트야?" - est-product-calc.js는 버그 수정이 71번 중 51번
   몰린 파일): 1,340줄짜리 est-product-calc.js에서 "커튼" 함수만 분리함. 모든 최상위 문장이 함수 선언이라
   로드 시점에 실행되는 코드가 없어 위치만 옮겨도 동작이 안 바뀜(전역 함수 소스 비교로 확인).
   포함: addCurtainRow, calcCurtainRow, autoUpdateRail, copyCurtainRow
   ══════════════════════════════════════════════════ */

function addCurtainRow() {
  if (typeof unfreezeEstimateIfEditing === 'function') unfreezeEstimateIfEditing();
  var tbody = document.getElementById('curtain-body');
  var tr = document.createElement('tr');
  tr.className = 'row-curtain';
  // 2026-09-11(선혜님 확인 - "우리는 거의 모든 제품이 형상가공 들어가기
  // 때문에 기본이 O 야"): 매번 체크해야 했던 형상가공 칸을 기본 체크된
  // 상태로 시작 - 캔가공소 거래처 설정에 defaultShapeProcess를 false로
  // 등록해두면(예외적으로 형상가공 안 하는 경우가 생기면) 그 설정을
  // 따르고, 등록 안 돼있으면(대부분의 경우) 기본값인 O(체크됨)로 시작.
  var shapeProcessChecked = getDefaultShapeProcessChecked() ? ' checked' : '';
  tr.innerHTML =
    '<td data-label="공간"><input type="text" class="space-inp" placeholder="공간" style="'+INP+';cursor:pointer;caret-color:transparent" readonly onclick="openSpacePicker(this)"></td>'+
    '<td data-label="제품명" style="padding:6px 8px">'+
      '<input type="text" placeholder="제품명 (고객용)" class="c-display-name" style="'+INP+'">'+
      '<div class="inner-fields print-hide">'+
        '<div class="inner-row">'+
          '<input type="text" list="fabric-list" placeholder="원단명" class="c-fabric inner-inp">'+
          '<input type="text" list="fabric-vendor-list" placeholder="원단 거래처" class="c-vendor inner-inp" style="width:72px">'+
          // 2026-09-09(선혜님 확인 - "커튼은 무조건 제작을 해애해") - 이
          // 체크박스(가공소 여부를 항목마다 표시하던 것) 제거. 커튼은
          // 예외 없이 항상 제작(가공소)을 거치므로, collectVendorGroups()가
          // 체크 여부와 무관하게 모든 커튼 항목에 자동으로 가공소 발주
          // 라인을 추가함(등록된 가공소가 1곳일 때) - 사람이 매번 체크할
          // 필요 없어짐.
          '<input type="text" placeholder="컬러" class="c-color inner-inp" style="width:60px">'+
          // 2026-09-11(선혜님이 실제 캔가공소 발주서 양식 확인해주심):
          // 원단량(마수)은 자동계산이 아니라 직접 입력 - 예전엔 표시전용
          // span("원단량: —")이라 실제로 입력할 방법이 없었음. 형상가공
          // 여부(O/X)도 발주서에 필요한데 이 개념 자체가 없었음 - 체크박스로
          // 신설(체크=O=형상가공 함).
          '<input type="text" placeholder="원단량(예: 10.2마)" class="c-yardage inner-inp" style="width:100px">'+
          // 2026-09-11(선혜님 지시 - "관련되게 원단 발주서까지도 그
          // 가격이 뜨게 해야 하는데"): 원단량(마수)에 단가를 곱해서
          // 원단발주서에 총액을 표시하려면 단가가 필요함.
          '<input type="text" inputmode="numeric" placeholder="마당 단가" class="c-fabric-unit-price inner-inp" style="width:80px">'+
          '<label style="display:flex;align-items:center;gap:2px;font-size:11px;color:var(--sub);white-space:nowrap"><input type="checkbox" class="c-shape-process"'+shapeProcessChecked+' style="width:14px;height:14px">형상가공</label>'+
        '</div>'+
        '<div class="inner-row" style="margin-top:2px">'+
          '<input type="text" list="vendor-list" placeholder="레일/부자재 거래처 (예: 목성)" class="c-rail-vendor inner-inp" style="width:140px">'+
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
      // 2026-09-04(선혜님 지적 - 실제 스크린샷으로 "이 방식이 최선이니?"
      // 평가 요청, 실제 재현 성공): 처음엔 이 버튼을 제품명 입력창 옆에
      // 나란히 뒀는데, 그러면 제품명 칸 폭이 줄어들어서 실제 제품명
      // 텍스트가 잘려 보이는 부작용이 있었음(재현: 필요폭 131px인데
      // 표시폭 98.6px로 줄어듦) - 더 중요한 정보(제품명)를 침범하지 않게
      // 오른쪽 액션 버튼들(드래그/복사/삭제) 옆, 작은 아이콘 형태로 이동.
      '<button type="button" class="inner-toggle-btn print-hide" onclick="toggleInnerFields(this)" title="원단명·거래처·컬러 입력" style="min-height:32px;min-width:32px;padding:6px;border:1px solid var(--border);border-radius:4px;background:#fff;cursor:pointer;font-size:13px;color:var(--sub);margin-right:2px" aria-label="거래처 정보">🏢</button>'+
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

function calcCurtainRow(el, skipPnumReset) {
  var tr = el.closest('tr');
  // 2026-08-24(선혜님 발견 — "폭수를 한 폭 줄이거나 늘릴 때도 있는데 수정이
  // 안 된다"): 폭수(.pnum) 칸 자체를 직접 고쳐도, 곧바로 아래 자동계산 로직이
  // "수동으로 안 고쳤다"고 판단해서 그 값을 도로 자동계산값으로 덮어쓰고
  // 있었음 — 폭수 입력칸을 직접 건드린 게 트리거였을 때만 manual 표시를
  // 남기는 코드가 통째로 빠져있었음. 이제 직접 고치면 그 값이 유지되고,
  // 가로(mw)/세로(mh)/주름(pleat)을 바꾸면 다시 자동계산으로 돌아감(원래
  // 자동계산이 도움이 되는 경우가 더 많아서, 치수를 다시 잡을 땐 새로
  // 제안받는 게 자연스러움).
  // 2026-09-08(선혜님 지시 - 전수감사 중 발견): restoreLineItemsToForm/
  // loadDraft가 "가로길이 입력창(mw)"을 인자로 이 함수를 불러서 금액 등
  // 부수계산을 트리거하는데, 이게 정확히 "사용자가 가로길이를 방금
  // 수정했다"는 신호와 똑같이 취급되어, 방금 복원한 저장된 폭수(pnum)의
  // manual 표시를 무조건 지워버리고 자동계산값으로 덮어쓰고 있었음 -
  // 견적서를 다시 열 때마다 저장된 정확한 폭수가 조용히 바뀌는 심각한
  // 버그(재현: pnum=5로 저장했는데 다시 열면 자동계산값 7로 바뀜).
  // skipPnumReset=true로 부르면(복원 상황 전용) 이 "가로길이 변경 감지"를
  // 건너뛰어 이미 복원된 pnum이 안전하게 유지됨.
  if (el.classList && el.classList.contains('pnum')) {
    el.dataset.manual = '1';
  } else if (!skipPnumReset && el.classList && (el.classList.contains('mw') || el.classList.contains('mh') || el.classList.contains('pleat-type'))) {
    var pnumEl0 = tr.querySelector('.pnum');
    if (pnumEl0) delete pnumEl0.dataset.manual;
  }
  var mw = Math.max(0, parseFloat(tr.querySelector('.mw')?.value)||0);
  var mh = Math.max(0, parseFloat(tr.querySelector('.mh')?.value)||0);
  // 2026-08-05: 제작높이 힌트만 레일타입에 따라 다르게 계산 — 일반레일 -3cm / 전동레일 -5cm.
  // 실측/시공 의뢰서 문서(est-doc-request.js)는 이 보정 없이 원래 실측값 그대로 출력하는 게 맞음(선혜님 확인).
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
  // 폭수 추천 규칙(주름형태별 허용 소수점 포함)은 est-calc-rules.js의 calcSuggestedPanels 한 곳에만 있음
  var sugP = calcSuggestedPanels(mw, pleat);
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
  // 안내 문구/기준(250/270/290cm)은 est-calc-rules.js의 curtainHeightFeeWarning 한 곳에만 있음
  var heightWarnText = curtainHeightFeeWarning(mh);
  if (heightWarnText) {
    heightFeeWarnEl.textContent = heightWarnText;
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
  if (window._estEditState && window._estEditState.skipAutoSvc) return; // 2026-10-08: 저장된 시공 행을 여는 중
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
  // 레일 자수/단가/문구 규칙은 est-calc-rules.js의 railMaterialSpec 한 곳에만 있음
  var railSpec = railMaterialSpec(mw);
  var jaR = railSpec.ja;

  // 레일 (자재) 행: 단가 1,600원 × 레일수
  var existing = svcBody.querySelector('[data-rail-src="'+rowIdx+'"]');
  if(existing) {
    // 2026-09-01(선혜님 지시 - "조절레일 (타공형) 이 기본이야"): 그냥 "레일"
    // 이라고만 나오던 것을, 실제로 기본으로 쓰는 레일 종류(조절레일/타공형)를
    // 명시하도록 변경 - 시공요청서에도 이 텍스트에서 레일길이를 추출해서
    // 보여주니, 시공기사님이 어떤 레일인지 더 명확히 알 수 있게 됨.
    // 2026-09-18(선혜님 - "그럼 청구는 되지만 실측이나 시공에서 안뜨잖아"로
    // svc-body에 "위치" 칸을 신설하면서, td 순서를 세는 대신 클래스명으로
    // 찾도록 바꿈 - 컬럼이 나중에 또 바뀌어도 안 깨지게. 위치는 이제
    // 내용 텍스트에 안 합치고 별도 칸(.svc-space)에 정확히 넣음.
    var spaceInp = existing.querySelector('.svc-space'); if(spaceInp) spaceInp.value = space||'';
    var inp=existing.querySelector('.svc-content'); if(inp) inp.value=railSpec.content;
    // 2026-09-19(선혜님 - "다시 열어보니 실측+레일비가... 이게 말이
    // 되니?????????"): 사용자가 이 단가를 직접 수정해뒀으면(manualOverride)
    // 자동계산이 그 값을 덮어쓰지 않고 그대로 둠. 수량도 마찬가지 -
    // override 상태에서는 "단가=최종금액, 수량=1"이 원칙이므로, 레일
    // 자수가 바뀌어도(예: 커튼 가로 재입력) 수량을 자동 자수로 되돌리지
    // 않음 - 안 그러면 단가는 유지돼도 수량이 곱해져서 최종금액이 다시
    // 부풀려짐(2026-09-19 "안됐잖아!!!!!"로 실제 재현된 바로 그 문제).
    if (!existing.dataset.manualOverride) {
      var pinp=existing.querySelector('.sprice'); if(pinp){ pinp.setAttribute('data-raw',String(railSpec.unitPrice)); pinp.value=(railSpec.unitPrice).toLocaleString(); }
      var qinp=existing.querySelector('.sqty'); if(qinp) qinp.value=jaR;
    }
    calcSvcRow(existing.querySelector('.sprice'));
  } else {
    addSvcRow();
    var newRow = svcBody.lastElementChild;
    newRow.setAttribute('data-rail-src', rowIdx);
    var sel=newRow.querySelector('.svc-kind'); if(sel) sel.value='레일';
    var spaceInp=newRow.querySelector('.svc-space'); if(spaceInp) spaceInp.value = space||'';
    var inp=newRow.querySelector('.svc-content'); if(inp) inp.value=railSpec.content;
    var pinp=newRow.querySelector('.sprice'); if(pinp){ pinp.setAttribute('data-raw',String(railSpec.unitPrice)); pinp.value=(railSpec.unitPrice).toLocaleString(); }
    var qinp=newRow.querySelector('.sqty'); if(qinp) qinp.value=jaR;
    calcSvcRow(pinp);
  }

  // 레일 시공비 규칙은 est-calc-rules.js의 railInstallSpec 한 곳에만 있음
  var installSpec = railInstallSpec();

  // 레일 시공비 행: 단가 25,000원 × 1개 (레일수와 무관, 창문 1개 시공당 고정)
  var existingCost = svcBody.querySelector('[data-railcost-src="'+rowIdx+'"]');
  if(existingCost) {
    var cSpaceInp=existingCost.querySelector('.svc-space'); if(cSpaceInp) cSpaceInp.value = space||'';
    var cinp=existingCost.querySelector('.svc-content'); if(cinp) cinp.value=installSpec.content;
    if (!existingCost.dataset.manualOverride) {
      var cpinp=existingCost.querySelector('.sprice'); if(cpinp){ cpinp.setAttribute('data-raw',String(installSpec.price)); cpinp.value=(installSpec.price).toLocaleString(); }
    }
    var cqinp=existingCost.querySelector('.sqty'); if(cqinp) cqinp.value=installSpec.qty;
    calcSvcRow(existingCost.querySelector('.sprice'));
  } else {
    addSvcRow();
    var newCostRow = svcBody.lastElementChild;
    newCostRow.setAttribute('data-railcost-src', rowIdx);
    var csel=newCostRow.querySelector('.svc-kind'); if(csel) csel.value='시공비';
    var cSpaceInp=newCostRow.querySelector('.svc-space'); if(cSpaceInp) cSpaceInp.value = space||'';
    var cinp=newCostRow.querySelector('.svc-content'); if(cinp) cinp.value=installSpec.content;
    var cpinp=newCostRow.querySelector('.sprice'); if(cpinp){ cpinp.setAttribute('data-raw',String(installSpec.price)); cpinp.value=(installSpec.price).toLocaleString(); }
    var cqinp=newCostRow.querySelector('.sqty'); if(cqinp) cqinp.value=installSpec.qty;
    calcSvcRow(cpinp);
  }

  calcTotal();
}
function copyCurtainRow(btn) {
  var tr=btn.closest('tr');
  var clone=tr.cloneNode(true);
  _copySelectValues(tr, clone);
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
