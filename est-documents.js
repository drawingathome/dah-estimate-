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
    prodHTML += '<table class="pv-prod-table">';
    prodHTML += '<colgroup>';
    prodHTML += '<col style="width:13%"><col style="width:14%"><col style="width:28%"><col style="width:18%"><col style="width:7%"><col style="width:10%"><col style="width:10%">';
    prodHTML += '</colgroup>';
    prodHTML += '<thead><tr>';
    prodHTML += '<th>공간</th><th>사이즈(cm)</th><th style="text-align:left">제품명</th>';
    prodHTML += '<th>사양</th><th class="r">폭</th><th class="r">단가</th><th class="r">금액</th>';
    prodHTML += '</tr></thead><tbody>';

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

    function renderCurtainRow(r) {
      var specParts = r.spec.split(' · ');
      var specCell = specParts[0]+(specParts.length>1?'<br><span style="font-size:11px;color:#B0A99F">'+specParts.slice(1).join(' · ')+'</span>':'');
      var html = '<tr>';
      html += '<td class="space">'+r.space+'</td>';
      html += '<td class="sz">'+(r.mw?r.mw+'×'+r.mh:'—')+'</td>';
      html += '<td class="name">'+r.name+'</td>';
      html += '<td class="spec-col">'+specCell+'</td>';
      html += '<td class="r" style="color:#B0A99F;font-size:11px">'+(r.pnum?r.pnum:'—')+'</td>';
      html += '<td class="r" style="color:#B0A99F;font-size:11px">'+(r.price?r.price.toLocaleString():'—')+'</td>';
      html += '<td class="amt">'+r.amt+'</td>';
      html += '</tr>';
      return html;
    }
    function renderBlindRow(r) {
      var spec = r.kind+(r.handle?' · '+r.handle:'');
      var html = '<tr>';
      html += '<td class="space">'+r.space+'</td>';
      html += '<td class="sz">'+(r.bw?r.bw+'×'+r.bh:'—')+'</td>';
      html += '<td class="name">'+r.name+'</td>';
      html += '<td class="spec-col">'+spec+(r.sqm?'<br><span style="font-size:11px;color:#B0A99F">'+r.sqm+'</span>':'')+'</td>';
      html += '<td class="r">—</td>';
      html += '<td class="r" style="color:#B0A99F;font-size:11px">'+(r.price?r.price.toLocaleString():'—')+'</td>';
      html += '<td class="amt">'+r.amt+'</td>';
      html += '</tr>';
      return html;
    }

    spaceOrder.forEach(function(spaceKey) {
      prodHTML += '<tr class="sub-head"><td colspan="7">'+spaceKey+'</td></tr>';
      spaceGroups[spaceKey].forEach(function(r) {
        prodHTML += (r.type === 'blind') ? renderBlindRow(r) : renderCurtainRow(r);
      });
    });
    prodHTML += '</tbody></table>';
  }

  
  var svcHTML = '';
  var svcDetailNote = '';  // 참고사항에 넣을 세부 내역 텍스트
  if(svcRows.length) {
    // 2026-08-14: 기존에 쓰시던 견적서 방식(선혜님 확인) — 고객용 출력에서는
    // 레일/시공비 항목을 하나하나 나열하지 않고 "시공 서비스" 한 줄 합계로만
    // 보여주고, 세부 내역은 아래 참고사항에 텍스트로 정리해서 넣는다.
    // (예전엔 항목이 10개 넘게 펼쳐져서 고객이 보기에 복잡했음)
    var svcTotal = 0;
    var detailParts = [];
    var measureInstallSum = 0, measureInstallCount = 0;
    var railPartsSum = 0, railDetailBits = [];
    var etcParts = [];
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
      // 실측비/시공비/블라인드시공은 data-svc-type 속성으로 표시됨 — 이걸 안 보면
      // "기타"로 분류되어 참고사항에 중복 표시되는 문제가 생김(재현으로 발견)
      var svcTypeAttr = tr.getAttribute('data-svc-type') || '';
      var isMeasureOrInstall = isRegionInstall || isRailInstall ||
        svcTypeAttr === '실측비' || svcTypeAttr === '시공비' || svcTypeAttr === '블라인드시공';
      if (isMeasureOrInstall) {
        measureInstallSum += amt; measureInstallCount++;
      } else if (isRailMaterial) {
        railPartsSum += amt;
        railDetailBits.push(desc.trim() + (qty > 1 ? ' ' + qty + '개' : ''));
      } else {
        etcParts.push(desc.trim() + ' ' + amt.toLocaleString() + '원');
      }
    });
    if (measureInstallSum > 0) detailParts.push('실측+시공비 ' + measureInstallSum.toLocaleString() + '원');
    if (railPartsSum > 0) detailParts.push('레일 및 부자재 ' + railPartsSum.toLocaleString() + '원' + (railDetailBits.length ? ' (' + railDetailBits.join(', ') + ')' : ''));
    etcParts.forEach(function(p){ detailParts.push(p); });
    svcDetailNote = detailParts.join('\n');

    svcHTML += '<table class="pv-prod-table" style="margin-top:0">';
    svcHTML += '<colgroup><col style="width:20%"><col style="width:60%"><col style="width:20%"></colgroup>';
    svcHTML += '<thead><tr><th>구분</th><th style="text-align:left">내용</th><th class="r">금액</th></tr></thead><tbody>';
    svcHTML += '<tr>';
    svcHTML += '<td style="font-size:11px;color:#8E8078">시공 서비스</td>';
    svcHTML += '<td>세부 내역은 하단 참고사항을 확인해주세요</td>';
    svcHTML += '<td class="amt">' + svcTotal.toLocaleString() + '원</td>';
    svcHTML += '</tr>';
    svcHTML += '</tbody></table>';
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
    processHTML = '<div class="pv-process" style="padding:14px 28px;border-top:1px solid #EEE6DC">';
    processHTML += '<div class="pv-process-title" style="margin-bottom:6px">PROCESS</div>';
    processHTML += '<div style="font-size:10.5px;line-height:1.65;color:#4A4A4A">';
    steps.forEach(function(s,i){
      processHTML += '<div>'+(i+1)+'. '+s[0]+' : '+s[1]+'</div>';
    });
    processHTML += '</div></div>';
  }

  
  var cMemo = document.getElementById('c-memo')?.value||'';
  var notesHTML = '';
  var noteItems = [];
  // 2026-08-14: 시공 서비스 세부 내역을 참고사항 맨 위에 표시(선혜님 확인) —
  // 고객용 출력에서 시공 항목을 한 줄 합계로만 보여주는 대신, 어떤 항목이
  // 포함됐는지는 여기서 투명하게 안내.
  if (svcDetailNote) {
    svcDetailNote.split('\n').forEach(function(line){ if (line.trim()) noteItems.push(line.trim()); });
  }
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

  
  var out = '<div class="pv-wrap" style="min-width:560px;max-width:720px;margin:0 auto">';

  
  out += '<div class="pv-header">'
      +'<img class="pv-logo" style="height:36px;display:block;object-fit:contain" src="'+DAH_LOGO_B64+'" alt="드로잉엣홈">'
      +'<div class="pv-header-right">'
      +'<span class="pv-doc-label">ESTIMATE</span>'
      +'<div class="pv-doc-title">'+docLabel+'</div>'
      +'</div>'
      +'</div>';

  
  out += '<div class="pv-meta">'
      +'<span>No. <strong>'+(cNo||'—')+'</strong></span>'
      +'<span>발행일 <strong>'+today()+'</strong></span>'
      +'<span>담당자 <strong>'+(cStaff||'장선혜')+'</strong></span>'
      +'</div>';

  
  out += '<div class="pv-parties">';
  
  out += '<div class="pv-party">'
      +'<div class="pv-party-label">공급자</div>'
      +'<div class="pv-party-name">드로잉엣홈</div>'
      +'<div class="pv-party-info">'
      +'<span>사업자 120-11-39858</span>'
      +'<span>대표자 장선혜</span>'
      +'<span>이메일 info@drawingathome.co.kr</span>'
      +'<span>주소 서울 서초구 사평대로 53길 64 1층</span>'
      +'</div>'
      +'</div>';
  
  out += '<div class="pv-party">'
      +'<div class="pv-party-label">수신자</div>'
      +'<div class="pv-party-name">'+cName+'</div>'
      +'<div class="pv-party-info">'
      +(cPhone?'<span>연락처 '+cPhone+'</span>':'')
      +(cAddr?'<span>주소 '+cAddr+'</span>':'')
      +'</div>'
      +'</div>';
  out += '</div>';

  
  if(hasSchedule){
    out += '<div class="pv-schedule-bar">';
    if(measureDate) out += '<div class="pv-sch-item"><div class="pv-sch-label">실측 예정</div><div class="pv-sch-val">'+fmtDate2(measureDate)+'</div></div>';
    if(installDate) out += '<div class="pv-sch-item"><div class="pv-sch-label">시공 예정</div><div class="pv-sch-val">'+fmtDate2(installDate)+'</div></div>';
    out += '</div>';
  }

  
  if(prodHTML){
    out += '<div class="pv-section" style="padding:0;border-radius:0;border:none;border-top:1px solid #EEE6DC;margin-bottom:0">';
    out += '<div style="padding:12px 20px 8px;font-size:11px;font-weight:800;color:#B0A99F;letter-spacing:1.5px">커튼 · 블라인드</div>';
    out += prodHTML;
    out += '</div>';
  }

  
  if(svcHTML){
    out += '<div class="pv-section" style="padding:0;border-radius:0;border:none;border-top:1px solid #EEE6DC;margin-bottom:0">';
    out += '<div style="padding:12px 20px 8px;font-size:11px;font-weight:800;color:#B0A99F;letter-spacing:1.5px">시공 서비스</div>';
    out += svcHTML;
    out += '</div>';
  }

  
  out += '<table class="pv-sum-table" style="border-top:1px solid #EEE6DC;margin-top:0">';
  out += '<tr><td class="sum-lbl">제품 소계</td><td class="sum-val">'+sumCurtain+'</td></tr>';
  if(svcRows.length) out += '<tr><td class="sum-lbl">시공 서비스</td><td class="sum-val">'+sumSvc+'</td></tr>';
  if(sumDisc && sumDisc !== '-0원' && sumDisc !== '') out += '<tr><td class="sum-lbl">할인</td><td class="sum-val" style="color:#282828">'+sumDisc+'</td></tr>';
  out += '<tr class="total-row"><td class="sum-lbl" style="font-size:11px;font-weight:500;color:#8E8078">최종 견적</td><td class="sum-val" style="font-size:22px;font-weight:900;letter-spacing:-0.5px;color:#282828">'+sumTotal+'</td></tr>';
  out += '</table>';

  
  out += '<div class="pv-payment-split" style="border-top:none">'
      +'<div class="pv-payment-item">'
      +'<div class="pv-payment-label">계약금 50%</div>'
      +'<div class="pv-payment-sub">계약 시 납부</div>'
      +'<div class="pv-payment-amount">'+sumDeposit+'</div>'
      +'</div>'
      +'<div class="pv-payment-item">'
      +'<div class="pv-payment-label">잔금 50%</div>'
      +'<div class="pv-payment-sub">실측 후 납부</div>'
      +'<div class="pv-payment-amount">'+sumBalance+'</div>'
      +'</div>'
      +'</div>';

  
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
      +'<div style="color:rgba(255,255,255,0.4);font-size:11px">맞춤제작 특성상 제작 시작 후 취소·변경은 불가합니다. 문의사항은 언제든지 연락주세요.</div>'
      +'</div>';

  out += '</div>';
  return out;
}
function printForCustomer() {
  calcTotal();
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
  navLabel.style.cssText = 'color:rgba(255,255,255,0.6);font-size:11px;font-weight:600;letter-spacing:0.3px';
  var navBtns = document.createElement('div');
  navBtns.style.cssText = 'display:flex;gap:var(--sp-2)';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.onclick = function(){
    document.getElementById('pv-overlay').remove();
    document.body.style.overflow = '';
    document.body.classList.remove('preview-open');
  };
  closeBtn.style.cssText = 'padding:7px 16px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit';
  var printBtn = document.createElement('button');
  printBtn.textContent = '인쇄 / PDF 저장';
  printBtn.onclick = openPdfModal;
  printBtn.style.cssText = 'padding:7px 18px;background:#282828;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit';
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

function buildVendorDocForOne(vendor, groupItems, cName, cStaff, extraNote, today) {
  var out = '<div class="pv-wrap" style="min-width:560px;max-width:720px;margin:0 auto;background:#fff;padding:36px 32px">';

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
    return '<div class="pv-wrap" style="min-width:560px;max-width:720px;margin:0 auto;padding:60px 20px;text-align:center;color:#B0A99F;font-size:13px">거래처 또는 원단명이 입력된 항목이 없습니다.<br>커튼/블라인드 입력창의 "거래처" 필드를 채운 후 다시 시도해주세요.</div>';
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
  navLabel.style.cssText = 'color:rgba(255,255,255,0.6);font-size:11px;font-weight:600;letter-spacing:0.3px';
  var navBtns = document.createElement('div');
  navBtns.style.cssText = 'display:flex;gap:var(--sp-2)';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.onclick = function(){
    document.getElementById('pv-overlay').remove();
    document.body.style.overflow = '';
    document.body.classList.remove('preview-open');
  };
  closeBtn.style.cssText = 'padding:7px 16px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit';
  var printBtn = document.createElement('button');
  printBtn.textContent = '인쇄 / PDF 저장';
  printBtn.onclick = openPdfModal;
  printBtn.style.cssText = 'padding:7px 18px;background:#282828;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit';
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

  var out = '<div class="pv-wrap" style="min-width:560px;max-width:720px;margin:0 auto;background:#fff;padding:36px 32px">';

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
    var items = [];
    document.querySelectorAll('#curtain-body tr').forEach(function(tr){
      var space  = tr.querySelector('.space-inp')?.value || '';
      var fabric = tr.querySelector('.c-fabric')?.value || '';
      var name   = tr.querySelector('.c-display-name')?.value || '';
      if(!space && !fabric && !name) return;
      items.push((space||'—')+' : 커튼 1조');
    });
    document.querySelectorAll('#blind-body tr').forEach(function(tr){
      var space  = tr.querySelector('.space-inp')?.value || '';
      var kind2  = tr.querySelector('.blind-kind')?.value || '블라인드';
      var innerInps = tr.querySelectorAll('.inner-row .inner-inp');
      var fabric = innerInps[0]?.value || '';
      if(!space && !fabric) return;
      items.push((space||'—')+' : '+kind2);
    });
    if(items.length === 0) {
      out += '<div style="padding:30px 0;text-align:center;color:#B0A99F;font-size:12px">입력된 공간/제품이 없습니다.</div>';
    } else {
      out += '<div style="padding:20px 10px;text-align:center">';
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
    }
  }

  if(extraNote) {
    out += '<div style="margin-top:var(--sp-6);text-align:center;font-size:13px;color:#E4483A;font-weight:600;line-height:1.7;white-space:pre-wrap">'+escHtml(extraNote)+'</div>';
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
  var newInstallerName = window.prompt(label+' 담당 설치기사명을 입력해주세요 (없으면 빈칸으로 확인)', currentInstallerName);
  if (newInstallerName !== null && installerNameEl) installerNameEl.value = newInstallerName;
  var currentInstallerPhone = installerPhoneEl ? installerPhoneEl.value : '';
  var newInstallerPhone = window.prompt(label+' 담당 설치기사 연락처를 입력해주세요 (없으면 빈칸으로 확인)', currentInstallerPhone);
  if (newInstallerPhone !== null && installerPhoneEl) installerPhoneEl.value = newInstallerPhone;

  var extraNote = window.prompt(label+' 담당자에게 남길 추가 메모가 있으면 입력해주세요 (없으면 취소 또는 빈칸으로 확인)', '');
  var html = buildRequestHTML(kind, extraNote);

  var cNameForDrive = document.getElementById('c-name')?.value || '미지정고객';
  var instNameForDrive = document.getElementById('c-installer-name')?.value || '';
  saveDocumentToDrive('실측시공', cNameForDrive, label + (instNameForDrive ? '_' + instNameForDrive : ''), html);

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
  navLabel.style.cssText = 'color:rgba(255,255,255,0.6);font-size:11px;font-weight:600;letter-spacing:0.3px';
  var navBtns = document.createElement('div');
  navBtns.style.cssText = 'display:flex;gap:var(--sp-2)';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.onclick = function(){
    document.getElementById('pv-overlay').remove();
    document.body.style.overflow = '';
    document.body.classList.remove('preview-open');
  };
  closeBtn.style.cssText = 'padding:7px 16px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit';
  var printBtn = document.createElement('button');
  printBtn.textContent = '인쇄 / PDF 저장';
  printBtn.onclick = openPdfModal;
  printBtn.style.cssText = 'padding:7px 18px;background:#282828;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit';
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
