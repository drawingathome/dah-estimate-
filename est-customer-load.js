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
  // 2026-09-04(선혜님 지적 — "발주서는 어떻게 됐지??"로 실제 확인하다
  // 발견): 발주서처럼 품목이 적어 내용이 짧으면 pageHeightMm이 폭(190.5mm)
  // 보다 작아질 수 있는데, jsPDF에 orientation:'portrait'를 강제한 채로
  // 폭>높이인 모순된 크기를 주면 jsPDF가 내부적으로 폭/높이를 뒤바꿔버려서
  // 콘텐츠가 이상하게 배치되고 오른쪽이 잘리는 문제가 있었음(재현으로 확인
  // - 견적서는 항상 세로로 길어서 이 경로를 안 탔지만 발주서에서 처음 드러남).
  // 높이가 폭보다 항상 크도록 최소값을 보장해서 모순을 원천 차단.
  pageHeightMm = Math.max(pageHeightMm, 200);

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
  var contentEl = document.querySelector('#pv-overlay .pv-wrap') || document.querySelector('.pv-wrap');
  if (contentEl) contentEl.style.zoom = '';

  // 2026-09-03(선혜님 지적 — "니가 할 수 있는데까지 하고 말해야지, 전문업체는
  // 어떻게 하지?"로 근본 재설계): "견적 길이에 맞추기"를 브라우저 네이티브
  // 인쇄(@page size + window.print())로 구현하려던 시도가 여러 차례
  // 실패했음 — 화면에서 실제 인쇄시 CSS(부모 width:100%, max-width:none,
  // .print-hide 등)가 어떻게 상호작용할지 정확히 흉내내는 게 근본적으로
  // 어려웠음(같은 콘텐츠로도 매번 다른 오차가 남). 대신 이 파일에 이미
  // 있던 카톡공유 기능(_doShareEstimatePDF, html2canvas+jsPDF 방식)이
  // 정확히 같은 문제(콘텐츠 길이에 맞춘 PDF 1장)를 겪지 않고 있었음을
  // 발견 — 이유는 브라우저의 @media print CSS를 전혀 안 거치고, 화면에
  // "실제로 보이는 상태"를 캔버스로 그대로 캡처해서 그 이미지 크기에
  // 맞는 PDF를 만들기 때문(전문 인쇄/PDF 도구들이 흔히 쓰는 방식 —
  // 브라우저 인쇄 CSS의 크로스브라우저 불확실성을 아예 우회함). 재현
  // 테스트로 정확도 확인(결제계좌 마지막 줄이 페이지 끝에 거의 여백 없이
  // 정확히 맞음). "견적 길이에 맞추기"만 이 방식으로 교체 — "A4로
  // 자르기"는 기존 방식이 원래도 문제없이 여러 페이지로 잘 나뉘고 있어서
  // 그대로 유지.
  if (_selectedPdfOpt === 'fit' && contentEl) {
    confirmPdfPrint_fitAsCanvas(contentEl);
    return;
  }

  var styleId = 'pdf-page-style';
  var old = document.getElementById(styleId);
  if(old) old.remove();
  var s = document.createElement('style');
  s.id = styleId;
  // 2026-09-08(선혜님 지적 - "A4로 자르기로 선택을 했는데 저렇게 나온거야"
  // → "페이지 안의 여백이나 배치가 여유가 너무 없다고 느끼는거야"): 여백을
  // .pv-wrap(콘텐츠 전체를 감싸는 통 하나)의 padding으로 주고 있었는데,
  // 이러면 콘텐츠가 여러 페이지로 나뉠 때 이 패딩은 전체 콘텐츠의 맨
  // 처음/맨 끝에만 적용되고, 페이지가 넘어가는 경계 지점(1페이지 끝~
  // 2페이지 시작)에는 여백이 전혀 안 생김 - 2페이지 이상으로 나뉘는
  // 문서일수록 여백이 없어 보이던 정확한 원인. @page margin(브라우저가
  // 몇 장으로 나뉘든 매 페이지마다 자동으로 적용)으로 되돌림 - 8/19에
  // 이미 이 방식이었다가, 이후(9/3 "견적 길이에 맞추기" 재설계 과정
  // 추정) 지금 방식으로 바뀌어 있었음.
  s.textContent = '@media print { @page { size: A4 portrait; margin: 10mm 12mm; } }';
  document.head.appendChild(s);

  _setPrintTitleAndPrint();
}

function confirmPdfPrint_fitAsCanvas(contentEl) {
  // 2026-09-03(선혜님 지시 - "버그를 찾아보자"로 발견, 실제 재현 성공):
  // html2canvas 캡처(비동기, 실측 900ms 이상 소요)가 끝난 뒤 .then() 콜백
  // 안에서 window.open()을 호출하고 있었음 - 클릭 시점으로부터 926ms나
  // 지난 뒤 호출되니, 브라우저(특히 iOS 사파리 - 이 앱의 주 사용 환경)가
  // "사용자 클릭과 무관한 호출"로 판단해서 팝업을 조용히 차단할 위험이
  // 매우 높음(체크리스트 30번 - 사용자 제스처 필요 API는 지연 호출 금지
  // 원칙과 정확히 같은 함정). 표준 우회: 클릭과 동기적으로 먼저 빈 탭을
  // 열어두고(이 시점엔 진짜 사용자 클릭 흐름 안이라 안전), 나중에 캡처가
  // 끝나면 그 탭의 location만 바꿔치기 - 탭 자체는 이미 열려있으니 팝업
  // 차단 정책과 무관해짐.
  var preOpenedTab = window.open('', '_blank');

  function run() {
    var custName = (document.getElementById('c-name')?.value || '').trim() || '고객';
    var isFinal = document.getElementById('status-final')?.classList.contains('on');
    var navText = document.querySelector('#pv-overlay .print-hide')?.textContent || '';
    var docLabel = isFinal ? '확정견적서' : '가견적서';
    if (navText.indexOf('발주서') >= 0) docLabel = '발주서';
    else if (navText.indexOf('실측') >= 0 && navText.indexOf('의뢰') >= 0) docLabel = '실측의뢰서';
    else if (navText.indexOf('시공') >= 0 && navText.indexOf('의뢰') >= 0) docLabel = '시공의뢰서';
    var safeCustName = custName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 30);
    var filename = safeCustName + '_' + docLabel + '.pdf';

    showToast('PDF 만드는 중...');
    var origWidth = contentEl.style.width;
    var origMaxWidth = contentEl.style.maxWidth;
    contentEl.style.width = '720px';
    contentEl.style.maxWidth = '720px';
    contentEl.classList.add('pv-pdf-capture');

    var naturalHeightPx = contentEl.scrollHeight;
    var PX_TO_MM = 25.4 / 96;
    var pageHeightMm = Math.ceil(naturalHeightPx * PX_TO_MM) + 5;
    // 2026-09-04(선혜님 지적 — "발주서는 어떻게 됐지??"로 실제 확인하다
    // 발견): 발주서처럼 짧은 문서에서 pageHeightMm이 폭(190.5mm)보다
    // 작아지면 jsPDF가 orientation:'portrait'와 모순되어 폭/높이를
    // 뒤바꿔버리는 문제 - 최소값 보장으로 원천 차단(자세한 설명은
    // _doShareEstimatePDF의 동일 지점 주석 참고).
    pageHeightMm = Math.max(pageHeightMm, 200);

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
      var url = URL.createObjectURL(pdfBlob);
      if (preOpenedTab && !preOpenedTab.closed) {
        preOpenedTab.location.href = url;
      } else {
        // 미리 연 탭이 실패했거나 사용자가 닫은 경우의 폴백(이 시점엔 이미
        // 늦었을 수 있지만, 최소한 시도는 함).
        window.open(url, '_blank');
      }
      showToast('PDF가 만들어졌어요 — 새 탭에서 확인·저장해주세요');
    }).catch(function(err){
      contentEl.style.width = origWidth;
      contentEl.style.maxWidth = origMaxWidth;
      contentEl.classList.remove('pv-pdf-capture');
      if (preOpenedTab && !preOpenedTab.closed) preOpenedTab.close();
      console.error('PDF 생성 실패:', err);
      showToast('PDF 생성에 실패했어요');
    });
  }

  if (typeof html2pdf === 'undefined') {
    showToast('PDF 기능 불러오는 중...');
    var script = document.createElement('script');
    script.src = '/html2pdf.bundle.min.js';
    script.onload = run;
    script.onerror = function() { showToast('PDF 기능을 불러오지 못했어요. 인터넷 연결을 확인해주세요'); };
    document.head.appendChild(script);
  } else {
    run();
  }
}

function _setPrintTitleAndPrint() {

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
  // 2026-09-15(선혜님 - "누락된거 없니? 다 했니?"로 재점검하다 발견):
  // 대시보드에서 고친 "미배정만 예외로 통과" 원칙이 견적서 앱의 이
  // 화면(고객 불러오기)에는 아직 없어서, 직원이 미배정 신규고객의 이름/
  // 전화번호로 검색해도 못 찾아 견적서를 새로 만들다 중복 고객을 만들
  // 위험이 있었음 - 동일 원칙 적용(이 앱엔 dash-utils.js가 없어 인라인으로).
  if (window._estCurrentUser && window._estCurrentUser.role === 'staff') {
    var unassignedForLoad = customers.filter(function(c){ return c.staffName === '미배정'; });
    customers = customers.filter(function(c){ return (c.staffName||'마스터') === window._estCurrentUser.name; }).concat(unassignedForLoad);
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
  // 2026-09-15(기타 품목 신설하며 함께 처리): 위 두 표와 동일하게 초기화
  // 안 하면, 저장된 견적서를 다시 열 때마다 기타품목 행이 계속 누적됨
  // (매번 다시 열 때마다 중복 추가되는 흔한 함정 - blind/curtain은 이미
  // 처리돼 있었는데 새로 추가하면서 깜빡하기 쉬운 부분이라 명시).
  var otherBodyForReset = document.getElementById('other-body');
  if (otherBodyForReset) otherBodyForReset.innerHTML = '';
  var svcBodyForReset = document.getElementById('svc-body');
  if (svcBodyForReset) svcBodyForReset.innerHTML = '';
  lineItems.forEach(function(it) {
    if (it.type === 'blind') {
      addBlindRow();
      var tr = document.getElementById('blind-body').lastElementChild;
      var sp = tr.querySelector('.space-inp'); if (sp) sp.value = it.space || '';
      var bdn = tr.querySelector('.b-display-name'); if (bdn) bdn.value = it.displayName || '';
      var fabricEl = tr.querySelector('.b-fabric'); if (fabricEl) fabricEl.value = it.fabric || '';
      var vendorEl = tr.querySelector('.b-vendor'); if (vendorEl) vendorEl.value = it.vendor || '';
      var colorEl = tr.querySelector('.b-color'); if (colorEl) colorEl.value = it.color || '';
      // 2026-09-09: 끈길이 복원 추가.
      var cordEl = tr.querySelector('.b-cord-length'); if (cordEl) cordEl.value = it.cordLength || '';
      // 2026-09-11: 하단바/코멘트 복원 추가.
      var bottomBarEl = tr.querySelector('.b-bottom-bar'); if (bottomBarEl) bottomBarEl.value = it.bottomBar || '';
      var commentEl = tr.querySelector('.b-comment'); if (commentEl) commentEl.value = it.comment || '';
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
        // 2026-09-18(선혜님 - "코드정리하고 버그 없는지 확인해"로 직접
        // 발견): 위치(.svc-space) 저장 자체를 est-misc.js에서 놓쳤던 것과
        // 짝을 맞춰서, 여기 복원 로직도 it.space를 위치 칸에 정확히 넣도록
        // 추가 - 안 그러면 저장은 돼도 다시 열 때 위치가 사라짐.
        var svcSpaceEl = str.querySelector('.svc-space'); if (svcSpaceEl) svcSpaceEl.value = it.space || '';
        var svcContentEl = str.querySelector('.svc-content'); if (svcContentEl) svcContentEl.value = it.content || it.displayName || it.space || '';
        var svcPriceEl = str.querySelector('.sprice'); if (svcPriceEl && it.price) { svcPriceEl.value = it.price; if (typeof fmtPriceBlur === 'function') fmtPriceBlur(svcPriceEl); }
        var svcQtyEl = str.querySelector('.sqty'); if (svcQtyEl) svcQtyEl.value = it.qty || it.pnum || '1';
        // 2026-09-19(선혜님 - "다시 열어보니 실측+레일비가... 이게 말이
        // 되니?????????"): 실측비/시공비/레일 등 자동계산 항목의 단가를
        // 사용자가 직접 수정해뒀으면(it.autoType) 자동계산 로직이 다시
        // 실행돼도 이 값을 덮어쓰지 않도록, 그 자동유형에 맞는 마커를
        // 여기서 미리 붙여둠 - 레일/레일시공비는 rowUid가 저장 시점과
        // 복원 시점에 서로 다르므로(매번 새로 발급됨), 위치(공간) 이름이
        // 일치하는 커튼 행을 찾아 그 rowUid를 그대로 가져다 씀(같은
        // 폴백 방식을 getRailLengthText()에서도 이미 쓰고 있음).
        if (it.autoType) {
          str.dataset.manualOverride = '1';
          if (it.autoType === 'rail' || it.autoType === 'railcost') {
            var matchedCurtainTr = Array.from(document.querySelectorAll('#curtain-body tr')).find(function(ctr) {
              return (ctr.querySelector('.space-inp')?.value || '') === (it.space || '') && it.space;
            });
            if (matchedCurtainTr) {
              if (!matchedCurtainTr.dataset.rowUid) {
                window._curtainRowSeq = (window._curtainRowSeq || 0) + 1;
                matchedCurtainTr.dataset.rowUid = 'crow' + window._curtainRowSeq;
              }
              str.setAttribute(it.autoType === 'rail' ? 'data-rail-src' : 'data-railcost-src', matchedCurtainTr.dataset.rowUid);
            }
          } else if (it.autoType === 'measure') {
            str.setAttribute('data-svc-type', '실측비');
          } else if (it.autoType === 'install') {
            str.setAttribute('data-svc-type', '시공비');
            str.setAttribute('data-install-base', String(it.price || 0));
          } else if (it.autoType === 'blindInstall') {
            str.setAttribute('data-svc-type', '블라인드시공');
          } else if (it.autoType === 'option') {
            str.setAttribute('data-svc-type', '옵션추가금');
          }
        }
        if (typeof calcSvcRow === 'function' && svcPriceEl) calcSvcRow(svcPriceEl);
      }
    } else if (it.type === 'other') {
      // 2026-09-15(선혜님 지시 - 침구/러그 등 기타 품목 신설): curtain/blind
      // 처럼 별도 분기 필요 - 안 하면 아래 최종 else(커튼 기본값)로 빠져서
      // 커튼 전용 필드(주름방식/개폐형태 등)가 엉뚱하게 붙거나, 표 자체가
      // 틀린 곳(curtain-body)에 복원되는 문제가 생김.
      addOtherItemRow();
      var otr = document.getElementById('other-body').lastElementChild;
      var onEl = otr.querySelector('.other-name'); if (onEl) onEl.value = it.displayName || '';
      var osEl = otr.querySelector('.other-size'); if (osEl) osEl.value = it.size || '';
      var oqEl = otr.querySelector('.other-qty'); if (oqEl) oqEl.value = it.qty || '1';
      var ontEl = otr.querySelector('.other-note'); if (ontEl) ontEl.value = it.note || '';
      var opEl = otr.querySelector('.other-price'); if (opEl && it.price) { opEl.value = it.price; if (typeof fmtPriceBlur === 'function') fmtPriceBlur(opEl); }
      if (typeof calcOtherItemRow === 'function' && opEl) calcOtherItemRow(opEl);
    } else {
      addCurtainRow();
      var ctr = document.getElementById('curtain-body').lastElementChild;
      var csp = ctr.querySelector('.space-inp'); if (csp) csp.value = it.space || '';
      var dn = ctr.querySelector('.c-display-name'); if (dn) dn.value = it.displayName || '';
      var fb = ctr.querySelector('.c-fabric'); if (fb) fb.value = it.fabric || '';
      var vd = ctr.querySelector('.c-vendor'); if (vd) vd.value = it.vendor || '';
      var rvd = ctr.querySelector('.c-rail-vendor'); if (rvd) rvd.value = it.railVendor || '';
      var cl = ctr.querySelector('.c-color'); if (cl) cl.value = it.color || '';
      // 2026-09-11(선혜님이 실제 캔가공소 발주서 양식 확인해주심): 원단량/
      // 형상가공 복원 추가 - 8/29와 같은 "복원 함수마다 각각 챙겨야
      // 하는" 유형이라, 저장 추가할 때 바로 여기도 함께 넣음(놓치는 걸 방지).
      var yd = ctr.querySelector('.c-yardage'); if (yd) yd.value = it.yardage || '';
      // 2026-09-12(선혜님 지적 - "형상가공 O으로 하자고 했는데 그런거 다
      // 누락했네": 손현영 견적서 재현으로 발견): shapeProcess 필드가 아직
      // 없던 예전 저장 데이터(it.shapeProcess가 undefined)를 복원할 때
      // !!undefined가 항상 false가 되어 무조건 X로 뜨고 있었음 - 기본값
      // O 로직(getDefaultShapeProcessChecked)이 신규행에만 적용되고
      // 복원 경로는 건너뛰고 있었던 것. 값이 명시적으로 저장돼있으면
      // 그 값을, 아예 없던 예전 데이터면 기본값(O)을 따르도록 수정.
      var sp = ctr.querySelector('.c-shape-process'); if (sp) sp.checked = (it.shapeProcess !== undefined) ? !!it.shapeProcess : getDefaultShapeProcessChecked();
      var fup = ctr.querySelector('.c-fabric-unit-price'); if (fup) fup.value = it.fabricUnitPrice || '';
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
      var pn = ctr.querySelector('.pnum'); if (pn && it.pnum) { pn.value = it.pnum; pn.dataset.manual = '1'; }
      // 2026-09-08(선혜님 지시 - "전문업체면 이 상태에 뭘 하겠니" 요청으로
      // 저장/복원 필드 전수대조 중 발견): pnum(폭수)을 복원해도, 바로 다음
      // calcCurtainRow(mw) 호출이 "가로길이가 바뀐 것"으로 취급해서 manual
      // 플래그 없는 pnum을 자동계산값으로 덮어쓰고 있었음 - 견적서를 다시
      // 열 때마다(재구매 불러오기 포함) 저장된 정확한 폭수가 조용히
      // 자동계산값으로 바뀌는 심각한 버그였음(재현: pnum=5로 저장했는데
      // 다시 열면 7로 바뀜). manual 플래그를 함께 설정해 방지.
      var cp = ctr.querySelector('.cprice'); if (cp && it.price) { cp.value = it.price; if (typeof fmtPriceBlur === 'function') fmtPriceBlur(cp); }
      if (typeof calcCurtainRow === 'function') calcCurtainRow(mw, true);
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
  // 2026-09-10(전체 재검토 중 발견 — newEstimate()와 정확히 같은 유형의
  // 재발): "고객 불러오기"로 다른 고객으로 전환할 때, 라인아이템/이름/
  // 전화번호는 새 고객 것으로 바뀌는데 희망도착일/설치기사명은 이전
  // 고객 값이 그대로 남아있었음 - 재구매 고객 처리 등에서 자주 쓰이는
  // 기능이라 실무에 실제로 영향을 줄 수 있는 버그. 먼저 비워두고
  // 시작(이 함수 자체가 설치기사 정보를 복원하는 별도 로직은 없음).
  window._vendorArrivalDates = {};
  window._vendorArrivalLocations = {};
  document.getElementById('c-installer-name').value = '';
  document.getElementById('c-installer-phone').value = '';
  // 2026-09-11(선혜님 지적 - "이 오류가 다음에 또 나올 수도 있니??"):
  // 로컬 캐시(dah_customers)의 depositAmount는 오래됐을 수 있어서
  // 즉시 반영 후에도, 서버에서 최신 값을 다시 조회해서 한 번 더 정확하게
  // 채움(URL기반 로드 경로와 동일한 안전장치, applyRealDepositToForm 재사용).
  // 2026-09-21(선혜님 - "위 내용 코드 정리해줘 버그가 많을꺼 같은데"
  // 요청으로 전수 점검 중 발견): 결제를 견적서 단위로 전환한 뒤,
  // c.depositAmount(customers 레벨)는 신규 고객이 아닌 이상 더 이상
  // 갱신되지 않아 이 즉시 반영이 오래된/부정확한 값을 잠깐 보여줄 수
  // 있었음 - 로컬 견적서 캐시(dah_saved)에서 최신 것을 찾아 즉시 반영.
  try {
    var localEsts = JSON.parse(localStorage.getItem('dah_saved')||'[]');
    var myLocalEsts = localEsts.filter(function(e){ return (c.id && e.clientId) ? e.clientId === c.id : e.clientName === c.clientName; });
    if (myLocalEsts.length > 0) {
      myLocalEsts.sort(function(a,b){ return (b.savedAt||b.date||'') > (a.savedAt||a.date||'') ? 1 : -1; });
      if (Number(myLocalEsts[0].depositAmount) > 0) applyRealDepositToForm(myLocalEsts[0].depositAmount);
    } else if (Number(c.depositAmount) > 0) {
      applyRealDepositToForm(c.depositAmount);
    }
  } catch (eLocalDep) {}
  // 2026-09-21(선혜님 - "위 내용 코드 정리해줘 버그가 많을꺼 같은데"
  // 요청으로 전수 점검 중 발견): 결제를 견적서 단위로 전환한 뒤,
  // customers.deposit_amount는 신규 고객이 아닌 이상 더 이상 갱신되지
  // 않으므로, 여기서 계속 customers 테이블만 조회하면 이 참고용 계약금
  // 힌트가 항상 0(또는 오래된 값)으로 잘못 보일 수 있었음 - 이 고객의
  // 최신 견적서(estimates)에서 조회하도록 교체.
  if (c.id && typeof SUPABASE_URL !== 'undefined') {
    try {
      var depXhr = new XMLHttpRequest();
      depXhr.open('GET', SUPABASE_URL + '/rest/v1/estimates?client_id=eq.' + encodeURIComponent(c.id) + '&order=created_at.desc&limit=1&select=deposit_amount', true);
      depXhr.setRequestHeader('apikey', SUPABASE_KEY);
      depXhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
      depXhr.onload = function() {
        try {
          var rows = JSON.parse(depXhr.responseText);
          if (rows && rows[0]) applyRealDepositToForm(rows[0].deposit_amount);
        } catch (eDepParse) {}
      };
      depXhr.send();
    } catch (eDepOuter) {}
  }
  if(c.clientName && document.getElementById('c-name')) document.getElementById('c-name').value=c.clientName;
  if(c.phone && document.getElementById('c-phone')) document.getElementById('c-phone').value=c.phone;
  if(c.addr && document.getElementById('c-addr')) {
    // 2026-09-15(선혜님 - "위험도가 있든 없든 고쳐야지!!"): est-utils.js가
    // 이 파일보다 항상 먼저 로드되는 게 이미 확인됐으므로, 매번 함수
    // 존재를 방어적으로 검사하던 반복 코드를 없애고 그냥 직접 호출.
    var splitAddr = splitAddrDetail(c.addr);
    document.getElementById('c-addr').value = splitAddr.base;
    if (splitAddr.detail && document.getElementById('c-addr2')) document.getElementById('c-addr2').value = splitAddr.detail;
  }
  // 2026-09-15(선혜님 - "고객 불러오기 해봤는데 기존 견적이 불러와지던데"
  // → "고객정보만 가져오고 품목은 항상 비워두게"로 확정): 예전엔(2026-08-05)
  // 재구매 편의를 위해 이 고객의 가장 최근 견적 품목/지역/할인까지 전부
  // 같이 불러왔는데, 그러면 "이 고객으로 완전히 새 견적서"를 만들 때마다
  // 매번 이전 품목을 일일이 지워야 해서 오히려 불편했음 - 이제 고객
  // 기본정보(이름/전화/주소)만 가져오고 품목·지역·할인은 항상 빈 상태로
  // 시작. 같은 날 실수로 중복 저장되는 것 자체는 저장 시점에 별도로
  // 서버에서 한 번 더 확인하는 안전장치(saveToEstimates 참고)가 이미
  // 있어서, 여기서 이 처리를 안 해도 유령 견적서가 쌓이지 않음.
  // 예전엔 restoreLineItemsToForm()이 품목 복원 전에 항상 먼저 비우는
  // 역할도 같이 했는데, 이제 그 호출 자체를 없앴으니 여기서 직접 비워야
  // 함 - 안 그러면 A고객 견적 작업 중에 곧바로 B고객을 불러올 때 A의
  // 품목이 B의 이름/전화번호와 뒤섞인 채 남아있게 됨.
  document.getElementById('curtain-body').innerHTML = '';
  document.getElementById('blind-body').innerHTML = '';
  var blindTbl = document.getElementById('blind-table'); if (blindTbl) blindTbl.style.display = 'none';
  var otherBody = document.getElementById('other-body'); if (otherBody) otherBody.innerHTML = '';
  var otherTbl = document.getElementById('other-table'); if (otherTbl) otherTbl.style.display = 'none';
  document.getElementById('svc-body').innerHTML = '';
  if (typeof resetEstEditingState === 'function') resetEstEditingState();
  if (typeof renderEmptyState === 'function') renderEmptyState();
  if (typeof calcTotal === 'function') calcTotal();
  closeCustLoad();
  showToast('고객 정보를 불러왔습니다 — '+(c.clientName||''));
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
  if (window._estEditState.lastCalcBreakdown) {
    window._estEditState.lastCalcBreakdown.deposit = dep;
    window._estEditState.lastCalcBreakdown.balance = bal;
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
