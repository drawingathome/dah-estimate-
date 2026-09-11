/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 문서 생성 (고객용/거래처용/실측시공 의뢰서)
   견적서 HTML 생성 및 인쇄, 거래처별 발주서 생성,
   실측/시공 의뢰서 생성. 서로 긴밀히 연관되어 하나의 파일로 유지.
   ══════════════════════════════════════════════════ */

function buildCustomerHTML() {
  var cName       = escHtml(document.getElementById('c-name')?.value||'');
  var cPhone      = escHtml(document.getElementById('c-phone')?.value||'');
  var cAddr       = escHtml(document.getElementById('c-addr')?.value||'');
  var measureDate = document.getElementById('c-measure')?.value||'';
  var installDate = document.getElementById('c-install')?.value||'';
  var cNo         = document.getElementById('c-no')?.value||'';
  var cStaff      = escHtml(document.getElementById('c-staff')?.value||'장선혜');
  var sumCurtain  = document.getElementById('sum-curtain')?.textContent||'0원';
  var sumSvc      = document.getElementById('sum-svc')?.textContent||'0원';
  var _grandEl = document.getElementById('sum-total');
  var _grandNum = parseInt((_grandEl?.textContent||'0').replace(/[^0-9]/g,''))||0;
  var sumTotal = _grandNum > 0 ? _grandNum.toLocaleString()+'원' : (document.getElementById('sum-total')?.textContent||'0원');
  var sumDisc     = document.getElementById('sum-discount')?.textContent||'';
  var depInp      = document.getElementById('deposit-input');
  var sumDeposit  = '—';
  if(depInp && depInp.value) {
    var depRaw = depInp.getAttribute('data-raw') || depInp.value.replace(/[^0-9]/g,'');
    sumDeposit = depRaw ? parseInt(depRaw).toLocaleString()+'원' : '—';
  }
  var sumBalance = document.getElementById('sum-balance')?.textContent||'—';
  var curTab     = currentTab||'ga';
  var isFinal    = curTab==='final';
  var docLabel   = isFinal ? '최종 견적서' : '가견적서';

  function fmtDate2(d){
    if(!d) return '—';
    if(d.includes('년')) return d.replace(/\s+/g,' ').trim();
    if(d.includes('-')){ var p=d.split('-'); return p[0]+'년 '+parseInt(p[1])+'월 '+parseInt(p[2])+'일'; }
    if(d.length>=8) return d.slice(0,4)+'년 '+parseInt(d.slice(4,6))+'월 '+parseInt(d.slice(6,8))+'일';
    return d||'—';
  }
  function today(){
    return formatKoreanDate();
  }

  
  var curtainRows=[];
  document.querySelectorAll('#curtain-body tr').forEach(function(tr){
    var space=tr.querySelector('.space-inp')?.value||'';
    var name =tr.querySelector('.c-display-name')?.value||'';
    var pleat=tr.querySelector('.pleat-type')?.value||'';
    var open =tr.querySelector('.open-type')?.value||'';
    var hem  =tr.querySelector('.hem-type')?.value||'';
    var mw   =tr.querySelector('.mw')?.value||'';
    var mh   =tr.querySelector('.mh')?.value||'';
    var pnum =tr.querySelector('.pnum')?.value||'';
    var price=getPriceVal(tr.querySelector('.cprice'))||0;
    var amt  =tr.querySelector('.camt')?.textContent||'—';
    var spec =[pleat,open,hem].filter(Boolean).join(' · ');
    // 2026-08-15: 공간명/제품명을 둘 다 안 입력하면 이 행이 고객용 문서
    // "표"에서 통째로 빠지던 심각한 사각지대(선혜님과 "실무 조합 검증" 중
    // 재현으로 발견) - 금액은 제품소계/최종금액에 정확히 반영되는데 표에는
    // 안 나와서, 고객이 "내가 뭘 주문했는지" 문서로 확인할 수 없는 상태가
    // 조용히 발생할 수 있었음. 실제로 치수나 단가가 입력된 "유효한 행"이면
    // 공간/제품명이 비어있어도 표시하도록 필터 완화.
    if(name||space||mw||price) curtainRows.push({
      space:escHtml(space||'기타'),name:escHtml(name),spec:escHtml(spec),
      mw:mw,mh:mh,pnum:pnum,price:price,amt:amt,type:'curtain'
    });
  });

  
  var blindRows=[];
  document.querySelectorAll('#blind-body tr').forEach(function(tr){
    var space=tr.querySelector('.space-inp')?.value||'';
    var name =tr.querySelector('.c-display-name')?.value||tr.querySelectorAll('td')[1]?.querySelector('input')?.value||'';
    var kind =tr.querySelector('.blind-kind')?.value||'';
    var handle=tr.querySelector('.handle-dir')?.value||'';
    var bw   =tr.querySelector('.bmw')?.value||'';
    var bh   =tr.querySelector('.bmh')?.value||'';
    var sqm  =tr.querySelector('.bsqm')?.textContent||'';
    var price=getPriceVal(tr.querySelector('.blind-price'))||0;
    var amt  =tr.querySelector('.bamt')?.textContent||'—';
    var addon=tr.querySelector('.blind-opt')?.value||'';
    // 2026-08-15: 커튼과 동일한 이유로 필터 완화 - 종류/치수/단가가 입력된
    // 유효한 행이면 공간/제품명이 비어있어도 표시.
    if(name||space||kind||bw||price) blindRows.push({
      space:escHtml(space||'기타'),name:escHtml(name),kind:escHtml(kind),handle:escHtml(handle),
      addon:escHtml(addon),bw:bw,bh:bh,sqm:sqm,price:price,amt:amt,type:'blind'
    });
  });

  
  var svcRows=[];
  document.querySelectorAll('#svc-body tr').forEach(function(tr){
    var tds=tr.querySelectorAll('td');
    var svcType=tds[0]?.querySelector('select')?.value||'';
    var desc =tds[1]?.querySelector('input')?.value||'';
    var price=getPriceVal(tds[2]?.querySelector('input'));
    var qty  =parseFloat(tds[3]?.querySelector('input')?.value)||1;
    var amt  =tds[4]?.textContent||'';
    if(desc&&amt&&amt!=='0원') svcRows.push({svcType:escHtml(svcType),desc:escHtml(desc),price:price,qty:qty,amt:amt});
  });

  
  var allRows = curtainRows.concat(blindRows);
  var prodHTML = '';
  if(allRows.length) {
    prodHTML += '<div class="pv-table-scroll-wrap"><div class="pv-table-scroll"><table class="pv-prod-table">';
    prodHTML += '<colgroup><col style="width:13%"><col style="width:14%"><col style="width:35%"><col style="width:9%"><col style="width:13%"><col style="width:16%"></colgroup>';
    prodHTML += '<thead><tr><th style="text-align:left">공간</th><th style="text-align:left">사이즈(cm)</th><th style="text-align:left">제품명</th><th class="r">폭</th><th class="r">단가</th><th class="r">금액</th></tr></thead><tbody>';

    // 고객용 견적서는 "공간"(거실/안방/자녀방 등) 기준으로 묶어서 보여줌 —
    // 입력화면(내부관리)에서는 커튼/블라인드로 나눠 작성하지만, 고객이 받는 문서는
    // "이 방에 뭐가 들어가는지"가 한눈에 보이는 게 더 자연스럽다는 피드백 반영.
    // 공간 등장 순서(처음 나온 순서)를 그대로 유지한다.
    var spaceOrder = [];
    var spaceGroups = {};
    allRows.forEach(function(r) {
      var key = r.space || '기타';
      if (!spaceGroups[key]) { spaceGroups[key] = []; spaceOrder.push(key); }
      spaceGroups[key].push(r);
    });

    function renderCurtainRow(r, isFirst, groupSize) {
      var specArr = r.spec.split(' · ');
      var usedSpecAsTitle = !r.name;
      var title = r.name || specArr[0] || '커튼';
      var subSpec = (usedSpecAsTitle ? specArr.slice(1) : specArr).join(' · ');
      var spaceCell = isFirst ? '<td class="space-cell" rowspan="'+groupSize+'"><span class="space-cell-text">'+(r.space||'')+'</span></td>' : '';
      var html = '<tr'+(isFirst?' class="pv-group-first"':'')+'>'
        +spaceCell
        +'<td class="sz">'+(r.mw?r.mw+'×'+r.mh:'—')+'</td>'
        +'<td class="name">'+title+(subSpec?'<div class="pv-cell-sub">'+subSpec+'</div>':'')+'</td>'
        +'<td class="r" style="color:#B0A99F;font-size:10.5px">'+(r.pnum?r.pnum:'—')+'</td>'
        +'<td class="r" style="color:#B0A99F;font-size:10.5px">'+(r.price?r.price.toLocaleString():'—')+'</td>'
        +'<td class="amt">'+r.amt+'</td>'
        +'</tr>';
      return html;
    }
    function renderBlindRow(r, isFirst, groupSize) {
      var usedKindAsTitle = !r.name;
      var title = r.name || r.kind || '블라인드';
      var subParts = [];
      if (!usedKindAsTitle) subParts.push(r.kind);
      if (r.handle) subParts.push(r.handle);
      if (r.sqm) subParts.push(r.sqm);
      var subSpec = subParts.join(' · ');
      var spaceCell = isFirst ? '<td class="space-cell" rowspan="'+groupSize+'"><span class="space-cell-text">'+(r.space||'')+'</span></td>' : '';
      var html = '<tr'+(isFirst?' class="pv-group-first"':'')+'>'
        +spaceCell
        +'<td class="sz">'+(r.bw?r.bw+'×'+r.bh:'—')+'</td>'
        +'<td class="name">'+title+(subSpec?'<div class="pv-cell-sub">'+subSpec+'</div>':'')+'</td>'
        +'<td class="r">—</td>'
        +'<td class="r" style="color:#B0A99F;font-size:10.5px">'+(r.price?r.price.toLocaleString():'—')+'</td>'
        +'<td class="amt">'+r.amt+'</td>'
        +'</tr>';
      return html;
    }

    spaceOrder.forEach(function(spaceKey) {
      var groupSize = spaceGroups[spaceKey].length;
      spaceGroups[spaceKey].forEach(function(r, idx) {
        var isFirst = (idx === 0);
        prodHTML += (r.type === 'blind') ? renderBlindRow(r, isFirst, groupSize) : renderCurtainRow(r, isFirst, groupSize);
      });
    });
    prodHTML += '</tbody></table></div></div>';
  }

  
  var svcHTML = '';
  if(svcRows.length) {
    // 2026-08-15: 고객용 출력에서 실측+시공비/레일/전동및부자재/기타옵션을
    // "시공 서비스" 표 자체에 4줄(값 있는 것만)로 정리해서 보여줌
    // (기존엔 표는 한 줄로 뭉뚱그리고 세부내역을 참고사항에 텍스트로
    // 넣었었는데, 선혜님 정정으로 "시공서비스 표 안에" 정리하는 것으로 변경).
    // 2026-08-15: 참고사항을 4줄 고정 구조로 재구성(선혜님 요청):
    // ①실측+시공비(지역별) ②레일 ③전동 및 부자재 ④기타 옵션(블라인드옵션 외)
    var measureInstallSum = 0;
    var railSum = 0, railDetailBits = [];
    var motorMaterialSum = 0;
    var etcOptionSum = 0;
    document.querySelectorAll('#svc-body tr').forEach(function(tr){
      var tds = tr.querySelectorAll('td');
      var desc = tds[1]?.querySelector('input')?.value || '';
      var price = getPriceVal(tds[2]?.querySelector('input'));
      var qty = parseFloat(tds[3]?.querySelector('input')?.value) || 1;
      var amt = price * qty;
      if (!desc || !amt) return;
      var isRailMaterial = tr.hasAttribute('data-rail-src');
      var isRailInstall = tr.hasAttribute('data-railcost-src');
      var isRegionInstall = tr.hasAttribute('data-install-base');
      var svcTypeAttr = tr.getAttribute('data-svc-type') || '';
      var kindSelect = tds[0]?.querySelector('select')?.value || '';
      var isMeasureOrInstall = isRegionInstall || isRailInstall ||
        svcTypeAttr === '실측비' || svcTypeAttr === '시공비' || svcTypeAttr === '블라인드시공';
      var isOptionExtra = svcTypeAttr === '옵션추가금'; // 전동 등 블라인드 옵션추가금
      var isManualMaterial = kindSelect === '부자재'; // 직접 추가한 부자재
      if (isMeasureOrInstall) {
        measureInstallSum += amt;
      } else if (isRailMaterial) {
        railSum += amt;
        railDetailBits.push(desc.trim() + (qty > 1 ? ' ' + qty + '개' : ''));
      } else if (isOptionExtra || isManualMaterial) {
        motorMaterialSum += amt;
      } else {
        etcOptionSum += amt;
      }
    });
    // 2026-08-15: 4줄이 이제 시공서비스 표에 직접 행으로 렌더링되므로,
    // 참고사항에 별도 텍스트로 중복 표시할 필요가 없어짐(아래 svcLines 참고).

    // 2026-08-15: 4줄(실측+시공비/레일/전동및부자재/기타옵션)을 참고사항
    // 텍스트가 아니라 "시공 서비스" 표 자체의 실제 행으로 렌더링(선혜님
    // 정정: "시공서비스에 정리하자는 말이었다" — 예전엔 표는 여전히
    // "세부 내역은 하단 참고사항을 확인해주세요" 한 줄로 뭉뚱그려두고,
    // 정작 4줄은 완전히 다른 섹션인 참고사항에 작은 글씨로 묻혀있었음).
    svcHTML += '<div class="pv-table-scroll-wrap"><div class="pv-table-scroll"><table class="pv-prod-table" style="margin-top:0">';
    svcHTML += '<colgroup><col style="width:70%"><col style="width:30%"></colgroup>';
    svcHTML += '<thead><tr><th style="text-align:left">품목</th><th class="r">금액</th></tr></thead><tbody>';
    var svcLines = [];
    if (measureInstallSum > 0) svcLines.push(['실측 + 시공비', measureInstallSum]);
    if (railSum > 0) svcLines.push(['레일', railSum]);
    if (motorMaterialSum > 0) svcLines.push(['전동 및 부자재', motorMaterialSum]);
    if (etcOptionSum > 0) svcLines.push(['기타 옵션', etcOptionSum]);
    svcLines.forEach(function(line){
      svcHTML += '<tr>';
      svcHTML += '<td style="font-size:11px;color:#8E8078">' + line[0] + '</td>';
      svcHTML += '<td class="amt">' + line[1].toLocaleString() + '원</td>';
      svcHTML += '</tr>';
    });
    svcHTML += '</tbody></table></div></div>';
  }

  
  var hasSchedule = measureDate || installDate;

  
  var processHTML = '';
  if(true){
    // 2026-08-14: 기존에 쓰시던 견적서(PROCESS 섹션) 형식으로 압축(선혜님 확인).
    // 예전엔 5단계가 각각 번호 뱃지+제목+설명으로 2줄씩 차지해 389px(문서 전체의
    // 25%)를 써서 A4 1페이지를 넘기는 주원인이었음. "번호. 제목 : 설명" 한 줄
    // 형식으로 바꿔 내용은 그대로 두면서 높이만 대폭 줄임.
    var steps=[
      ['상담 및 제품 선택','제품을 확인하고 커튼의 종류, 디자인, 소재 등을 상담하여 선택'],
      ['계약금 결제 및 일정 확정','1차 견적 확인 후 계약금(총 금액의 50%)을 결제하며, 실측 및 시공 일정을 확정'],
      ['실측 및 최종 결제','현장 실측 후 최종 견적 안내 및 잔금 결제. 실측 이후에는 제작이 진행되어 취소 및 변경이 불가능 합니다.'],
      ['제품 제작','결제 완료 후 제품 제작 및 시공 준비가 진행'],
      ['시공 및 설치','약속된 일정에 시공팀이 현장을 방문하여 커튼 시공 및 설치 완료']
    ];
    processHTML = '<div class="pv-process">';
    processHTML += '<div class="pv-process-title">PROCESS</div>';
    processHTML += '<div class="pv-timeline">';
    steps.forEach(function(s,i){
      var isLast = (i === steps.length-1);
      processHTML += '<div class="pv-tl-step'+(isLast?' pv-tl-last':'')+'">'
        +'<span class="pv-tl-dot">'+(i+1)+'</span>'
        +(isLast?'':'<span class="pv-tl-line"></span>')
        +'<div class="pv-tl-text"><strong>'+s[0]+'</strong> — '+s[1]+'</div>'
        +'</div>';
    });
    processHTML += '</div></div>';
  }

  
  var cMemo = document.getElementById('c-memo')?.value||'';
  var notesHTML = '';
  var noteItems = [];
  // 2026-08-15: 시공 서비스 세부내역은 이제 "시공 서비스" 표 자체에
  // 직접 4줄로 표시되므로(위 svcLines 참고), 참고사항에는 더 이상
  // 중복해서 넣지 않음.
  if(cMemo) noteItems.push(cMemo);
  
  noteItems.push('맞춤제작 특성상 계약 후 취소·변경이 불가합니다.');
  noteItems.push('견적서 유효기간은 발행일로부터 7일입니다.');
  if(noteItems.length){
    notesHTML = '<div class="pv-notes">';
    notesHTML += '<div class="pv-notes-title">참고사항</div>';
    noteItems.forEach(function(n){
      notesHTML += '<div class="pv-notes-item">'+n+'</div>';
    });
    notesHTML += '</div>';
  }

  
  var out = '<div class="pv-wrap" style="max-width:720px;margin:0 auto">';

  
  out += '<div class="pv-header">'
      +'<div>'
      +'<img class="pv-logo" style="height:36px;display:block;object-fit:contain" src="'+DAH_LOGO_B64+'" alt="드로잉엣홈">'
      +'<div class="pv-supplier-line" style="margin-top:9px;margin-bottom:0;color:#B0A99F">드로잉엣홈 · 사업자 120-11-39858 · 대표 장선혜 · info@drawingathome.co.kr · 서울 서초구 사평대로 53길 64 1층</div>'
      +'</div>'
      +'<div class="pv-header-right">'
      +''
      +'<div class="pv-doc-title">'+docLabel+'</div>'
      +'</div>'
      +'</div>';
  // 2026-08-15: 커튼 주름(pleat)을 추상화한 시그니처 요소 — 헤더 바로 아래
  // 얇은 세로선을 불규칙한 간격으로 배치해 "이 문서는 커튼/블라인드 회사
  // 것"이라는 걸 은근히 알려줌(선혜님 디자인 피드백 반영 — 뻔한 헤어라인
  // 신문스타일에서 벗어나 브랜드 고유의 시그니처를 하나 넣음).
  // 2026-08-15: 시그니처(주름 패턴) 제거 - 너무 미묘해서 있으나마나 하다는
  // 선혜님 판단. 억지로 살리기보다 깔끔하게 없애기로 함.

  out += '<div class="pv-meta">'
      +'<span>No. <strong>'+(cNo||'—')+'</strong></span>'
      +'<span>발행일 <strong>'+today()+'</strong></span>'
      +'<span>담당자 <strong>'+(cStaff||'장선혜')+'</strong></span>'
      +'</div>';

  // 2026-08-15: 공급자/수신자를 나란히 비교하는 2열 구조를 폐기(선혜님
  // 피드백 — "간격이 안 맞다": 공급자는 항상 4줄, 수신자는 최대 2줄이라
  // 구조적으로 항상 불균형했음). 수신자(고객)를 중심에 크게, 공급자
  // 고정정보는 문서 하단으로 이동해 컴팩트한 한 줄로 처리.
  out += '<div class="pv-recipient">'
      +'<div class="pv-recipient-label">수신</div>'
      +'<div class="pv-recipient-name">'+cName+' 님</div>'
      +(function(){ var bits=[]; if(cPhone) bits.push(cPhone); if(cAddr) bits.push(cAddr); return bits.length ? '<div class="pv-recipient-info">'+bits.join(' · ')+'</div>' : ''; })()
      +'</div>';

  
  if(hasSchedule){
    out += '<div class="pv-schedule-bar">';
    if(measureDate) out += '<div class="pv-sch-item"><div class="pv-sch-label">실측 예정</div><div class="pv-sch-val">'+fmtDate2(measureDate)+'</div></div>';
    if(installDate) out += '<div class="pv-sch-item"><div class="pv-sch-label">시공 예정</div><div class="pv-sch-val">'+fmtDate2(installDate)+'</div></div>';
    out += '</div>';
  }

  
  if(prodHTML){
    out += '<div class="pv-section">';
    out += '<div class="pv-section-title">'
        +'<svg width="20" height="20" viewBox="0 0 20 20" style="vertical-align:-5px;margin-right:6px"><line x1="2" y1="3.5" x2="18" y2="3.5" stroke="#1A1A1A" stroke-width="1.3" stroke-linecap="round"/><path d="M5.5 4.5 Q7.5 11 5.5 17.5" stroke="#1A1A1A" stroke-width="1.1" fill="none" stroke-linecap="round"/><path d="M10 4.5 Q12 11 10 17.5" stroke="#1A1A1A" stroke-width="1.1" fill="none" stroke-linecap="round"/><path d="M14.5 4.5 Q16.5 11 14.5 17.5" stroke="#1A1A1A" stroke-width="1.1" fill="none" stroke-linecap="round"/></svg>'
        +'커튼 · 블라인드</div>';
    out += prodHTML;
    out += '</div>';
  }

  
  if(svcHTML){
    out += '<div class="pv-section">';
    out += '<div class="pv-section-title">'
        +'<svg width="20" height="20" viewBox="0 0 20 20" style="vertical-align:-5px;margin-right:6px"><rect x="1.5" y="7.5" width="17" height="5" rx="2.5" stroke="#1A1A1A" stroke-width="1.2" fill="none"/><circle cx="10" cy="10" r="1.6" stroke="#1A1A1A" stroke-width="1" fill="none"/></svg>'
        +'시공 자재</div>';
    out += svcHTML;
    out += '</div>';
  }

  
  out += '<div class="pv-summary-divider"></div>';
  out += '<table class="pv-sum-table pv-sum-indent" style="margin-top:0">';
  out += '<colgroup><col style="width:70%"><col style="width:30%"></colgroup>';
  out += '<tr><td class="sum-lbl">제품 소계</td><td class="sum-val">'+sumCurtain+'</td></tr>';
  if(svcRows.length) out += '<tr><td class="sum-lbl">시공 자재</td><td class="sum-val">'+sumSvc+'</td></tr>';
  if(sumDisc && sumDisc !== '-0원' && sumDisc !== '') out += '<tr><td class="sum-lbl">할인</td><td class="sum-val" style="color:#282828">'+sumDisc+'</td></tr>';
  out += '</table>';

  // 2026-08-15: "최종 견적"을 표 행에서 완전히 분리 — 그동안 모든 섹션이
  // "제목-얇은선-표" 패턴만 반복돼서 리듬감이 없다는 지적(선혜님) 반영.
  // 유일하게 여기서만 다른 비율(가운데 정렬, 훨씬 큰 여백, 상하 이중선)을
  // 써서 시선이 자연스럽게 멈추는 지점으로 만듦.
  out += '<div class="pv-total-block">'
      +'<span class="pv-total-label">최종 견적</span>'
      +'<span class="pv-total-value">'+sumTotal+'</span>'
      +'</div>';

  
  out += '<div class="pv-payment-split" style="border-top:none">'
      +'<div class="pv-payment-item">'
      +'<div class="pv-payment-label">계약금 50% <span class="pv-payment-sub">· 계약 시 납부</span></div>'
      +'<div class="pv-payment-amount">'+sumDeposit+'</div>'
      +'</div>'
      +'<div class="pv-payment-item">'
      +'<div class="pv-payment-label">잔금 50% <span class="pv-payment-sub">· 실측 후 납부</span></div>'
      +'<div class="pv-payment-amount">'+sumBalance+'</div>'
      +'</div>'
      +'</div>';

  // 2026-08-22(선혜님 발견): A4 표준 옵션에서 내용이 2페이지로 넘어갈 때,
  // 참고사항+PROCESS까지는 1페이지 끝에 억지로 다 들어가고 결제계좌 한 줄만
  // 뚝 떨어져서 2페이지 맨 위에 혼자 남고 나머지는 텅 비는 문제가 있었음
  // (참고사항/PROCESS/결제계좌가 서로 묶여있지 않고 따로 흘러서 생김).
  // 세 블록을 한 덩어리(.pv-tail-group)로 묶어서, 남은 공간에 다 못 들어가면
  // 이 덩어리 전체가 통째로 다음 페이지로 넘어가도록 함 — 마지막 줄만 혼자
  // 떨어지는 대신, 참고사항부터 결제계좌까지 다음 페이지에 다 같이 나옴.
  out += '<div class="pv-tail-group">';

  out += notesHTML;

  out += processHTML;

  try {
    var photos = JSON.parse(localStorage.getItem('dah_photos')||'[]');
    if(photos.length > 0) {
      out += '<div class="pv-photos">';
      out += '<div class="pv-photos-title">시공 사례</div>';
      out += '<div class="pv-photos-grid">';
      photos.slice(0,6).forEach(function(p){
        out += '<img src="'+p.src+'" alt="시공사례">';
      });
      out += '</div></div>';
    }
  } catch(e){}

  // 계좌정보는 설정탭에 저장된 값을 사용 — 예전엔 여기 문구가 코드에 고정되어 있어서
  // 설정탭에서 계좌번호/은행명을 바꿔도 견적서에는 전혀 반영이 안 되고 있었음
  var _acctSettings = {};
  try { _acctSettings = JSON.parse(localStorage.getItem('dah_settings') || '{}'); } catch(e){}
  var _bankName = _acctSettings.bank || '국민은행';
  var _acctNum = _acctSettings.account || '015401-04-258798';
  var _holderName = _acctSettings.holder || '장선혜';

  out += '<div class="pv-footer">'
      +'<div style="margin-bottom:6px"><strong>결제 계좌</strong>&nbsp;&nbsp;' + _bankName + ' ' + _acctNum + '&nbsp;&nbsp;예금주: ' + _holderName + '(드로잉엣홈)</div>'
      +''
      +'</div>';

  out += '</div>'; // .pv-tail-group 닫기

  out += '</div>';
  return out;
}
function printForCustomer() {
  // 2026-08-24: "저장 당시 금액 고정" 보기 모드일 때는 calcTotal()로 다시
  // 계산하면 그 순간 최신 설정으로 덮어써버려서 얼려둔 의미가 없어짐 —
  // 이 경우엔 재계산 대신 저장된 스냅샷을 그대로 다시 적용만 함.
  if (window._viewingFrozenEstimate && window._lastCalcBreakdown && typeof applyFrozenBreakdown === 'function') {
    applyFrozenBreakdown(window._lastCalcBreakdown);
  } else {
    calcTotal();
  }
  var html = buildCustomerHTML();

  // 구글드라이브에 저장 (2026-08-02 추가, 이후 확정견적서만 저장하도록 조정) —
  // 가견적서는 아직 확정 전이라 자주 바뀔 수 있어서 매번 저장하면 드라이브가
  // 지저분해짐. 확정견적서만 저장.
  var isFinalForDrive = (document.getElementById('status-final')?.classList.contains('on'));
  if (isFinalForDrive) {
    var cNameForDrive2 = document.getElementById('c-name')?.value || '미지정고객';
    var cStaffForDrive2 = document.getElementById('c-staff')?.value || '';
    saveDocumentToDrive('확정견적서', cNameForDrive2, '', html, cStaffForDrive2);
  }

  var existing = document.getElementById('pv-overlay');
  if(existing) existing.remove();

  var ov = document.createElement('div');
  ov.id = 'pv-overlay';
  ov.style.cssText = [
    'position:fixed;top:0;left:0;width:100%;height:100%',
    'background:#F5F2EE;z-index:9999;overflow-y:auto;overflow-x:auto',
    'display:flex;flex-direction:column'
  ].join(';');

  
  var nav = document.createElement('div');
  nav.className = 'print-hide';
  nav.style.cssText = [
    'position:sticky;top:0;z-index:10001',
    'background:#282828;padding:0 24px',
    'display:flex;align-items:center;justify-content:space-between',
    'height:52px;flex-shrink:0'
  ].join(';');
  var isFinal = (document.getElementById('status-final')?.classList.contains('on'));
  var navLabel = document.createElement('span');
  navLabel.textContent = isFinal ? '최종 견적서 — 고객용 미리보기' : '가견적서 — 고객용 미리보기';
  navLabel.style.cssText = 'color:rgba(255,255,255,0.6);font-size:11px;font-weight:600;letter-spacing:0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1 1 auto;margin-right:8px';
  var navBtns = document.createElement('div');
  navBtns.style.cssText = 'display:flex;gap:var(--sp-2);flex-shrink:0';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.onclick = function(){
    document.getElementById('pv-overlay').remove();
    document.body.style.overflow = '';
    document.body.classList.remove('preview-open');
  };
  closeBtn.style.cssText = 'padding:7px 16px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit;white-space:nowrap;flex-shrink:0';
  var printBtn = document.createElement('button');
  printBtn.textContent = '인쇄 / PDF 저장';
  printBtn.onclick = openPdfModal;
  printBtn.style.cssText = 'padding:7px 18px;background:#282828;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;white-space:nowrap;flex-shrink:0';
  var shareBtn = document.createElement('button');
  shareBtn.textContent = '💬 카톡 공유';
  shareBtn.onclick = shareEstimatePDF;
  shareBtn.style.cssText = 'padding:7px 18px;background:#F06E2D;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;white-space:nowrap;flex-shrink:0';
  navBtns.appendChild(closeBtn);
  navBtns.appendChild(shareBtn);
  navBtns.appendChild(printBtn);
  nav.appendChild(navLabel);
  nav.appendChild(navBtns);

  
  var content = document.createElement('div');
  content.style.cssText = 'flex:1;padding:32px 20px 60px;display:flex;justify-content:center';
  var inner = document.createElement('div');
  inner.style.cssText = 'width:100%;max-width:640px';
  inner.innerHTML = html;
  content.appendChild(inner);

  ov.appendChild(nav);
  ov.appendChild(content);
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  document.body.classList.add('preview-open');

  // 2026-08-16: 모바일에서 표(공간/사이즈/제품명/폭/단가/금액)가 화면보다 넓어서
  // 옆으로 스크롤해야 하는데, "더 있다"는 걸 알려주는 표시가 없으면 사용자가
  // 스크롤 가능하다는 걸 모르고 놓칠 수 있음 — 오른쪽 그라데이션 힌트를 넣고,
  // 끝까지 스크롤하면 자연스럽게 사라지게 함.
  ov.querySelectorAll('.pv-table-scroll').forEach(function(scrollEl) {
    var wrap = scrollEl.closest('.pv-table-scroll-wrap');
    if (!wrap) return;
    function updateHint() {
      var atEnd = scrollEl.scrollLeft + scrollEl.clientWidth >= scrollEl.scrollWidth - 2;
      wrap.classList.toggle('scrolled-end', atEnd);
    }
    updateHint();
    scrollEl.addEventListener('scroll', updateHint, { passive: true });
  });
}

function buildVendorDocForOne(vendor, groupItems, cName, cStaff, extraNote, today, arrivalDate, arrivalLocation) {
  // 2026-09-09(선혜님 지시 - "모든 발주서에는 하단에 비고 칸을 만들어서
  // 코멘트 남길 수 있게 하자" + "발주 페이지 자체를 수정할 수 있게":
  // data-vendor로 이 문서가 어느 거래처 것인지 표시해서, 인쇄 버튼을
  // 눌러 최종 저장할 때 화면에서 이 블록을 다시 찾아 수정된 내용
  // 그대로(비고 포함) 저장할 수 있게 함 - 실측/시공 의뢰서가 이미 쓰던
  // "미리보기에서 고친 뒤 인쇄 버튼 눌러야 최종 저장" 방식과 동일.
  var out = '<div class="pv-wrap" data-vendor="'+escHtml(vendor)+'" style="max-width:720px;margin:0 auto;background:#fff;padding:36px 32px">';

  out += '<div style="text-align:center;margin-bottom:6px">'
      // 2026-09-11(선혜님 지적 - "모든 작지서의 상단에 우리 로고
      // 이미지 가지고 있잖아 그걸로 바꿔줘 그냥 폰트 영어로 치지
      // 말고"): 고객용 견적서는 이미 실제 로고 이미지(DAH_LOGO_B64)를
      // 쓰고 있었는데, 발주서/실측시공의뢰서는 텍스트로 흉내만 내고
      // 있었음 - 동일한 이미지로 통일.
      +'<img class="pv-logo" style="height:36px;display:block;object-fit:contain;margin:0 auto" src="'+DAH_LOGO_B64+'" alt="드로잉엣홈">'
      +'<div style="font-size:11px;color:#B0A99F;letter-spacing:3px;margin-top:6px">발 주 서</div>'
      +'</div>';

  // 2026-09-11(선혜님 지적 - "발주서 포멧이 마음에 안들어 그냥 길게
  // 하지 말고 표를 만든상태서 수정을 하게 하는건 어때??"): 세로로 6줄
  // 쌓이던 flexbox 나열 방식을 실제 테두리 있는 표(3행 2열)로 재구성 -
  // 훨씬 컴팩트하고, 처음 참고로 보여주신 실제 발주서 양식과도 더
  // 비슷한 형태. 각 값 칸은 여전히 클릭해서 직접 수정 가능(contenteditable).
  function infoTableRow(label1, val1, editable1, label2, val2, editable2, emphasize) {
    var cellStyle = 'padding:8px 10px;border:1px solid #EEE6DC;font-size:13px';
    var labelStyle = cellStyle + ';background:#FAF7F5;color:#8E8078;white-space:nowrap;width:1%';
    // 2026-09-11(선혜님 지시 - "도착일과 도착장소는 굵은 폰트를 사용해주고"):
    // 실제로 가장 중요한 정보(언제·어디로 보내야 하는지)만 굵게 강조하고
    // 나머지(요청일/발주처/업체명/담당자)는 일반 굵기로 낮춰서 대비를 줌.
    var valStyle = cellStyle + (emphasize ? ';font-weight:700' : ';font-weight:400');
    return '<tr>'
      + '<td style="'+labelStyle+'">'+label1+'</td>'
      + '<td style="'+valStyle+'"'+(editable1?' contenteditable="true" class="pv-editable-field"':'')+'>'+val1+'</td>'
      + '<td style="'+labelStyle+'">'+label2+'</td>'
      + '<td style="'+valStyle+'"'+(editable2?' contenteditable="true" class="pv-editable-field"':'')+'>'+val2+'</td>'
      + '</tr>';
  }
  out += '<table style="width:100%;border-collapse:collapse;margin-top:var(--sp-6);padding-top:16px">'
      // 2026-09-11(선혜님 지시 - "모든 발주서 요청일자나 도착일자 도착
      // 장소는 기본적으로 수정할 수 있게 해줘"): 요청일만 유일하게 고정
      // 값(editable=false)이었음 - 도착일/도착장소/발주처와 동일하게
      // 수정 가능하도록 통일.
      + infoTableRow('요청일', today, true, '발주처', escHtml(vendor), true, false)
      // 2026-09-10(선혜님 지적 - "도착일 / 도착 장소가 없어" → "수정이
      // 되게" → "거래처마다 달라야"): 발주정보 팝업에서 거래처별로
      // 입력받은 값을 여기 표시(입력 안 하면 "협의" 표시), 클릭해서도
      // 직접 수정 가능.
      + infoTableRow('도착일', arrivalDate||'협의', true,
        // 2026-09-10(선혜님 지적 - "받는곳이라고 하면 헷갈릴꺼 같은데"):
        // "발주처"(위 칸)와 나란히 두면 둘 다 "어디로 가는지"처럼 헷갈릴
        // 수 있어 "도착 장소"로 구분.
        // 2026-09-10(선혜님 지적 - "가공소로 도착되게 해야 해"): 원단은
        // 저희 회사가 아니라 가공소로 바로 배송되는 경우가 있는 등,
        // 발주 종류/거래처에 따라 실제 도착지가 달라질 수 있어 고정
        // 값이 아니라 직접 클릭해서 고칠 수 있게 함.
        '도착 장소', escHtml(arrivalLocation||'서울 서초구 사평대로 53길 64 1층 드로잉엣홈'), true, true)
      + infoTableRow('업체명', '드로잉엣홈', false, '담당자', cStaff||'—', false, false)
      + '</table>';

  out += '<div style="margin-top:10px;font-size:11px;color:#B0A99F">*아래와 같이 발주 합니다.</div>';

  out += '<div style="margin-top:var(--sp-5);padding:8px 14px;background:#F5F2EE;font-size:13px;font-weight:700;color:#282828">거래처: '+escHtml(vendor)+'</div>';
  // 2026-09-11(선혜님이 실제 캔가공소 발주서 양식 확인해주심): 원단/
  // 부자재/블라인드는 공통 테이블(위치·품명·제품정보·사이즈·내용·수량·
  // 고객명)로 충분한데, 캔가공소(제작) 발주는 완전히 다른 정보(제작
  // 사이즈, 형상가공 여부, 하단시접, 원단정보-거래처+코드+마수)가
  // 필요해서 별도 테이블 구조로 분기.
  var isProduction = groupItems.length > 0 && groupItems[0].orderCategory === 'production';
  // 2026-09-11(선혜님 지시 - "목성은 제품정도 / 사이즈 / 내용 빼도
  // 될꺼 같은데??"): 레일(material) 항목은 product 칸에 이미 "N자
  // 조절레일(타공형)"로 필요한 정보가 다 들어있고, 제품정보/사이즈/
  // 내용은 항상 "—"(빈 값)만 나오는 무의미한 칸이었음 - 위치/품명/
  // 수량/고객명만 남긴 축소된 테이블로 분기.
  var isMaterial = groupItems.length > 0 && groupItems[0].orderCategory === 'material';
  var isBlind = groupItems.length > 0 && groupItems[0].orderCategory === 'blind';
  if (isProduction) {
    // 2026-09-11(발주서 하나하나 점검하다 발견 - 8개 칸짜리 캔가공소 표가
    // 모바일 실사용 폭(390px)보다 넓어서 "고객"/"원단정보" 칸이 화면
    // 밖으로 밀려 안 보이던 문제): 칸 안쪽 여백/글자크기를 살짝 줄이고,
    // 그래도 안 들어가는 경우를 대비해 표만 좌우로 스크롤되는 감싸는 칸을
    // 추가(제목·비고 등 나머지 화면은 그대로 고정).
    out += '<div class="pv-order-table-scroll" style="overflow-x:auto;-webkit-overflow-scrolling:touch">';
    out += '<table style="width:100%;border-collapse:collapse;font-size:11px">'
        +'<thead><tr style="border-bottom:1.5px solid #282828;background:#FAF7F5">'
        +'<th style="text-align:left;padding:6px 4px">공간</th>'
        +'<th style="text-align:left;padding:6px 4px">원단(품명)</th>'
        +'<th style="text-align:center;padding:6px 4px">제작사이즈</th>'
        +'<th style="text-align:center;padding:6px 4px">형상가공</th>'
        +'<th style="text-align:center;padding:6px 4px">하단시접</th>'
        +'<th style="text-align:left;padding:6px 4px">내용</th>'
        +'<th style="text-align:left;padding:6px 4px">고객</th>'
        +'<th style="text-align:left;padding:6px 4px">원단정보</th>'
        +'</tr></thead><tbody>';
    groupItems.forEach(function(it){
      out += '<tr style="border-bottom:1px solid #EEE6DC">'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.space)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.product)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:center;font-weight:700">'+escHtml(it.fabSize||it.size)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:center">'+(it.shapeProcess?'O':'X')+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:center">'+escHtml(it.hemType||'—')+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.content)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;font-weight:700;color:#E4483A">'+(cName||'—')+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.fabricInfo||'—')+'</td>'
          +'</tr>';
    });
    out += '</tbody></table></div>';
    out += '<div class="print-hide" style="font-size:11px;color:#B0A99F;margin-top:2px">← 표를 옆으로 밀면 나머지 항목(고객/원단정보)이 보입니다</div>';
  } else if (isMaterial) {
    out += '<table style="width:100%;border-collapse:collapse;font-size:12px">'
        +'<thead><tr style="border-bottom:1.5px solid #282828;background:#FAF7F5">'
        +'<th style="text-align:left;padding:8px 6px">위치</th>'
        +'<th style="text-align:left;padding:8px 6px">품명</th>'
        +'<th style="text-align:right;padding:8px 6px">수량</th>'
        +'<th style="text-align:left;padding:8px 6px">고객명</th>'
        +'</tr></thead><tbody>';
    groupItems.forEach(function(it){
      out += '<tr style="border-bottom:1px solid #EEE6DC">'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:8px 6px">'+escHtml(it.space)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:8px 6px">'+escHtml(it.product)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:8px 6px;text-align:right;font-weight:700">'+escHtml(it.qty)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:8px 6px;font-weight:700;color:#E4483A">'+(cName||'—')+'</td>'
          +'</tr>';
    });
    out += '</tbody></table>';
  } else if (isBlind) {
    // 2026-09-11(선혜님이 실제 윈텍/덱스터 발주서 양식 보여주심 - "넣을
    // 부분이 보이지??"): 실제 거래처 발주서엔 시스템(블라인드 종류)/
    // 손잡이방향/끈길이/하단바/코멘트가 각자 칸으로 나뉘어 있는데, 지금까진
    // 원단(커튼) 표를 그대로 재사용해서 "제품정보"(색상)만 있고 저 다섯
    // 정보는 "내용" 한 칸에 뭉쳐서 나가거나 아예 빠져있었음 - 블라인드
    // 전용 표로 분리해서 실제 양식과 동일한 칸 구성으로 재구성.
    out += '<div class="pv-order-table-scroll" style="overflow-x:auto;-webkit-overflow-scrolling:touch">';
    out += '<table style="width:100%;border-collapse:collapse;font-size:11px">'
        +'<thead><tr style="border-bottom:1.5px solid #282828;background:#FAF7F5">'
        +'<th style="text-align:left;padding:6px 4px">위치</th>'
        +'<th style="text-align:left;padding:6px 4px">원단명</th>'
        +'<th style="text-align:left;padding:6px 4px">시스템</th>'
        +'<th style="text-align:center;padding:6px 4px">사이즈</th>'
        +'<th style="text-align:center;padding:6px 4px">손잡이방향</th>'
        +'<th style="text-align:center;padding:6px 4px">끈길이</th>'
        +'<th style="text-align:center;padding:6px 4px">하단바</th>'
        +'<th style="text-align:left;padding:6px 4px">코멘트</th>'
        +'<th style="text-align:right;padding:6px 4px">수량</th>'
        +'<th style="text-align:left;padding:6px 4px">고객명</th>'
        +'</tr></thead><tbody>';
    groupItems.forEach(function(it){
      out += '<tr style="border-bottom:1px solid #EEE6DC">'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.space)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.product)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.kind)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:center">'+escHtml(it.size)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:center">'+escHtml(it.handle)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:center">'+escHtml(it.cordLength)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:center">'+escHtml(it.bottomBar)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.comment)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:right;font-weight:700">'+escHtml(it.qty)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;font-weight:700;color:#E4483A">'+(cName||'—')+'</td>'
          +'</tr>';
    });
    out += '</tbody></table></div>';
    out += '<div class="print-hide" style="font-size:11px;color:#B0A99F;margin-top:2px">← 표를 옆으로 밀면 나머지 항목(끈길이/하단바/코멘트/수량/고객명)이 보입니다</div>';
  } else {
  // 2026-09-11(발주서 하나하나 점검하다 발견 - 원단 7칸짜리 표가 모바일
  // 실사용 폭보다 넓어서 "수량"/"고객명" 칸이 안 보이던 문제; 블라인드는
  // 같은 날 별도로 전용 표(isBlind)로 분리됨): 캔가공소 표와 동일하게
  // 여백/글자크기 축소 + 좌우 스크롤 감싸는 칸.
  out += '<div class="pv-order-table-scroll" style="overflow-x:auto;-webkit-overflow-scrolling:touch">';
  out += '<table style="width:100%;border-collapse:collapse;font-size:11px">'
      +'<thead><tr style="border-bottom:1.5px solid #282828;background:#FAF7F5">'
      +'<th style="text-align:left;padding:6px 4px">위치</th>'
      +'<th style="text-align:left;padding:6px 4px">품명</th>'
      // 2026-09-10(선혜님 지적 - "컬러-> 제품정보 로 수정해주고"): 실제
      // 값이 순수 색상명이 아니라 제품코드/세부사양(예: "AL25-8274L",
      // "Amalfi RM-01번 화이트 + 뒷면: HK-3022FR 아이보리")이라 "컬러"
      // 보다 "제품정보"가 정확한 표현.
      +'<th style="text-align:left;padding:6px 4px">제품정보</th>'
      +'<th style="text-align:center;padding:6px 4px">사이즈</th>'
      +'<th style="text-align:left;padding:6px 4px">내용</th>'
      +'<th style="text-align:right;padding:6px 4px">수량</th>'
      +'<th style="text-align:left;padding:6px 4px">고객명</th>'
      +'</tr></thead><tbody>';
  groupItems.forEach(function(it){
    out += '<tr style="border-bottom:1px solid #EEE6DC">'
        +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.space)+'</td>'
        +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.product)+'</td>'
        +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.color)+'</td>'
        +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:center">'+escHtml(it.size)+(it.fabSize?('<br><span style="font-size:11px;color:#F06E2D;font-weight:700">제작 '+escHtml(it.fabSize)+'</span>'):'')+'</td>'
        +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.content)+'</td>'
        +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:right;font-weight:700">'+escHtml(it.qty)+'</td>'
        +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;font-weight:700;color:#E4483A">'+(cName||'—')+'</td>'
        +'</tr>';
  });
  out += '</tbody></table></div>';
  out += '<div class="print-hide" style="font-size:11px;color:#B0A99F;margin-top:2px">← 표를 옆으로 밀면 나머지 항목(수량/고객명)이 보입니다</div>';
  }

  out += '<div class="pv-vendor-note-editable" contenteditable="true" style="margin-top:var(--sp-6);text-align:center;font-size:13px;color:#E4483A;font-weight:600;line-height:1.7;white-space:pre-wrap;outline:none;border:1px dashed #F0C9C4;border-radius:8px;padding:8px" data-placeholder="비고(클릭해서 직접 입력)">'+escHtml(extraNote||'')+'</div>';

  out += '</div>';
  return out;
}

// 2026-09-09(선혜님 지시 - "발주서 버튼 누르고 발주정보 입력하는건 좋아"로
// 확정된 설계): 지금까지 원단명/거래처/컬러 칸이 커튼 행마다 작고 촘촘하게
// 우겨넣어져 있어서(inner-fields, 클릭해서 펼쳐야 보임) 실제로 아무도
// 안 채우고 있었음(오늘 하루 여러 번 재현·확인된 문제) - "발주서" 버튼을
// 누르면 이 별도의 큰 팝업이 먼저 뜨고, 시공요청서와 같은 표 형태로
// 위치/사이즈/제품명을 보여주면서 원단·블라인드 거래처만 크고 편하게
// 입력받음. 핵심 설계 원칙: 이 팝업은 별도 데이터 구조가 아니라, 견적서
// 화면(같은 DOM)의 실제 입력창(.c-vendor, .b-vendor)에 직접 연결된
// "창구"일 뿐 - 여기서 입력하는 즉시 원본 값이 갱신되므로, 발주서를
// 실제로 만드는 코드(collectVendorGroups 등)는 전혀 안 건드려도 그대로
// 작동함.
function openVendorInfoModal() {
  var curtainTrs = Array.from(document.querySelectorAll('#curtain-body tr'));
  var blindTrs = Array.from(document.querySelectorAll('#blind-body tr'));
  if (curtainTrs.length === 0 && blindTrs.length === 0) {
    alert('입력된 커튼·블라인드 항목이 없어요. 먼저 항목을 추가해주세요.');
    return;
  }

  var existing = document.getElementById('vendor-info-modal');
  if (existing) existing.remove();

  var ov = document.createElement('div');
  ov.id = 'vendor-info-modal';
  ov.className = 'print-hide';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#F5F2EE;z-index:10000;overflow-y:auto;overflow-x:auto;display:flex;flex-direction:column';

  var nav = document.createElement('div');
  nav.style.cssText = 'position:sticky;top:0;z-index:10001;background:#282828;padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:52px;flex-shrink:0';
  var navLabel = document.createElement('span');
  navLabel.textContent = '발주 정보 입력';
  navLabel.style.cssText = 'color:rgba(255,255,255,0.9);font-size:13px;font-weight:700;white-space:nowrap';
  var navBtns = document.createElement('div');
  navBtns.style.cssText = 'display:flex;gap:8px;flex-shrink:0';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.onclick = function(){ ov.remove(); };
  closeBtn.style.cssText = 'padding:7px 16px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit;white-space:nowrap';
  var nextBtn = document.createElement('button');
  nextBtn.textContent = '발주서 보기 →';
  nextBtn.onclick = function(){
    // 2026-09-09(선혜님 - "니가 전문업체인데 시뮬레이션 돌려봐" 요청으로
    // 발견): 블라인드 거래처를 <select required>로 만들었지만, <form>
    // 태그 없이 버튼 클릭으로 저장하는 구조라 required 속성이 실제로는
    // 아무 효력이 없었음(브라우저가 강제 안 함) - 저장 시점(가견적 단계,
    // 아직 거래처를 모를 수 있는 정상적인 상황)엔 막으면 안 되므로, 대신
    // 여기(발주서를 실제로 보려는 시점)에서 명시적으로 검증.
    var missingVendorSpaces = [];
    document.querySelectorAll('#blind-body tr').forEach(function(tr){
      var vendorSel = tr.querySelector('.b-vendor');
      var fabric = tr.querySelector('.b-fabric')?.value || '';
      if (vendorSel && !vendorSel.value && fabric) {
        missingVendorSpaces.push(tr.querySelector('.space-inp')?.value || '(위치 미입력)');
      }
    });
    if (missingVendorSpaces.length > 0) {
      alert('블라인드 거래처를 아직 선택 안 한 항목이 있어요: ' + missingVendorSpaces.join(', ') + '\n거래처를 선택해주세요.');
      return;
    }
    // 2026-09-11(선혜님 지적 - "그걸 진작 말해야지 오류 체크해"): 원단
    // 거래처 칸에 실제로는 가공소(production) 카테고리로 등록된
    // 거래처명(예: "캔가공소")을 잘못 입력하는 실수가 실제로 발생함 -
    // 미리 확인해서 경고.
    var confusedFabricSpaces = [];
    if (Array.isArray(window._dahVendorListRaw)) {
      var productionNames = window._dahVendorListRaw.filter(function(v){
        return v && Array.isArray(v.categories) && v.categories.indexOf('production') >= 0;
      }).map(function(v){ return v.name; });
      document.querySelectorAll('#curtain-body tr').forEach(function(tr){
        var vendorVal = tr.querySelector('.c-vendor')?.value || '';
        if (vendorVal && productionNames.indexOf(vendorVal) >= 0) {
          confusedFabricSpaces.push(tr.querySelector('.space-inp')?.value || '(위치 미입력)');
        }
      });
    }
    if (confusedFabricSpaces.length > 0) {
      if (!confirm('원단 거래처 칸에 가공소 이름이 입력된 항목이 있어요: ' + confusedFabricSpaces.join(', ') + '\n가공소는 자동으로 처리되니 원단 거래처 칸에는 실제 원단 매입처를 입력해야 해요.\n그대로 진행할까요?')) return;
    }
    ov.remove();
    openVendorArrivalDateModal();
  };
  nextBtn.style.cssText = 'padding:7px 18px;background:#282828;color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;white-space:nowrap';
  navBtns.appendChild(closeBtn);
  navBtns.appendChild(nextBtn);
  nav.appendChild(navLabel);
  nav.appendChild(navBtns);

  var content = document.createElement('div');
  content.style.cssText = 'flex:1;padding:24px 16px 60px;display:flex;justify-content:center';
  var wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;max-width:720px';
  content.appendChild(wrap);

  // 2026-09-11(선혜님 지적 - "도착일이 다 달라 원단도착일이 다르고
  // 가공소 제작일이 다르고 블라인드 제작일이 다른데 이렇게 만들면
  // 어떻하니"): 여기 있던 "공통 희망 도착일 하나" 방식은 완전히 잘못된
  // 설계였음 - 원단/가공소/레일/블라인드 각각 실제 완료·도착 시점이
  // 다른데 전부 같은 날짜를 찍어버렸음. 거래처별로 각각 입력받도록
  // 재설계(아래 openVendorArrivalDateModal 참고) - 이 자리의 공통
  // 입력창은 완전히 제거.

  // 2026-09-09(선혜님 지적 - "끈길이 넣을 공간도 없구만!!!!", 실제
  // 모바일 화면(390px)으로 스크린샷 찍어서 재현 확인): 표(가로 여러
  // 컬럼) 형태는 데스크톱에선 괜찮아 보였지만, 실제 사용 환경인 좁은
  // 모바일 화면에서는 컬럼 6개가 우겨넣어져서 "끈길이" 같은 칸이
  // 사실상 입력 불가능한 크기로 찌그러져 있었음 - 데스크톱만 확인하고
  // 실제 환경(모바일)을 안 본 게 원인. 표를 완전히 버리고, 항목 하나당
  // 카드 하나로 만들어서 각 필드를 세로로 큼직하게 배치.
  function buildCards(title, hintText, items, buildCardBody) {
    var section = document.createElement('div');
    section.style.cssText = 'margin-bottom:20px';
    var titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.style.cssText = 'font-size:14px;font-weight:700;color:#282828;margin-bottom:2px';
    var hintEl = document.createElement('div');
    hintEl.textContent = hintText;
    hintEl.style.cssText = 'font-size:11px;color:#B0A99F;margin-bottom:10px';
    section.appendChild(titleEl); section.appendChild(hintEl);
    items.forEach(function(tr){
      var card = document.createElement('div');
      card.style.cssText = 'background:#fff;border-radius:12px;padding:16px;margin-bottom:10px';
      buildCardBody(tr, card);
      section.appendChild(card);
    });
    wrap.appendChild(section);
  }
  function bigInput(placeholder, origEl, defaultValue) {
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = (origEl && origEl.value) ? origEl.value : (defaultValue || '');
    input.style.cssText = 'width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px;font-family:inherit;box-sizing:border-box';
    input.addEventListener('input', function(){ if (origEl) origEl.value = input.value; });
    if (origEl && !origEl.value && input.value) origEl.value = input.value;
    return input;
  }
  // 2026-09-10(선혜님 지적 - "발주입력이 번거롭다 세로로 되어있어서
  // 번거로워 기존의 방식이 훨씬 편하지"): 모든 필드를 한 줄씩 세로로
  // 쌓으니 항목 하나당 화면을 너무 많이 차지해서 스크롤이 길어짐 -
  // 그렇다고 예전 표(가로 6칸)처럼 다시 돌아가면 모바일에서 또 입력칸이
  // 찌그러지는 문제가 재발함(9/9에 실제로 겪음). 절충안: 카드 안에서
  // 2칸씩 나란히 배치 - 각 입력칸이 여전히 화면 절반 너비(모바일에서도
  // 충분히 타이핑 가능)를 유지하면서, 세로 길이는 기존 대비 절반으로 줄어듦.
  function fieldPairRow(label1, input1, label2, input2) {
    var row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px';
    function oneCol(label, input) {
      var col = document.createElement('div');
      var lbl = document.createElement('div');
      lbl.textContent = label;
      lbl.style.cssText = 'font-size:11px;font-weight:700;color:#8E8078;margin-bottom:4px';
      col.appendChild(lbl); col.appendChild(input);
      return col;
    }
    row.appendChild(oneCol(label1, input1));
    row.appendChild(oneCol(label2, input2));
    return row;
  }

  if (curtainTrs.length > 0) {
    buildCards('커튼', '원단·레일 거래처는 커튼마다 다를 수 있어 직접 입력해주세요. (제작 발주만 자동으로 처리돼요)', curtainTrs, function(tr, card) {
      var space = tr.querySelector('.space-inp')?.value || '—';
      var mw = tr.querySelector('.mw')?.value || '';
      var mh = tr.querySelector('.mh')?.value || '';
      var size = (mw && mh) ? (mw + '×' + mh) : '—';
      var name = tr.querySelector('.c-display-name')?.value || '—';
      var origVendorInput = tr.querySelector('.c-vendor');
      var origRailVendorInput = tr.querySelector('.c-rail-vendor');

      var head = document.createElement('div');
      head.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px';
      head.innerHTML = '<span style="font-size:14px;font-weight:700">'+escHtml(space)+'</span>'
        + '<span style="font-size:12px;color:#8E8078">'+escHtml(size)+'</span>';
      card.appendChild(head);
      var nameEl = document.createElement('div');
      nameEl.textContent = name;
      nameEl.style.cssText = 'font-size:12px;color:#B0A99F;margin-bottom:2px';
      card.appendChild(nameEl);

      var vendorInput = bigInput('원단 거래처', origVendorInput);
      vendorInput.setAttribute('list', 'vendor-list');
      // 2026-09-09(선혜님 지적 - "레일 발주는 어떻게 하라는건지....") -
      // 레일거래처(.c-rail-vendor)는 안내 문구와 달리 실제로는 자동
      // 처리가 아니라 여전히 커튼 행마다 개별 입력해야 하는데, 이 팝업에
      // 입력할 곳 자체가 없었음.
      var railInput = bigInput('레일 거래처', origRailVendorInput);
      railInput.setAttribute('list', 'vendor-list');
      card.appendChild(fieldPairRow('원단 거래처', vendorInput, '레일 거래처', railInput));
    });
  }

  if (blindTrs.length > 0) {
    buildCards('블라인드', '품명·컬러·끈길이를 입력하고, 거래처는 반드시 선택해주세요.', blindTrs, function(tr, card) {
      var space = tr.querySelector('.space-inp')?.value || '—';
      var bmw = tr.querySelector('.bmw')?.value || '';
      var bmh = tr.querySelector('.bmh')?.value || '';
      var size = (bmw && bmh) ? (bmw + '×' + bmh) : '—';
      var displayName = tr.querySelector('.b-display-name')?.value || '';
      var origFabricInput = tr.querySelector('.b-fabric');
      var origColorInput = tr.querySelector('.b-color');
      var origCordInput = tr.querySelector('.b-cord-length');
      var origVendorSelect = tr.querySelector('.b-vendor');

      var head = document.createElement('div');
      head.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline';
      head.innerHTML = '<span style="font-size:14px;font-weight:700">'+escHtml(space)+'</span>'
        + '<span style="font-size:12px;color:#8E8078">'+escHtml(size)+'</span>';
      card.appendChild(head);

      // 2026-09-09(선혜님 지적 - "바뀐게 없음", 재현해서 진짜 원인 발견):
      // 품명 칸을 예전엔 "placeholder(회색 안내글자)"로만 채웠었음 -
      // 화면엔 이미 제품명이 들어있는 것처럼 보여서, 실제로는 입력을
      // 안 해도 "이미 채워져 있네"라고 착각하고 그냥 넘어가게 만드는
      // 심각한 착시였음. 실제 값(value)으로 채워야 진짜로 저장됨.
      var fabricInput = bigInput('품명', origFabricInput, displayName);
      var colorInput = bigInput('컬러', origColorInput);
      card.appendChild(fieldPairRow('품명', fabricInput, '컬러', colorInput));

      var cordInput = bigInput('끈길이 (예: 150cm)', origCordInput);
      var select = document.createElement('select');
      select.style.cssText = 'width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px;font-family:inherit;box-sizing:border-box;background:#fff';
      select.innerHTML = origVendorSelect ? origVendorSelect.innerHTML : '<option value="">거래처 선택</option>';
      select.value = origVendorSelect ? origVendorSelect.value : '';
      select.addEventListener('change', function(){ if (origVendorSelect) { origVendorSelect.value = select.value; origVendorSelect.dispatchEvent(new Event('change')); } });
      card.appendChild(fieldPairRow('끈길이', cordInput, '거래처 (필수)', select));
    });
  }

  ov.appendChild(nav);
  ov.appendChild(content);
  document.body.appendChild(ov);
}

// 2026-09-11(선혜님 지적 - "도착일이 다 달라 원단도착일이 다르고
// 가공소 제작일이 다르고 블라인드 제작일이 다른데 이렇게 만들면
// 어떻하니"): 원단/가공소(제작)/레일/블라인드 각각 실제 완료·도착
// 시점이 다른데, 발주 전체에 공통 날짜 하나만 있었던 게 잘못된
// 설계였음 - 발주서를 실제로 만드는 거래처 각각(collectVendorGroups
// 결과와 정확히 동일한 기준)마다 별도의 도착일을 입력받도록 재설계.
function openVendorArrivalDateModal() {
  var collected = collectVendorGroups();
  var vendorNames = Object.keys(collected.groups);

  var ov = document.createElement('div');
  ov.id = 'vendor-arrival-modal';
  ov.className = 'print-hide';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#F5F2EE;z-index:10000;overflow-y:auto;display:flex;flex-direction:column';

  var nav = document.createElement('div');
  nav.style.cssText = 'position:sticky;top:0;z-index:10001;background:#282828;padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:52px;flex-shrink:0';
  var navLabel = document.createElement('span');
  navLabel.textContent = '거래처별 희망 도착일';
  navLabel.style.cssText = 'color:rgba(255,255,255,0.9);font-size:13px;font-weight:700;white-space:nowrap';
  var navBtns = document.createElement('div');
  navBtns.style.cssText = 'display:flex;gap:8px;flex-shrink:0';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.onclick = function(){ ov.remove(); };
  closeBtn.style.cssText = 'padding:7px 16px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit;white-space:nowrap';
  var nextBtn = document.createElement('button');
  nextBtn.textContent = '발주서 보기 →';
  nextBtn.onclick = function(){ ov.remove(); printForVendor(); };
  nextBtn.style.cssText = 'padding:7px 18px;background:#282828;color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;white-space:nowrap';
  navBtns.appendChild(closeBtn);
  navBtns.appendChild(nextBtn);
  nav.appendChild(navLabel);
  nav.appendChild(navBtns);

  var content = document.createElement('div');
  content.style.cssText = 'flex:1;padding:24px 16px 60px;display:flex;justify-content:center';
  var wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;max-width:720px';
  content.appendChild(wrap);

  var hint = document.createElement('div');
  hint.textContent = '거래처마다 실제 도착·완료 시점이 다를 수 있어 각각 따로 입력해주세요. (선택사항 - 비워두면 "협의"로 표시돼요)';
  hint.style.cssText = 'font-size:11px;color:#B0A99F;margin-bottom:12px';
  wrap.appendChild(hint);

  window._vendorArrivalDates = window._vendorArrivalDates || {};
  // 2026-09-11(선혜님 지시 - "기본 세트는 내가 하나하나 정리해주고
  // 수정도 되게 할까?? 보통은 잘 안바뀌는데 바뀌는 경우도 있어서"):
  // 거래처 관리 화면에서 등록한 기본 도착 소요일수/기본 도착장소를
  // 자동으로 채워주되, 이미 값이 있으면(이번 발주에서 이미 입력했으면)
  // 그 값을 우선시하고, 그때그때 바뀌면 여기서 직접 수정 가능.
  window._vendorArrivalLocations = window._vendorArrivalLocations || {};
  var DEFAULT_LOCATION = '서울 서초구 사평대로 53길 64 1층 드로잉엣홈';
  function findVendorMeta(name) {
    if (!Array.isArray(window._dahVendorListRaw)) return null;
    return window._dahVendorListRaw.find(function(v){ return v && v.name === name; }) || null;
  }
  vendorNames.forEach(function(vendor){
    var meta = findVendorMeta(vendor);
    if (!window._vendorArrivalDates[vendor] && meta && meta.defaultArrivalDays) {
      var d = new Date();
      d.setDate(d.getDate() + parseInt(meta.defaultArrivalDays, 10));
      window._vendorArrivalDates[vendor] = d.toISOString().slice(0, 10);
    }
    if (!window._vendorArrivalLocations[vendor]) {
      window._vendorArrivalLocations[vendor] = (meta && meta.defaultLocation) || DEFAULT_LOCATION;
    }
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:12px;padding:16px;margin-bottom:10px';
    var lbl = document.createElement('div');
    lbl.textContent = vendor === '미지정' ? '거래처 미지정 항목' : vendor;
    lbl.style.cssText = 'font-size:14px;font-weight:700;margin-bottom:8px';
    var dateLbl = document.createElement('div');
    dateLbl.textContent = '희망 도착일';
    dateLbl.style.cssText = 'font-size:11px;font-weight:700;color:#8E8078;margin-bottom:4px';
    var input = document.createElement('input');
    input.type = 'date';
    input.value = window._vendorArrivalDates[vendor] || '';
    input.style.cssText = 'width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px;font-family:inherit;box-sizing:border-box';
    input.addEventListener('input', function(){ window._vendorArrivalDates[vendor] = input.value; });
    var locLbl = document.createElement('div');
    locLbl.textContent = '도착 장소';
    locLbl.style.cssText = 'font-size:11px;font-weight:700;color:#8E8078;margin:10px 0 4px';
    var locInput = document.createElement('input');
    locInput.type = 'text';
    locInput.value = window._vendorArrivalLocations[vendor] || '';
    locInput.style.cssText = 'width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px;font-family:inherit;box-sizing:border-box';
    locInput.addEventListener('input', function(){ window._vendorArrivalLocations[vendor] = locInput.value; });
    card.appendChild(lbl); card.appendChild(dateLbl); card.appendChild(input);
    card.appendChild(locLbl); card.appendChild(locInput);
    wrap.appendChild(card);
  });

  ov.appendChild(nav);
  ov.appendChild(content);
  document.body.appendChild(ov);
}

function collectVendorGroups() {
  var cName  = escHtml(document.getElementById('c-name')?.value||'');
  var cStaff = escHtml(document.getElementById('c-staff')?.value||'장선혜');

  var items = [];
  document.querySelectorAll('#curtain-body tr').forEach(function(tr){
    var fabric = tr.querySelector('.c-fabric')?.value || '';
    var vendor = tr.querySelector('.c-vendor')?.value || '';
    var color  = tr.querySelector('.c-color')?.value || '';
    var railVendorCheck = tr.querySelector('.c-rail-vendor')?.value || '';
    var space  = tr.querySelector('.space-inp')?.value || '';
    var mw     = tr.querySelector('.mw')?.value || '';
    var mh     = tr.querySelector('.mh')?.value || '';
    var pnum   = tr.querySelector('.pnum')?.value || '';
    var displayNameCheck = tr.querySelector('.c-display-name')?.value || '';
    // 2026-09-01(선혜님 지적 — "발주서(거래처별) 클릭하고 목성을 적으니
    // '거래처 또는 원단명이 입력된 항목이 없습니다'가 뜬다"로 발견, 실제
    // 프로덕션 재현): 목성은 실제로 원단(fabric)이 아니라 레일/부자재
    // 거래처라 "레일 거래처" 칸에 입력하는 게 자연스러운데, 이 조기 return
    // 조건이 fabric/vendor(원단쪽)만 확인해서, 원단은 안 채우고 레일거래처만
    // 채운 행은 이 시점에 통째로 걸러져(return) 그 아래(611번대)에 이미
    // 있던 railVendor 처리 코드에 도달하지도 못하고 있었음 - 조건에
    // railVendor도 포함해서 이 행이 계속 처리되게 함.
    // 2026-09-11(선혜님 발견 - 손현영님 사례: "왜 발주서에는 거실 2개
    // 안방 2개 되지??" 확인 과정에서 실제로는 정반대의 더 심각한 문제를
    // 발견함): 원단거래처를 아직 안 정했거나 고객이 직접 원단을 대는
    // 경우(fabric/vendor 둘 다 빈값), 캔가공소 제작 발주는 원단거래처와
    // 무관하게 항상 필요한데도 이 조건 때문에 행 자체가 통째로 걸러져서
    // 캔가공소 발주서에서 완전히 빠지고 있었음 - "커튼은 무조건 제작을
    // 해야 한다"는 원래 설계 의도(위 2026-09-09 참고)와 어긋남. 실제
    // 커튼이 입력된 행인지(제품명/사이즈 존재)까지 조건에 포함해서, 원단
    // 거래처가 비어있어도 제작 발주는 정상적으로 생성되게 함.
    if(!fabric && !vendor && !railVendorCheck && !displayNameCheck && !mw && !mh) return;
    var pleat  = (tr.querySelector('.pleat-type')?.value || '').replace('형','');
    var open   = (tr.querySelector('.open-type')?.value || '').replace('형','');
    var heightAdjust = parseFloat(tr.querySelector('.height-adjust')?.value);
    if (isNaN(heightAdjust)) heightAdjust = -3;
    var fh = (mh && parseFloat(mh) > 0) ? (parseFloat(mh) + heightAdjust) : null;
    // 2026-09-09(선혜님 지시 - "커튼은 무조건 제작을 해애해 담만 가공소는
    // 차 후에 바꿀 수 있어"): 예전엔 "가공소" 체크박스로 이 항목이
    // 원단(fabric) 발주인지 제작(production) 발주인지 양자택일로
    // 나눴는데, 실제로는 커튼 하나가 원단 매입 + 제작 의뢰 둘 다 항상
    // 필요한 별개의 두 발주임 - 체크박스 없이, 원단거래처가 있으면
    // 원단 발주를, 등록된 가공소가 있으면 제작 발주를 각각 독립적으로 생성.
    var displayName = displayNameCheck;
    var hemType = tr.querySelector('.hem-type')?.value || '';
    var yardage = tr.querySelector('.c-yardage')?.value || '';
    var shapeProcess = tr.querySelector('.c-shape-process')?.checked || false;
    var fabricUnitPrice = tr.querySelector('.c-fabric-unit-price')?.value || '';
    if (fabric || vendor) {
      // 2026-09-11(선혜님 지시 - "관련되게 원단 발주서까지도 그 가격이
      // 뜨게 해야 하는데"): 원단량(마수)에 단가를 곱한 총액을 수량 칸에
      // 함께 표시 - 원단업체 발주서에서 바로 예상 금액을 확인할 수 있게.
      var yardageNum = parseFloat(String(yardage).replace(/[^0-9.]/g, ''));
      var unitPriceNum = parseFloat(String(fabricUnitPrice).replace(/[^0-9.]/g, ''));
      var fabricTotal = (yardageNum && unitPriceNum) ? Math.round(yardageNum * unitPriceNum) : null;
      var qtyDisplay = yardage || (pnum?(pnum+'폭'):'—');
      if (fabricTotal !== null) qtyDisplay += ' (' + fabricTotal.toLocaleString() + '원)';
      items.push({
        space: space||'—', product: fabric||'—', color: color||'—',
        size: '—', fabSize: null,
        content:[pleat, open].filter(Boolean).join(' ')||'—',
        qty: qtyDisplay,
        vendor: vendor,
        orderCategory: 'fabric'
      });
    }
    var autoProductionVendor = getAutoProductionVendorName();
    if (autoProductionVendor) {
      // 2026-09-11(선혜님이 실제 캔가공소 발주서 양식 확인해주심): 지금까지
      // "품명" 자리에 원단코드(fabric)를 넣고 있었는데, 실제 양식은 제품명
      // (displayName)이 들어가야 함 - 원단코드는 거래처+마수와 함께 별도
      // "원단정보" 칸으로 빠짐(fabricInfo). 하단시접(hemType)/형상가공
      // (shapeProcess)도 실제 양식에 필요한 정보라 추가.
      items.push({
        space: space||'—', product: displayName||'—', color: color||'—',
        size: (mw&&mh)?(mw+'×'+mh):'—',
        fabSize: (mw && fh!==null) ? (mw+'×'+fh.toFixed(1).replace(/\.0$/,'')) : null,
        content:[pleat, open].filter(Boolean).join(' ')||'—',
        qty: pnum?(pnum+'폭'):'—',
        vendor: autoProductionVendor,
        orderCategory: 'production',
        hemType: hemType || '—',
        shapeProcess: shapeProcess,
        fabricInfo: [vendor||'캔', fabric, yardage].filter(Boolean).join(' ') || '—'
      });
    }
    // 2026-08-10: 레일(전동 등) 거래처가 매번 다를 수 있어 견적서마다 입력
    // 가능하게 함 - 원단과 별개 항목으로 발주서에 반영(선혜님 확인).
    var railVendor = tr.querySelector('.c-rail-vendor')?.value || '';
    if (railVendor) {
      // 2026-09-11(선혜님 - "우리가 레일 계산할때 -자 조절레일로 적는거
      // 아니야? 그 내용을 적으면 되잖아"): 발주서에 "레일"이라고만 막연히
      // 적던 것을, 실제로 시공비 계산에 이미 쓰던 것과 정확히 같은 방식
      // (자 단위 환산 + "조절레일(타공형)")으로 통일.
      var railJa = mw ? calcRailJa(parseFloat(mw)) : null;
      items.push({
        space: space||'—', product: (railJa ? railJa+'자 ' : '') + '조절레일(타공형)' + (heightAdjust <= -5 ? ' (전동)' : ''), color: '—',
        size: '—', fabSize: null,
        content: '—', qty: '1개', vendor: railVendor,
        orderCategory: 'material'
      });
    }
  });

  document.querySelectorAll('#blind-body tr').forEach(function(tr){
    var fabric = tr.querySelector('.b-fabric')?.value || '';
    var vendor = tr.querySelector('.b-vendor')?.value || '';
    var color  = tr.querySelector('.b-color')?.value || '';
    var cordLength = tr.querySelector('.b-cord-length')?.value || '';
    // 2026-09-11(선혜님이 실제 윈텍/덱스터 발주서 양식 보여주심 - "넣을
    // 부분이 보이지??"): 실제 발주서엔 시스템(종류)/손잡이방향/끈길이/
    // 하단바/코멘트가 전부 각자 칸으로 나뉘어 있는데, 지금까지는 "내용"
    // 한 칸에 뭉쳐서 표시하고 있었음 - 각 칸을 그대로 살려서 전달.
    var bottomBar = tr.querySelector('.b-bottom-bar')?.value || '';
    var comment = tr.querySelector('.b-comment')?.value || '';
    if(!fabric && !vendor) return;
    var space = tr.querySelector('.space-inp')?.value || '';
    var bmw   = tr.querySelector('.bmw')?.value || '';
    var bmh   = tr.querySelector('.bmh')?.value || '';
    var handle= tr.querySelector('.handle-dir')?.value || '';
    var kind  = tr.querySelector('.blind-kind')?.value || '';
    var opt   = tr.querySelector('.blind-opt')?.value || '';
    items.push({
      space: space||'—', product: fabric||'—', color: color||'—',
      size:(bmw&&bmh)?(bmw+'×'+bmh):'—',
      kind: kind||'—',
      handle: handle ? (handle==='기타'?'기타':handle+'잡이') : '—',
      cordLength: cordLength||'—',
      bottomBar: bottomBar||'—',
      comment: [opt, comment].filter(Boolean).join(' / ')||'—',
      qty: '1개',
      vendor: vendor,
      orderCategory: 'blind'
    });
  });

  var groups = {};
  items.forEach(function(it){
    var key = it.vendor || '미지정';
    if(!groups[key]) groups[key] = [];
    groups[key].push(it);
  });
  // 2026-09-04(선혜님 지시 - "공간별로 나오게 해줘"): 화면에 입력한 순서
  // 그대로 나열되고 있었는데, 같은 공간(거실/안방 등) 품목끼리 모여서
  // 보이는 게 실무에서 훨씬 보기 편함 - 각 거래처 그룹 안에서 공간 기준
  // 정렬(같은 공간끼리는 원래 입력 순서 그대로 유지되도록 안정 정렬).
  Object.keys(groups).forEach(function(key){
    groups[key].sort(function(a, b){
      return (a.space||'').localeCompare(b.space||'', 'ko');
    });
  });

  return { groups: groups, cName: cName, cStaff: cStaff, itemCount: items.length };
}

function buildVendorHTML(extraNote, arrivalDatesByVendor, arrivalLocationsByVendor) {
  function today(){
    return formatKoreanDate();
  }
  var collected = collectVendorGroups();

  if(collected.itemCount === 0) {
    return '<div class="pv-wrap" style="max-width:720px;margin:0 auto;padding:60px 20px;text-align:center;color:#B0A99F;font-size:13px">거래처 또는 원단명이 입력된 항목이 없습니다.<br>커튼/블라인드 입력창의 "거래처" 필드를 채운 후 다시 시도해주세요.</div>';
  }

  var todayStr = today();
  var vendors = Object.keys(collected.groups);
  var out = '';
  vendors.forEach(function(vendor, i){
    var vendorArrivalRaw = arrivalDatesByVendor ? arrivalDatesByVendor[vendor] : '';
    var vendorArrivalStr = vendorArrivalRaw ? formatKoreanDate(new Date(vendorArrivalRaw+'T00:00:00')) : '';
    var vendorLocation = arrivalLocationsByVendor ? arrivalLocationsByVendor[vendor] : '';
    out += '<div style="' + (i > 0 ? 'page-break-before:always;margin-top:40px;' : '') + '">';
    out += buildVendorDocForOne(vendor, collected.groups[vendor], collected.cName, collected.cStaff, i === vendors.length - 1 ? extraNote : null, todayStr, vendorArrivalStr, vendorLocation);
    out += '</div>';
  });
  return out;
}

function printForVendor() {
  calcTotal();
  // 2026-09-09(선혜님 지적 - "이거는 왜 이렇게 미리 알림으로 띄우는거야??
  // ... 니가 디테일하게 보지 않은거 같애!!"): 실측/시공(printRequest)은
  // 큰 팝업으로 개선했으면서, 발주서(printForVendor)는 예전 window.prompt()
  // 방식이 그대로 남아있었음 - 게다가 이미 각 거래처 문서마다 직접 수정
  // 가능한 비고 칸(.pv-vendor-note-editable, 발주서 페이지 자체 수정
  // 개선 때 만듦)이 있어서 이 prompt는 완전히 중복이었음. 미리보기가
  // 뜨기도 전에 불쑥 끼어드는 것도 방금 만든 팝업→미리보기 흐름을
  // 방해했음 - 완전 제거.
  var extraNote = '';
  // 2026-09-11: 거래처마다 도착일이 다르므로(원단/가공소/레일/블라인드
  // 각각 실제 완료·도착 시점이 다름), 단일 값이 아니라 거래처별 맵을
  // 넘김 - openVendorArrivalDateModal에서 채워짐.
  var html = buildVendorHTML(extraNote, window._vendorArrivalDates || {}, window._vendorArrivalLocations || {});
  // 2026-09-09(선혜님 지시 - "발주 페이지 자체를 수정할 수 있게도
  // 적용이 되어있니??" → "이제 발주서도 보기 화면에서 직접 고칠 수
  // 있게(실측/시공과 동일하게)"): 예전엔 미리보기가 뜨기도 전에 이
  // 시점(함수 시작 직후)에 구글드라이브 저장 + order_status 갱신이
  // 이미 끝나버려서, 미리보기에서 비고를 고쳐도 이미 저장된 파일엔
  // 반영이 안 됐음(고칠 수도 없었음 - contenteditable 자체가 없었음).
  // 실측/시공 의뢰서가 이미 8/26에 이렇게 개선됐던 것과 동일하게,
  // 저장을 "인쇄/PDF저장" 버튼을 실제로 눌러 최종 확정하는 시점으로
  // 미룸(아래 printBtn.onclick 참고) - 그때 화면에 떠 있는(수정됐을
  // 수 있는) 최신 내용을 그대로 저장.

  var existing = document.getElementById('pv-overlay');
  if(existing) existing.remove();

  var ov = document.createElement('div');
  ov.id = 'pv-overlay';
  ov.style.cssText = [
    'position:fixed;top:0;left:0;width:100%;height:100%',
    'background:#F5F2EE;z-index:9999;overflow-y:auto;overflow-x:auto',
    'display:flex;flex-direction:column'
  ].join(';');

  var nav = document.createElement('div');
  nav.className = 'print-hide';
  nav.style.cssText = [
    'position:sticky;top:0;z-index:10001',
    'background:#282828;padding:0 24px',
    'display:flex;align-items:center;justify-content:space-between',
    'height:52px;flex-shrink:0'
  ].join(';');
  var navLabel = document.createElement('span');
  navLabel.textContent = '발주서 — 거래처별 원단 발주 목록';
  navLabel.style.cssText = 'color:rgba(255,255,255,0.6);font-size:11px;font-weight:600;letter-spacing:0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1 1 auto;margin-right:8px';
  var navBtns = document.createElement('div');
  navBtns.style.cssText = 'display:flex;gap:var(--sp-2);flex-shrink:0';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.onclick = function(){
    document.getElementById('pv-overlay').remove();
    document.body.style.overflow = '';
    document.body.classList.remove('preview-open');
  };
  closeBtn.style.cssText = 'padding:7px 16px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit;white-space:nowrap;flex-shrink:0';
  var printBtn = document.createElement('button');
  printBtn.textContent = '인쇄 / PDF 저장';
  printBtn.onclick = function() {
    try {
      var collected2 = collectVendorGroups();
      if (collected2.itemCount > 0) {
        inner.querySelectorAll('[data-vendor]').forEach(function(vendorBlock){
          var vendor = vendorBlock.getAttribute('data-vendor');
          saveDocumentToDrive(vendorCategory(vendor), collected2.cName || '미지정고객', vendor, vendorBlock.outerHTML, collected2.cStaff);
        });
        updateOrderStatusFromVendorGroups(collected2.groups);
        // 2026-09-10(선혜님 - "예상되는 부분을 좀 더 파볼까??"로 발견):
        // 발주를 실제로 완료해도 화면의 "업무처리" 카드가 페이지를
        // 새로고침하기 전까지 "아직 없음"으로 그대로 남아있었음 -
        // renderWorkStatusCards()가 페이지 로드시 딱 한 번만 실행되고
        // 있었음. 서버 저장이 비동기라 살짝 지연 후 다시 그림.
        if (typeof renderWorkStatusCards === 'function') setTimeout(renderWorkStatusCards, 800);
      }
    } catch (eSaveVendor) { console.warn('발주서 드라이브 저장 실패:', eSaveVendor); typeof reportClientError==='function' && reportClientError('발주서 드라이브 저장 실패: ' + (eSaveVendor && eSaveVendor.message || eSaveVendor), eSaveVendor && eSaveVendor.stack); }
    openPdfModal();
  };
  printBtn.style.cssText = 'padding:7px 18px;background:#282828;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;white-space:nowrap;flex-shrink:0';
  navBtns.appendChild(closeBtn);
  navBtns.appendChild(printBtn);
  nav.appendChild(navLabel);
  nav.appendChild(navBtns);

  var content = document.createElement('div');
  content.style.cssText = 'flex:1;padding:32px 20px 60px;display:flex;justify-content:center';
  var inner = document.createElement('div');
  inner.style.cssText = 'width:100%;max-width:640px';
  inner.innerHTML = html;
  content.appendChild(inner);

  ov.appendChild(nav);
  ov.appendChild(content);
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  document.body.classList.add('preview-open');
}

// 2026-09-10(eslint로 발견): _selectedPdfOpt가 est-customer-load.js에
// 이미 선언되어 있는데(실제 로직도 거기서 관리됨) 여기서도 동일하게
// 중복 선언되고 있었음 - 두 파일이 같은 페이지에서 함께 로드되므로
// 전역 변수가 두 곳에서 따로 초기화되는 혼란스러운 구조였음. 중복 제거.

function buildRequestHTML(kind, extraNote) {
  // kind: 'measure' (실측 의뢰서) or 'install' (시공 의뢰서)
  function infoRow(label, val) {
    return '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px">'
        +'<span style="color:#8E8078">'+label+'</span>'
        +'<strong style="color:#282828;text-align:right">'+(val||'—')+'</strong>'
        +'</div>';
  }

  var cName    = escHtml(document.getElementById('c-name')?.value||'');
  var cPhone   = escHtml(document.getElementById('c-phone')?.value||'');
  var cAddr    = escHtml(document.getElementById('c-addr')?.value||'');
  var cStaff   = escHtml(document.getElementById('c-staff')?.value||'장선혜');
  var instName = escHtml(document.getElementById('c-installer-name')?.value||'');
  var instPhone= escHtml(document.getElementById('c-installer-phone')?.value||'');
  var dateVal  = document.getElementById(kind==='measure' ? 'c-measure' : 'c-install')?.value || '';
  var label = kind==='measure' ? '실측' : '시공';

  var out = '<div class="pv-wrap" style="max-width:720px;margin:0 auto;background:#fff;padding:36px 32px">';

  // 상단 로고/타이틀
  out += '<div style="text-align:center;margin-bottom:6px">'
      +'<img class="pv-logo" style="height:36px;display:block;object-fit:contain;margin:0 auto" src="'+DAH_LOGO_B64+'" alt="드로잉엣홈">'
      +'<div style="font-size:11px;color:#B0A99F;letter-spacing:3px;margin-top:6px">'+label+' 의 뢰 서</div>'
      +'</div>';

  // 좌: 업체정보(설치기사) / 우: 고객·일정 정보
  out += '<div style="display:flex;gap:var(--sp-6);margin-top:var(--sp-6);padding-top:16px;border-top:1px solid #282828;font-size:13px">'
      +'<div style="flex:1">'
        +infoRow('업체정보', instName)
        +infoRow('연락처', instPhone)
      +'</div>'
      +'<div style="flex:1">'
        +infoRow(label+'일', dateVal||'미정')
        +infoRow('고객명', cName)
        +infoRow('연락처', cPhone)
        +infoRow('주소', cAddr)
        +infoRow('담당자', cStaff)
      +'</div>'
      +'</div>';

  out += '<div style="margin-top:10px;font-size:11px;color:#B0A99F">*아래와 같이 '+label+'요청 합니다.</div>';
  out += '<div style="margin-top:14px;padding:8px 0;background:#F5F2EE;text-align:center;font-size:12px;font-weight:700;color:#282828">내 용</div>';

  if(kind === 'measure') {
    // ── 실측 의뢰서: 공간별 번호 목록 ──
    // 2026-08-24(선혜님 지적 — "겉지/속지, 연창 관계가 안 보여서 시공팀이
    // 헷갈릴 수 있다"): 예전엔 커튼/블라인드 항목 개수만큼 "공간 : 커튼 1조"를
    // 그대로 반복 출력해서, 같은 공간에 겉지+속지 2줄이 있어도 서로 무관한
    // 별개 항목처럼 보였음. 같은 공간(커튼은 공간 단위, 블라인드는 공간+종류
    // 단위)으로 묶어서 개수만 표시하도록 변경 — "거실 : 커튼 2조",
    // "거실 : 롤스크린 2피스"처럼 한 줄로 정리됨.
    // 2026-08-28(선혜님 요청 — "블라인드 실측 다 누락되었어", "거실[메인] :
    // 겉커튼+속커튼 / 거실[알파룸] : 겉커튼+속커튼 / 거실[측면] : 블라인드
    // 2피스... 이런식으로 만들게 구조를 짜줄 수 있어?"): 예전엔 공간
    // 단위로만 묶어서 "거실 : 커튼 4조"처럼 뭉뚱그려져, 같은 거실 안에
    // [메인]/[알파룸]처럼 서로 다른 창문 위치가 있어도 구분이 안 되고
    // 겉커튼/속커튼 구성도 안 보여서 시공팀이 헷갈릴 수 있었음(제품명이
    // "[메인] 이븐 아이보리 겉커튼"처럼 대괄호 세부위치를 담고 있는 걸
    // 활용해서 재설계). 공간+세부위치로 묶고, 그 안의 겉커튼/속커튼
    // 구성을 함께 표시.
    function extractSubLoc(name) {
      var m = (name||'').match(/^\[([^\]]+)\]/);
      return m ? m[1] : '';
    }
    function curtainRole(name) {
      if (/속커튼/.test(name)) return '속커튼';
      if (/겉커튼/.test(name)) return '겉커튼';
      return '커튼';
    }
    // 2026-08-31(선혜님 지적 — "속커튼+블라인드 일 수도 있는데 이런 것들이
    // 구현되지 않아"): 커튼/블라인드를 각각 별개 딕셔너리(curtainGroups/
    // blindGroups)로 묶어서, 같은 공간+세부위치에 커튼(예: 속커튼만)과
    // 블라인드가 함께 있어도 "거실[정면] : 속커튼 1장"과 "거실[정면] :
    // 롤스크린" 두 줄로 따로 나오고 있었음 — 실제로는 같은 창문 하나에
    // 대한 시공 지시라 한 줄("거실[정면] : 속커튼+롤스크린")로 합쳐서
    // 보여줘야 시공팀이 헷갈리지 않음. 공간+세부위치 기준 하나의 통합
    // 그룹으로 재설계 - 커튼 구성요소(겉커튼/속커튼/커튼)와 블라인드
    // 종류를 같은 그룹 안의 "구성요소" 목록으로 합쳐서 담음.
    var groups = {}; var groupOrder = [];
    function getGroup(space, subLoc) {
      var key = (space||'—')+'|'+subLoc;
      if(!(key in groups)) { groups[key] = { space: space||'—', subLoc: subLoc, parts: {} }; groupOrder.push(key); }
      return groups[key];
    }
    document.querySelectorAll('#curtain-body tr').forEach(function(tr){
      var space  = tr.querySelector('.space-inp')?.value || '';
      var fabric = tr.querySelector('.c-fabric')?.value || '';
      var name   = tr.querySelector('.c-display-name')?.value || '';
      if(!space && !fabric && !name) return;
      var g = getGroup(space, extractSubLoc(name));
      var role = curtainRole(name);
      g.parts[role] = (g.parts[role]||0) + 1;
    });
    document.querySelectorAll('#blind-body tr').forEach(function(tr){
      var space  = tr.querySelector('.space-inp')?.value || '';
      var kind2  = tr.querySelector('.blind-kind')?.value || '블라인드';
      var name   = tr.querySelector('.b-display-name')?.value || '';
      var fabric = tr.querySelector('.b-fabric')?.value || '';
      if(!space && !fabric && !name) return;
      var g = getGroup(space, extractSubLoc(name));
      g.parts[kind2] = (g.parts[kind2]||0) + 1;
    });
    function groupLabel(space, subLoc) { return space + (subLoc ? '['+subLoc+']' : ''); }
    var CURTAIN_PARTS = {'겉커튼':1,'속커튼':1,'커튼':1}; // 단위가 "장"인 구성요소(나머지는 블라인드류 - "피스")
    var items = [];
    groupOrder.forEach(function(key){
      var g = groups[key];
      var label = groupLabel(g.space, g.subLoc);
      var partKeys = Object.keys(g.parts);
      var desc;
      if (g.parts['겉커튼'] && g.parts['속커튼'] && partKeys.length === 2) {
        desc = '겉커튼+속커튼';
      } else {
        desc = partKeys.map(function(k){
          var n = g.parts[k];
          if (n <= 1) return k;
          return k + ' ' + n + (CURTAIN_PARTS[k] ? '장' : '피스');
        }).join('+');
      }
      items.push(label+' : '+desc);
    });
    if(items.length === 0) {
      out += '<div style="padding:30px 0;text-align:center;color:#B0A99F;font-size:12px">입력된 공간/제품이 없습니다.</div>';
    } else {
      out += '<div class="print-hide" style="text-align:center;font-size:11px;color:#B0A99F;margin-top:8px">✏️ 아래 내용을 클릭하면 발송 전에 직접 고칠 수 있어요</div>';
      out += '<div id="pv-request-editable" contenteditable="true" style="padding:20px 10px;text-align:center;outline:none;border:1px dashed #DDD5CB;border-radius:8px;margin-top:6px">';
      items.forEach(function(txt, i){
        out += '<div style="font-size:13px;color:#282828;padding:8px 0">'+(i+1)+'. '+escHtml(txt)+'</div>';
      });
      out += '</div>';
    }
  } else {
    // ── 시공 의뢰서: 위치/실측사이즈/내용/기타 표 (2026-08-05: "제작사이즈"는 오해 소지가
    // 있어 "실측사이즈"로 정정 — 제작사이즈(보정값 반영)는 가공소 발주할 때만 필요하고,
    // 그건 collectVendorGroups()의 fabSize로 별도 처리됨) ──
    // 2026-09-01(선혜님 지시 - "실측 시공 요청서 해보자", 실제 시공요청서
    // 4개 예시로 비교해서 발견): 기존엔 "기타" 칸에 원단/레일 거래처만
    // 단독으로 나왔는데, 실제 문서는 항상 "캔가공소(제작)/거래처" 조합으로
    // 나옴 - production(제작) 카테고리 거래처를 1곳뿐이면 자동으로 앞에
    // 붙이는 패턴을 printRequest()의 기존 install업체 자동선택과 동일하게 적용.
    // 2026-09-09: 아래 계산은 이제 전역 헬퍼 getAutoProductionVendorName()로
    // 옮김 - collectVendorGroups()(발주서)에서도 재사용해야 해서(가공소가
    // 이제 체크박스 없이 모든 커튼에 자동 적용되므로).
    var productionVendorName = getAutoProductionVendorName();
    function withProduction(etc, isWorkshop) {
      // 2026-09-08(선혜님 지적 - "거래처도 여전히 안되네", 실제 최시내
      // 고객 데이터로 재현 확인): 이 함수가 각 항목이 실제로 "가공소"를
      // 썼는지(vendorIsWorkshop 체크 여부)는 전혀 확인 안 하고, 시스템
      // 전체에 production 카테고리 거래처가 1곳뿐이면 무조건 그 이름을
      // 붙이고 있었음 - 실제로 모든 항목이 vendorIsWorkshop:false(가공소
      // 체크 안 함, 원단 거래처도 비어있음)인데도 "캔가공소"가 무조건
      // 표시되던 명백한 오류. 실제로 가공소를 쓴 항목일 때만 붙도록 수정.
      if (!isWorkshop) return etc || '—';
      if (!etc || etc === '—') return productionVendorName || '—';
      return productionVendorName ? (productionVendorName + '/' + etc) : etc;
    }
    // 2026-09-01: 레일 길이(N자)는 커튼 행 자체엔 저장 안 되고, autoUpdateRail()이
    // svc-body에 별도로 만드는 "레일" 서비스행의 텍스트에만 있음(data-rail-src로
    // 그 레일이 어느 커튼 행에서 왔는지 연결돼있음) - 이걸 찾아서 "내용" 칸에 합침.
    function getRailLengthText(curtainTr) {
      var rowUid = curtainTr.dataset.rowUid;
      var svcBody = document.getElementById('svc-body');
      var railTr = null;
      if (rowUid) {
        railTr = svcBody && svcBody.querySelector('[data-rail-src="' + rowUid + '"]');
      }
      // 2026-09-01(선혜님 지시 - "좀 더 파봐"로 발견, 실제 재현 성공): 저장된
      // 견적서를 다시 열면(restoreLineItemsToForm), 레일 서비스행의 텍스트는
      // 정확히 복원되지만 data-rail-src 속성은 안 붙임(그 정보 자체가 저장된
      // lineItems에 없음) - 그래서 위 매칭이 항상 실패해서, "저장 후 다시 열어
      // 시공요청서 만들기"(오늘 만든 '다시보기' 기능이 정확히 이 경로를 탐 -
      // 실사용에서 가장 흔한 경로)에서 레일길이가 항상 빠지고 있었음. rowUid
      // 매칭이 안 되면, 레일 서비스행 텍스트가 정확히 "그 공간 이름"으로
      // 시작하는지로 폴백 매칭 - 완벽하진 않지만(같은 공간에 레일이 여러개면
      // 첫번째와 매칭) 없는 것보다 훨씬 나음.
      if (!railTr) {
        var space = curtainTr.querySelector('.space-inp')?.value || '';
        if (space && svcBody) {
          var svcRows = svcBody.querySelectorAll('tr');
          for (var i = 0; i < svcRows.length; i++) {
            var inp0 = svcRows[i].querySelectorAll('td')[1]?.querySelector('input');
            var txt0 = inp0 ? inp0.value : '';
            if (txt0.indexOf(space + ' ') === 0 && /자/.test(txt0)) { railTr = svcRows[i]; break; }
          }
        }
      }
      if (!railTr) return '';
      var inp = railTr.querySelectorAll('td')[1] && railTr.querySelectorAll('td')[1].querySelector('input');
      var txt = inp ? inp.value : '';
      var m = txt.match(/(\d+)자/);
      return m ? m[1] + '자 레일' : '';
    }
    var rows = [];
    document.querySelectorAll('#curtain-body tr').forEach(function(tr){
      var space  = tr.querySelector('.space-inp')?.value || '';
      var vendor = tr.querySelector('.c-vendor')?.value || '';
      var railVendor = tr.querySelector('.c-rail-vendor')?.value || '';
      // 2026-09-09(오늘 만든 4단계 - "커튼은 무조건 제작을 해애해"로
      // 가공소 체크박스를 없앴는데, 이 함수(실측/시공 문서용)는 그
      // 체크박스를 여전히 읽고 있어서 항상 false가 되던 회귀버그를
      // 코드정리 중 발견 - collectVendorGroups()(발주서용)와 동일하게
      // 자동배정 여부로 판단하도록 통일.
      var isWorkshop = !!getAutoProductionVendorName();
      var mw = tr.querySelector('.mw')?.value || '';
      var mh = tr.querySelector('.mh')?.value || '';
      var pleat = (tr.querySelector('.pleat-type')?.value || '').replace('형','');
      var open  = (tr.querySelector('.open-type')?.value || '').replace('형','');
      var railLen = getRailLengthText(tr);
      // 2026-09-04(선혜님 지적 - "무슨 제품인지 안나와"로 발견, 실제
      // 스크린샷으로 재현 성공): "내용" 칸이 주름형/개폐형/레일길이만
      // 있고, 정작 무슨 제품(원단/제품명)을 다는지가 전혀 없었음 - 시공
      // 기사님이 봤을 때 "나비주름/양개/18자레일"만으론 어떤 커튼을
      // 달아야 하는지 알 수 없음. 고객용 제품명(있으면)을 맨 앞에 추가,
      // 없으면 원단명으로 대체.
      var productName = (tr.querySelector('.c-display-name')?.value || tr.querySelector('.c-fabric')?.value || '').trim();
      if(!space && !mw && !vendor) return;
      rows.push({
        space: space||'—',
        size: (mw&&mh) ? (mw+'×'+mh) : '—',
        content: [productName, [pleat, open, railLen].filter(Boolean).join(' / ')].filter(Boolean).join(' — ')||'—',
        // 2026-08-13: 원단거래처(vendor)는 시공기사가 알 필요없는 내부정보라
        // 노출하지 않고, 대신 레일거래처(railVendor)를 노출 - 레일은 브랜드별로
        // (전동레일 등) 시공방식이 달라서 기사님이 반드시 알아야 함(선혜님 확인)
        etc: withProduction(railVendor, isWorkshop)
      });
    });
    document.querySelectorAll('#blind-body tr').forEach(function(tr){
      var space  = tr.querySelector('.space-inp')?.value || '';
      var vendor = tr.querySelector('.b-vendor')?.value || '';
      var bname  = tr.querySelector('.b-display-name')?.value || '';
      var bmw = tr.querySelector('.bmw')?.value || '';
      var bmh = tr.querySelector('.bmh')?.value || '';
      var handle = tr.querySelector('.handle-dir')?.value || '';
      var blindKind = tr.querySelector('.blind-kind')?.value || '';
      var cordLength = tr.querySelector('.b-cord-length')?.value || '';
      if(!space && !bmw && !vendor && !bname) return;
      rows.push({
        space: space||'—',
        size: (bmw&&bmh) ? (bmw+'×'+bmh) : '—',
        // 2026-09-09(선혜님 지적 - "블라인드는 끈길이도 적을 수 있게
        // 해줘야 하는데 그게 안되네"): 끈길이 정보를 내용 칸에 추가 -
        // 시공기사님이 실제 끈길이를 알아야 정확히 시공 가능.
        content: [blindKind, handle ? (handle==='기타'?'기타':handle+'잡이') : '', cordLength ? ('끈길이 '+cordLength) : ''].filter(Boolean).join(' — ')||'—',
        // 2026-09-08(선혜님 지적 - "블라인드도 지금은 가공소로 들어가있어",
        // 직접 수정한 파일과 비교해 발견): 블라인드는 완제품을 그대로
        // 구매하는 거라 원단을 재단하는 "가공소" 공정 자체가 없는데,
        // withProduction()(제작 거래처가 1곳뿐이면 자동으로 이름을 앞에
        // 붙이는 커튼 전용 로직)을 그대로 재사용해서 블라인드에도 실수로
        // 가공소 이름이 붙고 있었음 - 블라인드는 순수 거래처명만 표시.
        etc: vendor || '—'
      });
    });

    // 2026-09-08(선혜님 지시 - "고객견적서에 있는 공간 순서대로 정리해주면
    // 될꺼 같고"): 9/4에는 "공간별로 나오게 해줘"라는 요청으로 가나다순
    // 정렬을 추가했었는데, 이번엔 견적서에 입력한 순서 그대로가 낫다는
    // 요구로 바뀌어 정렬 로직을 제거했었음 - 근데 이러면 같은 공간에
    // 커튼과 블라인드가 둘 다 있을 때, 커튼 전체(모든 공간)가 먼저,
    // 블라인드 전체(모든 공간)가 나중에 오는 구조(rows는 커튼 배열 뒤에
    // 블라인드 배열을 이어붙인 것)라서, 같은 공간이 서로 뚝 떨어진 두
    // 그룹으로 쪼개져 나오는 새 문제가 생김("시륵 시공 정리할때 공간별로
    // 묶어달라고!!!"로 재발견). 가나다순은 아니면서도 같은 공간은 붙어
    // 있어야 하므로, "이 공간이 rows 안에서 처음 나온 위치" 기준으로
    // 안정정렬 - 공간 그룹의 순서는 입력 순서를 그대로 따르고, 그 안에서
    // 커튼/블라인드가 섞여도 같은 공간끼리는 항상 붙어서 나옴.
    var spaceFirstOrder = {};
    rows.forEach(function(r, i) { if (!(r.space in spaceFirstOrder)) spaceFirstOrder[r.space] = i; });
    rows.sort(function(a, b) { return spaceFirstOrder[a.space] - spaceFirstOrder[b.space]; });

    if(rows.length === 0) {
      out += '<div style="padding:30px 0;text-align:center;color:#B0A99F;font-size:12px">입력된 공간/제품이 없습니다.</div>';
    } else {
      out += '<div class="print-hide" style="text-align:center;font-size:11px;color:#B0A99F;margin-top:8px">✏️ 아래 표를 클릭하면 발송 전에 직접 고칠 수 있어요</div>';
      out += '<div id="pv-request-editable" contenteditable="true" style="outline:none;border:1px dashed #DDD5CB;border-radius:8px;margin-top:6px;padding:4px">';
      out += '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:2px">'
          +'<thead><tr style="border-bottom:1.5px solid #282828;background:#FAF7F5">'
          +'<th style="text-align:left;padding:8px 6px">위치</th>'
          +'<th style="text-align:center;padding:8px 6px">실측사이즈</th>'
          +'<th style="text-align:left;padding:8px 6px">내용</th>'
          +'<th style="text-align:left;padding:8px 6px">기타</th>'
          +'</tr></thead><tbody>';
      var lastSpace = null;
      var lastSize = null;
      rows.forEach(function(r){
        var spaceChanged = (r.space !== lastSpace);
        var spaceCell = spaceChanged ? escHtml(r.space) : '';
        lastSpace = r.space;
        // 2026-09-01(선혜님 지시 - "니머지는?"으로 이어서 진행, 실제 시공요청서
        // 예시 이미지4에서 발견): 같은 위치(예: 거실) 안에서 여러 항목이 같은
        // 사이즈를 공유하면(예: 겉커튼+속커튼이 같은 창), 사이즈도 위치처럼
        // 빈칸으로 병합해서 표시함 - 단, 위치가 바뀌면 사이즈도 반드시 다시
        // 표시(다른 방의 우연히 같은 사이즈와 잘못 병합되면 안 되므로 리셋).
        if (spaceChanged) lastSize = null;
        var sizeCell = (r.size === lastSize) ? '' : escHtml(r.size);
        lastSize = r.size;
        out += '<tr style="border-bottom:1px solid #EEE6DC">'
            +'<td style="padding:8px 6px;font-weight:700">'+spaceCell+'</td>'
            +'<td style="padding:8px 6px;text-align:center">'+sizeCell+'</td>'
            +'<td style="padding:8px 6px">'+escHtml(r.content)+'</td>'
            +'<td style="padding:8px 6px;color:#8E8078">'+escHtml(r.etc)+'</td>'
            +'</tr>';
      });
      out += '</tbody></table>';
      out += '</div>';
    }
  }

  if(extraNote) {
    out += '<div id="pv-request-note-editable" contenteditable="true" style="margin-top:var(--sp-6);text-align:center;font-size:13px;color:#E4483A;font-weight:600;line-height:1.7;white-space:pre-wrap;outline:none;border:1px dashed #F0C9C4;border-radius:8px;padding:8px">'+escHtml(extraNote)+'</div>';
  }

  out += '</div>';
  return out;
}


function printRequest(kind, skipPrompts) {
  calcTotal();
  var label = kind==='measure' ? '실측' : '시공';

  // 2026-09-04(선혜님 지시 - "주소/실측일자/시공일자도 기입 안하면 경고가
  // 떠야할것 같은데?"로 확장): 지역 미입력 경고를 만들고 나서, "정작 더
  // 중요한 주소/날짜는 저장(saveEstimate) 시점에만 확인하고, 정작 시공
  // 기사가 실제로 쓰는 이 문서(시공/실측요청서) 생성 시점엔 확인이 없었다"
  // 는 정확한 지적으로 추가. 시공요청서는 시공일을, 실측요청서는 실측일을
  // 확인 대상으로 삼음(문서 성격에 맞는 날짜만 - 시공요청서에 실측일이
  // 없다고 경고하는 건 무의미하므로). 여러 항목이 한꺼번에 비어있으면
  // 개별 확인창이 연달아 뜨지 않도록 모아서 한 번에 보여줌. 날짜미정
  // 체크박스가 되어있으면 그 항목은 빠뜨림으로 안 잡음(진짜 미정이니까).
  // 다시보기(autoDoc, skipPrompts=true)일 땐 이미 저장된 값 그대로
  // 자동으로 보여주는 흐름이라 전부 건너뜀(경고가 뜨면 자동화가 멈춤).
  if (!skipPrompts) {
    var missingForDoc = [];
    if (!(document.getElementById('c-region')?.value || '')) missingForDoc.push('지역(레일 길이 등 일부 정보가 자동으로 안 채워질 수 있어요)');
    if (!(document.getElementById('c-addr')?.value || '').trim()) missingForDoc.push('주소');
    if (kind === 'measure' && !document.getElementById('c-measure-tbd')?.checked && !(document.getElementById('c-measure')?.value || '')) missingForDoc.push('실측 예정일');
    if (kind === 'install' && !document.getElementById('c-install-tbd')?.checked && !(document.getElementById('c-install')?.value || '')) missingForDoc.push('시공 예정일');
    if (missingForDoc.length > 0) {
      var proceedMissing = window.confirm('다음 항목이 비어있어요:\n\n' + missingForDoc.join('\n') + '\n\n그래도 ' + label + '요청서를 만드시겠어요?');
      if (!proceedMissing) return;
    }
  }

  // 설치기사 정보는 견적서 화면에는 노출하지 않고, 의뢰서 생성 시점에만 물어봄
  var installerNameEl = document.getElementById('c-installer-name');
  var installerPhoneEl = document.getElementById('c-installer-phone');
  var currentInstallerName = installerNameEl ? installerNameEl.value : '';
  var currentInstallerPhone = installerPhoneEl ? installerPhoneEl.value : '';
  // 2026-08-26(선혜님 발견 — "거래처 등록을 했는데 왜 수기로 다 써야 하지"):
  // 이 견적에 아직 설치기사 정보가 없고(=이번이 처음 묻는 거고), 설정탭
  // 거래처관리에서 '실측·시공' 담당으로 등록해둔 곳이 정확히 1곳뿐이면
  // 그 정보로 자동 채움 - 그 경우 사용자는 그냥 "확인"만 누르면 됨(여전히
  // 필요하면 팝업에서 직접 고쳐 쓸 수 있음). 등록된 곳이 없거나 2곳 이상
  // (누구인지 특정 불가)이면 예전처럼 빈 값으로 물어봄.
  if (!currentInstallerName && !currentInstallerPhone && Array.isArray(window._dahVendorListRaw)) {
    var installVendors = window._dahVendorListRaw.filter(function(v) {
      return v && Array.isArray(v.categories) && v.categories.indexOf('install') >= 0;
    });
    if (installVendors.length === 1) {
      currentInstallerName = installVendors[0].name || '';
      currentInstallerPhone = installVendors[0].phone || '';
    }
  }
  // 2026-09-09(선혜님 지시 - "실측/시공을 어떻게 하는지" 논의에서 확정 -
  // "지금 창(설치기사명/연락처 묻는 것)을 발주서처럼 큰 팝업 화면으로
  // 개선하기"): window.prompt() 3연발(이름→연락처→비고, 한 번에 하나씩만
  // 물어봐서 어수선함)을 발주정보 팝업과 같은 스타일의 큰 화면 하나로
  // 교체. 실제 미리보기 표시 로직은 _showRequestPreview()로 분리해서,
  // 팝업의 "확인" 콜백에서 호출하도록 함(skipPrompts 경로는 팝업 없이
  // 바로 호출).
  if (!skipPrompts) {
    openInstallerInfoModal(label, currentInstallerName, currentInstallerPhone, function(name, phone, note) {
      if (installerNameEl) installerNameEl.value = name;
      if (installerPhoneEl) installerPhoneEl.value = phone;
      _showRequestPreview(kind, label, note);
    });
    return;
  }
  if (installerNameEl) installerNameEl.value = currentInstallerName;
  if (installerPhoneEl) installerPhoneEl.value = currentInstallerPhone;
  _showRequestPreview(kind, label, '');
}

// 2026-09-09: 설치기사명/연락처/비고를 한 화면에서 입력받는 팝업 -
// 발주정보 입력 팝업과 같은 스타일. 확인을 누르면 onConfirm(name, phone,
// note)를 호출하고, 취소/닫기를 누르면 아무 것도 안 하고 닫힘.
function openInstallerInfoModal(label, currentName, currentPhone, onConfirm) {
  var existing = document.getElementById('installer-info-modal');
  if (existing) existing.remove();

  var ov = document.createElement('div');
  ov.id = 'installer-info-modal';
  ov.className = 'print-hide';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#F5F2EE;z-index:10000;overflow-y:auto;display:flex;flex-direction:column';

  var nav = document.createElement('div');
  nav.style.cssText = 'position:sticky;top:0;z-index:10001;background:#282828;padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:52px;flex-shrink:0';
  var navLabel = document.createElement('span');
  navLabel.textContent = label + ' 담당자 정보';
  navLabel.style.cssText = 'color:rgba(255,255,255,0.9);font-size:13px;font-weight:700;white-space:nowrap';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.onclick = function(){ ov.remove(); };
  closeBtn.style.cssText = 'padding:7px 16px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit;white-space:nowrap';
  nav.appendChild(navLabel);
  nav.appendChild(closeBtn);

  var content = document.createElement('div');
  content.style.cssText = 'flex:1;padding:24px 16px 60px;display:flex;justify-content:center';
  var wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;max-width:420px;background:#fff;border-radius:12px;padding:20px';

  function makeField(labelText, placeholder, value) {
    var fieldWrap = document.createElement('div');
    fieldWrap.style.cssText = 'margin-bottom:14px';
    var lbl = document.createElement('div');
    lbl.textContent = labelText;
    lbl.style.cssText = 'font-size:12px;font-weight:700;color:#282828;margin-bottom:6px';
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = value || '';
    input.style.cssText = 'width:100%;padding:11px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box';
    fieldWrap.appendChild(lbl); fieldWrap.appendChild(input);
    wrap.appendChild(fieldWrap);
    return input;
  }

  var nameInput = makeField('설치기사명', '이름을 입력하세요', currentName);
  var phoneInput = makeField('연락처', '010-0000-0000', currentPhone);

  var noteLbl = document.createElement('div');
  noteLbl.textContent = '비고 (선택)';
  noteLbl.style.cssText = 'font-size:12px;font-weight:700;color:#282828;margin-bottom:6px';
  var noteInput = document.createElement('textarea');
  noteInput.placeholder = '담당자에게 남길 메모가 있으면 입력하세요';
  noteInput.style.cssText = 'width:100%;min-height:80px;padding:11px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box;resize:vertical';
  wrap.appendChild(noteLbl); wrap.appendChild(noteInput);

  var confirmBtn = document.createElement('button');
  confirmBtn.textContent = '확인 → ' + label + '요청서 보기';
  confirmBtn.style.cssText = 'width:100%;padding:12px;background:#282828;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:6px';
  confirmBtn.onclick = function(){
    ov.remove();
    onConfirm(nameInput.value, phoneInput.value, noteInput.value);
  };
  wrap.appendChild(confirmBtn);

  content.appendChild(wrap);
  ov.appendChild(nav);
  ov.appendChild(content);
  document.body.appendChild(ov);
}

function _showRequestPreview(kind, label, extraNote) {
  var html = buildRequestHTML(kind, extraNote);

  var cNameForDrive = document.getElementById('c-name')?.value || '미지정고객';
  // 2026-08-26(선혜님 발견 — "자동으로 적히지만 수정할 부분이 있을 수도 있는데,
  // 마지막 발송전에 수정할 수 있게 가능하니"): 예전엔 미리보기가 뜨기도 전에
  // 이 시점(생성 직후)에 구글드라이브 저장이 먼저 끝나버려서, 그 뒤 미리보기에서
  // 내용을 고쳐도 이미 저장된 문서엔 반영이 안 됐음(애초에 고칠 수도 없었음).
  // 아래에서 "내용"/메모 영역을 contenteditable로 만들고, 드라이브 저장도
  // "인쇄/PDF저장" 버튼을 실제로 눌러 최종 확정하는 시점으로 미룸 - 그때
  // 화면에 떠 있는(수정됐을 수 있는) 최신 내용을 그대로 저장함.

  var existing = document.getElementById('pv-overlay');
  if(existing) existing.remove();

  var ov = document.createElement('div');
  ov.id = 'pv-overlay';
  ov.style.cssText = [
    'position:fixed;top:0;left:0;width:100%;height:100%',
    'background:#F5F2EE;z-index:9999;overflow-y:auto;overflow-x:auto',
    'display:flex;flex-direction:column'
  ].join(';');

  var nav = document.createElement('div');
  nav.className = 'print-hide';
  nav.style.cssText = [
    'position:sticky;top:0;z-index:10001',
    'background:#282828;padding:0 24px',
    'display:flex;align-items:center;justify-content:space-between',
    'height:52px;flex-shrink:0'
  ].join(';');
  var navLabel = document.createElement('span');
  navLabel.textContent = label+' 의뢰서 미리보기';
  navLabel.style.cssText = 'color:rgba(255,255,255,0.6);font-size:11px;font-weight:600;letter-spacing:0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1 1 auto;margin-right:8px';
  var navBtns = document.createElement('div');
  navBtns.style.cssText = 'display:flex;gap:var(--sp-2);flex-shrink:0';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.onclick = function(){
    document.getElementById('pv-overlay').remove();
    document.body.style.overflow = '';
    document.body.classList.remove('preview-open');
  };
  closeBtn.style.cssText = 'padding:7px 16px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit;white-space:nowrap;flex-shrink:0';
  var printBtn = document.createElement('button');
  printBtn.textContent = '인쇄 / PDF 저장';
  printBtn.onclick = function() {
    try {
      var finalHtml = inner ? inner.innerHTML : html;
      // 2026-08-27(선혜님 발견 — "발주서 이런거는 정리된게 없어, 제대로
      // 안들어오는거 같은데"로 구글드라이브 문서보관함을 전수조사하다 발견):
      // 예전엔 파일명 구분자에 label(실측/시공)뿐 아니라 설치기사 이름까지
      // 같이 들어가고 있었음(instNameForDrive). 구글Apps Script의 저장
      // 로직은 "같은 [연월]/[고객명]/[문서종류] 파일명이면 덮어쓰기"인데,
      // 설치기사 이름이 비어있다가 나중에 채워지면(오늘 만든 "거래처 등록
      // 연동 자동입력" 기능 덕에 앞으로 더 자주 채워질 것) 파일명 자체가
      // 바뀌어서 예전 파일이 안 지워지고 계속 쌓임(실제로 유경진 폴더에
      // "실측시공_실측.html"과 "실측시공_실측_유지철팀장님.html" 두 개가
      // 남아있는 것 확인함). 설치기사 이름은 문서 "내용"에 이미 표시되고
      // 있으니, 파일명 구분자에서는 빼고 label(실측/시공)만 남김.
      var cStaffForDrive3 = document.getElementById('c-staff')?.value || '';
      saveDocumentToDrive('실측시공', cNameForDrive, label, finalHtml, cStaffForDrive3);
      // 2026-09-09: 발주(order_status.fabric/production/material/blind)는
      // 이미 자동 기록되고 있었는데, 실측/시공은 전혀 기록이 안 되고
      // 있었음 - "업무처리" 통합 탭에서 세 가지 진행상태를 보여주려면
      // 여기도 똑같이 기록해야 함. kind가 'measure'/'install' 그대로
      // order_status의 카테고리 키가 됨(기존 install 카테고리 이름과 일치).
      var installerNameForStatus = document.getElementById('c-installer-name')?.value || '';
      var statusUpdate = {};
      statusUpdate[kind] = { done: true, vendor: installerNameForStatus, orderDate: new Date().toISOString().slice(0, 10) };
      if (typeof updateOrderStatus === 'function') updateOrderStatus(statusUpdate);
      // 2026-09-10: 발주와 동일하게, 실측/시공 완료 직후에도 업무처리
      // 카드를 다시 그려서 새로고침 없이 바로 반영되게 함.
      if (typeof renderWorkStatusCards === 'function') setTimeout(renderWorkStatusCards, 800);
      // 2026-09-09(선혜님 지시 - "실측/시공/발주가 다 따로 되어있다" →
      // 업무처리 통합탭 기획 중 "이 정보가 왜 저장이 안 되지" 확인):
      // 설치기사 이름/연락처가 지금까지 DB에 전혀 저장이 안 되고 있었음 -
      // 같은 견적서를 다른 날 다시 열면(예: 실측 때 입력한 정보를 나중에
      // 시공의뢰서 만들 때 재사용) 완전히 사라져서 매번 새로 입력해야
      // 했음. estimates.installer_name/installer_phone 컬럼 신설,
      // 발주상태 기록과 같은 시점(실제 저장 확정 시점)에 즉시 DB 반영 -
      // 견적서 "저장" 버튼을 따로 안 눌러도 남도록.
      if (window._editingEstDbId && typeof SUPABASE_URL !== 'undefined') {
        var installerPhoneForSave = document.getElementById('c-installer-phone')?.value || '';
        try {
          var xhrInstaller = new XMLHttpRequest();
          xhrInstaller.open('PATCH', SUPABASE_URL + '/rest/v1/estimates?id=eq.' + encodeURIComponent(window._editingEstDbId), true);
          xhrInstaller.setRequestHeader('apikey', SUPABASE_KEY);
          xhrInstaller.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
          xhrInstaller.setRequestHeader('Content-Type', 'application/json');
          xhrInstaller.onerror = function() { console.warn('설치기사 정보 저장 실패'); typeof reportClientError==='function' && reportClientError('설치기사 정보 저장 실패'); };
          xhrInstaller.send(JSON.stringify({ installer_name: installerNameForStatus, installer_phone: installerPhoneForSave }));
        } catch (eInstaller) { console.warn('설치기사 정보 저장 실패:', eInstaller); typeof reportClientError==='function' && reportClientError('설치기사 정보 저장 실패: ' + (eInstaller && eInstaller.message || eInstaller), eInstaller && eInstaller.stack); }
      }
    } catch(e) { console.warn('의뢰서 드라이브 저장 실패:', e); typeof reportClientError==='function' && reportClientError('의뢰서 드라이브 저장 실패: ' + (e && e.message || e), e && e.stack); }
    openPdfModal();
  };
  printBtn.style.cssText = 'padding:7px 18px;background:#282828;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;white-space:nowrap;flex-shrink:0';
  navBtns.appendChild(closeBtn);
  navBtns.appendChild(printBtn);
  nav.appendChild(navLabel);
  nav.appendChild(navBtns);

  var content = document.createElement('div');
  content.style.cssText = 'flex:1;padding:32px 20px 60px;display:flex;justify-content:center';
  var inner = document.createElement('div');
  inner.style.cssText = 'width:100%;max-width:640px';
  inner.innerHTML = html;
  content.appendChild(inner);

  ov.appendChild(nav);
  ov.appendChild(content);
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  document.body.classList.add('preview-open');
}
