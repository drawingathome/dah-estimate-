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

  function savePayData(pd, callback) {
    if (typeof logEvent === 'function') logEvent('payment_save', { hasDeposit: Number(pd.depositAmount) > 0, hasBalance: Number(pd.balanceAmount) > 0, customerId: c.id, customerName: c.clientName });
    // 2026-08-25(선혜님 발견 — "오지은 실장이 119만원 입금했는데 목표가 그대로"):
    // 매출(목표달성률) 계산은 customers.price/performance_revenue를 기준으로
    // 하는데, 이 두 필드는 오직 견적서를 저장할 때만 채워지고 있었음. 견적서
    // 없이(또는 이 결제화면이 그 견적과 연결이 안 된 채) 입금 정보만 먼저
    // 기록하면, 실제로 돈은 들어왔는데도 매출 집계엔 전혀 안 잡히는 빈틈이
    // 있었음. price/performance_revenue가 아직 비어있는(0) 고객이면, 이번에
    // 입력한 입금 총액만큼은 최소한 매출로 잡히도록 자동으로 채워줌(이미
    // 값이 있으면 덮어쓰지 않음 — 견적서 기반 정확한 금액을 그대로 존중).
    var newDep = Number(pd.depositAmount)||0;
    var newBal = Number(pd.balanceAmount)||0;
    var paidTotal = newDep + newBal;
    var priceWasEmpty = !(Number(c.price) > 0) && !(Number(c.performanceRevenue) > 0);
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
      if (priceWasEmpty && paidTotal > 0) { arr[idx].price = paidTotal; arr[idx].performanceRevenue = paidTotal; }
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
      var patchBody = {
        deposit_amount:  Number(pd.depositAmount)||0,
        deposit_date:    pd.depositDate||'',
        deposit_method:  pd.depositMethod||'',
        deposit_receipt: pd.depositReceipt||false,
        balance_amount:  Number(pd.balanceAmount)||0,
        balance_date:    pd.balanceDate||'',
        balance_method:  pd.balanceMethod||'',
        balance_receipt: pd.balanceReceipt||false
      };
      if (priceWasEmpty && paidTotal > 0) { patchBody.price = paidTotal; patchBody.performance_revenue = paidTotal; }
      // 2026-09-06(선혜님 지적 — "선금이 입금되었고 실측준비중인데 왜 결제
      // 처리 목록에 안 뜨지"로 발견, 실제 DB로 재현 확인): 이 PATCH는
      // 곧바로 다음 줄에서(콜백을 안 기다리고) changeStage()가 호출되면서
      // changeStage() 내부의 saveCustomerToDb()(낙관적 잠금 사용)와 거의
      // 동시에 서버로 나가고 있었음 - 이 PATCH가 먼저 서버에 도착해
      // updated_at을 갱신시키면, 뒤이은 saveCustomerToDb()가 오래된
      // updated_at을 락값으로 들고 있어 "동시저장충돌"로 조용히 실패하는
      // 경우가 있었음(실제로 deposit_amount는 반영됐는데 stage는 '가견적'
      // 그대로 남은 고객을 DB에서 발견함). 콜백을 추가해서, 이 PATCH가
      // 끝난 뒤에만 changeStage()가 실행되도록 순서를 보장함.
      sbXHR('PATCH', 'customers?id=eq.'+c.id, patchBody, function(err, data){
        if (err) {
          showToast('⚠️ 결제정보가 서버에 반영되지 않았어요' + (err.zeroRows ? '(권한 문제일 수 있어요)' : '') + ' — 새로고침해서 확인해주세요');
        } else if (data && data[0] && data[0].updated_at) {
          // 2026-09-08(선혜님 지적 - "너가 이런데이터를 만들기만 하고
          // 방치한게 꽤 되는걸로 아는데" → 실제 client_error_logs에서
          // 오늘 발생한 "손현영" 고객 저장실패로 재발 확인): 어제(9/6)
          // savePayData→changeStage 순서는 보장했지만, savePayData의
          // PATCH 성공 후 로컬스토리지의 락값(updatedAt)을 갱신하는 걸
          // 빠뜨렸음 - 그래서 곧바로 이어지는 changeStage()가 여전히
          // 낡은 updatedAt으로 saveCustomerToDb()를 호출해 "동시저장충돌"
          // (0건 매칭)로 실패하고 있었음. 서버 응답의 최신 updated_at을
          // 로컬에 반영해서, 뒤이은 changeStage()가 최신 락값을 쓰게 함.
          var arr = loadCustomers();
          var localC = arr.find(function(x){ return x.id === c.id; });
          if (localC) { localC.updatedAt = data[0].updated_at; saveCustomers(arr); }
        }
        // 2026-09-11(선혜님 지적 - "선금이 2,170,000원이라서 대시보드에서
        // 적용을 했어 그러면 계약금도 그렇게 나와야 하는데 견적서의
        // 계약금(50%)... 이라고 나온다고"): 실측/시공일 동기화와 정확히
        // 같은 유형의 누락 - 결제탭에서 실제로 받은 선금을 입력해도,
        // 연결된 견적서의 price_breakdown.deposit(자동계산된 50% 계획값)은
        // 전혀 안 바뀌고 있었음. price_breakdown은 JSON 통째 컬럼이라
        // 먼저 최신 견적서를 조회해서 기존 값과 병합한 뒤 다시 저장.
        if (!err && typeof SUPABASE_URL !== 'undefined' && c.id) {
          try {
            var findEstXhr = new XMLHttpRequest();
            findEstXhr.open('GET', SUPABASE_URL + '/rest/v1/estimates?client_id=eq.' + encodeURIComponent(c.id) + '&order=created_at.desc&limit=1&select=id,price_breakdown', true);
            findEstXhr.setRequestHeader('apikey', SUPABASE_KEY);
            findEstXhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
            findEstXhr.onload = function() {
              try {
                var estRows = JSON.parse(findEstXhr.responseText);
                var estRow = estRows && estRows[0];
                if (estRow && estRow.price_breakdown) {
                  var pb = Object.assign({}, estRow.price_breakdown);
                  pb.deposit = newDep;
                  pb.balance = (Number(pb.finalTotal) || 0) - newDep;
                  var patchEstXhr = new XMLHttpRequest();
                  patchEstXhr.open('PATCH', SUPABASE_URL + '/rest/v1/estimates?id=eq.' + encodeURIComponent(estRow.id), true);
                  patchEstXhr.setRequestHeader('apikey', SUPABASE_KEY);
                  patchEstXhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
                  patchEstXhr.setRequestHeader('Content-Type', 'application/json');
                  patchEstXhr.send(JSON.stringify({ price_breakdown: pb }));
                }
              } catch (eEstFind) {}
            };
            findEstXhr.send();
          } catch (eEstOuter) {}
        }
        if (callback) callback();
      });
    } else {
      if (callback) callback();
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
    // 2026-09-08(선혜님 지시 - "카드든 현금이든 나눠서 할 경우 추가할 수
    // 있게 해줘"): 결제방법을 카드/현금 중 하나만 고를 수 있어서, 나눠서
    // 입금됐을 때(예: 일부는 카드, 일부는 현금) 기록할 방법이 없었음.
    // 기존 한 줄(방법+금액)은 그대로 두고, "+ 결제수단 추가" 버튼으로
    // 같은 형태의 줄을 더 붙일 수 있게 함 - 저장시 모든 줄의 금액을
    // 합산하고, 방법들은 " + "로 조합한 문자열로 저장(예: "카드 500,000원
    // + 현금 500,000원"). DB 스키마(deposit_amount 단일 숫자 컬럼) 변경
    // 없이 처리 가능해 다른 곳(매출계산, 단계전환 등)에 영향 없음.
    var depExtraWrap = div('display:flex;flex-direction:column;gap:6px;width:100%', []);
    var depExtraRows = [];
    function addDepExtraRow() {
      var row = div('display:flex;flex-wrap:wrap;gap:6px;width:100%', []);
      var m = el('select', {style:'flex:1;min-width:80px;padding:6px;border:1px solid var(--border);border-radius:12px;font-size:11px;font-family:inherit;background:#fff'});
      ['카드','현금'].forEach(function(mm){ var o=el('option',{}); o.value=mm; o.textContent=mm; m.appendChild(o); });
      var a = el('input', {type:'text', placeholder:'추가 금액', style:'flex:2;min-width:90px;padding:6px;border:1px solid var(--border);border-radius:12px;font-size:11px;font-family:inherit'});
      var rm = btn('padding:6px 10px;background:var(--ivory1);color:#6B6B6B;border:none;border-radius:12px;font-size:11px;font-family:inherit;cursor:pointer', '×', function(){
        depExtraWrap.removeChild(row);
        depExtraRows = depExtraRows.filter(function(r){ return r !== rowObj; });
      });
      row.appendChild(m); row.appendChild(a); row.appendChild(rm);
      depExtraWrap.appendChild(row);
      var rowObj = { method: m, amount: a };
      depExtraRows.push(rowObj);
    }
    var depAddBtn = btn('padding:6px 10px;background:transparent;color:var(--terra);border:1px dashed var(--terra);border-radius:12px;font-size:11px;font-family:inherit;cursor:pointer;width:100%', '+ 결제수단 추가(나눠 받은 경우)', addDepExtraRow);
    var depSave = btn('width:100%;padding:9px;background:var(--dark);color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:var(--sp-1)', '선금 저장', function(){
      var inputAmt = Number(depAmt.value.replace(/[^0-9]/g,'')) || 0;
      // 추가된 줄들의 금액을 합산 및 방법 조합
      var methodParts = [];
      if (inputAmt > 0) methodParts.push(depMethod.value + ' ' + inputAmt.toLocaleString() + '원');
      depExtraRows.forEach(function(r){
        var amt = Number(r.amount.value.replace(/[^0-9]/g,'')) || 0;
        if (amt > 0) { inputAmt += amt; methodParts.push(r.method.value + ' ' + amt.toLocaleString() + '원'); }
      });
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
      newPd.depositMethod  = methodParts.length > 1 ? methodParts.join(' + ') : depMethod.value;
      newPd.depositAmount  = String(inputAmt);
      newPd.depositDate    = depDate.value;
      newPd.depositReceipt = depReceiptChk.checked;
      clearPayDraft('dep');
      savePayData(newPd, function(){
        // 2026-08-05: 0원인데도 무조건 다음 단계로 넘어가던 버그 수정 —
        // 실제로 입금액이 0보다 클 때만 "선금결제 완료"로 간주해 단계 전환
        if (inputAmt > 0 && ['방문예약','상담','가견적'].indexOf(c.stage) >= 0) changeStage('선금결제');
        closeDetail(); openDetail(c.clientName, c.id);
      });
    });
    depForm.appendChild(depMethod); depForm.appendChild(depAmt); depForm.appendChild(depDate); depForm.appendChild(depReceipt);
    depSec.appendChild(depForm); depSec.appendChild(depExtraWrap); depSec.appendChild(depAddBtn); depSec.appendChild(depSave);
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
    // 2026-09-08(선혜님 지시 - "카드든 현금이든 나눠서 할 경우 추가할 수
    // 있게 해줘"): 선금과 동일한 방식 - 나눠서 입금됐을 때 줄을 추가해서
    // 각각 기록, 저장시 합산+조합 문자열로 처리.
    var balExtraWrap = div('display:flex;flex-direction:column;gap:6px;width:100%', []);
    var balExtraRows = [];
    function addBalExtraRow() {
      var row = div('display:flex;flex-wrap:wrap;gap:6px;width:100%', []);
      var m = el('select', {style:'flex:1;min-width:80px;padding:6px;border:1px solid var(--border);border-radius:12px;font-size:11px;font-family:inherit;background:#fff'});
      ['카드','현금'].forEach(function(mm){ var o=el('option',{}); o.value=mm; o.textContent=mm; m.appendChild(o); });
      var a = el('input', {type:'text', placeholder:'추가 금액', style:'flex:2;min-width:90px;padding:6px;border:1px solid var(--border);border-radius:12px;font-size:11px;font-family:inherit'});
      var rm = btn('padding:6px 10px;background:var(--ivory1);color:#6B6B6B;border:none;border-radius:12px;font-size:11px;font-family:inherit;cursor:pointer', '×', function(){
        balExtraWrap.removeChild(row);
        balExtraRows = balExtraRows.filter(function(r){ return r !== rowObj; });
      });
      row.appendChild(m); row.appendChild(a); row.appendChild(rm);
      balExtraWrap.appendChild(row);
      var rowObj = { method: m, amount: a };
      balExtraRows.push(rowObj);
    }
    var balAddBtn = btn('padding:6px 10px;background:transparent;color:var(--terra);border:1px dashed var(--terra);border-radius:12px;font-size:11px;font-family:inherit;cursor:pointer;width:100%', '+ 결제수단 추가(나눠 받은 경우)', addBalExtraRow);
    var balSave = btn('width:100%;padding:9px;background:var(--dark);color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:var(--sp-1)', '잔금 저장', function(){
      var inputAmt = Number(balAmt.value.replace(/[^0-9]/g,'')) || 0;
      var methodParts = [];
      if (inputAmt > 0) methodParts.push(balMethod.value + ' ' + inputAmt.toLocaleString() + '원');
      balExtraRows.forEach(function(r){
        var amt = Number(r.amount.value.replace(/[^0-9]/g,'')) || 0;
        if (amt > 0) { inputAmt += amt; methodParts.push(r.method.value + ' ' + amt.toLocaleString() + '원'); }
      });
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
      newPd.balanceMethod  = methodParts.length > 1 ? methodParts.join(' + ') : balMethod.value;
      newPd.balanceAmount  = String(inputAmt);
      newPd.balanceDate    = balDate.value;
      newPd.balanceReceipt = balReceiptChk.checked;
      clearPayDraft('bal');
      savePayData(newPd, function(){
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
    });
    balForm.appendChild(balMethod); balForm.appendChild(balAmt); balForm.appendChild(balDate); balForm.appendChild(balReceipt);
    balSec.appendChild(balForm); balSec.appendChild(balExtraWrap); balSec.appendChild(balAddBtn); balSec.appendChild(balSave);
  }
  paySec.appendChild(balSec);
  if (payBody) payBody.appendChild(paySec);
}
