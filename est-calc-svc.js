/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 기타품목 · 부자재/서비스(실측비·시공비·레일) 행 계산과 요약
   2026-09-28(선혜님 - "밑에 세개를 그러면 놔두는게 베스트야?"): est-product-calc.js에서 "기타품목/서비스(svc)" 함수만 분리함.
   신안라 사건(자동계산 항목 직접수정시 값 유실)의 markSvcManualOverride도 여기 있음.
   코드 내용은 한 줄도 안 바꾸고 위치만 옮김(전역 함수 소스 비교로 확인).
   포함: addOtherItemRow, calcOtherItemRow, copyOtherItemRow, addSvcRow, markSvcManualOverride, calcSvcRow,
         autoAddSvcFee, delSvcRow, copySvcRow, categorizeSvcRow, renderSvcSummary, summarizeSvcDetails, toggleSvcDetail
   ══════════════════════════════════════════════════ */


// 2026-09-15(선혜님 지시 - "커튼/블라인드 아니어도 침구/러그 제작 가능한데
// 견적서 양식 하나 추가하면...하자"): 커튼(마수)/블라인드(판폭) 같은 전용
// 계산식이 필요 없는 범용 품목 - 단가×수량만 계산. addBlindRow와 같은
// 패턴(행 생성/드래그/복사/삭제)을 따르되, 계산 로직만 훨씬 단순함.
function addOtherItemRow() {
  if (typeof unfreezeEstimateIfEditing === 'function') unfreezeEstimateIfEditing();
  var tbody = document.getElementById('other-body');
  var tbl = document.getElementById('other-table');
  if (tbl) tbl.style.display = 'table';
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td data-label="품명"><input type="text" placeholder="품명 (예: 이불 사계절누빔형)" class="other-name" style="'+INP+'"></td>'+
    '<td data-label="사이즈"><input type="text" placeholder="사이즈 (예: 200*230)" class="other-size" style="'+INP+'"></td>'+
    '<td data-label="단가"><input type="text" inputmode="numeric" placeholder="단가" class="other-price" oninput="fmtPrice(this);calcOtherItemRow(this)" onfocus="fmtPriceFocus(this)" onblur="fmtPriceBlur(this);calcOtherItemRow(this)" style="'+INP+'"></td>'+
    '<td data-label="수량"><input type="text" inputmode="numeric" placeholder="1" class="other-qty" value="1" oninput="fmtPrice(this);calcOtherItemRow(this)" style="'+INP+'"></td>'+
    '<td data-label="기타"><input type="text" placeholder="원단번호 등 메모" class="other-note" style="'+INP+'"></td>'+
    '<td class="amt oamt" data-label="합계">—</td>'+
    '<td style="white-space:nowrap">'+
      '<span class="row-drag-handle print-hide" title="드래그해서 순서 바꾸기" style="cursor:grab;padding:4px 6px;color:var(--sub);user-select:none;display:inline-block">⠿</span>'+
      '<button class="copy-btn print-hide" onclick="copyOtherItemRow(this)">⧉</button>'+
      '<button class="del-btn print-hide" onclick="delRow(this)">✕</button>'+
    '</td>';
  tbody.appendChild(tr);
  makeRowDraggable(tr);
  setupRowDragReorder('other-body');
  renderEmptyState();
}

function calcOtherItemRow(el) {
  var tr = el.closest('tr');
  if (!tr) return;
  var price = Math.max(0, getPriceVal(tr.querySelector('.other-price'))||0);
  var qty = Math.max(0, parseFloat(tr.querySelector('.other-qty')?.value)||0);
  var amt = price*qty;
  var amtCell = tr.querySelector('.oamt');
  if (amtCell) amtCell.textContent = amt>0 ? amt.toLocaleString()+'원' : '—';
  if (typeof calcTotal === 'function') calcTotal();
}

function copyOtherItemRow(btn) {
  var tr = btn.closest('tr');
  var clone = tr.cloneNode(true);
  tr.parentNode.insertBefore(clone, tr.nextSibling);
  makeRowDraggable(clone);
  if (typeof calcTotal === 'function') calcTotal();
}

function addSvcRow() {
  var tbody = document.getElementById('svc-body');
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td><select class="svc-kind" style="'+SEL+'"><option value="레일">레일</option><option value="시공비">시공비</option>'+
    '<option value="전동">전동</option><option value="실측비">실측비</option>'+
    '<option value="부자재">부자재</option><option value="기타">기타</option></select></td>'+
    '<td><input type="text" placeholder="위치" class="svc-space" style="'+INP+'"></td>'+
    '<td><input type="text" placeholder="내용 입력" class="svc-content" style="'+INP+'"></td>'+
    '<td><input type="text" inputmode="numeric" placeholder="단가" class="sprice" oninput="fmtPrice(this);markSvcManualOverride(this);calcSvcRow(this)" onfocus="fmtPriceFocus(this)" onblur="fmtPriceBlur(this);calcSvcRow(this)" style="'+INP+'"></td>'+
    '<td><input type="number" placeholder="1" class="sqty" value="1" oninput="fmtPrice(this);calcSvcRow(this)" style="'+INP+'"></td>'+
    '<td class="amt samt">0원</td>'+
    '<td style="white-space:nowrap">'+
      '<button class="copy-btn print-hide" onclick="copySvcRow(this)">⧉</button>'+
      '<button class="del-btn print-hide" onclick="delSvcRow(this)">✕</button>'+
    '</td>';
  tbody.appendChild(tr);
}

// 2026-09-19(선혜님 - "신안라 님 견적서... 다시 열어보니 실측+레일비가
// 765,000원+604,800원인데 금액은 똑같이 28,134,000원이 나오는데 이게
// 말이 되니?????????" - 실제 데이터 유실/총액 불일치 재현으로 발견):
// 실측비/시공비/레일(자동계산 svc행)의 단가를 사용자가 직접 수정해도,
// 그 수정값 자체는 "자동생성이라 재계산으로 다시 만들어짐"이라는
// 이유로 저장 대상에서 아예 제외되고 있었음(est-misc.js) - 근데 저장
// 시점의 총액(grand)은 그 수정값을 반영해서 계산된 채로 저장됐음.
// 다시 열면 항목은 기본 자동계산값으로 재생성되는데, 총액은 예전
// (수정값 기준) 값이 얼려진 채로 그대로 보여서 화면이 완전히 앞뒤가
// 안 맞았음 - 실제로는 수정한 값 자체가 통째로 유실되고 있었던 것.
// 해결: 사용자가 자동계산 svc행의 단가를 실제로 타이핑하면(oninput,
// 프로그래밍적 자동계산 대입과 구분됨) "수동 지정" 표시를 남겨서,
// 이후 자동 재계산이 그 행을 건드리지 않고, 저장/복원 시에도 이
// 수정값이 실제로 보존되게 함.
function markSvcManualOverride(el) {
  var tr = el.closest('tr');
  if (tr) {
    tr.dataset.manualOverride = '1';
    // 2026-09-19(선혜님 - "안됐잖아!!!!!" - 인쇄까지 실제로 확인해서
    // 재현 성공): 사용자가 "단가" 칸에 입력하는 값은 실제로는 "이
    // 항목 전체를 이 금액으로 고정하고 싶다"는 의도인데(예: 레일
    // 자재비를 1,890,000원으로), 수량(레일 자수 등 자동계산값, 예:
    // 10자)이 그대로 남아있어서 최종 금액이 단가×수량(18,900,000원)
    // 으로 부풀려지고 있었음 - 단가를 직접 수정하는 순간 수량을 1로
    // 맞춰서, 입력한 값이 곧 최종 금액이 되도록 함.
    var qtyInp = tr.querySelector('.sqty');
    if (qtyInp) qtyInp.value = '1';
    // 2026-09-22(선혜님 - "오류가 너무 많아서 못쓸 지경이야, 찾아"로
    // 원인 추적 - 최금희 고객 사례 100% 재현 성공): "직접 수정"된 값은
    // 지역을 나중에 다시 선택해도 영구히 유지되는데(의도된 설계 -
    // 2026-09-19 도입), 실측비/시공비처럼 나란히 붙어있는 자동생성
    // 필드에 실수로 다른 칸의 값을 잘못 입력해도(예: 시공비 칸에
    // 실측비 금액을 잘못 타이핑) 화면상 자동계산값과 전혀 구분이 안 돼
    // 몇 시간이 지나서야("서울 시공비 40,000원") 눈치채는 사고가
    // 실제로 재현됨. 자동생성 필드(실측비/시공비/레일/레일시공비)를
    // 직접 고치면 눈에 띄게 표시해서, 실수로 잘못 입력한 걸 그 자리에서
    // 바로 알아챌 수 있게 함 - 의도적 할인/조정이면 그대로 두면 되고,
    // 실수면 바로 지우고 다시 입력하면 됨.
    var isAutoManagedField = tr.hasAttribute('data-svc-type') || tr.hasAttribute('data-rail-src') || tr.hasAttribute('data-railcost-src');
    if (isAutoManagedField) {
      el.style.background = '#FFF3E0';
      el.style.borderColor = '#F06E2D';
      var contentInp = tr.querySelector('.svc-content');
      if (contentInp && contentInp.value.indexOf(' ✏️직접수정') === -1) {
        contentInp.value = contentInp.value + ' ✏️직접수정';
      }
    }
  }
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
  // 2026-09-22(선혜님 지적 - "더하기 계산이 안맞는게 더 문제야", 최금희
  // 고객 견적서에서 상세 내역 합이 2,145,000원인데 위 요약카드엔
  // 1,865,000원으로 떠서 280,000원 차이나던 것으로 발견): 이 줄 자신의
  // 금액(.samt)과 맨 아래 전체 합계(calcTotal)는 매번 정확히 갱신되고
  // 있었는데, "레일·시공비·기타" 요약카드(renderSvcSummary)만 새 행을
  // 추가/삭제할 때만 갱신되고 기존 행의 단가/수량을 직접 고칠 때는 전혀
  // 다시 안 그려지고 있었음 - 복제 버튼으로 만든 행이든 원래 있던 행이든
  // 상관없이, 단가를 손으로 고치는 모든 경우에 요약이 멈춰있었던 것.
  if (typeof renderSvcSummary === 'function') renderSvcSummary();
}

function autoAddSvcFee() {
  var region = document.getElementById('c-region').value;
  var svcBody = document.getElementById('svc-body');
  var hint = document.getElementById('region-hint');
  var customInp = document.getElementById('c-region-price');
  customInp.style.display = region==='기타' ? 'inline-block' : 'none';
  var customBase = parseFloat(document.getElementById('c-region-price').value)||0;
  // 요금 결정 규칙(설정값 우선 → 기본 요금 → '기타'는 직접 입력)은 est-calc-rules.js의 resolveRegionPrices 한 곳에만 있음.
  // 기본 요금표의 정식 위치는 shared-common-utils.js의 DEFAULT_REGION_FEES(대시보드 설정 화면과 공유).
  var regionFees = (typeof getRegionFees === 'function') ? getRegionFees() : {};
  var prices = resolveRegionPrices(region, regionFees, customBase, DEFAULT_REGION_FEES);
  if(!svcBody) return;
  var rows = svcBody.querySelectorAll('[data-svc-type="실측비"],[data-svc-type="시공비"]');
  // 2026-09-19(선혜님 - "다시 열어보니 실측+레일비가... 이게 말이
  // 되니?????????"): 실측비/시공비는 레일과 달리 "기존 행을 찾아
  // 업데이트"가 아니라 "무조건 삭제 후 새로 생성"하는 방식이라, 삭제
  // 전에 사용자가 수동 지정해둔 단가를 먼저 기억해뒀다가 새로 만든
  // 뒤 그대로 복원 - 안 그러면 지역을 재선택할 때마다(예: 다른 필드
  // 편집이 지역 select의 change를 트리거하는 경우 등) manualOverride
  // 값 자체가 삭제와 함께 통째로 사라짐.
  var manualOverrides = {};
  rows.forEach(function(r){
    if (r.dataset.manualOverride) {
      var t = r.getAttribute('data-svc-type');
      manualOverrides[t] = { price: r.querySelector('.sprice')?.value, raw: r.querySelector('.sprice')?.dataset.raw };
    }
  });
  rows.forEach(function(r){ r.remove(); });
  if (isNoInstallFee(prices)) {
    Array.from(svcBody.querySelectorAll('tr')).forEach(function(r){
      var type=r.querySelector('select')?.value||'';
      if(type==='실측비'||type==='시공비'||type==='레일') r.remove();
    });
    if(hint) hint.textContent=NO_INSTALL_HINT;
    calcTotal(); return;
  }
  ['실측비','시공비'].forEach(function(type) {
    var typePrice = prices[type];
    addSvcRow();
    var row = svcBody.lastElementChild;
    row.setAttribute('data-svc-type', type);
    var tds = row.querySelectorAll('td');
    var sel=row.querySelector('.svc-kind'); if(sel) sel.value=type==='실측비'?'실측비':'시공비';
    var inp=row.querySelector('.svc-content'); if(inp) inp.value=regionFeeContent(region, type);
    var pinp=row.querySelector('.sprice');
    if (manualOverrides[type]) {
      // 삭제 전 기억해둔 수동 지정값을 그대로 복원 - 지역이 바뀌어도
      // 사용자가 직접 넣은 값은 유지(자동계산값으로 되돌리지 않음).
      if (pinp) { pinp.value = manualOverrides[type].price; pinp.dataset.raw = manualOverrides[type].raw; }
      row.dataset.manualOverride = '1';
    } else if(pinp){ pinp.setAttribute('data-raw',String(typePrice)); pinp.value=typePrice.toLocaleString(); }
    if(type==='시공비') row.setAttribute('data-install-base', String(typePrice));
    var qinp=row.querySelector('.sqty'); if(qinp) qinp.value=1;
    calcSvcRow(pinp);
  });
  if(hint) hint.textContent=regionFeeHint(prices);
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

function delSvcRow(btn) {
  btn.closest('tr').remove();
  calcTotal();
  // 2026-09-22(더하기 안 맞는 문제 - calcSvcRow와 같은 원인): 행 삭제
  // 시에도 요약카드가 안 갱신되고 있었음.
  if (typeof renderSvcSummary === 'function') renderSvcSummary();
}
function copySvcRow(btn) {
  var tr=btn.closest('tr');
  var clone=tr.cloneNode(true);
  _copySelectValues(tr, clone);
  clone.dataset.rowId='s'+Date.now();
  clone.querySelectorAll('input[data-raw]').forEach(function(inp){
    inp.setAttribute('data-raw',inp.getAttribute('data-raw'));
  });
  tr.parentNode.insertBefore(clone,tr.nextSibling);
  clone.removeAttribute('data-svc-type');
  clone.removeAttribute('data-rail-src');
  clone.removeAttribute('data-rail-svc-src');
  // 2026-09-22(선혜님 지적 - "더하기 계산이 안맞는게 더 문제야"로 원인
  // 추적 중 발견): 레일시공비(data-railcost-src)나 지역시공비(data-
  // install-base) 행을 복제하면, 복사본이 이 태그를 그대로 유지해서
  // autoUpdateRail()이 나중에 "이 커튼줄의 레일시공비 행"을 찾을 때
  // 원본과 복사본 중 어느 쪽을 자동갱신 대상으로 볼지 꼬여버림 - 한쪽은
  // 최신값으로 갱신되고 다른 한쪽은 옛날 값에 멈춰있는 채로 둘 다
  // 화면에 남아 합계가 어긋나는 원인이 됨. 복제본은 "자동관리 대상"에서
  // 완전히 빼서 순수한 수동 입력 행으로 만듦(내용/단가는 그대로 유지,
  // 필요하면 자유롭게 고쳐 쓰도록).
  clone.removeAttribute('data-railcost-src');
  clone.removeAttribute('data-install-base');
  calcTotal();
  if (typeof renderSvcSummary === 'function') renderSvcSummary();
}

// 2026-09-22(선혜님 지적 - "버그를 고치고 고쳐도 왜 같은 버그가 생기지,
// 쌍둥이함수까지 찾아": est-doc-customer.js가 아래 renderSvcSummary()와
// 완전히 똑같은 "레일/실측+시공비/전동+부자재/기타" 4그룹 분류를 각자
// 손으로 따로 짜놨는데, 서로 다른 기준을 쓰고 있었음 - renderSvcSummary는
// "구분" 드롭다운의 실시간 값을 보는데, est-doc-customer.js는 고정된
// data-svc-type 속성값만 보고 있어서(수동으로 만든 행이나, 만든 뒤
// 드롭다운을 바꾼 행에서는 이 속성이 실제 값과 다를 수 있음), 직원이
// 보는 내부 화면이랑 고객에게 나가는 견적서 문서의 금액이 서로 달라질
// 수 있는 구조였음. 또한 est-doc-customer.js에만 있던 "블라인드시공"/
// "옵션추가금"/"부자재" 분류가 renderSvcSummary엔 아예 없어서, 그런
// 행들이 내부 화면에서만 "기타"로 잘못 묶이고 있었음. 이 분류 로직을
// 딱 한 곳(이 함수)으로 통합해서, 두 화면이 항상 똑같은 기준으로 같은
// 결과를 내도록 함 - "실시간 드롭다운 값"을 우선하고, 만들어질 때
// 붙는 고정 속성은 드롭다운이 아직 없거나 비어있을 때만 보조로 씀.
function categorizeSvcRow(tr) {
  var isRailMaterial = tr.hasAttribute('data-rail-src');     // 레일 자재(1,600원×레일수)
  var isRailInstall  = tr.hasAttribute('data-railcost-src'); // 레일 시공비(25,000원)
  var isRegionInstall = tr.hasAttribute('data-install-base'); // 지역별 실측·시공비
  var svcTypeAttr = tr.getAttribute('data-svc-type') || '';
  var kindSelect = tr.querySelector('.svc-kind')?.value || tr.querySelector('td select')?.value || '';

  if (isRailMaterial) return 'rail';
  if (isRailInstall || isRegionInstall) return 'measureInstall';
  if (kindSelect === '전동') return 'motor';
  if (kindSelect === '실측비' || kindSelect === '시공비') return 'measureInstall';
  if (svcTypeAttr === '블라인드시공') return 'measureInstall';
  if (svcTypeAttr === '옵션추가금') return 'motor';
  if (kindSelect === '부자재') return 'motor';
  return 'etc';
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

  rows.forEach(function(tr) {
    var priceInp = tr.querySelector('.sprice');
    var qtyInp = tr.querySelector('.sqty');
    var price = Math.max(0, getPriceVal(priceInp) || 0);
    var qty = Math.max(0, parseFloat(qtyInp?.value) || 1);
    var amt = price * qty;
    var label = tr.querySelector('.svc-content')?.value || '';
    var group = categorizeSvcRow(tr);
    groups[group].sum += amt;
    groups[group].details.push(label);
  });

  var html = '';
  ['measureInstall', 'rail', 'motor', 'etc'].forEach(function(key) {
    var g = groups[key];
    if (g.details.length === 0) return;
    var detailText = summarizeSvcDetails(g.details);
    html += '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0">'
      + '<div><span style="font-size:12px;font-weight:700;color:#282828">' + escHtml(g.label) + '</span>'
      + (detailText ? '<div style="font-size:11px;color:#B0A99F;margin-top:1px">' + escHtml(detailText) + '</div>' : '')
      + '</div>'
      + '<span style="font-size:13px;font-weight:700;color:#282828;white-space:nowrap">' + g.sum.toLocaleString() + '원</span>'
      + '</div>';
  });
  card.innerHTML = html || '<div style="font-size:11px;color:#B0A99F">레일/시공비/기타 항목이 없습니다</div>';
}

// 2026-09-19(선혜님 - "레일이 여러개면 묶어서 정리가 안되니 너무
// 복잡한데?? 전문업체 기분으로 확인해" - 커튼 22개짜리 견적서에서
// "레일 시공비"라는 똑같은 문구가 20번 넘게 그대로 나열되던 것으로
// 발견): 같은 텍스트(예: "레일 시공비")가 여러 번 반복되면 "레일
// 시공비 24개"처럼 묶어서 보여줌 - 서로 다른 길이(예: "16자"/"18자")는
// 각자 그대로 두되, 같은 길이가 여러 개면 그것끼리는 묶임.
function summarizeSvcDetails(details) {
  var counts = {}, order = [];
  details.filter(Boolean).forEach(function(d) {
    if (!(d in counts)) { counts[d] = 0; order.push(d); }
    counts[d]++;
  });
  return order.map(function(d) {
    return counts[d] > 1 ? d + ' ' + counts[d] + '개' : d;
  }).join(', ');
}

function toggleSvcDetail() {
  var wrap = document.getElementById('svc-detail-wrap');
  var btn = document.getElementById('svc-detail-toggle');
  if (!wrap || !btn) return;
  var isHidden = wrap.style.display === 'none';
  wrap.style.display = isHidden ? '' : 'none';
  btn.textContent = isHidden ? '상세 항목 접기 ▴' : '상세 항목 펼치기 ▾';
}
