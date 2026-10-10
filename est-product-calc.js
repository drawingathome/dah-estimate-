/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 공통 계산: 합계(calcTotal)/얼림 금액/행 삭제/드래그 정렬
   2026-09-28(선혜님 - "밑에 세개를 그러면 놔두는게 베스트야?" - 이 파일은 버그 수정이 71번 중
   51번 몰린 재발 버그의 중심): 예전엔 "계산 함수들이 서로 긴밀히 호출하는 구조라 하나의 파일로
   유지함"이라고 적혀 있었는데, 순수 전역 함수라 파일 위치와 호출은 무관해서(로드 시점에 실행되는
   코드도 없음) 행 종류별로 나눔 - 전역 함수 소스 비교로 동일함을 확인.
     est-calc-curtain.js  커튼 행(추가/폭수·금액/레일 자동/복사)
     est-calc-blind.js    블라인드 행(추가/최소면적/옵션 추가금/부자재 자동/복사)
     est-calc-svc.js      기타품목 + 부자재·서비스(실측비/시공비/레일) 행, 서비스 요약
   이 파일엔 모든 행이 함께 쓰는 합계(calcTotal)·얼림(applyFrozenBreakdown)·삭제·드래그만 남음.
   ══════════════════════════════════════════════════ */


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
  // 2026-09-19(선혜님 - "그게 중요하니??? 금액이 차이가 나는게 말이
  // 안되는데" - 근본 원인 해결): 저장된 스냅샷(bd)이 지금 화면에 실제로
  // 보이는 품목들과 안 맞으면(예전 버그로 저장된 데이터 등 어떤
  // 이유로든), 그걸 무조건 그대로 보여주는 게 "화면 항목과 최종 총액이
  // 완전히 안 맞는" 상황을 만들었음 - 언제, 왜 저장이 잘못됐는지와
  // 무관하게, 화면에 보이는 숫자는 항상 서로 앞뒤가 맞아야 함. 얼려진
  // 총액을 적용하기 전에 항상 지금 DOM 기준으로 실제 재계산해서 저장된
  // 값과 비교하고, 서로 다르면(신뢰할 수 없는 스냅샷) 얼림 자체를 적용
  // 안 하고 방금 재계산한 정확한 값을 그대로 둠 - 이렇게 하면 예전
  // 버그로 저장된 데이터를 다시 입력/저장하지 않고 그냥 열기만 해도,
  // 최소한 "화면에 보이는 항목 합계=최종 총액"이라는 앞뒤가 맞는
  // 상태는 항상 보장됨.
  if (typeof calcTotal === 'function') {
    calcTotal();
    var liveTotalEl = document.getElementById('sum-total');
    var liveTotal = liveTotalEl ? Number((liveTotalEl.textContent || '').replace(/[^\d]/g, '')) : null;
    if (bd.finalTotal != null && liveTotal != null && liveTotal !== bd.finalTotal) {
      window._estEditState.viewingFrozenEstimate = false;
      // 2026-09-21(선혜님 - "100만원 선금이 정리가 되어있는데 왜
      // 계약금 3,359,000원으로 정리가 되냐고" - 민소아 견적서로 실제
      // 재현된 부작용): 위 안전장치가 총액 불일치를 감지하면 여기서
      // 그냥 return해버려서, 아래에 있던 "계약금은 실제 받은 돈이니
      // 자동 50% 추정으로 덮어쓰지 마라"는 보호 플래그 설정까지 통째로
      // 건너뛰었음 - 그 직후 calcTotal()이 이미 실행된 상태라 "보호
      // 안 된 계약금은 50% 자동계산"이 그대로 발동해서, 실제로 받은
      // 선금(예: 100만원)이 화면상 50% 추정치로 조용히 덮어써짐. 항목
      // 표시/총액은 재계산값을 쓰더라도, "실제 받은 돈"인 계약금만큼은
      // 저장된 값과 보호 플래그를 여기서 먼저 적용해 자동추정에
      // 덮어써지지 않게 함.
      if (bd.deposit != null && bd.deposit > 0) {
        var depInpEarly = document.getElementById('deposit-input');
        // 2026-09-22(구조 재설계 - 통합 depositSource 모델): 이미 'real'
        // (사용자 직접입력·실제결제액)로 확정된 값이 있으면 이 얼려둔
        // 스냅샷값으로 되돌리지 않음 - 절대 다운그레이드 안 함.
        if (depInpEarly && depInpEarly.dataset.depositSource !== 'real') {
          depInpEarly.value = bd.deposit.toLocaleString();
          depInpEarly.dataset.raw = String(bd.deposit);
          depInpEarly.dataset.depositSource = 'frozen';
        }
        var sumDepDispEarly = document.getElementById('sum-deposit-disp');
        if (sumDepDispEarly) sumDepDispEarly.textContent = bd.deposit.toLocaleString()+'원';
        var sumBalDispEarly = document.getElementById('sum-balance-disp');
        if (sumBalDispEarly && liveTotal != null) sumBalDispEarly.textContent = Math.max(0, liveTotal - bd.deposit).toLocaleString()+'원';
      }
      return;
    }
  }
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
    // 2026-09-22(구조 재설계 - 통합 depositSource 모델): 이미 'real'로
    // 확정된 값이 있으면 얼려둔 스냅샷값으로 되돌리지 않음.
    if (depInp && bd.deposit > 0 && depInp.dataset.depositSource !== 'real') {
      depInp.value = bd.deposit.toLocaleString();
      depInp.dataset.raw = String(bd.deposit);
      depInp.dataset.depositSource = 'frozen';
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
  window._estEditState.lastCalcBreakdown = bd; // 이 상태로 저장(재저장)해도 같은 스냅샷 유지
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
    // 청구 면적 규칙은 est-calc-rules.js의 calcBlindBillableSqm 한 곳에만 있음(예전엔 calcBlindRow와 이 자리에 똑같이 2곳 복사돼 있었음)
    var sqm=calcBlindBillableSqm(bw, bh, getBlindMinSqm(kind)).sqm;
    curtainTotal+=Math.round(price*sqm);
  });
  // 2026-09-15(선혜님 지시 - 침구/러그 등 기타 품목 신설): 커튼/블라인드
  // 전용 계산식(마수/판폭)이 필요 없는 단순 단가×수량 품목 - 실제 침구
  // 견적서 캡처 기준으로 할인이 이 제품소계 전체에 함께 적용되는 걸
  // 확인해서, 커튼/블라인드와 같은 discountable 합계(curtainTotal)에 포함.
  document.querySelectorAll('#other-body tr').forEach(function(tr){
    var price = Math.max(0, getPriceVal(tr.querySelector('.other-price'))||0);
    var qty = Math.max(0, parseFloat(tr.querySelector('.other-qty')?.value)||0);
    curtainTotal += price*qty;
  });
  var svcTotal=0;
  document.querySelectorAll('#svc-body tr').forEach(function(tr){
    // 2026-08-14: 부자재 단가는 할인성 마이너스 입력을 실제로 쓰신다고
    // 확인(calcSvcRow와 동일 이유) - 여기서도 Math.max(0,...) 제거.
    svcTotal+=(getPriceVal(tr.querySelector('.sprice'))||0)*
              Math.max(0, (parseFloat(tr.querySelector('.sqty')?.value)||1));
  });
  renderSvcSummary();
  // 쿠폰/직접입력 순차 할인 규칙(원단위 먼저 → % 나중, 각 %는 남은 금액 기준)과 그 역사는
  // est-calc-rules.js의 applyDiscountItems 한 곳에만 있음. 여기선 화면에서 선택된 쿠폰/직접입력을 읽어 넘기기만 함.
  var discType=document.getElementById('discount-type')?.value||'won';
  var discInput=Math.max(0, parseFloat(document.getElementById('discount')?.value)||0);
  var items = Array.from(document.querySelectorAll('.coupon-check:checked')).map(function(cb){
    return { source:'coupon', el: cb, type: cb.dataset.type, value: parseFloat(cb.dataset.value)||0,
             label: cb.dataset.name, id: cb.dataset.id, name: cb.dataset.name };
  });
  if (discInput > 0) {
    items.push({ source:'manual', type: discType, value: discInput, label: '직접입력' });
  }
  var discountResult = applyDiscountItems(curtainTotal, items);
  var totalDiscount = discountResult.totalDiscount;
  var discountBreakdown = discountResult.discountBreakdown;
  var appliedCoupons = discountResult.appliedCoupons; // 저장용 - 쿠폰ID로 불러오기시 정확히 재선택하기 위함
  var manualDiscount = discountResult.manualDiscount;
  var discount = totalDiscount;
  var grand = calcGrandBeforeTruncation(curtainTotal, discount, svcTotal);
  // 최종 견적금액 천원단위 절사(내림, 2026-08-12 선혜님 확인)와 그 이유는 est-calc-rules.js의 truncateToThousand에 있음.
  // 절사분은 할인 내역에 "끝자리 절사" 줄로 명시(2026-08-14 선혜님 확인).
  if (grand > 0) {
    var trunc = truncateToThousand(grand);
    if (trunc.truncAmt > 0) {
      discountBreakdown.push({ label: '끝자리 절사', amount: trunc.truncAmt });
      discount += trunc.truncAmt; // sum-discount(할인 총액) 표시에도 절사분 반영
    }
    grand = trunc.grand;
  }
  window._estEditState.lastDiscountBreakdown = discountBreakdown; // 영수증 표시용
  window._estEditState.lastAppliedDiscounts = { coupons: appliedCoupons, manual: manualDiscount }; // 저장용(쿠폰ID 포함) - 절사는 매번 계산되므로 저장 불필요
  var breakdownEl = document.getElementById('discount-breakdown');
  if (breakdownEl) {
    breakdownEl.innerHTML = discountBreakdown.map(function(d){
      return '<div style="display:flex;justify-content:space-between;padding:2px 0">'+
        '<span>'+d.label+'</span><span>-'+d.amount.toLocaleString()+'원</span></div>';
    }).join('');
  }
  var depInp=document.getElementById('deposit-input');
  var depRaw=getPriceVal(depInp)||0;
  // 계약금 비율(커튼/블라인드 있으면 50%, 침구/러그만이면 100%)과 그 이유는 est-calc-rules.js의 calcDepositRatio에 있음.
  var depositRatio = calcDepositRatio(hasCurtainOrBlindItem());
  // 2026-09-22(구조 재설계 - 통합 depositSource 모델): 'real'이든
  // 'frozen'이든 뭔가 보호 대상으로 지정된 값이 있으면 자동 재계산 안 함.
  if(grand>0 && depInp && !depInp.dataset.depositSource){
    var auto50=calcAutoDeposit(grand, depositRatio);
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
  // 계약금/잔금 규칙(계약금이 총액보다 크면 총액으로 제한, 잔금 음수 방지)은 est-calc-rules.js의 calcDepositAndBalance
  var depositBalance = calcDepositAndBalance(grand, depRaw);
  var deposit = depositBalance.deposit;
  var balance = depositBalance.balance;
  // 2026-08-05: 성과매출이 할인을 반영 안 하고 있었음(할인 전 curtainTotal 그대로) —
  // 할인해준 만큼은 실제로 못 받은 돈이니 성과에서도 빠져야 함
  var perf=calcPerformanceRevenue(curtainTotal, discount);
  document.getElementById('sum-curtain').textContent=curtainTotal.toLocaleString()+'원';
  
  var totalEl = document.getElementById('sum-total');
  if(totalEl) totalEl.textContent = grand.toLocaleString()+'원';
  var depDispEl = document.getElementById('sum-deposit-disp');
  if(depDispEl) depDispEl.textContent = deposit>0 ? deposit.toLocaleString()+'원' : (grand>0 ? calcAutoDeposit(grand, depositRatio).toLocaleString()+'원 (예상)' : '—');
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
  window._estEditState.lastCalcBreakdown = {
    productSubtotal: curtainTotal, discount: discount, installSubtotal: svcTotal,
    finalTotal: grand, deposit: deposit, balance: balance, performanceRevenue: perf,
    discountDetail: discountBreakdown,
    // 2026-10-08: 자동 시공 행(실측/시공/레일/블라인드시공)이 line_items에 모두 저장된 견적이라는 표식.
    // 이 표식이 있으면 다시 열 때 재계산 없이 저장된 행 그대로 복원(est-customer-load / dah-estimate.html).
    svcRowsSaved: true
  };
}

function delRow(btn) {
  // 2026-09-18(선혜님 - "이 견적서 다시 살려줘" / "인쇄가 왜이렇게
  // 되지??"): 행 삭제는 input 이벤트가 아니라 클릭이라 위 이벤트
  // 위임(unfreezeEstimateIfEditing)으로는 안 잡힘 - 여기서 직접 호출.
  if (typeof unfreezeEstimateIfEditing === 'function') unfreezeEstimateIfEditing();
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
  // 2026-09-15(기타 품목 신설하며 함께 처리): blind-table과 동일하게,
  // 마지막 기타품목 행을 지우면 표 자체도 숨겨야 curtain-only 견적에서
  // 빈 표가 남지 않음.
  var otherBody = document.getElementById('other-body');
  var otherTbl = document.getElementById('other-table');
  if (otherBody && otherTbl && otherBody.querySelectorAll('tr').length === 0) {
    otherTbl.style.display = 'none';
  }
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
  // 2026-09-18(선혜님 - "이 견적서 다시 살려줘" / "인쇄가 왜이렇게
  // 되지??"로 발견, 그 다음 "1번 똑같은데?? 왜 갑자기 이렇게
  // 바뀐거지??"로 재현되어 최초 수정의 회귀까지 발견): 처음엔
  // autoAddSvcFee()를 재호출하는 방식으로 고쳤는데, 그 함수 자체에
  // "커튼/블라인드 없으면 실측비/시공비 불필요" 조건을 넣었더니
  // "지역을 먼저 선택하고 나중에 커튼을 입력하는" 정상적인 흐름까지
  // 깨뜨림(지역 선택 시점엔 아직 커튼이 없어서 실측/시공비 자체가
  // 안 붙게 됨) - autoAddSvcFee()는 원래대로 되돌리고, 대신 여기서
  // (커튼+블라인드가 실제로 모두 사라진 시점에만) 실측비/시공비 행을
  // 직접 지움 - 레일 자재비는 이미 위에서 개별 행 삭제시 연동 삭제됨.
  if (typeof hasCurtainOrBlindItem === 'function' && !hasCurtainOrBlindItem() && svcBody) {
    Array.from(svcBody.querySelectorAll('[data-svc-type="실측비"],[data-svc-type="시공비"]')).forEach(function(r) { r.remove(); });
  }
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
// 2026-09-08(선혜님 발견 - "처음 견적서에는 5센치 되어있는것도 다 리드로
// 바뀌어있는걸 확인했어" → 유경진 사례로 재현): 커튼/블라인드/서비스
// "복사" 버튼(copyCurtainRow/copyBlindRow/copySvcRow)이 전부
// cloneNode(true)로 행을 복제하는데, cloneNode는 HTML의 <option selected>
// 속성은 복제하지만, 사용자가 JS로 프로그래밍적으로 바꾼 select의 "현재
// 선택값"(value property, HTML 속성이 아님)은 복제하지 못하는 잘 알려진
// DOM 함정임 - 그래서 시접을 "5cm"로 바꾼 행을 복사하면, 복사본은 항상
// 첫 번째 옵션("리드")으로 리셋되고 있었음(재현 테스트로 실제 확인함).
// cloneNode 직후 원본의 모든 select 값을 복사본에 명시적으로 다시
// 대입해주는 공용 헬퍼 - 세 복사 함수 모두에서 재사용.
function _copySelectValues(original, clone) {
  var origSelects = original.querySelectorAll('select');
  var cloneSelects = clone.querySelectorAll('select');
  for (var i = 0; i < origSelects.length; i++) {
    if (cloneSelects[i]) cloneSelects[i].value = origSelects[i].value;
  }
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

// 2026-09-04(선혜님 지시 - "필요할때만 펼치는 버튼 추가"): 원단명/거래처/
// 컬러/레일거래처 입력창(.inner-fields)이 기본으로 숨겨져 있다가, 이
// 버튼을 누르면 그 행에서만 펼쳐지도록 함. 버튼 텍스트/화살표도 상태에
// 맞춰 바꿔서 지금 펼쳐진 상태인지 한눈에 알 수 있게 함.
function toggleInnerFields(btn) {
  var tr = btn.closest('tr');
  var fields = tr ? tr.querySelector('.inner-fields') : null;
  if (!fields) return;
  var isOpen = fields.classList.toggle('expanded');
  btn.style.background = isOpen ? 'var(--dark)' : '#fff';
  btn.style.color = isOpen ? '#fff' : 'var(--sub)';
}
