/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — PDF모달 / 고객불러오기 / 계약금계산
   PDF 사이즈 선택, 기존 고객목록에서 불러오기/검색,
   계약금(선금) 자동/수동 계산.
   ══════════════════════════════════════════════════ */

var _selectedPdfOpt = 'fit';

// 2026-08-19(선혜님 요청 — "카톡으로 바로 발송" 원클릭 공유): 카카오 비즈니스
// API(알림톡)는 채널등록+템플릿승인+Make.com 연결이 아직 안 되어 있어 당장은
// 불가능. 대신 브라우저의 네이티브 "공유하기" 기능(navigator.share)을 활용 —
// 실제 PDF 파일을 만들어서 공유창을 띄우면, 모바일에서 카카오톡을 직접 선택해
// 파일째로 보낼 수 있음(사진 공유하듯). PC나 파일공유 미지원 브라우저에서는
// 자동으로 다운로드로 폴백(기존 인쇄/PDF저장과 동일한 안전한 경로).
// 2026-08-19(선혜님 발견 — 아이패드에서 "저장"조차 안 되는 심각한 문제):
// html2pdf.bundle.min.js(946KB)를 페이지 로드시 무조건 받아오게 했더니, 이게
// 다른 필수 스크립트(est-save.js 등) 로딩까지 지연시켜서 저장 같은 기본 기능이
// 먹통처럼 보였을 가능성이 높음. 카톡공유 버튼을 실제로 누른 시점에만 동적으로
// 불러오도록 변경 — 이러면 카톡공유를 안 쓰는 대다수 상황에서는 이 무거운
// 라이브러리를 아예 안 받아오니 다른 기능에 전혀 영향을 줄 수 없음.
function shareEstimatePDF() {
  if (typeof html2pdf === 'undefined') {
    showToast('PDF 기능 불러오는 중...');
    var script = document.createElement('script');
    script.src = '/html2pdf.bundle.min.js';
    script.onload = function() { _doShareEstimatePDF(); };
    script.onerror = function() { showToast('PDF 기능을 불러오지 못했어요. 인터넷 연결을 확인해주세요'); };
    document.head.appendChild(script);
    return;
  }
  _doShareEstimatePDF();
}

function _doShareEstimatePDF() {
  var contentEl = document.querySelector('#pv-overlay .pv-wrap') || document.querySelector('.pv-wrap');
  if (!contentEl || typeof html2pdf === 'undefined') {
    showToast('PDF 생성 기능을 사용할 수 없어요');
    return;
  }
  var custName = (document.getElementById('c-name')?.value || '').trim() || '고객';
  var isFinal = document.getElementById('status-final')?.classList.contains('on');
  var docLabel = isFinal ? '확정견적서' : '가견적서';
  // 2026-08-19(재검토 요청으로 발견): 고객명에 파일시스템 금지문자(\/:*?"<>|)가
  // 섞이면 파일 저장/전달 자체가 실패할 수 있어 안전한 문자로 치환. 길이도
  // 과도하게 길면(예: 실수로 메모까지 이름칸에 넣은 경우) 잘라서 안전하게 처리.
  var safeCustName = (custName || '고객').replace(/[\\/:*?"<>|]/g, '_').slice(0, 30);
  var filename = safeCustName + '_' + docLabel + '.pdf';

  showToast('PDF 만드는 중...');

  // 2026-08-19에 확인된 원칙: 측정/생성 시점의 레이아웃 폭을 실제 렌더링폭(720px,
  // buildCustomerHTML의 인라인 max-width)과 반드시 일치시켜야 정확한 결과가 나옴.
  var origWidth = contentEl.style.width;
  var origMaxWidth = contentEl.style.maxWidth;
  contentEl.style.width = '720px';
  contentEl.style.maxWidth = '720px';
  contentEl.classList.add('pv-pdf-capture');

  var naturalHeightPx = contentEl.scrollHeight;
  var PX_TO_MM = 25.4 / 96;
  // 2026-08-19: scrollHeight 측정과 html2canvas 실제 캡처(scale:2) 사이의 미세한
  // 반올림 오차로, 딱 맞게 계산하면 마지막 몇 px가 빈 페이지로 밀려나가는 문제가
  // 있었음(실제로 재현됨) - 5mm 여유를 둬서 방지.
  var pageHeightMm = Math.ceil(naturalHeightPx * PX_TO_MM) + 5;

  var opt = {
    margin: 0,
    filename: filename,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: [190.5, pageHeightMm], orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] }
  };

  html2pdf().set(opt).from(contentEl).outputPdf('blob').then(function(pdfBlob) {
    contentEl.style.width = origWidth;
    contentEl.style.maxWidth = origMaxWidth;
    contentEl.classList.remove('pv-pdf-capture');
    var pdfFile;
    try { pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' }); }
    catch(e) { pdfFile = null; }

    if (pdfFile && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      navigator.share({
        files: [pdfFile],
        title: custName + '님 ' + docLabel,
        text: '[드로잉엣홈] ' + custName + '님 ' + docLabel + '를 보내드립니다 🙂'
      }).then(function(){
        showToast('공유 완료');
      }).catch(function(err){
        if (err && err.name !== 'AbortError') showToast('공유가 취소됐어요');
      });
    } else {
      var url = URL.createObjectURL(pdfBlob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      showToast('PDF가 다운로드됐어요. 카카오톡에서 직접 첨부해주세요');
    }
  }).catch(function(err){
    contentEl.style.width = origWidth;
    contentEl.style.maxWidth = origMaxWidth;
    contentEl.classList.remove('pv-pdf-capture');
    console.error('PDF 생성 실패:', err);
    showToast('PDF 생성에 실패했어요');
  });
}

function openPdfModal() {
  _selectedPdfOpt = 'fit';
  document.getElementById('pdf-opt-fit')?.classList.add('selected');
  document.getElementById('pdf-opt-a4')?.classList.remove('selected');
  document.getElementById('pdf-size-modal')?.classList.add('open');
}
function closePdfModal() {
  document.getElementById('pdf-size-modal')?.classList.remove('open');
}
function selectPdfOpt(type) {
  _selectedPdfOpt = type;
  document.getElementById('pdf-opt-fit')?.classList.toggle('selected', type==='fit');
  document.getElementById('pdf-opt-a4')?.classList.toggle('selected', type==='a4');
}
function confirmPdfPrint() {
  closePdfModal();
  var styleId = 'pdf-page-style';
  var old = document.getElementById(styleId);
  if(old) old.remove();
  var s = document.createElement('style');
  s.id = styleId;

  var contentEl = document.querySelector('#pv-overlay .pv-wrap') || document.querySelector('.pv-wrap');
  if (contentEl) contentEl.style.zoom = '';

  // "견적 길이에 맞추기": @page 높이 자체를 콘텐츠 길이에 맞춰 늘리는 방식.
  // (zoom 속성은 아이패드 등에서 불안정해서 8/19에 이 방식으로 정착함)
  if (_selectedPdfOpt === 'fit' && contentEl) {
    // ⚠️ 정확도 미해결(2026-09-03): 실제 인쇄시 렌더링 폭/패딩과 화면에서
    // 강제로 흉내낸 측정 조건이 안 맞아서, 계산된 높이가 실제 필요한
    // 높이보다 꽤 크게(테스트 사례에서 최대 100mm+) 나오는 문제가 있음.
    // 여러 방식(측정폭 조정, 부모 컨테이너 흉내, beforeprint 이벤트 활용)을
    // 시도했지만 전부 실제값과 안 맞았음 — Puppeteer emulateMediaType
    // (print)+자연측정으로는 정확한 값이 나왔는데, 이걸 실제 프로덕션
    // 코드(beforeprint 이벤트)로 재현하면 여전히 부정확함 — 즉 "브라우저가
    // 진짜 인쇄를 준비하는 정확한 타이밍에 어떤 CSS 조건이 실제로 걸려
    // 있는지"를 아직 정확히 못 밝혀냄. 다음 시도는 실제 브라우저(크롬/
    // 사파리)에서 인쇄 미리보기를 직접 열어 개발자도구로 그 순간의 실제
    // 렌더링을 확인하는 것부터 시작할 것 — 이 컨테이너 환경(Puppeteer)
    // 만으로는 한계가 있었음.
    var origWidth = contentEl.style.width;
    var origMaxWidth = contentEl.style.maxWidth;
    var origPadding = contentEl.style.padding;
    var origBoxSizing = contentEl.style.boxSizing;
    // 측정 폭은 buildCustomerHTML()의 인라인 max-width(720px)와 일치시킴
    // (CSS의 max-width:680px보다 인라인 스타일이 우선 적용되므로).
    contentEl.style.width = '720px';
    contentEl.style.maxWidth = '720px';
    contentEl.style.boxSizing = 'border-box';
    contentEl.style.padding = '10mm 12mm';
    var heightPx = contentEl.scrollHeight;
    contentEl.style.width = origWidth;
    contentEl.style.maxWidth = origMaxWidth;
    contentEl.style.padding = origPadding;
    contentEl.style.boxSizing = origBoxSizing;

    var PX_TO_MM = 25.4 / 96;
    var heightMm = Math.ceil(heightPx * PX_TO_MM);
    // @page margin 대신 .pv-wrap의 padding으로 여백을 줌 — margin을 쓰면
    // 그 공간에 브라우저가 자체 머리글/바닥글(날짜·URL 등)을 넣을 수 있음.
    s.textContent = '@media print { @page { size: 210mm ' + heightMm + 'mm; margin: 0; } .pv-wrap { page-break-inside: avoid; padding:10mm 12mm!important; box-sizing:border-box!important; } }';
  } else {
    s.textContent = '@media print { @page { size: A4 portrait; margin: 0; } .pv-wrap { padding:10mm 12mm!important; box-sizing:border-box!important; } }';
  }
  document.head.appendChild(s);

  // 브라우저 "머리글/바닥글" 인쇄 옵션이 켜져 있으면 <title>이 그대로
  // 인쇄물에 찍히므로, 실제 문서 종류에 맞게 갱신(견적서/발주서/의뢰서 등).
  var custNameForTitle = document.getElementById('c-name')?.value || '';
  var isFinalForTitle = document.getElementById('status-final')?.classList.contains('on');
  var navText = document.querySelector('#pv-overlay .print-hide')?.textContent || '';
  var docKind = isFinalForTitle ? '확정견적서' : '가견적서';
  if (navText.indexOf('발주서') >= 0) docKind = '발주서';
  else if (navText.indexOf('실측') >= 0 && navText.indexOf('의뢰') >= 0) docKind = '실측 의뢰서';
  else if (navText.indexOf('시공') >= 0 && navText.indexOf('의뢰') >= 0) docKind = '시공 의뢰서';
  document.title = (custNameForTitle ? custNameForTitle + ' ' : '') + docKind;

  // iOS 사파리는 window.print()를 "사용자 클릭의 실행 흐름 안"에서만
  // 허용함 — setTimeout으로 지연 호출하면 조용히 무시됨(에러도 안 남음).
  // 스타일 삽입은 이미 동기적으로 끝났으므로 지연 없이 바로 호출.
  try {
    window.print();
  } catch (e) {
    setTimeout(function(){ try { window.print(); } catch(e2) {} }, 100);
  }
}

function openCustomerLoad() {
  var ov = document.getElementById('cust-load-overlay');
  if(!ov) return;
  ov.classList.add('open');
  document.getElementById('cust-load-query').value = '';
  renderCustLoadList('');
  document.getElementById('cust-load-query').focus();
}
function closeCustLoad() {
  var ov = document.getElementById('cust-load-overlay');
  if(ov) ov.classList.remove('open');
}
function renderCustLoadList(q) {
  var list = document.getElementById('cust-load-list');
  if(!list) return;
  var customers = [];
  try { customers = JSON.parse(localStorage.getItem('dah_customers')||'[]'); } catch(e){}
  // 2026-08-12: 스태프 권한 제약 추가(선혜님 확인) - 예전엔 견적서 앱에
  // "권한" 개념 자체가 없어서, 스태프로 로그인해도 전체 고객(다른 담당자
  // 포함)이 다 보였음. 대시보드는 이미 스태프를 자기 담당 고객만 보게
  // 막고 있는데 견적서 앱만 예외였던 보안 허점.
  if (window._estCurrentUser && window._estCurrentUser.role === 'staff') {
    customers = customers.filter(function(c){ return (c.staffName||'마스터') === window._estCurrentUser.name; });
  }
  var filtered = q ? customers.filter(function(c){
    return (c.clientName||'').includes(q) || (c.phone||'').replace(/-/g,'').includes(q.replace(/-/g,''));
  }) : customers;
  
  filtered.sort(function(a,b){ return (b.createdAt||b.date||'') > (a.createdAt||a.date||'') ? 1 : -1; });
  if(!filtered.length) {
    list.innerHTML = '<div class="cust-load-empty">'+( q ? '검색 결과 없음' : '저장된 고객이 없습니다<br><span style="font-size:11px;color:#B0A99F">견적서 저장 시 자동으로 등록됩니다</span>')+'</div>';
    return;
  }
  
  var savedAll = [];
  try { savedAll = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e){}

  var displayList = q ? filtered.slice(0,100) : filtered.slice(0,30);
  list.innerHTML = displayList.map(function(c) {
    var info = [c.phone, c.addr].filter(Boolean).join(' · ');
    var lastEst = c.lastAmt ? c.lastAmt.toLocaleString()+'원 ('+c.lastDate+')' : '';
    var idx = customers.indexOf(c);
    
    var history = c.id
      ? savedAll.filter(function(s){ return s.clientId === c.id; }).slice(0,3)
      : savedAll.filter(function(s){ return s.clientName === (c.clientName||''); }).slice(0,3);
    var histHtml = history.length > 0
      ? '<div style="margin-top:var(--sp-1);display:flex;gap:var(--sp-1);flex-wrap:wrap">'
        + history.map(function(h){
            var lbl = h.status==='final'?'최종':'가견적';
            var amt = h.price ? h.price.toLocaleString()+'원' : '';
            return '<span style="font-size:11px;background:#F5F2EE;color:#8E8078;padding:2px 6px;border-radius:4px">'+lbl+(amt?' · '+amt:'')+'</span>';
          }).join('')
        + '</div>'
      : '';
    return '<div class="cust-load-item" data-idx="'+idx+'" onclick="loadCustByIdx(this)">'
      +'<div class="cust-load-name">'+escHtml(c.clientName||'이름없음')+'</div>'
      +'<div class="cust-load-info">'+escHtml(info)+(lastEst?' &nbsp;|&nbsp; 최근: '+escHtml(lastEst):'')+'</div>'
      +histHtml
      +'</div>';
  }).join('');
}
function filterCustLoad() {
  renderCustLoadList(document.getElementById('cust-load-query')?.value||'');
}
// 2026-08-05: 저장된 견적의 lineItems로 커튼/블라인드 표를 채우는 공용 함수.
// "고객 불러오기" 팝업과 "견적서 앱에서 열기"(대시보드 진입) 두 경로 모두
// 품목 복원이 안 되던 문제라 공용화해서 두 곳에서 재사용.
// 2026-08-05: 이관된 예전 데이터(문혜자 등)는 line_items 자체가 원본에
// 없어서 비어있음 — 텍스트 요약(fabric, "품목명(1,000원), ...")을 파싱해서
// 최소한 품목명+금액이라도 채우는 폴백
function parseProductString(str) {
  if (!str) return [];
  return str.split(/,\s*(?=[^)]*(?:\(|$))/).map(function(part) {
    var m = part.trim().match(/^(.*)\(([\d,]+)원\)$/);
    if (m) return { name: m[1].trim() || '(이름없음)', amount: m[2].replace(/,/g,'') };
    return part.trim() ? { name: part.trim(), amount: null } : null;
  }).filter(Boolean);
}

function restoreLineItemsToForm(lineItems, fallbackProductStr) {
  if ((!lineItems || lineItems.length === 0) && fallbackProductStr) {
    var parsed = parseProductString(fallbackProductStr);
    if (parsed.length === 0) return false;
    document.getElementById('curtain-body').innerHTML = '';
    document.getElementById('blind-body').innerHTML = '';
    parsed.forEach(function(p) {
      addCurtainRow();
      var ctr = document.getElementById('curtain-body').lastElementChild;
      var dn = ctr.querySelector('.c-display-name'); if (dn) dn.value = p.name || '';
      var cp = ctr.querySelector('.cprice'); if (cp && p.amount) { cp.value = p.amount; if (typeof fmtPriceBlur === 'function') fmtPriceBlur(cp); }
    });
    if (typeof calcTotal === 'function') calcTotal();
    return true;
  }
  if (!lineItems || lineItems.length === 0) return false;
  document.getElementById('curtain-body').innerHTML = '';
  document.getElementById('blind-body').innerHTML = '';
  var svcBodyForReset = document.getElementById('svc-body');
  if (svcBodyForReset) svcBodyForReset.innerHTML = '';
  lineItems.forEach(function(it) {
    if (it.type === 'blind') {
      addBlindRow();
      var tr = document.getElementById('blind-body').lastElementChild;
      var sp = tr.querySelector('.space-inp'); if (sp) sp.value = it.space || '';
      var bdn = tr.querySelector('.b-display-name'); if (bdn) bdn.value = it.displayName || '';
      var inns = tr.querySelectorAll('.inner-row .inner-inp');
      if (inns[0]) inns[0].value = it.fabric || '';
      if (inns[1]) inns[1].value = it.vendor || '';
      if (inns[2]) inns[2].value = it.color || '';
      var kindEl = tr.querySelector('.blind-kind'); if (kindEl) kindEl.value = it.kind || kindEl.value;
      var handleEl = tr.querySelector('.handle-dir'); if (handleEl && it.handle) handleEl.value = it.handle;
      var bmw = tr.querySelector('.bmw'); if (bmw) bmw.value = it.bmw || '';
      var bmh = tr.querySelector('.bmh'); if (bmh) bmh.value = it.bmh || '';
      var optEl = tr.querySelector('.blind-opt'); if (optEl) optEl.value = it.opt || '';
      var extraEl = tr.querySelector('.blind-extra'); if (extraEl && it.extra) { extraEl.value = it.extra; if (typeof fmtPriceBlur === 'function') fmtPriceBlur(extraEl); }
      var priceEl = tr.querySelector('.blind-price'); if (priceEl && it.price) { priceEl.value = it.price; if (typeof fmtPriceBlur === 'function') fmtPriceBlur(priceEl); }
      if (typeof calcBlindRow === 'function' && bmw) calcBlindRow(bmw);
    } else if (it.type === 'svc' || it.type === 'service') {
      // 2026-08-24(선혜님 발견 — 시공서비스 항목이 커튼 표 맨 위에 잘못 끼어있던
      // 문제): 오늘 플러그 이관 작업에서 시공서비스 항목을 type:'service'로
      // 저장했는데, 이 복원 함수는 정확히 type:'svc'만 인식해서 커튼 행으로
      // 잘못 들어가고 있었음(그래서 나비주름형·양개형·리드 같은 커튼 전용
      // 기본값이 시공서비스 항목에도 붙어 보였음). 'service'도 같이 인식하도록.
      // ('bedding'/'item'은 실제 제품 항목이라 원래대로 커튼 표로 가야 정상 —
      // 처음에 이것도 같이 옮기려 했다가 되돌림.
      addSvcRow();
      var str = document.getElementById('svc-body').lastElementChild;
      if (str) {
        var svcKindEl = str.querySelector('.svc-kind'); if (svcKindEl) svcKindEl.value = it.kind || '기타';
        var svcContentEl = str.querySelector('.svc-content'); if (svcContentEl) svcContentEl.value = it.content || it.displayName || it.space || '';
        var svcPriceEl = str.querySelector('.sprice'); if (svcPriceEl && it.price) { svcPriceEl.value = it.price; if (typeof fmtPriceBlur === 'function') fmtPriceBlur(svcPriceEl); }
        var svcQtyEl = str.querySelector('.sqty'); if (svcQtyEl) svcQtyEl.value = it.qty || it.pnum || '1';
        if (typeof calcSvcRow === 'function' && svcPriceEl) calcSvcRow(svcPriceEl);
      }
    } else {
      addCurtainRow();
      var ctr = document.getElementById('curtain-body').lastElementChild;
      var csp = ctr.querySelector('.space-inp'); if (csp) csp.value = it.space || '';
      var dn = ctr.querySelector('.c-display-name'); if (dn) dn.value = it.displayName || '';
      var fb = ctr.querySelector('.c-fabric'); if (fb) fb.value = it.fabric || '';
      var vd = ctr.querySelector('.c-vendor'); if (vd) vd.value = it.vendor || '';
      var rvd = ctr.querySelector('.c-rail-vendor'); if (rvd) rvd.value = it.railVendor || '';
      var vw = ctr.querySelector('.vendor-is-workshop'); if (vw) vw.checked = !!it.vendorIsWorkshop;
      var cl = ctr.querySelector('.c-color'); if (cl) cl.value = it.color || '';
      var pt = ctr.querySelector('.pleat-type'); if (pt && it.pleatType) pt.value = it.pleatType;
      var ot = ctr.querySelector('.open-type'); if (ot && it.openType) ot.value = it.openType;
      // 2026-08-29(선혜님 지적 - "주름은 나비주름/개폐는 양개형/시접은
      // 리드라고 자동으로 뜨는데 이게 왜 자꾸 돌아가지"로 발견): 시접
      // (hem-type)은 저장할 때는 정상적으로 담기는데(est-misc.js
      // collectLineItems), 이 함수(견적서 이력에서 "열어서 수정" 할 때
      // 쓰임)엔 복원 코드가 통째로 빠져있었음 - 다른 복원함수(자동저장
      // 초안 복원용, est-misc.js 269번줄 근처)엔 이미 있었는데 이
      // 함수만 놓쳐서, 열 때마다 새 행의 기본값(select 첫 옵션)으로
      // 리셋되고 있었음. 정확히 같은 패턴으로 추가.
      var hm = ctr.querySelector('.hem-type'); if (hm && it.hemType) hm.value = it.hemType;
      var ha = ctr.querySelector('.height-adjust'); if (ha) ha.value = (it.heightAdjust !== undefined && it.heightAdjust !== null) ? it.heightAdjust : -3;
      var mw = ctr.querySelector('.mw'); if (mw) mw.value = it.mw || '';
      var mh = ctr.querySelector('.mh'); if (mh) mh.value = it.mh || '';
      var pn = ctr.querySelector('.pnum'); if (pn && it.pnum) pn.value = it.pnum;
      var cp = ctr.querySelector('.cprice'); if (cp && it.price) { cp.value = it.price; if (typeof fmtPriceBlur === 'function') fmtPriceBlur(cp); }
      if (typeof calcCurtainRow === 'function') calcCurtainRow(mw);
    }
  });
  if (typeof calcTotal === 'function') calcTotal();
  return true;
}

function loadCustByIdx(el) {
  var idx = parseInt(el.getAttribute('data-idx'));
  var customers = [];
  try { customers = JSON.parse(localStorage.getItem('dah_customers')||'[]'); } catch(e){}
  var c = customers[idx];
  if(!c) return;
  if(c.clientName && document.getElementById('c-name')) document.getElementById('c-name').value=c.clientName;
  if(c.phone && document.getElementById('c-phone')) document.getElementById('c-phone').value=c.phone;
  if(c.addr && document.getElementById('c-addr')) document.getElementById('c-addr').value=c.addr;
  var loadedItems = false;
  try {
    var saved = JSON.parse(localStorage.getItem('dah_saved')||'[]');
    // 2026-08-05: id가 없는 고객(서버 동기화 전 로컬전용 레코드 등)이면
    // 'c.id && ...' 조건이 전부 false가 되어 mine이 항상 빈 배열이었음 —
    // 미리보기 목록(renderCustLoadList)엔 이름기반 폴백이 있는데 여기만 빠져서,
    // 미리보기엔 "이전 견적 있음" 뱃지가 뜨는데 정작 불러오기를 누르면 품목이
    // 하나도 안 채워지는 불일치가 있었음. 동일한 폴백으로 통일.
    var mine = (c.id
      ? saved.filter(function(e){ return e.clientId === c.id; })
      : saved.filter(function(e){ return e.clientName === (c.clientName||''); })
    ).sort(function(a,b){ return (b.savedAt||'') > (a.savedAt||'') ? 1 : -1; });
    var latest = mine[0];
    if (latest) {
      loadedItems = restoreLineItemsToForm(latest.lineItems, latest.fabric);
      // 2026-08-12: 저장된 견적의 지역(region)을 복원 - 예전엔 지역 정보 자체가
      // 저장 안 돼서, 재구매 견적 불러오기 시 지역시공비(실측+설치, 서울기준
      // 9만원)가 통째로 사라지던 버그. change 이벤트를 발생시켜야
      // autoAddSvcFee()가 실행되어 지역시공비 행이 다시 생김(value만 설정하면
      // onchange가 안 걸림).
      if (latest.region && document.getElementById('c-region')) {
        document.getElementById('c-region').value = latest.region;
        document.getElementById('c-region').dispatchEvent(new Event('change', {bubbles:true}));
      }
      if (latest.appliedDiscounts && typeof restoreAppliedDiscounts === 'function') {
        restoreAppliedDiscounts(latest.appliedDiscounts);
      }
      // 2026-08-24(선혜님 발견 — "생성이 안되어야지"): "고객 불러오기"는
      // 원래 "이 고객정보로 완전히 새 견적을 시작"하는 용도라 항상 새로
      // 저장되게 만들어져 있었음. 근데 같은 날 이미 만든 견적을 다시 불러와서
      // (예: 기능 테스트 삼아) 살짝 고치고 저장하면, 그것도 매번 새 견적으로
      // 쌓여서 유령이 계속 생기는 원인이 됐음. 최근 견적이 "오늘" 저장된
      // 것이면 새로 만드는 게 아니라 그걸 이어서 수정(PATCH)하도록 함 —
      // 진짜 재구매(다른 날짜의 새 방문)는 오늘 것이 없으므로 기존처럼
      // 새 견적으로 정상 시작됨.
      var todayStr = new Date().toISOString().slice(0,10);
      var latestDateStr = (latest.savedAt||'').slice(0,10);
      if (latest.dbId && latestDateStr === todayStr) {
        window._editingEstDbId = latest.dbId;
        window._editingEstUpdatedAt = latest.updatedAt || null;
        showToast('오늘 만드신 성지윤님 견적을 이어서 수정합니다 — 저장하면 새로 안 쌓이고 이 견적이 갱신돼요'.replace('성지윤', c.clientName||''));
      }
    }
  } catch(e) { console.warn('기존 견적 품목 불러오기 실패:', e); }
  closeCustLoad();
  if (!(window._editingEstDbId)) {
    showToast('고객 정보를 불러왔습니다 — '+(c.clientName||'')+(loadedItems ? ' (이전 견적 품목 포함)' : ''));
  }
}

// 2026-08-28(선혜님 지시 - "코드정리 싹 다 한거니?"로 발견): searchCustomer/
// selectCustomer/closeCustomerSearch 세트는 애초에 "Supabase 연동 후 사용
// 가능합니다"/"검색 기능 준비 중..."이라는 placeholder 상태로 미완성이었고,
// 지금은 loadCustId/loadEstDbId URL파라미터 기반 고객불러오기(오늘 하루 종일
// 다뤘던 방식)로 완전히 대체됨 - HTML에도 이걸 여는 버튼 자체가 없어서
// 셋 다 안전하게 제거.


function calcDeposit() {
  var depInp = document.getElementById('deposit-input');
  if(depInp) depInp.dataset.manualEdit = '1';
  var totalEl = document.getElementById('sum-total');
  var grand = parseInt((totalEl?.textContent||'0').replace(/[^0-9]/g,''))||0;
  var dep = getPriceVal(depInp)||0;
  var bal = grand - dep;
  var balEl = document.getElementById('sum-balance');
  if(balEl) balEl.textContent = bal.toLocaleString()+'원';
  // 2026-08-24(선혜님 발견 — 최시내님 사례: 계약금을 직접 입력해도 위쪽
  // 검은 박스(TOTAL ESTIMATE)의 계약금/잔금 표시가 그대로 50% 자동계산값에
  // 멈춰있던 문제): 아래 "잔금" 줄만 갱신하고 위쪽 박스는 안 건드리고
  // 있었음 — 이 함수가 처음 만들어질 때부터 있던 누락으로 보임. 같이 갱신.
  var depDispEl = document.getElementById('sum-deposit-disp');
  if(depDispEl) depDispEl.textContent = dep>0 ? dep.toLocaleString()+'원' : (grand>0 ? Math.round(grand*0.5).toLocaleString()+'원 (예상)' : '—');
  var balDispEl = document.getElementById('sum-balance-disp');
  if(balDispEl) balDispEl.textContent = dep>0 ? bal.toLocaleString()+'원' : '—';
  // 이 견적을 다시 저장할 때 방금 직접 입력한 계약금/잔금이 정확히 저장되도록
  // (저장 당시 금액 고정 스냅샷에도 반영되게) 최신 계산값 갱신.
  if (window._lastCalcBreakdown) {
    window._lastCalcBreakdown.deposit = dep;
    window._lastCalcBreakdown.balance = bal;
  }
}
function setDepositAuto(pct) {
  var totalEl = document.getElementById('sum-total');
  var grand = parseInt((totalEl?.textContent||'0').replace(/[^0-9]/g,''))||0;
  if(!grand) { calcTotal(); grand = parseInt((totalEl?.textContent||'0').replace(/[^0-9]/g,''))||0; }
  var dep = Math.round(grand * pct / 100);
  var depInp = document.getElementById('deposit-input');
  if(depInp){ depInp.setAttribute('data-raw',String(dep)); depInp.value=dep.toLocaleString(); }
  calcDeposit();
}
