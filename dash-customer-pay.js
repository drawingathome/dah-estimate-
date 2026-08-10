/* ══════════════════════════════════════════════════
   고객상세 - 결제(선금/잔금) 탭 렌더링
   ══════════════════════════════════════════════════
   dash-customer-detail.js에서 분리됨 (2026-07-17) —
   원래 openDetail() 함수 하나가 500줄 넘게 모든 탭을 다 그렸는데,
   결제 관련 로직만 이 파일로 분리함.
   openDetail()이 renderPaySection(c, payBody)를 호출함. */

function renderPaySection(c, payBody) {
  // 2026-08-04: id기반 키를 우선 시도하고, 없으면 이름기반(예전 데이터)으로 폴백
  function getLocalPay() {
    try {
      if (c.id) {
        var byId = localStorage.getItem('dah_pay_id_'+c.id);
        if (byId) return JSON.parse(byId);
      }
      return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}');
    } catch(e) { return {}; }
  }
  var _localPay = getLocalPay();
  // 결제 관리 섹션 - customers 객체 직접 사용 (localStorage 병행)
  var payData = {
    depositAmount:  c.depositAmount  || _localPay.depositAmount  || 0,
    depositDate:    c.depositDate    || _localPay.depositDate    || '',
    depositMethod:  c.depositMethod  || _localPay.depositMethod  || '',
    depositReceipt: c.depositReceipt || _localPay.depositReceipt || false,
    balanceAmount:  c.balanceAmount  || _localPay.balanceAmount  || 0,
    balanceDate:    c.balanceDate    || _localPay.balanceDate    || '',
    balanceMethod:  c.balanceMethod  || _localPay.balanceMethod  || '',
    balanceReceipt: c.balanceReceipt || _localPay.balanceReceipt || false
  };

  var paySec = div('margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)', []);
  paySec.appendChild(el('div', {style:'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px', text:'결제 관리'}));

  function savePayData(pd) {
    if (typeof logEvent === 'function') logEvent('payment_save', { hasDeposit: Number(pd.depositAmount) > 0, hasBalance: Number(pd.balanceAmount) > 0 });
    // 1) localStorage 백업
    // 2026-08-04: 이름 기반 키만 쓰면 동명이인일 때 결제정보가 섞일 이론적
    // 위험이 있어(실제 최우선 소스는 customers.depositAmount라 id기반으로
    // 안전하지만, 서버값이 비어 이 폴백에 의존하는 드문 경우 대비) id 기반
    // 키로도 함께 저장해서 이중 안전장치를 둠
    localStorage.setItem('dah_pay_'+c.clientName, JSON.stringify(pd));
    if (c.id) localStorage.setItem('dah_pay_id_'+c.id, JSON.stringify(pd));
    // 2) customers 캐시 업데이트
    var arr = loadCustomers();
    var idx = c.id ? arr.findIndex(function(x){ return x.id === c.id; }) : arr.findIndex(function(x){ return x.clientName === c.clientName; });
    if (idx >= 0) {
      arr[idx].depositAmount  = Number(pd.depositAmount)||0;
      arr[idx].depositDate    = pd.depositDate||'';
      arr[idx].depositMethod  = pd.depositMethod||'';
      arr[idx].depositReceipt = pd.depositReceipt||false;
      arr[idx].balanceAmount  = Number(pd.balanceAmount)||0;
      arr[idx].balanceDate    = pd.balanceDate||'';
      arr[idx].balanceMethod  = pd.balanceMethod||'';
      arr[idx].balanceReceipt = pd.balanceReceipt||false;
      saveCustomers(arr);
    }
    // 3) Supabase 동기화
    if (c.id) {
      sbXHR('PATCH', 'customers?id=eq.'+c.id, {
        deposit_amount:  Number(pd.depositAmount)||0,
        deposit_date:    pd.depositDate||'',
        deposit_method:  pd.depositMethod||'',
        deposit_receipt: pd.depositReceipt||false,
        balance_amount:  Number(pd.balanceAmount)||0,
        balance_date:    pd.balanceDate||'',
        balance_method:  pd.balanceMethod||'',
        balance_receipt: pd.balanceReceipt||false
      }, function(){});
    }
  }

  // 선금 섹션
  // 2026-08-10: 선금/잔금 입력폼도 "저장" 버튼 누르기 전에 중단(모달 닫힘,
  // 새로고침 등)되면 입력값이 날아가던 문제 - 고객ID별 임시저장 키로 해결.
  // (반드시 depositDone 체크/buildDepForm 최초호출보다 먼저 정의할 것 —
  // 처음엔 아래쪽에 뒀다가 payDraftKey가 undefined인 채로 buildDepForm이
  // 먼저 호출되는 버그가 있었음)
  var payDraftKey = 'dah_pay_draft_' + c.id;
  function getPayDraft() { try { return JSON.parse(localStorage.getItem(payDraftKey) || '{}'); } catch(e) { return {}; } }
  function savePayDraft(section, data) {
    var d = getPayDraft(); d[section] = data;
    try { localStorage.setItem(payDraftKey, JSON.stringify(d)); } catch(e) {}
  }
  function clearPayDraft(section) {
    var d = getPayDraft(); delete d[section];
    try { localStorage.setItem(payDraftKey, JSON.stringify(d)); } catch(e) {}
  }

  var depositDone = payData.depositAmount && payData.depositDate;
  var depSec = div('margin-bottom:var(--sp-2);padding:var(--sp-3);background:'+(depositDone?'#F5FAF5':'var(--ivory1)')+';border-radius:12px;border:1px solid '+(depositDone?'#B0D4B0':'var(--border)'), []);
  var depTitle = div('display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-2)', [
    el('div', {style:'font-size:12px;font-weight:700;color:var(--dark)', text:(depositDone?'✔ ':'')+'선금 (계약금)'}),
  ]);
  if (depositDone) {
    var depEditBtn = btn('font-size:11px;color:#6B6B6B;background:none;border:1px solid var(--border);border-radius:10px;padding:2px 8px;cursor:pointer;font-family:inherit', '수정', function(){
      depSec.innerHTML = ''; buildDepForm();
    });
    depTitle.appendChild(depEditBtn);
    depSec.appendChild(depTitle);
    depSec.appendChild(el('div', {style:'font-size:11px;font-weight:800;color:var(--dark);letter-spacing:-0.5px;margin-bottom:2px', text: Number(payData.depositAmount).toLocaleString()+'원'}));
    depSec.appendChild(el('div', {style:'font-size:11px;color:#6B6B6B', text: (payData.depositMethod||'') + ' · ' + (payData.depositDate||'') + (payData.depositReceipt?' · 현금영수증 ✔':'')}));
  } else {
    depSec.appendChild(depTitle);
    buildDepForm();
  }

  function buildDepForm() {
    var depDraft = (!payData.depositAmount) ? (getPayDraft().dep || {}) : {};
    var depForm = div('display:flex;flex-wrap:wrap;gap:6px', []);
    var depMethod = el('select', {style:'flex:1;min-width:80px;padding:6px;border:1px solid var(--border);border-radius:12px;font-size:11px;font-family:inherit;background:#fff'});
    ['카드','현금'].forEach(function(m){ var o=el('option',{}); o.value=m; o.textContent=m; depMethod.appendChild(o); });
    if (payData.depositMethod) depMethod.value = payData.depositMethod;
    else if (depDraft.method) depMethod.value = depDraft.method;
    var depAmt = el('input', {type:'text', placeholder:'선금 금액', style:'flex:2;min-width:90px;padding:6px;border:1px solid var(--border);border-radius:12px;font-size:11px;font-family:inherit'});
    if (payData.depositAmount) depAmt.value = Number(payData.depositAmount).toLocaleString();
    else if (depDraft.amount) depAmt.value = depDraft.amount;
    var depDate = el('input', {type:'date', style:'flex:2;min-width:110px;padding:6px;border:1px solid var(--border);border-radius:12px;font-size:11px;font-family:inherit'});
    if (payData.depositDate) depDate.value = payData.depositDate;
    else if (depDraft.date) depDate.value = depDraft.date;
    else depDate.value = todayStr();
    var depReceipt = el('label', {style:'display:flex;align-items:center;gap:var(--sp-1);font-size:11px;color:#6B6B6B;cursor:pointer;width:100%'});
    var depReceiptChk = el('input', {type:'checkbox'}); depReceiptChk.checked = payData.depositReceipt || depDraft.receipt || false;
    depReceipt.appendChild(depReceiptChk); depReceipt.appendChild(document.createTextNode('현금영수증'));
    function saveDepDraft() {
      savePayDraft('dep', { method: depMethod.value, amount: depAmt.value, date: depDate.value, receipt: depReceiptChk.checked });
    }
    depMethod.addEventListener('change', saveDepDraft);
    depAmt.addEventListener('input', saveDepDraft);
    depDate.addEventListener('change', saveDepDraft);
    depReceiptChk.addEventListener('change', saveDepDraft);
    var depSave = btn('width:100%;padding:9px;background:var(--dark);color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:var(--sp-1)', '선금 저장', function(){
      var inputAmt = Number(depAmt.value.replace(/[^0-9]/g,'')) || 0;
      if (inputAmt > 0 && !depDate.value) {
        alert('입금 날짜를 입력해주세요.');
        depDate.focus();
        return;
      }
      var expectedHalf = Math.round((c.price || 0) * 0.5);
      if (c.price > 0 && inputAmt > 0 && inputAmt !== expectedHalf) {
        var proceed = confirm(
          '입력하신 선금(' + inputAmt.toLocaleString() + '원)이 견적금액의 50%(' + expectedHalf.toLocaleString() + '원)와 달라요.\n'
          + '이대로 저장할까요?'
        );
        if (!proceed) return;
      }
      var newPd = Object.assign({}, payData);
      newPd.depositMethod  = depMethod.value;
      newPd.depositAmount  = depAmt.value.replace(/[^0-9]/g,'');
      newPd.depositDate    = depDate.value;
      newPd.depositReceipt = depReceiptChk.checked;
      savePayData(newPd);
      clearPayDraft('dep');
      // 2026-08-05: 0원인데도 무조건 다음 단계로 넘어가던 버그 수정 —
      // 실제로 입금액이 0보다 클 때만 "선금결제 완료"로 간주해 단계 전환
      if (inputAmt > 0 && ['방문예약','상담','가견적'].indexOf(c.stage) >= 0) changeStage('선금결제');
      closeDetail(); openDetail(c.clientName, c.id);
    });
    depForm.appendChild(depMethod); depForm.appendChild(depAmt); depForm.appendChild(depDate); depForm.appendChild(depReceipt);
    depSec.appendChild(depForm); depSec.appendChild(depSave);
  }
  paySec.appendChild(depSec);

  // 잔금 섹션
  var balanceDone = payData.balanceAmount && payData.balanceDate;
  var balSec = div('padding:var(--sp-3);background:'+(balanceDone?'#F5FAF5':'var(--ivory1)')+';border-radius:12px;border:1px solid '+(balanceDone?'#B0D4B0':'var(--border)'), []);
  var balTitle = div('display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-2)', [
    el('div', {style:'font-size:12px;font-weight:700;color:var(--dark)', text:(balanceDone?'✔ ':'')+'잔금'})
  ]);
  if (balanceDone) {
    var balEditBtn = btn('font-size:11px;color:#6B6B6B;background:none;border:1px solid var(--border);border-radius:10px;padding:2px 8px;cursor:pointer;font-family:inherit', '수정', function(){
      balSec.innerHTML = ''; buildBalForm();
    });
    balTitle.appendChild(balEditBtn);
    balSec.appendChild(balTitle);
    balSec.appendChild(el('div', {style:'font-size:11px;font-weight:800;color:var(--dark);letter-spacing:-0.5px;margin-bottom:2px', text: Number(payData.balanceAmount).toLocaleString()+'원'}));
    balSec.appendChild(el('div', {style:'font-size:11px;color:#6B6B6B', text: (payData.balanceMethod||'') + ' · ' + (payData.balanceDate||'') + (payData.balanceReceipt?' · 현금영수증 ✔':'')}));
  } else {
    balSec.appendChild(balTitle);
    buildBalForm();
  }
  function buildBalForm() {
    var balDraft = (!payData.balanceAmount) ? (getPayDraft().bal || {}) : {};
    var balForm = div('display:flex;flex-wrap:wrap;gap:6px', []);
    var balMethod = el('select', {style:'flex:1;min-width:80px;padding:6px;border:1px solid var(--border);border-radius:12px;font-size:11px;font-family:inherit;background:#fff'});
    ['카드','현금'].forEach(function(m){ var o=el('option',{}); o.value=m; o.textContent=m; balMethod.appendChild(o); });
    if (payData.balanceMethod) balMethod.value = payData.balanceMethod;
    else if (balDraft.method) balMethod.value = balDraft.method;
    var balAmt = el('input', {type:'text', placeholder:'잔금 금액', style:'flex:2;min-width:90px;padding:6px;border:1px solid var(--border);border-radius:12px;font-size:11px;font-family:inherit'});
    if (payData.balanceAmount) balAmt.value = Number(payData.balanceAmount).toLocaleString();
    else if (balDraft.amount) balAmt.value = balDraft.amount;
    var balDate = el('input', {type:'date', style:'flex:2;min-width:110px;padding:6px;border:1px solid var(--border);border-radius:12px;font-size:11px;font-family:inherit'});
    if (payData.balanceDate) balDate.value = payData.balanceDate;
    else if (balDraft.date) balDate.value = balDraft.date;
    else balDate.value = todayStr();
    var balReceipt = el('label', {style:'display:flex;align-items:center;gap:var(--sp-1);font-size:11px;color:#6B6B6B;cursor:pointer;width:100%'});
    var balReceiptChk = el('input', {type:'checkbox'}); balReceiptChk.checked = payData.balanceReceipt || balDraft.receipt || false;
    balReceipt.appendChild(balReceiptChk); balReceipt.appendChild(document.createTextNode('현금영수증'));
    function saveBalDraft() {
      savePayDraft('bal', { method: balMethod.value, amount: balAmt.value, date: balDate.value, receipt: balReceiptChk.checked });
    }
    balMethod.addEventListener('change', saveBalDraft);
    balAmt.addEventListener('input', saveBalDraft);
    balDate.addEventListener('change', saveBalDraft);
    balReceiptChk.addEventListener('change', saveBalDraft);
    var balSave = btn('width:100%;padding:9px;background:var(--dark);color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:var(--sp-1)', '잔금 저장', function(){
      var inputAmt = Number(balAmt.value.replace(/[^0-9]/g,'')) || 0;
      if (inputAmt > 0 && !balDate.value) {
        alert('입금 날짜를 입력해주세요.');
        balDate.focus();
        return;
      }
      var expectedBalance = Math.max(0, (c.price || 0) - (Number(payData.depositAmount) || 0));
      if (c.price > 0 && inputAmt > 0 && inputAmt !== expectedBalance) {
        var proceed = confirm(
          '입력하신 잔금(' + inputAmt.toLocaleString() + '원)이 예상 잔금(견적금액-선금, ' + expectedBalance.toLocaleString() + '원)과 달라요.\n'
          + '이대로 저장할까요?'
        );
        if (!proceed) return;
      }
      var newPd = Object.assign({}, payData);
      newPd.balanceMethod  = balMethod.value;
      newPd.balanceAmount  = balAmt.value.replace(/[^0-9]/g,'');
      newPd.balanceDate    = balDate.value;
      newPd.balanceReceipt = balReceiptChk.checked;
      savePayData(newPd);
      clearPayDraft('bal');
      // 2026-08-05: 0원인데도 무조건 다음 단계로 넘어가던 버그 수정 —
      // 실제로 입금액이 0보다 클 때만 "잔금결제 완료"로 간주해 단계 전환
      // 2026-08-05: 자동전환 조건이 '실측준비중/확정견적/잔금결제' 딱 3개 단계에서만
      // 작동해서, 아직 '선금결제'에 머문 채로 바로 잔금부터 받으면(중간 단계를
      // 하나씩 안 거치는 실제 업무 흐름) 전환이 안 걸리는 버그가 있었음(선혜님이
      // 실제 화면에서 발견). 특정 단계 목록이 아니라 "시공준비중보다 앞선 단계면
      // 전부" 전환되도록 STAGE_NUM 순서 비교로 일반화.
      var stageIsBeforeInstallPrep = (typeof STAGE_NUM !== 'undefined') && STAGE_NUM[c.stage] && STAGE_NUM[c.stage] < STAGE_NUM['시공준비중'];
      if (inputAmt > 0 && stageIsBeforeInstallPrep) changeStage('시공준비중');
      closeDetail(); openDetail(c.clientName, c.id);
    });
    balForm.appendChild(balMethod); balForm.appendChild(balAmt); balForm.appendChild(balDate); balForm.appendChild(balReceipt);
    balSec.appendChild(balForm); balSec.appendChild(balSave);
  }
  paySec.appendChild(balSec);
  if (payBody) payBody.appendChild(paySec);
}
