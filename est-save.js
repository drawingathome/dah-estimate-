/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 저장/검증/토스트
   PDF저장, 새견적서 초기화, 입력값 검증, 견적서 저장(고객/견적DB 동기화),
   전체 견적서 엑셀 내보내기, 토스트 알림.
   ══════════════════════════════════════════════════ */

function savePDF() {
  showToast('PDF 저장 중...');
  setTimeout(function(){ window.print(); }, 300);
}

function newEstimate() {
  if(!confirm('새 견적서를 작성하시겠어요? 현재 내용이 초기화됩니다.')) return;
  document.getElementById('c-name').value='';
  document.getElementById('c-phone').value='';
  document.getElementById('c-addr').value='';
  document.getElementById('c-memo').value='';
  document.getElementById('c-region').value='';
  document.getElementById('discount').value=0;
  var depInp=document.getElementById('deposit-input');
  if(depInp){depInp.value='';depInp.removeAttribute('data-raw');}
  document.getElementById('sum-balance').textContent='0원';
  document.getElementById('curtain-body').innerHTML='';
  document.getElementById('blind-body').innerHTML='';
  document.getElementById('svc-body').innerHTML='';
  document.getElementById('blind-table').style.display='none';
  document.getElementById('survey-card').style.display='none';
  var d=new Date();
  document.getElementById('c-date').value=d.toISOString().slice(0,10);
  // 견적번호 안전한 순번 채번
  (function(){
    var p2 = function(n){ return String(n).padStart(2,'0'); };
    var saved = [];
    try { saved = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e) {}
    var prefix = 'DAH-' + d.getFullYear() + p2(d.getMonth()+1) + p2(d.getDate()) + '-';
    var todayNos = saved
      .map(function(e){ return e.no||''; })
      .filter(function(no){ return no.indexOf(prefix) === 0; })
      .map(function(no){ return parseInt(no.replace(prefix,''))||0; });
    var nextSeq = todayNos.length > 0 ? Math.max.apply(null, todayNos) + 1 : 1;
    document.getElementById('c-no').value = prefix + String(nextSeq).padStart(2,'0');
  })();
  setStatus('ga');
  setCustType('new');
  addCurtainRow();
  calcTotal();
  showToast('✅ 새 견적서 시작');
}

function showFieldError(fieldId, msg) {
  var el = document.getElementById(fieldId);
  if (!el) return;
  el.style.borderBottomColor = '#C0392B';
  var errEl = el.parentNode.querySelector('.field-err');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.className = 'field-err';
    errEl.style.cssText = 'font-size:11px;color:#C0392B;margin-top:3px;font-weight:500';
    el.parentNode.appendChild(errEl);
  }
  errEl.textContent = msg;
  setTimeout(function() {
    el.style.borderBottomColor = '';
    if (errEl) errEl.remove();
  }, 3000);
  el.focus();
}

function validateEstimate() {
  var name = document.getElementById('c-name')?.value?.trim();
  if (!name) { showFieldError('c-name', '고객명을 입력해주세요'); return false; }
  var hasProduct = false;
  var missingPriceRows = []; // 가로/높이는 채웠는데 단가를 빼먹은 행 번호(사람이 세는 순서, 1부터)

  document.querySelectorAll('#curtain-body tr').forEach(function(r, idx) {
    var price = getPriceVal(r.querySelector('.cprice'));
    var hasSize = (r.querySelector('.mw')?.value || '').trim() !== '' || (r.querySelector('.mh')?.value || '').trim() !== '';
    if (price > 0) hasProduct = true;
    else if (hasSize) missingPriceRows.push('커튼 ' + (idx + 1) + '번째');
  });
  document.querySelectorAll('#blind-body tr').forEach(function(r, idx) {
    var price = getPriceVal(r.querySelector('.blind-price'));
    var hasSize = (r.querySelector('.mw')?.value || '').trim() !== '' || (r.querySelector('.mh')?.value || '').trim() !== '';
    if (price > 0) hasProduct = true;
    else if (hasSize) missingPriceRows.push('블라인드 ' + (idx + 1) + '번째');
  });
  if (!hasProduct) {
    // 2026-08-05: AS·수선 접수는 무상 하자처리처럼 제품금액이 없을 수 있음.
    // 증상이 기재되어 있으면 금액 없이도 저장 가능하게 예외 처리 —
    // 예전엔 이 조건이 없어서 무상 AS건은 저장 자체가 막혔었음.
    var asSymptomFilled = (currentCustType === 'as') && (document.getElementById('as-symptom')?.value || '').trim() !== '';
    if (!asSymptomFilled) { showToast('제품 금액을 1개 이상 입력해주세요', 'error'); return false; }
  }
  // 가로/높이까지 입력해놓고 단가만 빼먹은 행이 있으면 — 조용히 0원으로 저장되는 걸 막고 알려줌
  if (missingPriceRows.length > 0) {
    showToast('⚠️ ' + missingPriceRows.join(', ') + ' 항목의 단가가 비어있어요. 확인 후 다시 저장해주세요', 'error');
    return false;
  }

  // 블라인드 옵션추가금(전동 등)이 있는데 지역(시공비 행)이 선택 안 된 경우 —
  // 이 금액이 견적 총액에 반영되지 못하고 그대로 저장되어 누락될 수 있으므로 저장 자체를 막음
  var blindBody = document.getElementById('blind-body');
  var svcBody = document.getElementById('svc-body');
  if (blindBody && svcBody) {
    var extraSum = 0;
    blindBody.querySelectorAll('.blind-extra').forEach(function(inp){
      extraSum += Math.max(0, parseFloat(inp.value.replace(/[^0-9.-]/g,''))||0);
    });
    var hasSvcRow = !!svcBody.querySelector('[data-svc-type="시공비"]');
    if (extraSum > 0 && !hasSvcRow) {
      showToast('⚠️ 옵션추가금(전동 등)이 반영되려면 먼저 지역(서울/경기/기타)을 선택해주세요', 'error');
      return false;
    }
  }
  return true;
}

function getExpiryBadge(savedAt) {
  if(!savedAt) return '';
  var diff = Math.ceil((new Date(savedAt).getTime() + 7*24*60*60*1000 - Date.now()) / 86400000);
  if(diff > 3) return '<span class="expiry-badge ok">D-'+diff+'</span>';
  if(diff > 0) return '<span class="expiry-badge warn">D-'+diff+' 마감임박</span>';
  return '<span class="expiry-badge over">유효기간 만료</span>';
}
function saveEstimate() {
  clearDraft(); // 저장 완료 시 초안 삭제
  if (!validateEstimate()) return;
  var name=document.getElementById('c-name').value.trim();
  if(!name) { showToast('⚠️ 고객명을 입력하세요'); return; }
  var phone=document.getElementById('c-phone').value.trim();
  var addr=document.getElementById('c-addr').value.trim();
  var addr2=document.getElementById('c-addr2')?.value.trim()||'';
  var staffName=document.getElementById('c-staff').value.trim();
  var custMemo=document.getElementById('c-memo').value.trim();
  var grand=parseInt(document.getElementById('sum-total').textContent.replace(/[^0-9]/g,''))||0;
  var perf=parseInt(document.getElementById('sum-perf').textContent.replace(/[^0-9]/g,''))||0;
  var spaceArr=[],fabricArr=[];
  document.querySelectorAll('#curtain-body tr').forEach(function(tr){
    var s=tr.querySelector('.space-inp')?.value||''; if(s) spaceArr.push(s);
    var f=tr.querySelector('.c-display-name')?.value||''; if(f) fabricArr.push(f);
  });
  var spaceStr=spaceArr.join(', '), fabricStr=fabricArr.join(', ');
  // 커튼/블라인드 각 행의 전체 세부정보 수집 (2026-08-04 신규) — 예전엔 요약
  // 문자열(spaceStr/fabricStr)만 저장돼서, 저장 후엔 발주서/실측의뢰서를
  // 다시 만들 방법이 전혀 없었음(사이즈/원단/거래처/색상 등이 다 사라짐).
  // 이제 각 행 전체를 그대로 배열로 저장해서, 나중에 이 데이터로 문서를
  // 다시 만들 수 있게 함.
  var lineItems = [];
  document.querySelectorAll('#curtain-body tr').forEach(function(tr){
    var space = tr.querySelector('.space-inp')?.value||'';
    var displayName = tr.querySelector('.c-display-name')?.value||'';
    var fabric = tr.querySelector('.c-fabric')?.value||'';
    if (!space && !displayName && !fabric) return; // 완전히 빈 행은 제외
    lineItems.push({
      type: 'curtain', space: space, displayName: displayName, fabric: fabric,
      vendor: tr.querySelector('.c-vendor')?.value||'', color: tr.querySelector('.c-color')?.value||'',
      pleatType: tr.querySelector('.pleat-type')?.value||'', openType: tr.querySelector('.open-type')?.value||'',
      hemType: tr.querySelector('.hem-type')?.value||'', mw: tr.querySelector('.mw')?.value||'',
      mh: tr.querySelector('.mh')?.value||'', pnum: tr.querySelector('.pnum')?.value||'',
      price: getPriceVal(tr.querySelector('.cprice')), amt: tr.querySelector('.camt')?.textContent||''
    });
  });
  document.querySelectorAll('#blind-body tr').forEach(function(tr){
    var space = tr.querySelector('.space-inp')?.value||'';
    var innerInps = tr.querySelectorAll('.inner-row .inner-inp');
    var fabric = innerInps[0]?.value||'';
    if (!space && !fabric) return;
    lineItems.push({
      type: 'blind', space: space, fabric: fabric,
      vendor: innerInps[1]?.value||'', color: innerInps[2]?.value||'',
      kind: tr.querySelector('.blind-kind')?.value||'', handle: tr.querySelector('.handle-dir')?.value||'',
      bmw: tr.querySelector('.bmw')?.value||'', bmh: tr.querySelector('.bmh')?.value||'',
      opt: tr.querySelector('.blind-opt')?.value||'',
      price: getPriceVal(tr.querySelector('.blind-price')), amt: tr.querySelector('.bamt')?.textContent||''
    });
  });
  function saveToCustomers() {
    
    saveToLocalStorage();

    // 고객명단 구글시트 동기화 (항상 — 가견적/확정 상관없이 현재 상태 반영)
    var isFinalForDrive = (currentTab === 'final' || document.getElementById('status-final')?.classList.contains('on'));
    syncCustomerToSheet({
      clientName: name, phone: phone, addr: addr+(addr2?' '+addr2:''),
      staffName: staffName, stage: isFinalForDrive ? '확정견적' : '가견적',
      price: grand, performanceRevenue: perf,
      date: document.getElementById('c-measure')?.value||'',
      measureDate: document.getElementById('c-measure')?.value||'',
      installDate: document.getElementById('c-install')?.value||'',
      memo: custMemo
    });

    // 견적서는 확정(최종) 견적서일 때만 구글드라이브에 저장 (가견적서는 저장 안 함)
    if (isFinalForDrive && typeof buildCustomerHTML === 'function') {
      try {
        var custDocHtml = buildCustomerHTML();
        saveDocumentToDrive('견적서', name || '미지정고객', phone, custDocHtml);
      } catch(e) { console.warn('견적서 드라이브 저장용 HTML 생성 실패:', e); }
    }
    
    try {
      var xhr=new XMLHttpRequest();
      var existingCustId = window._estSaveCustomerId;
      var isUpdate = !!existingCustId;
      xhr.open(isUpdate ? 'PATCH' : 'POST', SUPABASE_URL+'/rest/v1/customers'+(isUpdate ? '?id=eq.'+existingCustId : ''), true);
      xhr.setRequestHeader('apikey',SUPABASE_KEY);
      xhr.setRequestHeader('Authorization','Bearer '+(typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
      xhr.setRequestHeader('Content-Type','application/json');
      xhr.setRequestHeader('Prefer', isUpdate ? 'return=minimal' : 'return=representation');
      xhr.onload=function(){
        if (xhr.status < 200 || xhr.status >= 300) {
          console.warn('Supabase 고객 저장 실패 (status='+xhr.status+'):', xhr.responseText);
        } else if (!isUpdate) {
          // 신규 생성 성공 — 응답으로 받은 진짜 id를 로컬 customer 레코드와 견적이력에도 반영
          try {
            var resData = JSON.parse(xhr.responseText);
            if (resData && resData[0] && resData[0].id) {
              var newId = resData[0].id;
              var arr = JSON.parse(localStorage.getItem('dah_customers')||'[]');
              var idx = arr.findIndex(function(c){ return c.clientName === name && !c.id; });
              if (idx >= 0) { arr[idx].id = newId; localStorage.setItem('dah_customers', JSON.stringify(arr)); }
              var savedArr = JSON.parse(localStorage.getItem('dah_saved')||'[]');
              var sIdx = savedArr.findIndex(function(e){ return e.no === document.getElementById('c-no')?.value.trim() && !e.clientId; });
              if (sIdx >= 0) { savedArr[sIdx].clientId = newId; localStorage.setItem('dah_saved', JSON.stringify(savedArr)); }
              window._estSaveCustomerId = newId;
            }
          } catch(e3) { /* 무시 — 로컬 id는 다음 저장시 이름+전화번호로 다시 매칭됨 */ }
        }
        saveToEstimates();
      };
      xhr.onerror=function(){ console.warn('Supabase 고객 저장 실패 (localStorage는 완료)'); saveToEstimates(); };
      var custPayload = {
        client_name:name, phone:phone, addr:addr+(addr2?' '+addr2:''),
        memo:custMemo+' | 커튼:'+grand+'원',
        staff_name:staffName
      };
      // 확정견적일 때만 고객 실적에 금액 동기화 (2026-08-04 신규) — 예전엔
      // 견적서를 아무리 저장해도 customers.price/performance_revenue가
      // 영구히 0으로 남아서, 신규로 발생하는 모든 고객이 매출탭 계산에
      // 절대 안 잡히는 구조적 결함이었음(이관 데이터만 수동으로 채워놔서
      // 우연히 정상으로 보였을 뿐). 가견적 단계에선 그대로 0으로 둬서,
      // 혹시 오래 방치돼도 하위호환 폴백에 잘못 걸리지 않도록 안전하게 둠.
      if (isFinalForDrive) { custPayload.price = grand; custPayload.performance_revenue = perf; }
      xhr.send(JSON.stringify(custPayload));
    } catch(e) { console.warn('Supabase 연결 오류:', e); saveToEstimates(); }
  }
  function saveToEstimates() {
    try {
      var xhr2=new XMLHttpRequest();
      xhr2.open('POST',SUPABASE_URL+'/rest/v1/estimates',true);
      xhr2.setRequestHeader('apikey',SUPABASE_KEY);
      xhr2.setRequestHeader('Authorization','Bearer '+(typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
      xhr2.setRequestHeader('Content-Type','application/json');
      xhr2.setRequestHeader('Prefer','return=minimal');
      xhr2.onload=function(){
        if (xhr2.status >= 200 && xhr2.status < 300) {
          showToast('✅ 저장 완료! (DB+로컬)');
        } else {
          console.warn('Supabase 견적서 저장 실패 (status='+xhr2.status+'):', xhr2.responseText);
          showToast('✅ 저장 완료 (로컬) — DB 동기화는 실패했어요');
        }
      };
      xhr2.onerror=function(){ console.warn('Supabase 견적서 저장 실패 (localStorage는 완료)'); showToast('✅ 저장 완료 (로컬) — DB 동기화는 실패했어요'); };
      xhr2.send(JSON.stringify(Object.assign({
        customer_name:name, price:grand,
        performance_revenue:perf, staff_name:staffName,
        estimate_status:currentTab||'ga',
        phone:phone, space:spaceStr, product:fabricStr,
        date: document.getElementById('c-measure')?.value || '',
        memo: custMemo,
        confirmed_at: window._estimateConfirmedAt || null,
        branch: '반포점',
        client_id: window._estSaveCustomerId || null,
        line_items: lineItems
      }, currentCustType === 'as' ? {
        // 2026-08-05: AS 접수 폼(시공일자/AS유형/증상/사진메모/비용)이 화면엔
        // 있는데 저장 로직에 전혀 연결이 안 돼있어서, 입력해도 저장 시 통째로
        // 사라지던 문제 — DB 컬럼 신규 추가 후 여기서 함께 저장
        as_install_date: document.getElementById('as-install-date')?.value || null,
        as_type: document.getElementById('as-type-sel')?.value || null,
        as_symptom: document.getElementById('as-symptom')?.value || null,
        as_photo_memo: document.getElementById('as-photo-memo')?.value || null,
        as_fee_type: (document.querySelector('input[name="as-fee"]:checked')?.value) || 'free'
      } : {})));
    } catch(e) { console.warn('Supabase 연결 오류:', e); showToast('✅ 저장 완료 (로컬) — DB 동기화는 실패했어요'); }
  }
  function saveToLocalStorage() {
    try {
      var saved = JSON.parse(localStorage.getItem('dah_saved')||'[]');
      var noStr = document.getElementById('c-no').value.trim();
      var isFinal = (currentTab === 'final' || document.getElementById('status-final')?.classList.contains('on'));
      var curtainCount = document.querySelectorAll('#curtain-body tr').length;
      var blindCount = document.querySelectorAll('#blind-body tr').length;
      var itemCount = curtainCount + blindCount;

      // 품목별 거래처 정보 수집 (2026-07-21 신규) — 대시보드 발주현황에서
      // 자동으로 채워쓸 수 있도록, 커튼/블라인드 각각의 거래처를 중복없이 저장
      var curtainVendors = Array.from(document.querySelectorAll('#curtain-body tr .c-vendor'))
        .map(function(el){ return el.value.trim(); }).filter(Boolean);
      var blindVendors = Array.from(document.querySelectorAll('#blind-body tr .c-vendor'))
        .map(function(el){ return el.value.trim(); }).filter(Boolean);
      var uniqCurtainVendors = curtainVendors.filter(function(v,i){ return curtainVendors.indexOf(v)===i; });
      var uniqBlindVendors = blindVendors.filter(function(v,i){ return blindVendors.indexOf(v)===i; });

      var idx = saved.findIndex(function(e){ return e.no === noStr; });
      var entry = {
        id: noStr || ('local-'+Date.now()),
        no: noStr,
        clientName: name,
        phone: phone,
        addr: addr+(addr2?' '+addr2:''),
        space: spaceStr,
        fabric: fabricStr,
        itemCount: itemCount,
        curtainCount: curtainCount,
        blindCount: blindCount,
        curtainVendors: uniqCurtainVendors,
        blindVendors: uniqBlindVendors,
        price: grand,
        performanceRevenue: perf,
        staffName: staffName,
        status: isFinal ? 'final' : 'ga',   
        contractStatus: isFinal ? 'contracted' : 'pending', // 2026-08-04: 최종견적서로 저장하면 계약상태도 자동 동기화(예전엔 별개로 남아 "최종견적서"인데 "가견적"으로 모순되게 보이던 문제)
        savedAt: new Date().toISOString(),
        expiryAt: new Date(Date.now()+7*24*60*60*1000).toISOString(),
        date: document.getElementById('c-measure')?.value || '',
        installDate: document.getElementById('c-install')?.value || '',
        memo: custMemo,
        confirmedAt: window._estimateConfirmedAt || null,
        branch: '반포점',
        lineItems: lineItems
      };
      if (currentCustType === 'as') {
        entry.asInstallDate = document.getElementById('as-install-date')?.value || null;
        entry.asType = document.getElementById('as-type-sel')?.value || null;
        entry.asSymptom = document.getElementById('as-symptom')?.value || null;
        entry.asPhotoMemo = document.getElementById('as-photo-memo')?.value || null;
        entry.asFeeType = (document.querySelector('input[name="as-fee"]:checked')?.value) || 'free';
      }
      if (idx >= 0) saved[idx] = entry;
      else saved.unshift(entry);
      
      if (saved.length > 500) saved = saved.slice(0, 500);
      localStorage.setItem('dah_saved', JSON.stringify(saved));

      
      try {
        var customers = JSON.parse(localStorage.getItem('dah_customers')||'[]');
        // ⚠️ 예전엔 cidx를 entry.id(견적서번호, 저장마다 값이 다름)로 찾아서, 같은 고객이
        // 여러 번 저장할 때마다(가견적→확정견적 등) 매번 새 레코드가 로컬에 쌓이는 버그가 있었음.
        // 이제 "이름+전화번호"로 기존 고객을 찾아서, 있으면 그 고객의 진짜 id(Supabase UUID)를
        // 유지한 채 갱신하고, 없을 때만 새로 만든다.
        var normPhone = function(p){ return (p||'').replace(/\D/g,''); };
        var cidx = customers.findIndex(function(c){
          return c.clientName === entry.clientName && normPhone(c.phone) === normPhone(entry.phone);
        });
        var existingId = cidx >= 0 ? customers[cidx].id : null;
        entry.clientId = existingId; // dah_saved(견적이력)에도 고객 고유번호 반영
        localStorage.setItem('dah_saved', JSON.stringify(saved));
        var custEntry = {
          id: existingId, // 기존 고객이면 진짜 id 유지, 신규면 null(Supabase 저장 응답으로 채워짐)
          clientName: entry.clientName,
          phone: entry.phone,
          addr: entry.addr,
          space: entry.space,
          price: entry.price,
          performanceRevenue: entry.performanceRevenue,
          staffName: entry.staffName,
          stage: entry.contractStatus === 'contracted' ? '계약금' : '상담',
          date: entry.date || new Date().toISOString().slice(0,10),
          measureDate: document.getElementById('c-measure')?.value || '',
          installDate: entry.installDate || '',
          memo: entry.memo || '',
          visitCount: 1,
          estimateNo: entry.no,
          estimateStatus: entry.status,
          createdAt: entry.savedAt
        };
        if (cidx >= 0) {
          
          custEntry.stage = customers[cidx].stage || custEntry.stage;
          custEntry.visitCount = customers[cidx].visitCount || 1;
          customers[cidx] = Object.assign(customers[cidx], custEntry);
        } else {
          customers.unshift(custEntry);
        }
        localStorage.setItem('dah_customers', JSON.stringify(customers));
        window._estSaveCustomerId = existingId; // saveToCustomers/saveToEstimates에서 사용
      } catch(e2) { console.warn('dah_customers 동기화 실패', e2); }

    } catch(e) { console.warn('localStorage 저장 실패', e); }
  }
  saveToCustomers();
  showToast('✅ 저장 완료!');
}

function exportAllEstimatesExcel() {
  try {
    var estimates = [];
    try { estimates = JSON.parse(localStorage.getItem('dah_saved') || '[]'); } catch(ex) {}
    if (!estimates || estimates.length === 0) { showToast('저장된 견적서가 없습니다'); return; }

    var CONTRACT_KO = {pending:'가견적', contracted:'계약됨', rejected:'미계약'};
    var STATUS_KO   = {ga:'가견적서', final:'최종견적서'};

    var headers = [
      '견적번호','구분','계약상태','고객명','연락처','주소','공간',
      '제품/원단','금액(원)','성과매출(원)',
      '담당자','실측일','시공일','저장일','메모'
    ];

    var rows = estimates.map(function(e) {
      return [
        e.no                               || '',
        STATUS_KO[e.status]                || '가견적서',
        CONTRACT_KO[e.contractStatus]      || '가견적',
        e.clientName                       || '',
        e.phone                            || '',
        e.addr                             || '',
        e.space                            || '',
        e.fabric                           || '',
        Number(e.price)                    || 0,
        Number(e.performanceRevenue)       || 0,
        e.staffName                        || '',
        e.date                             || '',
        e.installDate                      || '',
        e.savedAt ? e.savedAt.slice(0,10)  : '',
        e.memo                             || ''
      ];
    });

    var BOM = '\uFEFF';
    var csv = BOM + [headers].concat(rows).map(function(row) {
      return row.map(function(cell) {
        var s = String(cell);
        if (s.indexOf(',') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('"') >= 0) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(',');
    }).join('\r\n');

    var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    var d    = new Date();
    var pad  = function(n){ return String(n).padStart(2,'0'); };
    a.href     = url;
    a.download = '드로잉엣홈_견적서목록_' + d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('견적서 엑셀 저장 완료 (' + estimates.length + '건)');
  } catch(e) {
    alert('내보내기 실패: ' + e.message);
  }
}

function showToast(msg) {
  var t=document.getElementById('toast');
  t.textContent=msg; t.style.opacity='1';
  setTimeout(function(){ t.style.opacity='0'; },2200);
}
