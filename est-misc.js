/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 주소검색 / 날짜포맷 / 빈상태 / 공유 / 자동저장
   ══════════════════════════════════════════════════ */

function openKakaoAddr(targetId) {
  var script = document.createElement('script');
  script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  script.onload = function() {
    new daum.Postcode({
      oncomplete: function(data) {
        var addr = data.roadAddress || data.jibunAddress;
        var el = document.getElementById(targetId);
        if (el) {
          el.value = addr;
          el.dispatchEvent(new Event('input'));
          el.dispatchEvent(new Event('change'));
        }
      }
    }).open();
  };
  
  if (window.daum && window.daum.Postcode) {
    script.onload = null;
    new daum.Postcode({
      oncomplete: function(data) {
        var addr = data.roadAddress || data.jibunAddress;
        var el = document.getElementById(targetId);
        if (el) {
          el.value = addr;
          el.dispatchEvent(new Event('input'));
          el.dispatchEvent(new Event('change'));
        }
      }
    }).open();
  } else {
    document.head.appendChild(script);
  }
}

function fmtDateKo(el) {
  var v = el.value.replace(/[^0-9]/g,'');
  var out = '';
  if(v.length>0) out = v.slice(0,4);
  if(v.length>4) out += '년 '+v.slice(4,6);
  if(v.length>6) out += '월 '+v.slice(6,8);
  if(v.length>=8) out += '일';
  
  var pos = el.selectionStart;
  el.value = out;
  
  el.setAttribute('data-date-raw', v.slice(0,8));
}

function renderEmptyState() {
  var cBody = document.getElementById('curtain-body');
  var bBody = document.getElementById('blind-body');
  var cTable = document.getElementById('curtain-table');
  var bTable = document.getElementById('blind-table');
  var hasC = cBody && cBody.children.length > 0;
  var hasB = bBody && bBody.children.length > 0;
  var emWrap = document.getElementById('empty-hint');
  if(emWrap) emWrap.style.display = (!hasC && !hasB) ? 'flex' : 'none';
  if(cTable) cTable.style.display = hasC ? 'table' : 'none';
  if(bTable) bTable.style.display = hasB ? 'table' : 'none';
}

function shareEstimate() {
  calcTotal();
  var name = document.getElementById('c-name')?.value?.trim() || '고객';
  var total = document.getElementById('sum-total')?.textContent || '';
  var text = '[드로잉엣홈] '+name+'님 견적서\n총 금액: '+total+'\n\n견적서 확인 후 계약금(50%)을 입금해주시면 실측 일정을 잡아드리겠습니다 🙂';
  if(navigator.share){
    navigator.share({ title:'드로잉엣홈 견적서', text: text })
      .then(function(){ showToast('공유 완료 ✅'); })
      .catch(function(){});
  } else {
    navigator.clipboard?.writeText(text)
      .then(function(){ showToast('견적 내용이 복사됐습니다. 카카오톡에 붙여넣기 해주세요 🙂'); })
      .catch(function(){ showToast('공유 기능을 지원하지 않는 브라우저입니다'); });
  }
}

/* ── 자동 저장 (localStorage) ────────────────────── */
var _autoSaveTimer = null;

function autoSave() {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(function() {
    try {
      var data = collectFormData();
      localStorage.setItem('dah_estimate_draft', JSON.stringify({
        data: data,
        savedAt: new Date().toISOString(),
        version: '1.0'
      }));
      showAutoSaveIndicator();
    } catch(e) { console.warn('자동저장 실패:', e); }
  }, 1500);
}

function collectFormData() {
  var form = {};
  // 고객 정보
  form.clientName  = document.getElementById('c-name')?.value || '';
  form.phone       = document.getElementById('c-phone')?.value || '';
  form.addr        = document.getElementById('c-addr')?.value || '';
  form.addrDetail  = document.getElementById('c-addr-detail')?.value || '';
  form.measureDate = document.getElementById('c-measure')?.value || '';
  form.installDate = document.getElementById('c-install')?.value || '';
  form.region      = document.getElementById('c-region')?.value || '';
  form.memo        = document.getElementById('c-memo')?.value || '';
  return form;
}

function showAutoSaveIndicator() {
  var el = document.getElementById('auto-save-indicator');
  if (!el) return;
  el.textContent = '자동 저장됨 · ' + new Date().toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'});
  el.style.opacity = '1';
  setTimeout(function() { el.style.opacity = '0'; }, 2000);
}

function loadDraft() {
  try {
    var raw = localStorage.getItem('dah_estimate_draft');
    if (!raw) return;
    var draft = JSON.parse(raw);
    var savedAt = new Date(draft.savedAt);
    var diffMin = (Date.now() - savedAt.getTime()) / 60000;
    if (diffMin > 60) { localStorage.removeItem('dah_estimate_draft'); return; }
    
    if (confirm('저장된 임시 초안이 있습니다.\n불러오시겠습니까?\n(' + savedAt.toLocaleString('ko-KR') + ')')) {
      var d = draft.data;
      if (d.clientName)  document.getElementById('c-name').value = d.clientName;
      if (d.phone)       document.getElementById('c-phone').value = d.phone;
      if (d.addr)        document.getElementById('c-addr').value = d.addr;
      if (d.addrDetail)  document.getElementById('c-addr-detail') && (document.getElementById('c-addr-detail').value = d.addrDetail);
      if (d.measureDate) document.getElementById('c-measure').value = d.measureDate;
      if (d.installDate) document.getElementById('c-install').value = d.installDate;
      if (d.region)      document.getElementById('c-region').value = d.region;
      if (d.memo)        document.getElementById('c-memo').value = d.memo;
    }
  } catch(e) {}
}

function clearDraft() {
  localStorage.removeItem('dah_estimate_draft');
}
