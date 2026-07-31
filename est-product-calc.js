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
    '<td><input type="text" class="space-inp" placeholder="공간" style="'+INP+';cursor:pointer;caret-color:transparent" readonly onclick="openSpacePicker(this)"></td>'+
    '<td style="padding:6px 8px">'+
      '<input type="text" placeholder="제품명 (고객용)" class="c-display-name" style="'+INP+'">'+
      '<div class="inner-fields print-hide">'+
        '<div class="inner-row">'+
          '<input type="text" list="fabric-list" placeholder="원단명" class="c-fabric inner-inp">'+
          '<input type="text" list="vendor-list" placeholder="거래처" class="c-vendor inner-inp" style="width:72px">'+
          '<input type="text" placeholder="컬러" class="c-color inner-inp" style="width:60px">'+
          '<span class="c-yardage">원단량: —</span>'+
        '</div>'+
      '</div>'+
    '</td>'+
    '<td><select class="pleat-type" onchange="calcCurtainRow(this)" style="'+SEL+'">'+
      '<option value="나비주름형">나비주름</option><option value="민자형">민자</option></select></td>'+
    '<td><select class="open-type" style="'+SEL+'">'+
      '<option value="양개형">양개</option><option value="편개형">편개</option></select></td>'+
    '<td><select class="hem-type" style="'+SEL+'">'+
      '<option>리드</option><option>5cm</option><option>8cm</option></select></td>'+
    '<td>'+
      '<input type="number" placeholder="cm" class="mw" oninput="calcCurtainRow(this)" style="'+INP+'">'+
      '<span class="sub-size fw-display"></span>'+
    '</td>'+
    '<td>'+
      '<input type="number" placeholder="cm" class="mh" oninput="calcCurtainRow(this)" style="'+INP+'">'+
      '<span class="sub-size fh-display"></span>'+
    '</td>'+
    '<td><input type="number" class="pnum" value="2" oninput="calcCurtainRow(this)" style="'+INP+'"></td>'+
    '<td><input type="text" inputmode="numeric" placeholder="단가" class="cprice" oninput="fmtPrice(this);calcCurtainRow(this)" onfocus="fmtPriceFocus(this)" onblur="fmtPriceBlur(this);calcCurtainRow(this)" style="'+INP+'"></td>'+
    '<td class="amt camt">—</td>'+
    '<td style="white-space:nowrap">'+
      '<button class="copy-btn print-hide" onclick="copyCurtainRow(this)" title="복사">⧉</button>'+
      '<button class="del-btn print-hide" onclick="delRow(this)">✕</button>'+
    '</td>';
  tbody.appendChild(tr);
  renderEmptyState();

  // 레일 / 레일 시공비는 가로(mw) 입력 시 autoUpdateRail()에서 자동 생성/계산됨
}

function calcCurtainRow(el) {
  var tr = el.closest('tr');
  var mw = Math.max(0, parseFloat(tr.querySelector('.mw')?.value)||0);
  var mh = Math.max(0, parseFloat(tr.querySelector('.mh')?.value)||0);
  var fw = mw, fh = mh>0 ? mh-3 : 0;
  var pleat = tr.querySelector('.pleat-type')?.value||'민자형';
  var fwDisp = tr.querySelector('.fw-display');
  var fhDisp = tr.querySelector('.fh-display');
  if(fwDisp) fwDisp.textContent = mw?'제작 '+fw+'cm':'';
  if(fhDisp) fhDisp.textContent = mh?'제작 '+fh+'cm':'';
  
  var ratio = pleat==='나비주름형' ? 2.0 : 1.5;
  var sugP = Math.max(0, Math.ceil((mw*ratio)/130));
  var pnumEl = tr.querySelector('.pnum');
  if(pnumEl && !pnumEl.dataset.manual) pnumEl.value = sugP||1;
  var pnum = Math.max(0, parseFloat(tr.querySelector('.pnum')?.value)||1);
  
  var mhEl = tr.querySelector('.mh');
  var overWarnEl = tr.querySelector('.over-warn');
  if(!overWarnEl) {
    overWarnEl = document.createElement('div');
    overWarnEl.className = 'over-warn';
    overWarnEl.style.cssText = 'display:none;font-size:11px;color:#F06E2D;font-weight:700;margin-top:3px;white-space:nowrap';
    overWarnEl.textContent = '⚠️ 243cm 초과 — 2단 제작 필요';
    mhEl?.parentNode?.appendChild(overWarnEl);
  }
  if(mhEl) mhEl.style.borderBottom = fh>243 ? '2px solid #F06E2D' : '';
  if(overWarnEl) overWarnEl.style.display = fh>243 ? 'block' : 'none';
  
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
  var rowIdx = curtainTr.rowIndex;
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

  // 레일 (자재) 행: 단가 1,600원 × 레일수
  var existing = svcBody.querySelector('[data-rail-src="'+rowIdx+'"]');
  if(existing) {
    var tds = existing.querySelectorAll('td');
    if(tds[1]) { var inp=tds[1].querySelector('input'); if(inp) inp.value=(space?space+' ':' ')+'레일 '+jaR+'자'; }
    if(tds[2]) { var inp=tds[2].querySelector('input'); if(inp){ inp.setAttribute('data-raw','1600'); inp.value=(1600).toLocaleString(); } }
    if(tds[3]) { var inp=tds[3].querySelector('input'); if(inp) inp.value=jaR; }
    calcSvcRow(tds[2]?.querySelector('input'));
  } else {
    addSvcRow();
    var newRow = svcBody.lastElementChild;
    newRow.setAttribute('data-rail-src', rowIdx);
    var tds = newRow.querySelectorAll('td');
    if(tds[0]) { var sel=tds[0].querySelector('select'); if(sel) sel.value='레일'; }
    if(tds[1]) { var inp=tds[1].querySelector('input'); if(inp) inp.value=(space?space+' ':' ')+'레일 '+jaR+'자'; }
    if(tds[2]) { var inp=tds[2].querySelector('input'); if(inp){ inp.setAttribute('data-raw','1600'); inp.value=(1600).toLocaleString(); } }
    if(tds[3]) { var inp=tds[3].querySelector('input'); if(inp) inp.value=jaR; }
    calcSvcRow(tds[2]?.querySelector('input'));
  }

  // 레일 시공비 행: 단가 25,000원 × 1개 (레일수와 무관, 창문 1개 시공당 고정)
  var existingCost = svcBody.querySelector('[data-railcost-src="'+rowIdx+'"]');
  if(existingCost) {
    var ctds = existingCost.querySelectorAll('td');
    if(ctds[1]) { var inp=ctds[1].querySelector('input'); if(inp) inp.value=(space?space+' ':' ')+'레일 시공비'; }
    if(ctds[2]) { var inp=ctds[2].querySelector('input'); if(inp){ inp.setAttribute('data-raw','25000'); inp.value=(25000).toLocaleString(); } }
    if(ctds[3]) { var inp=ctds[3].querySelector('input'); if(inp) inp.value=1; }
    calcSvcRow(ctds[2]?.querySelector('input'));
  } else {
    addSvcRow();
    var newCostRow = svcBody.lastElementChild;
    newCostRow.setAttribute('data-railcost-src', rowIdx);
    var ctds = newCostRow.querySelectorAll('td');
    if(ctds[0]) { var sel=ctds[0].querySelector('select'); if(sel) sel.value='시공비'; }
    if(ctds[1]) { var inp=ctds[1].querySelector('input'); if(inp) inp.value=(space?space+' ':' ')+'레일 시공비'; }
    if(ctds[2]) { var inp=ctds[2].querySelector('input'); if(inp){ inp.setAttribute('data-raw','25000'); inp.value=(25000).toLocaleString(); } }
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
    '<td><input type="text" class="space-inp" placeholder="공간" style="'+INP+';cursor:pointer;caret-color:transparent" readonly onclick="openSpacePicker(this)"></td>'+
    '<td style="padding:6px 8px">'+
      '<input type="text" placeholder="제품명 (고객용)" style="'+INP+'">'+
      '<div class="inner-fields print-hide">'+
        '<div class="inner-row">'+
          '<input type="text" list="blind-list" placeholder="원단명" class="inner-inp">'+
          '<input type="text" list="vendor-list" placeholder="거래처" class="inner-inp" style="width:72px">'+
          '<input type="text" placeholder="컬러" class="inner-inp" style="width:60px">'+
        '</div>'+
      '</div>'+
    '</td>'+
    '<td><select class="blind-kind" onchange="calcBlindRow(this)" style="'+SEL+'">'+
      '<option>롤스크린</option><option>알루미늄</option><option>우드</option>'+
      '<option>허니콤</option><option>로만쉐이드</option><option>기타</option>'+
    '</select></td>'+
    '<td><select class="handle-dir" style="'+SEL+'"><option>좌손</option><option>우손</option><option>기타</option></select></td>'+

    '<td><input type="text" inputmode="numeric" placeholder="cm" class="bmw" oninput="fmtPrice(this);calcBlindRow(this)" style="'+INP+'"></td>'+
    '<td><input type="text" inputmode="numeric" placeholder="cm" class="bmh" oninput="fmtPrice(this);calcBlindRow(this)" style="'+INP+'"></td>'+
    '<td><input type="text" placeholder="옵션" class="blind-opt" style="'+INP+'"></td>'+
    '<td>'+
      '<input type="text" inputmode="numeric" placeholder="단가(원/㎡)" class="blind-price" oninput="fmtPrice(this);calcBlindRow(this)" onfocus="fmtPriceFocus(this)" onblur="fmtPriceBlur(this);calcBlindRow(this)" style="'+INP+'">'+
      '<span class="bsqm">—</span>'+
      '<input type="text" inputmode="numeric" placeholder="옵션추가금" class="blind-extra" oninput="fmtPrice(this);calcBlindRow(this)" onfocus="fmtPriceFocus(this)" onblur="fmtPriceBlur(this);calcBlindRow(this)" style="'+INP+';margin-top:3px;font-size:11px">'+
    '</td>'+
    '<td class="amt bamt">—</td>'+
    '<td style="white-space:nowrap">'+
      '<button class="copy-btn print-hide" onclick="copyBlindRow(this)">⧉</button>'+
      '<button class="del-btn print-hide" onclick="delRow(this)">✕</button>'+
    '</td>';
  tbody.appendChild(tr);
  autoAddBlindSvc();
  renderEmptyState();
}

function calcBlindRow(el) {
  var tr = el.closest('tr');
  var bw = Math.max(0, parseFloat(tr.querySelector('.bmw')?.value)||0);
  var bh = Math.max(0, parseFloat(tr.querySelector('.bmh')?.value)||0);
  var kind = tr.querySelector('.blind-kind')?.value||'';
  var price = Math.max(0, getPriceVal(tr.querySelector('.blind-price'))||0);
  var extra = parseFloat(tr.querySelector('.blind-extra')?.value)||0;
  var sqmRaw = (bw*bh)/10000;
  var minSqm = kind==='우드'?1.5:(kind==='로만쉐이드'?2.0:0);
  if(sqmRaw<minSqm && sqmRaw>0) sqmRaw=minSqm;
  
  var sqm = Math.ceil(sqmRaw*10)/10;
  var sqmEl = tr.querySelector('.bsqm');
  if(sqmEl) sqmEl.textContent = sqm>0 ? sqm.toFixed(1)+'㎡'+(sqmRaw===minSqm&&minSqm>0?' (최소)':'') : '—';
  
  var bmwEl = tr.querySelector('.bmw');
  var bwWarnEl = tr.querySelector('.blind-wide-warn');
  if(!bwWarnEl) {
    bwWarnEl = document.createElement('div');
    bwWarnEl.className = 'blind-wide-warn';
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
  blindBody.querySelectorAll('.blind-extra').forEach(function(inp){
    extraSum += Math.max(0, parseFloat(inp.value.replace(/[^0-9.-]/g,''))||0);
  });
  var svcRow = svcBody.querySelector('[data-svc-type="시공비"]');
  if (!svcRow) {
    // 시공 지역이 선택 안 된 경우 옵션추가금을 반영할 곳이 없어 금액이 누락될 수 있음 — 사용자에게 명확히 안내
    if (extraSum > 0) {
      showToast('⚠️ 옵션추가금을 반영하려면 먼저 지역(서울/경기/기타)을 선택해주세요');
    }
    return;
  }
  var base = parseFloat(svcRow.getAttribute('data-install-base'))||0;
  var priceInput = svcRow.querySelectorAll('td')[2]?.querySelector('input');
  if (priceInput) {
    var total = base + extraSum;
    priceInput.setAttribute('data-raw', String(total));
    priceInput.value = total.toLocaleString();
    calcSvcRow(priceInput);
  }
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
    '<td><select style="'+SEL+'"><option value="레일">레일</option><option value="시공비">시공비</option>'+
    '<option value="전동">전동</option><option value="실측비">실측비</option>'+
    '<option value="부자재">부자재</option><option value="기타">기타</option></select></td>'+
    '<td><input type="text" placeholder="내용 입력" style="'+INP+'"></td>'+
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
  var p = Math.max(0, getPriceVal(tr.querySelector('.sprice'))||0);
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
  recalcBlindOptionExtras();
}

function triggerSumPulse(){
  var el=document.querySelector('.summary-total-amount');
  if(!el) return;
  el.classList.remove('updated');
  requestAnimationFrame(function(){ el.classList.add('updated'); });
  setTimeout(function(){ el.classList.remove('updated'); }, 350);
}
function calcTotal() {
  var curtainTotal = 0;
  document.querySelectorAll('#curtain-body tr').forEach(function(tr){
    var mh = Math.max(0, parseFloat(tr.querySelector('.mh')?.value)||0);
    var fh = mh>0 ? mh-3 : 0;
    var isOver = fh>243;
    var price = isOver
      ? (getPriceVal(tr.querySelector('.cprice-over'))||getPriceVal(tr.querySelector('.cprice'))||0)
      : (getPriceVal(tr.querySelector('.cprice'))||0);
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
    var minSqm=kind==='우드'?1.5:(kind==='로만쉐이드'?2.0:0);
    if(sqmRaw<minSqm&&sqmRaw>0) sqmRaw=minSqm;
    var sqm=Math.ceil(sqmRaw*10)/10;
    curtainTotal+=Math.round(price*sqm);
  });
  var svcTotal=0;
  document.querySelectorAll('#svc-body tr').forEach(function(tr){
    svcTotal+=Math.max(0, (getPriceVal(tr.querySelector('.sprice'))||0))*
              Math.max(0, (parseFloat(tr.querySelector('.sqty')?.value)||1));
  });
  renderSvcSummary();
  var discType=document.getElementById('discount-type')?.value||'won';
  var discInput=Math.max(0, parseFloat(document.getElementById('discount')?.value)||0);
  var discount=discType==='pct'?Math.round(curtainTotal*discInput/100):discInput;
  var grand=curtainTotal-discount+svcTotal;
  if(grand<0) grand=0;
  var depInp=document.getElementById('deposit-input');
  var depRaw=getPriceVal(depInp)||0;
  if(grand>0 && depInp && !depInp.dataset.manualEdit){
    var auto50=Math.round(grand*0.5);
    depInp.value=''; depInp.removeAttribute('data-raw');
    depInp.value=auto50.toLocaleString();
    depInp.dataset.raw=String(auto50);
    depRaw=auto50;
  }
  var deposit=depRaw>0 ? depRaw : 0;
  var balance=grand-deposit;
  var perf=curtainTotal;
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
}

function delRow(btn) {
  var tr = btn.closest('tr');
  var rowIdx = tr.rowIndex;
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
  }
  calcTotal();
}

function delSvcRow(btn) {
  btn.closest('tr').remove();
  calcTotal();
}

function copyCurtainRow(btn) {
  var tr=btn.closest('tr');
  var clone=tr.cloneNode(true);
  clone.dataset.rowId='c'+Date.now();
  clone.querySelectorAll('input[data-raw]').forEach(function(inp){
    inp.setAttribute('data-raw',inp.getAttribute('data-raw'));
  });
  tr.parentNode.insertBefore(clone,tr.nextSibling);
  calcTotal();
}
function copyBlindRow(btn) {
  var tr=btn.closest('tr');
  var clone=tr.cloneNode(true);
  clone.dataset.rowId='b'+Date.now();
  clone.querySelectorAll('input[data-raw]').forEach(function(inp){
    inp.setAttribute('data-raw',inp.getAttribute('data-raw'));
  });
  tr.parentNode.insertBefore(clone,tr.nextSibling);
  autoAddBlindSvc();
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
    motor: { label: '전동 옵션', sum: 0, details: [] },
    etc: { label: '기타', sum: 0, details: [] }
  };

  // 블라인드 옵션추가금(전동 등)은 별도 행이 아니라 지역시공비 행의 금액에 합산되어 있으므로,
  // 여기서 직접 합산해 "전동 옵션" 그룹으로 분리하고, 실측+시공비 그룹에서는 그만큼 제외한다.
  var blindExtraSum = 0;
  document.querySelectorAll('#blind-body .blind-extra').forEach(function(inp) {
    blindExtraSum += Math.max(0, parseFloat((inp.value || '').replace(/[^0-9.-]/g, '')) || 0);
  });
  if (blindExtraSum > 0) {
    groups.motor.sum += blindExtraSum;
    groups.motor.details.push('전동/옵션 추가금');
  }

  rows.forEach(function(tr) {
    var type = tr.querySelector('td select')?.value || '';
    var priceInp = tr.querySelector('.sprice');
    var qtyInp = tr.querySelector('.sqty');
    var price = Math.max(0, getPriceVal(priceInp) || 0);
    var qty = Math.max(0, parseFloat(qtyInp?.value) || 1);
    var amt = price * qty;
    var label = tr.querySelectorAll('td')[1]?.querySelector('input')?.value || '';
    var isRail = tr.hasAttribute('data-rail-src') || tr.hasAttribute('data-railcost-src');
    var isRegionInstall = tr.hasAttribute('data-install-base');

    if (isRail) {
      groups.rail.sum += amt;
      groups.rail.details.push(label);
    } else if (isRegionInstall) {
      // 옵션추가금이 합산되어 있다면 그만큼 제외한 순수 실측/시공비만 반영
      groups.measureInstall.sum += Math.max(0, amt - blindExtraSum);
      groups.measureInstall.details.push(label);
      blindExtraSum = 0; // 지역시공비 행은 보통 1개이므로 중복 차감 방지
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
