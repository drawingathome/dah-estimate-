/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 블라인드 행 계산 (추가/최소면적/옵션 추가금/부자재 자동/복사)
   2026-09-28(선혜님 - "밑에 세개를 그러면 놔두는게 베스트야?"): est-product-calc.js에서 "블라인드" 함수만 분리함.
   코드 내용은 한 줄도 안 바꾸고 위치만 옮김(전역 함수 소스 비교로 확인).
   포함: addBlindRow, refreshBlindVendorOptions, calcBlindRow, recalcBlindOptionExtras,
         autoAddBlindSvc, copyBlindRow
   ══════════════════════════════════════════════════ */


function addBlindRow() {
  if (typeof unfreezeEstimateIfEditing === 'function') unfreezeEstimateIfEditing();
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
          '<input type="text" list="blind-list" placeholder="원단명" class="inner-inp b-fabric">'+
          // 2026-09-09(선혜님 지시 - "블라인드도 윈텍과 덱스터중 한 곳이
          // 되어야 해"): 자유입력(자동완성)이었던 걸 필수 선택 드롭다운으로
          // 변경 - 오타/누락 없이 반드시 등록된 거래처 중 하나를 고르게 함.
          // 처음엔 빈 채로 만들고, 거래처 목록이 로드되면(설정에서 blind
          // 카테고리로 등록된 곳들) refreshBlindVendorOptions()가 채움 -
          // 새 업체가 나중에 추가되면 코드 수정 없이 자동으로 선택지에 반영됨.
          '<select class="inner-inp b-vendor" required style="width:72px"><option value="">거래처 선택</option></select>'+
          '<input type="text" placeholder="컬러" class="inner-inp b-color" style="width:60px">'+
          // 2026-09-09(선혜님 지적 - "블라인드는 끈길이도 적을 수 있게
          // 해줘야 하는데 그게 안되네"): 새 필드 신설 - 실제 발주서
          // "내용" 칸에 손잡이 방향과 함께 표시됨.
          '<input type="text" placeholder="끈길이" class="inner-inp b-cord-length" style="width:60px">'+
          // 2026-09-11(선혜님이 실제 블라인드 거래처 발주서 양식(윈텍/덱스터)
          // 보여주심 - "넣을 부분이 보이지??": 실제 양식엔 있는데 지금 앱엔
          // 아예 없던 두 정보, "하단바"(하단감쌈 등 마감방식)와 "코멘트"
          // (원코드 원기둥형 투명 같은 자유 메모)를 신설.
          '<input type="text" placeholder="하단바" class="inner-inp b-bottom-bar" style="width:60px">'+
          '<input type="text" placeholder="코멘트" class="inner-inp b-comment" style="width:90px">'+
        '</div>'+
      '</div>'+
    '</td>'+
    '<td data-label="종류"><select class="blind-kind" onchange="calcBlindRow(this)" style="'+SEL+'">'+
      '<option>롤스크린</option><option>더블 롤블라인드</option><option>알루미늄</option><option>우드</option>'+
      '<option>허니콤</option><option>로만쉐이드</option><option>기타</option>'+
    '</select></td>'+
    '<td data-label="손잡이"><select class="handle-dir" style="'+SEL+'"><option>좌손</option><option>우손</option><option>노코드</option><option>기타</option></select></td>'+

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
      '<button type="button" class="inner-toggle-btn print-hide" onclick="toggleInnerFields(this)" title="원단명·거래처·컬러 입력" style="min-height:32px;min-width:32px;padding:6px;border:1px solid var(--border);border-radius:4px;background:#fff;cursor:pointer;font-size:13px;color:var(--sub);margin-right:2px" aria-label="거래처 정보">🏢</button>'+
      '<span class="row-drag-handle print-hide" title="드래그해서 순서 바꾸기" style="cursor:grab;padding:4px 6px;color:var(--sub);user-select:none;display:inline-block">⠿</span>'+
      '<button class="copy-btn print-hide" onclick="copyBlindRow(this)">⧉</button>'+
      '<button class="del-btn print-hide" onclick="delRow(this)">✕</button>'+
    '</td>';
  tbody.appendChild(tr);
  makeRowDraggable(tr);
  setupRowDragReorder('blind-body');
  autoAddBlindSvc();
  renderEmptyState();
  if (typeof refreshBlindVendorOptions === 'function') refreshBlindVendorOptions();
}

// 2026-09-09: 블라인드 거래처 select들을 전부(새 행 포함) 최신 거래처
// 목록(blind 카테고리)으로 채움 - 설정탭에서 거래처가 추가/변경될 때마다
// 다시 호출하면 항상 최신 상태 유지. 기존 선택값은 목록에 남아있으면
// 그대로 보존.
function refreshBlindVendorOptions() {
  if (!Array.isArray(window._dahVendorListRaw)) return;
  var blindVendors = window._dahVendorListRaw.filter(function(v) {
    return v && Array.isArray(v.categories) && v.categories.indexOf('blind') >= 0;
  });
  document.querySelectorAll('.b-vendor').forEach(function(sel) {
    var prevValue = sel.value;
    var optsHtml = '<option value="">거래처 선택</option>';
    blindVendors.forEach(function(v) {
      optsHtml += '<option value="'+String(v.name||'').replace(/"/g,'&quot;')+'">'+String(v.name||'')+'</option>';
    });
    sel.innerHTML = optsHtml;
    if (prevValue && blindVendors.some(function(v){ return v.name === prevValue; })) sel.value = prevValue;
  });
}

// getBlindMinSqm(종류별 최소 청구 면적)은 est-calc-rules.js로 옮김(계산 규칙은 그 파일 한 곳에만 둠)

function calcBlindRow(el) {
  var tr = el.closest('tr');
  var bw = Math.max(0, parseFloat(tr.querySelector('.bmw')?.value)||0);
  var bh = Math.max(0, parseFloat(tr.querySelector('.bmh')?.value)||0);
  var kind = tr.querySelector('.blind-kind')?.value||'';
  var price = Math.max(0, getPriceVal(tr.querySelector('.blind-price'))||0);
  var extra = parseFloat(tr.querySelector('.blind-extra')?.value)||0;
  // 청구 면적 규칙(최소면적 적용 + 0.1㎡ 올림)은 est-calc-rules.js의 calcBlindBillableSqm 한 곳에만 있음
  // (예전엔 합계 계산(calcTotal)에도 똑같은 계산이 복사돼 있었음)
  var minSqm = getBlindMinSqm(kind);
  var billable = calcBlindBillableSqm(bw, bh, minSqm);
  var sqmRaw = billable.sqmRaw;
  var sqm = billable.sqm;
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
  var sel=row.querySelector('.svc-kind'); if (sel) sel.value='전동';
  var inp=row.querySelector('.svc-content'); if (inp) inp.value = optNames.length ? optNames.join(', ') : '옵션 추가금';
  if (!row.dataset.manualOverride) {
    var pinp=row.querySelector('.sprice'); if(pinp){ pinp.setAttribute('data-raw', String(extraSum)); pinp.value=extraSum.toLocaleString(); }
  }
  var qinp=row.querySelector('.sqty'); if (qinp) qinp.value = 1;
  calcSvcRow(row.querySelector('.sprice'));
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
  var sel=row.querySelector('.svc-kind'); if(sel) sel.value='시공비';
  var inp=row.querySelector('.svc-content'); if(inp) inp.value='블라인드 시공비 ('+blindCount+'개)';
  if (!row.dataset.manualOverride) {
    var pinp=row.querySelector('.sprice'); if(pinp){ pinp.setAttribute('data-raw','10000'); pinp.value=(10000).toLocaleString(); }
  }
  // 2026-09-19: 레일과 동일한 이유로, override 상태에서는 블라인드
  // 개수가 바뀌어도 수량을 되돌리지 않음(단가=최종금액 원칙 유지).
  if (!row.dataset.manualOverride) {
    var qinp=row.querySelector('.sqty'); if(qinp) qinp.value=blindCount;
  }
  calcSvcRow(row.querySelector('.sprice'));
}
function copyBlindRow(btn) {
  var tr=btn.closest('tr');
  var clone=tr.cloneNode(true);
  _copySelectValues(tr, clone);
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
