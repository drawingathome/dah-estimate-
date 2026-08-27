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
    var d=new Date();
    return d.getFullYear()+'년 '+(d.getMonth()+1)+'월 '+d.getDate()+'일';
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
    var svcTotal = 0;
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
      svcTotal += amt;
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
    saveDocumentToDrive('확정견적서', cNameForDrive2, '', html);
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

function buildVendorDocForOne(vendor, groupItems, cName, cStaff, extraNote, today) {
  var out = '<div class="pv-wrap" style="max-width:720px;margin:0 auto;background:#fff;padding:36px 32px">';

  out += '<div style="text-align:center;margin-bottom:6px">'
      +'<div style="font-size:22px;font-weight:700;letter-spacing:1.5px;color:#282828">DRAWING at HOME</div>'
      +'<div style="font-size:11px;color:#B0A99F;letter-spacing:3px;margin-top:6px">발 주 서</div>'
      +'</div>';

  out += '<div style="display:flex;gap:var(--sp-6);margin-top:var(--sp-6);padding-top:16px;border-top:1px solid #282828;font-size:13px">'
      +'<div style="flex:1">'
        +'<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:#8E8078">요청일</span><strong>'+today+'</strong></div>'
        +'<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:#8E8078">업체명</span><strong>드로잉엣홈</strong></div>'
        +'<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:#8E8078">담당자</span><strong>'+(cStaff||'—')+'</strong></div>'
      +'</div>'
      +'<div style="flex:1">'
        +'<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:#8E8078">받는곳</span><strong>'+escHtml(vendor)+'</strong></div>'
        +'<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:#8E8078">수령지</span><strong>드로잉엣홈으로 보내주세요</strong></div>'
      +'</div>'
      +'</div>';

  out += '<div style="margin-top:10px;font-size:11px;color:#B0A99F">*아래와 같이 발주 합니다.</div>';

  out += '<div style="margin-top:var(--sp-5);padding:8px 14px;background:#F5F2EE;font-size:13px;font-weight:700;color:#282828">거래처: '+escHtml(vendor)+'</div>';
  out += '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      +'<thead><tr style="border-bottom:1.5px solid #282828;background:#FAF7F5">'
      +'<th style="text-align:left;padding:8px 6px">위치</th>'
      +'<th style="text-align:left;padding:8px 6px">품명</th>'
      +'<th style="text-align:left;padding:8px 6px">컬러</th>'
      +'<th style="text-align:center;padding:8px 6px">사이즈</th>'
      +'<th style="text-align:left;padding:8px 6px">내용</th>'
      +'<th style="text-align:right;padding:8px 6px">수량</th>'
      +'<th style="text-align:left;padding:8px 6px">고객명</th>'
      +'</tr></thead><tbody>';
  groupItems.forEach(function(it){
    out += '<tr style="border-bottom:1px solid #EEE6DC">'
        +'<td style="padding:8px 6px">'+escHtml(it.space)+'</td>'
        +'<td style="padding:8px 6px">'+escHtml(it.product)+'</td>'
        +'<td style="padding:8px 6px">'+escHtml(it.color)+'</td>'
        +'<td style="padding:8px 6px;text-align:center">'+escHtml(it.size)+(it.fabSize?('<br><span style="font-size:11px;color:#F06E2D;font-weight:700">제작 '+escHtml(it.fabSize)+'</span>'):'')+'</td>'
        +'<td style="padding:8px 6px">'+escHtml(it.content)+'</td>'
        +'<td style="padding:8px 6px;text-align:right;font-weight:700">'+escHtml(it.qty)+'</td>'
        +'<td style="padding:8px 6px;font-weight:700;color:#E4483A">'+(cName||'—')+'</td>'
        +'</tr>';
  });
  out += '</tbody></table>';

  if(extraNote) {
    out += '<div style="margin-top:var(--sp-6);text-align:center;font-size:13px;color:#E4483A;font-weight:600;line-height:1.7;white-space:pre-wrap">'+escHtml(extraNote)+'</div>';
  }

  out += '</div>';
  return out;
}

function collectVendorGroups() {
  var cName  = escHtml(document.getElementById('c-name')?.value||'');
  var cStaff = escHtml(document.getElementById('c-staff')?.value||'장선혜');

  var items = [];
  document.querySelectorAll('#curtain-body tr').forEach(function(tr){
    var fabric = tr.querySelector('.c-fabric')?.value || '';
    var vendor = tr.querySelector('.c-vendor')?.value || '';
    var color  = tr.querySelector('.c-color')?.value || '';
    if(!fabric && !vendor) return;
    var space  = tr.querySelector('.space-inp')?.value || '';
    var mw     = tr.querySelector('.mw')?.value || '';
    var mh     = tr.querySelector('.mh')?.value || '';
    var pnum   = tr.querySelector('.pnum')?.value || '';
    var pleat  = (tr.querySelector('.pleat-type')?.value || '').replace('형','');
    var open   = (tr.querySelector('.open-type')?.value || '').replace('형','');
    var isWorkshop = tr.querySelector('.vendor-is-workshop')?.checked || false;
    var heightAdjust = parseFloat(tr.querySelector('.height-adjust')?.value);
    if (isNaN(heightAdjust)) heightAdjust = -3;
    var fh = (mh && parseFloat(mh) > 0) ? (parseFloat(mh) + heightAdjust) : null;
    items.push({
      space: space||'—', product: fabric||'—', color: color||'—',
      // 2026-08-05: 원단(커튼) 거래처는 야드 단위로 구매하는 거라 사이즈 자체가 불필요.
      // 가공소로 체크된 경우에만 실측+제작사이즈를 보여줌. (블라인드는 업체가 직접
      // 사이즈에 맞춰 재단해서 나오는 제품이라 아래 블라인드 쪽은 별도로 계속 표시함)
      size: isWorkshop ? ((mw&&mh)?(mw+'×'+mh):'—') : '—',
      fabSize: (isWorkshop && mw && fh!==null) ? (mw+'×'+fh.toFixed(1).replace(/\.0$/,'')) : null,
      content:[pleat, open].filter(Boolean).join(' ')||'—',
      qty: pnum?(pnum+'폭'):'—',
      vendor: vendor
    });
    // 2026-08-10: 레일(전동 등) 거래처가 매번 다를 수 있어 견적서마다 입력
    // 가능하게 함 - 원단과 별개 항목으로 발주서에 반영(선혜님 확인).
    var railVendor = tr.querySelector('.c-rail-vendor')?.value || '';
    if (railVendor) {
      items.push({
        space: space||'—', product: '레일' + (heightAdjust <= -5 ? '(전동)' : ''), color: '—',
        size: mw ? (mw+'cm') : '—', fabSize: null,
        content: '—', qty: '1개', vendor: railVendor
      });
    }
  });

  document.querySelectorAll('#blind-body tr').forEach(function(tr){
    var innerInps = tr.querySelectorAll('.inner-row .inner-inp');
    var fabric = innerInps[0]?.value || '';
    var vendor = innerInps[1]?.value || '';
    var color  = innerInps[2]?.value || '';
    if(!fabric && !vendor) return;
    var space = tr.querySelector('.space-inp')?.value || '';
    var bmw   = tr.querySelector('.bmw')?.value || '';
    var bmh   = tr.querySelector('.bmh')?.value || '';
    var handle= tr.querySelector('.handle-dir')?.value || '';
    var opt   = tr.querySelector('.blind-opt')?.value || '';
    items.push({
      space: space||'—', product: fabric||'—', color: color||'—',
      size:(bmw&&bmh)?(bmw+'×'+bmh):'—',
      content: [handle ? (handle==='기타'?'기타':handle+'잡이') : '', opt].filter(Boolean).join(' / ')||'—',
      qty: '1개',
      vendor: vendor
    });
  });

  var groups = {};
  items.forEach(function(it){
    var key = it.vendor || '미지정';
    if(!groups[key]) groups[key] = [];
    groups[key].push(it);
  });

  return { groups: groups, cName: cName, cStaff: cStaff, itemCount: items.length };
}

function buildVendorHTML(extraNote) {
  function today(){
    var d=new Date();
    return d.getFullYear()+'년 '+(d.getMonth()+1)+'월 '+d.getDate()+'일';
  }
  var collected = collectVendorGroups();

  if(collected.itemCount === 0) {
    return '<div class="pv-wrap" style="max-width:720px;margin:0 auto;padding:60px 20px;text-align:center;color:#B0A99F;font-size:13px">거래처 또는 원단명이 입력된 항목이 없습니다.<br>커튼/블라인드 입력창의 "거래처" 필드를 채운 후 다시 시도해주세요.</div>';
  }

  var todayStr = today();
  var vendors = Object.keys(collected.groups);
  var out = '';
  vendors.forEach(function(vendor, i){
    out += '<div style="' + (i > 0 ? 'page-break-before:always;margin-top:40px;' : '') + '">';
    out += buildVendorDocForOne(vendor, collected.groups[vendor], collected.cName, collected.cStaff, i === vendors.length - 1 ? extraNote : null, todayStr);
    out += '</div>';
  });
  return out;
}

function printForVendor() {
  calcTotal();
  var extraNote = window.prompt('발주서에 남길 추가 메모가 있으면 입력해주세요 (없으면 취소 또는 빈칸으로 확인)', '');
  var html = buildVendorHTML(extraNote);

  // 구글드라이브에 거래처별로 각각 저장 (카테고리 자동 분류)
  var collected = collectVendorGroups();
  if (collected.itemCount > 0) {
    var todayStr = (function(){ var d=new Date(); return d.getFullYear()+'년 '+(d.getMonth()+1)+'월 '+d.getDate()+'일'; })();
    Object.keys(collected.groups).forEach(function(vendor){
      var oneDoc = buildVendorDocForOne(vendor, collected.groups[vendor], collected.cName, collected.cStaff, extraNote, todayStr);
      saveDocumentToDrive(vendorCategory(vendor), collected.cName || '미지정고객', vendor, oneDoc);
    });
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
  printBtn.onclick = openPdfModal;
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

var _selectedPdfOpt = 'fit';

function buildRequestHTML(kind, extraNote) {
  // kind: 'measure' (실측 의뢰서) or 'install' (시공 의뢰서)
  function today(){
    var d=new Date();
    return d.getFullYear()+'년 '+(d.getMonth()+1)+'월 '+d.getDate()+'일';
  }
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
      +'<div style="font-size:22px;font-weight:700;letter-spacing:1.5px;color:#282828">DRAWING at HOME</div>'
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
    var curtainCounts = {}; var curtainOrder = [];
    document.querySelectorAll('#curtain-body tr').forEach(function(tr){
      var space  = tr.querySelector('.space-inp')?.value || '';
      var fabric = tr.querySelector('.c-fabric')?.value || '';
      var name   = tr.querySelector('.c-display-name')?.value || '';
      if(!space && !fabric && !name) return;
      var key = space || '—';
      if(!(key in curtainCounts)) { curtainCounts[key] = 0; curtainOrder.push(key); }
      curtainCounts[key]++;
    });
    var blindCounts = {}; var blindOrder = [];
    document.querySelectorAll('#blind-body tr').forEach(function(tr){
      var space  = tr.querySelector('.space-inp')?.value || '';
      var kind2  = tr.querySelector('.blind-kind')?.value || '블라인드';
      var innerInps = tr.querySelectorAll('.inner-row .inner-inp');
      var fabric = innerInps[0]?.value || '';
      if(!space && !fabric) return;
      var key = (space||'—')+'|'+kind2;
      if(!(key in blindCounts)) { blindCounts[key] = 0; blindOrder.push(key); }
      blindCounts[key]++;
    });
    var items = [];
    curtainOrder.forEach(function(space){
      items.push(space+' : 커튼 '+curtainCounts[space]+'조');
    });
    blindOrder.forEach(function(key){
      var parts = key.split('|'); var space = parts[0]; var kind2 = parts[1];
      var n = blindCounts[key];
      items.push(space+' : '+kind2+(n>1 ? ' '+n+'피스' : ''));
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
    var rows = [];
    document.querySelectorAll('#curtain-body tr').forEach(function(tr){
      var space  = tr.querySelector('.space-inp')?.value || '';
      var vendor = tr.querySelector('.c-vendor')?.value || '';
      var railVendor = tr.querySelector('.c-rail-vendor')?.value || '';
      var mw = tr.querySelector('.mw')?.value || '';
      var mh = tr.querySelector('.mh')?.value || '';
      var pleat = (tr.querySelector('.pleat-type')?.value || '').replace('형','');
      var open  = (tr.querySelector('.open-type')?.value || '').replace('형','');
      if(!space && !mw && !vendor) return;
      rows.push({
        space: space||'—',
        size: (mw&&mh) ? (mw+'×'+mh) : '—',
        content: [pleat, open].filter(Boolean).join(' ')||'—',
        // 2026-08-13: 원단거래처(vendor)는 시공기사가 알 필요없는 내부정보라
        // 노출하지 않고, 대신 레일거래처(railVendor)를 노출 - 레일은 브랜드별로
        // (전동레일 등) 시공방식이 달라서 기사님이 반드시 알아야 함(선혜님 확인)
        etc: railVendor||'—'
      });
    });
    document.querySelectorAll('#blind-body tr').forEach(function(tr){
      var space  = tr.querySelector('.space-inp')?.value || '';
      var innerInps = tr.querySelectorAll('.inner-row .inner-inp');
      var vendor = innerInps[1]?.value || '';
      var bmw = tr.querySelector('.bmw')?.value || '';
      var bmh = tr.querySelector('.bmh')?.value || '';
      var handle = tr.querySelector('.handle-dir')?.value || '';
      if(!space && !bmw && !vendor) return;
      rows.push({
        space: space||'—',
        size: (bmw&&bmh) ? (bmw+'×'+bmh) : '—',
        content: handle ? (handle==='기타'?'기타':handle+'잡이') : '—',
        etc: vendor||'—'
      });
    });

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
      rows.forEach(function(r){
        var spaceCell = (r.space === lastSpace) ? '' : escHtml(r.space);
        lastSpace = r.space;
        out += '<tr style="border-bottom:1px solid #EEE6DC">'
            +'<td style="padding:8px 6px;font-weight:700">'+spaceCell+'</td>'
            +'<td style="padding:8px 6px;text-align:center">'+escHtml(r.size)+'</td>'
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


function printRequest(kind) {
  calcTotal();
  var label = kind==='measure' ? '실측' : '시공';

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
  var newInstallerName = window.prompt(label+' 담당 설치기사명을 입력해주세요 (없으면 빈칸으로 확인)', currentInstallerName);
  if (newInstallerName !== null && installerNameEl) installerNameEl.value = newInstallerName;
  var newInstallerPhone = window.prompt(label+' 담당 설치기사 연락처를 입력해주세요 (없으면 빈칸으로 확인)', currentInstallerPhone);
  if (newInstallerPhone !== null && installerPhoneEl) installerPhoneEl.value = newInstallerPhone;

  var extraNote = window.prompt(label+' 담당자에게 남길 추가 메모가 있으면 입력해주세요 (없으면 취소 또는 빈칸으로 확인)', '');
  var html = buildRequestHTML(kind, extraNote);

  var cNameForDrive = document.getElementById('c-name')?.value || '미지정고객';
  var instNameForDrive = document.getElementById('c-installer-name')?.value || '';
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
      saveDocumentToDrive('실측시공', cNameForDrive, label, finalHtml);
    } catch(e) { console.warn('의뢰서 드라이브 저장 실패:', e); }
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
