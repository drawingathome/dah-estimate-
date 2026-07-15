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
  document.querySelectorAll('#curtain-body tr').forEach(function(r) {
    if (getPriceVal(r.querySelector('.cprice')) > 0) hasProduct = true;
  });
  document.querySelectorAll('#blind-body tr').forEach(function(r) {
    if (getPriceVal(r.querySelector('.blind-price')) > 0) hasProduct = true;
  });
  if (!hasProduct) { showToast('제품 금액을 1개 이상 입력해주세요', 'error'); return false; }

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
      xhr.open('POST',SUPABASE_URL+'/rest/v1/customers',true);
      xhr.setRequestHeader('apikey',SUPABASE_KEY);
      xhr.setRequestHeader('Authorization','Bearer '+(typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
      xhr.setRequestHeader('Content-Type','application/json');
      xhr.setRequestHeader('Prefer','return=minimal');
      xhr.onload=function(){
        if (xhr.status < 200 || xhr.status >= 300) {
          console.warn('Supabase 고객 저장 실패 (status='+xhr.status+'):', xhr.responseText);
        }
        saveToEstimates();
      };
      xhr.onerror=function(){ console.warn('Supabase 고객 저장 실패 (localStorage는 완료)'); saveToEstimates(); };
      xhr.send(JSON.stringify({
        client_name:name, phone:phone, addr:addr+(addr2?' '+addr2:''),
        memo:custMemo+' | 커튼:'+grand+'원',
        staff_name:staffName
      }));
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
      xhr2.send(JSON.stringify({
        customer_name:name, price:grand,
        performance_revenue:perf, staff_name:staffName,
        status:currentTab||'ga',
        data: {phone:phone, space:spaceStr, product:fabricStr}
      }));
    } catch(e) { console.warn('Supabase 연결 오류:', e); showToast('✅ 저장 완료 (로컬) — DB 동기화는 실패했어요'); }
  }
  function saveToLocalStorage() {
    try {
      var saved = JSON.parse(localStorage.getItem('dah_saved')||'[]');
      var noStr = document.getElementById('c-no').value.trim();
      var isFinal = (currentTab === 'final' || document.getElementById('status-final')?.classList.contains('on'));
      
      var idx = saved.findIndex(function(e){ return e.no === noStr; });
      var entry = {
        id: noStr || ('local-'+Date.now()),
        no: noStr,
        clientName: name,
        phone: phone,
        addr: addr+(addr2?' '+addr2:''),
        space: spaceStr,
        fabric: fabricStr,
        price: grand,
        performanceRevenue: perf,
        staffName: staffName,
        status: isFinal ? 'final' : 'ga',   
        contractStatus: 'pending',            
        savedAt: new Date().toISOString(),
        expiryAt: new Date(Date.now()+7*24*60*60*1000).toISOString(),
        date: document.getElementById('c-measure')?.value || '',
        installDate: document.getElementById('c-install')?.value || '',
        memo: custMemo
      };
      if (idx >= 0) saved[idx] = entry;
      else saved.unshift(entry);
      
      if (saved.length > 500) saved = saved.slice(0, 500);
      localStorage.setItem('dah_saved', JSON.stringify(saved));

      
      try {
        var customers = JSON.parse(localStorage.getItem('dah_customers')||'[]');
        var cidx = customers.findIndex(function(c){ return c.id === entry.id; });
        var custEntry = {
          id: entry.id,
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
