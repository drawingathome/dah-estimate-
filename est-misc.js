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
      .then(function(){ showToast('공유 완료'); })
      .catch(function(){});
  } else {
    navigator.clipboard?.writeText(text)
      .then(function(){ showToast('견적 내용이 복사됐습니다. 카카오톡에 붙여넣기 해주세요 🙂'); })
      .catch(function(){ showToast('공유 기능을 지원하지 않는 브라우저입니다'); });
  }
}

/* ── 자동 저장 (localStorage) ────────────────────── */
var _autoSaveTimer = null;

// 2026-08-10: 커튼/블라인드 행 데이터를 수집하는 로직 — 원래 saveEstimate()
// 안에만 있어서 임시저장(draft)에서는 재사용을 못 했음(임시저장이 고객정보만
// 저장하고 정작 중요한 사이즈/단가/원단 등은 저장 안 되던 진짜 원인).
// saveEstimate()와 autoSave() 양쪽에서 재사용하도록 공용함수로 분리.
function collectLineItems() {
  var lineItems = [];
  document.querySelectorAll('#curtain-body tr').forEach(function(tr){
    var space = tr.querySelector('.space-inp')?.value||'';
    var displayName = tr.querySelector('.c-display-name')?.value||'';
    var fabric = tr.querySelector('.c-fabric')?.value||'';
    var mwVal = tr.querySelector('.mw')?.value||'';
    var mhVal = tr.querySelector('.mh')?.value||'';
    var priceVal = getPriceVal(tr.querySelector('.cprice'));
    if (!space && !displayName && !fabric && !mwVal && !mhVal && !priceVal) return;
    lineItems.push({
      type: 'curtain', space: space, displayName: displayName, fabric: fabric,
      vendor: tr.querySelector('.c-vendor')?.value||'', color: tr.querySelector('.c-color')?.value||'',
      vendorIsWorkshop: tr.querySelector('.vendor-is-workshop')?.checked || false,
      pleatType: tr.querySelector('.pleat-type')?.value||'', openType: tr.querySelector('.open-type')?.value||'',
      heightAdjust: tr.querySelector('.height-adjust')?.value||'-3',
      hemType: tr.querySelector('.hem-type')?.value||'', mw: tr.querySelector('.mw')?.value||'',
      mh: tr.querySelector('.mh')?.value||'', pnum: tr.querySelector('.pnum')?.value||'',
      price: getPriceVal(tr.querySelector('.cprice')), amt: tr.querySelector('.camt')?.textContent||''
    });
  });
  document.querySelectorAll('#blind-body tr').forEach(function(tr){
    var space = tr.querySelector('.space-inp')?.value||'';
    var innerInps = tr.querySelectorAll('.inner-row .inner-inp');
    var fabric = innerInps[0]?.value||'';
    var bmwVal = tr.querySelector('.bmw')?.value||'';
    var bmhVal = tr.querySelector('.bmh')?.value||'';
    if (!space && !fabric && !bmwVal && !bmhVal) return;
    lineItems.push({
      type: 'blind', space: space, fabric: fabric,
      displayName: tr.querySelector('.b-display-name')?.value||'',
      vendor: innerInps[1]?.value||'', color: innerInps[2]?.value||'',
      kind: tr.querySelector('.blind-kind')?.value||'', handle: tr.querySelector('.handle-dir')?.value||'',
      bmw: tr.querySelector('.bmw')?.value||'', bmh: tr.querySelector('.bmh')?.value||'',
      opt: tr.querySelector('.blind-opt')?.value||'',
      extra: getPriceVal(tr.querySelector('.blind-extra')),
      price: getPriceVal(tr.querySelector('.blind-price')), amt: tr.querySelector('.bamt')?.textContent||''
    });
  });
  // 2026-08-10: "+ 항목 추가"로 사용자가 직접 넣은 부자재(레일/시공비/전동/
  // 실측비/부자재/기타) 행이 저장 자체가 안 되던 문제 발견 - 저장은 물론
  // 계산에는 반영되지만 lineItems에 없어서 다시 열면 완전히 사라짐.
  // 단, 지역선택/커튼사이즈로 자동생성되는 레일·시공비·실측비 행(각각
  // data-rail-src, data-svc-type 속성으로 표시됨)은 재계산으로 다시 만들어
  // 지므로 제외 - 사용자가 수동으로 추가한 행만 저장.
  document.querySelectorAll('#svc-body tr').forEach(function(tr){
    if (tr.hasAttribute('data-rail-src') || tr.hasAttribute('data-railcost-src') || tr.hasAttribute('data-svc-type')) return;
    var content = tr.querySelector('.svc-content')?.value || '';
    var price = getPriceVal(tr.querySelector('.sprice'));
    if (!content && !price) return;
    lineItems.push({
      type: 'svc', kind: tr.querySelector('.svc-kind')?.value || '기타',
      content: content, price: price,
      qty: tr.querySelector('.sqty')?.value || '1'
    });
  });
  return lineItems;
}

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
  form.addrDetail  = document.getElementById('c-addr2')?.value || '';
  form.measureDate = document.getElementById('c-measure')?.value || '';
  form.installDate = document.getElementById('c-install')?.value || '';
  form.region      = document.getElementById('c-region')?.value || '';
  form.memo        = document.getElementById('c-memo')?.value || '';
  form.lineItems   = collectLineItems();
  // 2026-08-10: AS 접수 필드도 임시저장 대상에 포함 - 커튼/블라인드와 같은
  // 종류의 누락(선혜님이 발견)이 AS 폼에도 그대로 있었음.
  form.custType    = (typeof currentCustType !== 'undefined' ? currentCustType : 'new');
  if (form.custType === 'as') {
    form.asInstallDate = document.getElementById('as-install-date')?.value || '';
    form.asType         = document.getElementById('as-type-sel')?.value || '';
    form.asSymptom      = document.getElementById('as-symptom')?.value || '';
    form.asPhotoMemo    = document.getElementById('as-photo-memo')?.value || '';
    form.asFeeType       = document.querySelector('input[name="as-fee"]:checked')?.value || 'free';
  }
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
      if (d.addrDetail)  document.getElementById('c-addr2') && (document.getElementById('c-addr2').value = d.addrDetail);
      if (d.measureDate) document.getElementById('c-measure').value = d.measureDate;
      if (d.installDate) document.getElementById('c-install').value = d.installDate;
      if (d.region)      document.getElementById('c-region').value = d.region;
      if (d.memo)        document.getElementById('c-memo').value = d.memo;

      // 2026-08-10: 커튼/블라인드 행 복원 — 예전엔 고객정보만 복원되고
      // 사이즈/단가 등은 임시저장 자체가 안 됐던 문제 수정.
      // 2026-08-10: 고객유형(신규/재구매/AS) 및 AS 상세필드 복원
      if (d.custType && typeof setCustType === 'function') {
        setCustType(d.custType);
        if (d.custType === 'as') {
          if (d.asInstallDate && document.getElementById('as-install-date')) document.getElementById('as-install-date').value = d.asInstallDate;
          if (d.asType && document.getElementById('as-type-sel')) document.getElementById('as-type-sel').value = d.asType;
          if (d.asSymptom && document.getElementById('as-symptom')) document.getElementById('as-symptom').value = d.asSymptom;
          if (d.asPhotoMemo && document.getElementById('as-photo-memo')) document.getElementById('as-photo-memo').value = d.asPhotoMemo;
          if (d.asFeeType) {
            var feeRadio = document.querySelector('input[name="as-fee"][value="' + d.asFeeType + '"]');
            if (feeRadio) feeRadio.checked = true;
          }
        }
      }

      if (Array.isArray(d.lineItems) && d.lineItems.length > 0) {
        var curtainBody = document.getElementById('curtain-body');
        var blindBody = document.getElementById('blind-body');
        if (curtainBody) curtainBody.innerHTML = '';
        if (blindBody) blindBody.innerHTML = '';
        d.lineItems.forEach(function(item) {
          if (item.type === 'curtain') {
            addCurtainRow();
            var tr = curtainBody.lastElementChild;
            if (!tr) return;
            if (tr.querySelector('.space-inp')) tr.querySelector('.space-inp').value = item.space || '';
            if (tr.querySelector('.c-display-name')) tr.querySelector('.c-display-name').value = item.displayName || '';
            if (tr.querySelector('.c-fabric')) tr.querySelector('.c-fabric').value = item.fabric || '';
            if (tr.querySelector('.c-vendor')) tr.querySelector('.c-vendor').value = item.vendor || '';
            if (tr.querySelector('.c-color')) tr.querySelector('.c-color').value = item.color || '';
            if (tr.querySelector('.vendor-is-workshop')) tr.querySelector('.vendor-is-workshop').checked = !!item.vendorIsWorkshop;
            if (tr.querySelector('.pleat-type')) tr.querySelector('.pleat-type').value = item.pleatType || '';
            if (tr.querySelector('.open-type')) tr.querySelector('.open-type').value = item.openType || '';
            if (tr.querySelector('.height-adjust')) tr.querySelector('.height-adjust').value = item.heightAdjust || '-3';
            if (tr.querySelector('.hem-type')) tr.querySelector('.hem-type').value = item.hemType || '';
            if (tr.querySelector('.mw')) tr.querySelector('.mw').value = item.mw || '';
            if (tr.querySelector('.mh')) tr.querySelector('.mh').value = item.mh || '';
            if (tr.querySelector('.cprice')) tr.querySelector('.cprice').value = item.price || '';
            var mwEl = tr.querySelector('.mw');
            if (mwEl && typeof calcCurtainRow === 'function') calcCurtainRow(mwEl);
          } else if (item.type === 'blind') {
            addBlindRow();
            var btr = blindBody.lastElementChild;
            if (!btr) return;
            if (btr.querySelector('.space-inp')) btr.querySelector('.space-inp').value = item.space || '';
            if (btr.querySelector('.b-display-name')) btr.querySelector('.b-display-name').value = item.displayName || '';
            var innerInps = btr.querySelectorAll('.inner-row .inner-inp');
            if (innerInps[0]) innerInps[0].value = item.fabric || '';
            if (innerInps[1]) innerInps[1].value = item.vendor || '';
            if (innerInps[2]) innerInps[2].value = item.color || '';
            if (btr.querySelector('.blind-kind')) btr.querySelector('.blind-kind').value = item.kind || '';
            if (btr.querySelector('.handle-dir')) btr.querySelector('.handle-dir').value = item.handle || '';
            if (btr.querySelector('.bmw')) btr.querySelector('.bmw').value = item.bmw || '';
            if (btr.querySelector('.bmh')) btr.querySelector('.bmh').value = item.bmh || '';
            if (btr.querySelector('.blind-opt')) btr.querySelector('.blind-opt').value = item.opt || '';
            if (btr.querySelector('.blind-extra')) btr.querySelector('.blind-extra').value = item.extra || '';
            if (btr.querySelector('.blind-price')) btr.querySelector('.blind-price').value = item.price || '';
            var bmwEl = btr.querySelector('.bmw');
            if (bmwEl && typeof calcBlindRow === 'function') calcBlindRow(bmwEl);
          } else if (item.type === 'svc') {
            addSvcRow();
            var svcBody = document.getElementById('svc-body');
            var str = svcBody.lastElementChild;
            if (!str) return;
            if (str.querySelector('.svc-kind')) str.querySelector('.svc-kind').value = item.kind || '기타';
            if (str.querySelector('.svc-content')) str.querySelector('.svc-content').value = item.content || '';
            if (str.querySelector('.sprice')) str.querySelector('.sprice').value = item.price || '';
            if (str.querySelector('.sqty')) str.querySelector('.sqty').value = item.qty || '1';
            var spriceEl = str.querySelector('.sprice');
            if (spriceEl && typeof calcSvcRow === 'function') calcSvcRow(spriceEl);
          }
        });
        if (typeof calcTotal === 'function') calcTotal();
      }
    }
  } catch(e) {}
}

function clearDraft() {
  localStorage.removeItem('dah_estimate_draft');
}
