/* ══════════════════════════════════════════════════
   고객상세 - 결제(선금/잔금) 탭 렌더링
   ══════════════════════════════════════════════════
   dash-customer-detail.js에서 분리됨 (2026-07-17) —
   원래 openDetail() 함수 하나가 500줄 넘게 모든 탭을 다 그렸는데,
   결제 관련 로직만 이 파일로 분리함.
   openDetail()이 renderPaySection(c, payBody)를 호출함. */

function renderPaySection(c, payBody) {
  // 결제 관리 섹션 - customers 객체 직접 사용 (localStorage 병행)
  var payData = {
    depositAmount:  c.depositAmount  || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').depositAmount||0; }catch(e){return 0;} })(),
    depositDate:    c.depositDate    || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').depositDate||''; }catch(e){return '';} })(),
    depositMethod:  c.depositMethod  || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').depositMethod||''; }catch(e){return '';} })(),
    depositReceipt: c.depositReceipt || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').depositReceipt||false; }catch(e){return false;} })(),
    balanceAmount:  c.balanceAmount  || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').balanceAmount||0; }catch(e){return 0;} })(),
    balanceDate:    c.balanceDate    || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').balanceDate||''; }catch(e){return '';} })(),
    balanceMethod:  c.balanceMethod  || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').balanceMethod||''; }catch(e){return '';} })(),
    balanceReceipt: c.balanceReceipt || (function(){ try{ return JSON.parse(localStorage.getItem('dah_pay_'+c.clientName)||'{}').balanceReceipt||false; }catch(e){return false;} })()
  };

  var paySec = div('margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #EEE6DC', []);
  paySec.appendChild(el('div', {style:'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px', text:'결제 관리'}));

  function savePayData(pd) {
    // 1) localStorage 백업
    localStorage.setItem('dah_pay_'+c.clientName, JSON.stringify(pd));
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
  var depositDone = payData.depositAmount && payData.depositDate;
  var depSec = div('margin-bottom:8px;padding:12px;background:'+(depositDone?'#F5FAF5':'#FAF7F5')+';border-radius:12px;border:1px solid '+(depositDone?'#B0D4B0':'#EEE6DC'), []);
  var depTitle = div('display:flex;align-items:center;justify-content:space-between;margin-bottom:8px', [
    el('div', {style:'font-size:12px;font-weight:700;color:#282828', text:(depositDone?'✔ ':'')+'선금 (계약금)'}),
  ]);
  if (depositDone) {
    var depEditBtn = btn('font-size:11px;color:#6B6B6B;background:none;border:1px solid #EEE6DC;border-radius:10px;padding:2px 8px;cursor:pointer;font-family:inherit', '수정', function(){
      depSec.innerHTML = ''; buildDepForm();
    });
    depTitle.appendChild(depEditBtn);
    depSec.appendChild(depTitle);
    depSec.appendChild(el('div', {style:'font-size:11px;font-weight:800;color:#282828;letter-spacing:-0.5px;margin-bottom:2px', text: Number(payData.depositAmount).toLocaleString()+'원'}));
    depSec.appendChild(el('div', {style:'font-size:11px;color:#6B6B6B', text: (payData.depositMethod||'') + ' · ' + (payData.depositDate||'') + (payData.depositReceipt?' · 현금영수증 ✔':'')}));
  } else {
    depSec.appendChild(depTitle);
    buildDepForm();
  }
  function buildDepForm() {
    var depForm = div('display:flex;flex-wrap:wrap;gap:6px', []);
    var depMethod = el('select', {style:'flex:1;min-width:80px;padding:6px;border:1px solid #EEE6DC;border-radius:12px;font-size:11px;font-family:inherit;background:#fff'});
    ['카드','현금'].forEach(function(m){ var o=el('option',{}); o.value=m; o.textContent=m; depMethod.appendChild(o); });
    if (payData.depositMethod) depMethod.value = payData.depositMethod;
    var depAmt = el('input', {type:'text', placeholder:'선금 금액', style:'flex:2;min-width:90px;padding:6px;border:1px solid #EEE6DC;border-radius:12px;font-size:11px;font-family:inherit'});
    if (payData.depositAmount) depAmt.value = Number(payData.depositAmount).toLocaleString();
    var depDate = el('input', {type:'date', style:'flex:2;min-width:110px;padding:6px;border:1px solid #EEE6DC;border-radius:12px;font-size:11px;font-family:inherit'});
    if (payData.depositDate) depDate.value = payData.depositDate;
    var depReceipt = el('label', {style:'display:flex;align-items:center;gap:4px;font-size:11px;color:#6B6B6B;cursor:pointer;width:100%'});
    var depReceiptChk = el('input', {type:'checkbox'}); depReceiptChk.checked = payData.depositReceipt||false;
    depReceipt.appendChild(depReceiptChk); depReceipt.appendChild(document.createTextNode('현금영수증'));
    var depSave = btn('width:100%;padding:9px;background:#282828;color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:4px', '선금 저장', function(){
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
      if (c.stage === '상담') changeStage('계약금');
      closeDetail(); openDetail(c.clientName, c.id);
    });
    depForm.appendChild(depMethod); depForm.appendChild(depAmt); depForm.appendChild(depDate); depForm.appendChild(depReceipt);
    depSec.appendChild(depForm); depSec.appendChild(depSave);
  }
  paySec.appendChild(depSec);

  // 잔금 섹션
  var balanceDone = payData.balanceAmount && payData.balanceDate;
  var balSec = div('padding:12px;background:'+(balanceDone?'#F5FAF5':'#FAF7F5')+';border-radius:12px;border:1px solid '+(balanceDone?'#B0D4B0':'#EEE6DC'), []);
  var balTitle = div('display:flex;align-items:center;justify-content:space-between;margin-bottom:8px', [
    el('div', {style:'font-size:12px;font-weight:700;color:#282828', text:(balanceDone?'✔ ':'')+'잔금'})
  ]);
  if (balanceDone) {
    var balEditBtn = btn('font-size:11px;color:#6B6B6B;background:none;border:1px solid #EEE6DC;border-radius:10px;padding:2px 8px;cursor:pointer;font-family:inherit', '수정', function(){
      balSec.innerHTML = ''; buildBalForm();
    });
    balTitle.appendChild(balEditBtn);
    balSec.appendChild(balTitle);
    balSec.appendChild(el('div', {style:'font-size:11px;font-weight:800;color:#282828;letter-spacing:-0.5px;margin-bottom:2px', text: Number(payData.balanceAmount).toLocaleString()+'원'}));
    balSec.appendChild(el('div', {style:'font-size:11px;color:#6B6B6B', text: (payData.balanceMethod||'') + ' · ' + (payData.balanceDate||'') + (payData.balanceReceipt?' · 현금영수증 ✔':'')}));
  } else {
    balSec.appendChild(balTitle);
    buildBalForm();
  }
  function buildBalForm() {
    var balForm = div('display:flex;flex-wrap:wrap;gap:6px', []);
    var balMethod = el('select', {style:'flex:1;min-width:80px;padding:6px;border:1px solid #EEE6DC;border-radius:12px;font-size:11px;font-family:inherit;background:#fff'});
    ['카드','현금'].forEach(function(m){ var o=el('option',{}); o.value=m; o.textContent=m; balMethod.appendChild(o); });
    if (payData.balanceMethod) balMethod.value = payData.balanceMethod;
    var balAmt = el('input', {type:'text', placeholder:'잔금 금액', style:'flex:2;min-width:90px;padding:6px;border:1px solid #EEE6DC;border-radius:12px;font-size:11px;font-family:inherit'});
    if (payData.balanceAmount) balAmt.value = Number(payData.balanceAmount).toLocaleString();
    var balDate = el('input', {type:'date', style:'flex:2;min-width:110px;padding:6px;border:1px solid #EEE6DC;border-radius:12px;font-size:11px;font-family:inherit'});
    if (payData.balanceDate) balDate.value = payData.balanceDate;
    var balReceipt = el('label', {style:'display:flex;align-items:center;gap:4px;font-size:11px;color:#6B6B6B;cursor:pointer;width:100%'});
    var balReceiptChk = el('input', {type:'checkbox'}); balReceiptChk.checked = payData.balanceReceipt||false;
    balReceipt.appendChild(balReceiptChk); balReceipt.appendChild(document.createTextNode('현금영수증'));
    var balSave = btn('width:100%;padding:9px;background:#282828;color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:4px', '잔금 저장', function(){
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
      if (c.stage === '실측' || c.stage === '잔금') changeStage('시공');
      closeDetail(); openDetail(c.clientName, c.id);
    });
    balForm.appendChild(balMethod); balForm.appendChild(balAmt); balForm.appendChild(balDate); balForm.appendChild(balReceipt);
    balSec.appendChild(balForm); balSec.appendChild(balSave);
  }
  paySec.appendChild(balSec);
  if (payBody) payBody.appendChild(paySec);
}
