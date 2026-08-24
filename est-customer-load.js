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

  // 2026-08-19(선혜님 발견 — 플러그 앱과 실제 비교): 아이패드·PC·갤럭시탭 전부에서
  // 인쇄가 안 되던 근본 원인은 zoom 속성 자체의 불안정성이었을 가능성이 높음.
  // 실제로 잘 작동하는 참고 앱(플러그)의 방식을 확인해보니, zoom으로 압축하는 게
  // 아니라 "페이지 높이 자체를 콘텐츠 길이에 맞춰 늘리는" 훨씬 단순하고 표준적인
  // 방식(@page size만 사용, zoom 같은 비표준 속성 전혀 안 씀)을 쓰고 있었음.
  // 이게 원래(2026-08-16 이전) DAH가 쓰던 방식이기도 함 - zoom을 도입하면서 오히려
  // 안정성이 떨어졌던 것으로 보여 원래 방식으로 되돌림.
  if (_selectedPdfOpt === 'fit' && contentEl) {
    // 2026-08-19(선혜님 발견 — 재검토 요청으로 찾음): 모바일 등 좁은 화면에서
    // "견적 길이에 맞추기"를 실행하면, 화면이 좁아서 콘텐츠가 세로로 더 많이
    // 쌓인 상태(scrollHeight가 부풀려진 상태)로 측정되어, 실제 인쇄 폭(더 넓음)
    // 기준으로는 필요 없는 거대한 빈 여백이 페이지 아래에 남는 문제가 있었음.
    // + 아래 브라우저 머리글/바닥글 문제 수정으로 .pv-wrap에 좌우 padding(12mm)이
    // 새로 생기므로, "그 padding까지 적용한 상태"로 측정해야 실제 렌더링과 일치함
    // (measuring과 rendering의 레이아웃 조건을 반드시 동일하게 맞출 것).
    var origWidth = contentEl.style.width;
    var origMaxWidth = contentEl.style.maxWidth;
    var origPadding = contentEl.style.padding;
    var origBoxSizing = contentEl.style.boxSizing;
    // 2026-08-19(추가 검증 중 발견): buildCustomerHTML()이 실제로 만드는 .pv-wrap의
    // 인라인 style="max-width:720px"가 CSS의 max-width:680px보다 항상 우선 적용됨
    // (인라인 스타일 우선순위 원칙) — 680px로 측정하면 실제 렌더링 폭(720px)과
    // 40px 차이가 나서 여전히 부정확할 수 있었음. 실제 인라인 값과 정확히 일치시킴.
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
    var heightMm = Math.ceil(heightPx * PX_TO_MM); // 이미 위/아래 padding 10mm씩 포함된 높이라 별도로 안 더함
    // 2026-08-19(선혜님 발견 — 실제 인쇄물 사진, "우리 앱은 원래 안 그렇다"는 지적):
    // @page에 margin을 주면 그 여백 공간에 브라우저가 날짜/제목/URL 같은 자체
    // 머리글·바닥글을 자동으로 넣을 수 있음(그 여백이 "브라우저 몫"으로 남기 때문).
    // @page margin을 0으로 없애고, 대신 콘텐츠(.pv-wrap) 자체에 동일한 여백을
    // padding으로 줘서 화면상 보이는 여백은 그대로 유지하면서, 브라우저가 머리글/
    // 바닥글을 넣을 공간 자체를 원천적으로 없앰(검색으로 확인한 표준적인 해결법).
    s.textContent = '@media print { @page { size: 210mm ' + heightMm + 'mm; margin: 0; } .pv-wrap { page-break-inside: avoid; padding:10mm 12mm!important; box-sizing:border-box!important; } }';
  } else {
    s.textContent = '@media print { @page { size: A4 portrait; margin: 0; } .pv-wrap { padding:10mm 12mm!important; box-sizing:border-box!important; } }';
  }
  document.head.appendChild(s);

  // 2026-08-19(선혜님 발견 — 실제 인쇄물 사진으로 확인): 브라우저의 "머리글/바닥글"
  // 인쇄 옵션이 켜져 있으면, 페이지 <title> 태그 값이 그대로 인쇄물 상단에 찍히는데,
  // HTML의 <title>이 "드로잉엣홈 견적서 v20260621"이라는 옛날 버전 표시로 고정되어
  // 있어서 그게 그대로 인쇄물에 나타남 — 원래 이걸 고객명으로 바꾸던 코드가 있었는데
  // 오늘 이 함수를 여러 번 재작성하며 실수로 빠졌던 것으로 보임, 복원함.
  var custNameForTitle = document.getElementById('c-name')?.value || '';
  var isFinalForTitle = document.getElementById('status-final')?.classList.contains('on');
  // 2026-08-19: 이 함수는 견적서뿐 아니라 발주서·실측의뢰서·시공의뢰서 인쇄에도
  // 공통으로 쓰이는데, 무조건 "가견적서/확정견적서"로만 제목을 붙이면 발주서를
  // 인쇄할 때도 "OOO 가견적서"처럼 어색하게 나옴 — 오버레이 안의 문서제목
  // (.pv-doc-title 등)이나 안내 텍스트로 실제 문서 종류를 판별해서 정확히 표시.
  var navText = document.querySelector('#pv-overlay .print-hide')?.textContent || '';
  var docKind = isFinalForTitle ? '확정견적서' : '가견적서';
  if (navText.indexOf('발주서') >= 0) docKind = '발주서';
  else if (navText.indexOf('실측') >= 0 && navText.indexOf('의뢰') >= 0) docKind = '실측 의뢰서';
  else if (navText.indexOf('시공') >= 0 && navText.indexOf('의뢰') >= 0) docKind = '시공 의뢰서';
  document.title = (custNameForTitle ? custNameForTitle + ' ' : '') + docKind;

  // 2026-08-14: 아이패드/아이폰(iOS 사파리)에서 "인쇄 / PDF 저장"을 눌러도
  // 아무 반응이 없던 문제(선혜님 발견 — 실무에서 주로 아이패드 사용).
  // iOS 사파리는 보안상 window.print()를 "사용자가 버튼을 누른 그 실행 흐름
  // 안에서" 호출할 때만 허용하는데, 예전 코드는 setTimeout(…, 100)으로
  // 0.1초 뒤에 호출해서 iOS가 사용자 동작과 무관한 호출로 판단하고 조용히
  // 무시했음(에러조차 안 남아서 원인 파악이 어려웠음).
  // 스타일 삽입은 동기적으로 이미 끝났으므로 지연 없이 바로 호출해도 안전하다.
  try {
    window.print();
  } catch (e) {
    // 혹시 즉시 호출이 막히는 브라우저가 있으면 기존 방식으로 한 번 더 시도
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

function searchCustomer() {
  var ov = document.getElementById('customer-search-overlay');
  if(ov) { ov.style.display='flex'; return; }
  var el = document.createElement('div');
  el.id='customer-search-overlay';
  el.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:center;justify-content:center';
  var inner=document.createElement('div');
  inner.style.cssText='background:#fff;border-radius:12px;padding:var(--sp-6);width:480px;max-width:90vw';
  inner.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-4)"><span style="font-size:11px;font-weight:700">고객 검색</span><span id="cs-close" style="cursor:pointer;font-size:11px">&#x2715;</span></div><div style="display:flex;gap:var(--sp-2);margin-bottom:var(--sp-3)"><input type="text" id="cs-query" placeholder="이름 또는 전화번호" style="flex:1;padding:9px 12px;border:1.5px solid #EEE6DC;border-radius:8px;font-size:11px;font-family:inherit;outline:none"><button id="cs-btn" style="padding:8px 16px;background:#282828;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">검색</button></div><div id="cs-results" style="color:#8E8078;font-size:11px;text-align:center;padding:var(--sp-5)">Supabase 연동 후 사용 가능합니다.</div>';
  el.appendChild(inner);
  document.body.appendChild(el);
  document.getElementById('cs-close').onclick=function(){el.style.display='none';};
  document.getElementById('cs-btn').onclick=function(){
    var res=document.getElementById('cs-results');
    if(res) res.innerHTML='<p>검색 기능 준비 중...</p>';
  };
}
function selectCustomer(name,phone,addr){
  if(name) document.getElementById('c-name').value=name;
  if(phone) document.getElementById('c-phone').value=phone;
  if(addr) document.getElementById('c-addr').value=addr;
  var ov=document.getElementById('customer-search-overlay');
  if(ov) ov.style.display='none';
}
function closeCustomerSearch(){
  var ov=document.getElementById('customer-search-overlay');
  if(ov) ov.style.display='none';
}

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
