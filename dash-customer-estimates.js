/* ══════════════════════════════════════════════════
   DAH 대시보드 — 고객상세: 견적서 탭 · 견적서 이력/열기/불러오기
   2026-09-24(선혜님 - "나눌수 있는건 다 나눠보자" - 큰 파일 쪼개기 5차): dash-customer-detail-tabs.js(949줄)에서
   "견적서" 관련 함수만 분리함(견적서 탭 렌더링, 이력 모달, 견적서 선택 모달, 견적서 열기,
   시공요청서/발주서 새창 열기, 이력 목록). 코드 내용은 한 줄도 안 바꾸고 위치만 옮김.
   이 파일은 dash-customer-detail-tabs.js 바로 뒤에 로드됨.
   ══════════════════════════════════════════════════ */


function renderDetailEstTab() {
  var estEl = document.getElementById('detail-est-body');
  if (!estEl || !currentDetailName) return;
  // 2026-08-28(선혜님 지적 — "F5해도 여전히 3개야", 유경진 사례로 발견):
  // 이 함수가 localStorage(dah_saved)만 그대로 읽고 있어서, 서버에서
  // 견적서가 지워져도(관리자가 직접 지웠거나, 다른 기기/다른 사람이
  // 지웠거나) 이 화면은 브라우저에 남아있는 예전 캐시를 계속 보여주고
  // 있었음 - 새로고침(F5)해도 dah_saved 자체를 새로 받아오는 코드가
  // 없어서 안 고쳐졌음. loadEstimatesAsync(force=true)로 서버 최신
  // 상태를 먼저 받아온 뒤에만 그리도록 구조 변경.
  loadEstimatesAsync(function(){ renderDetailEstTabInner(estEl); }, true);
}

function renderDetailEstTabInner(estEl) {
  if (!currentDetailName || !document.getElementById('detail-est-body')) return; // 로딩 중 다른 고객으로 넘어간 경우 방지
  estEl.innerHTML = '';

  var all = [];
  try { all = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e) {}
  var ests = all.filter(function(e){
    var mine = (currentDetailId && e.clientId) ? e.clientId === currentDetailId : e.clientName === currentDetailName;
    return mine && !e.isArchived;
  });
  // 날짜 최신순 정렬
  ests.sort(function(a,b){ return (b.savedAt||b.date||'') > (a.savedAt||a.date||'') ? 1 : -1; });

  var cntEl = document.getElementById('dtab-est-cnt');
  if (cntEl) cntEl.textContent = ests.length > 0 ? ests.length+'건' : '';

  if (ests.length === 0) {
    estEl.innerHTML = '<div class="empty-state"><span class="empty-state-emoji">📋</span>' +
      '<div class="empty-state-title">저장된 견적서가 없습니다</div>' +
      '<div class="empty-state-desc">견적서 앱에서 작성 후 저장하면 여기에 표시됩니다</div>' +
      '<button onclick="openEstimate(\''+currentDetailName+'\')" style="margin-top:14px;padding:10px 20px;background:var(--dark);color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer">+ 견적서 작성하기</button></div>';
    return;
  }

  var STATUS_KO      = {ga:'가견적서', final:'최종견적서'};
  // 2026-09-08(선혜님 지적 - "지금 단계는 제대로 들어갔어(칸반) 근데
  // 위에 가견적이 나오는게 맞아?? 현재단계가 나와야 할꺼 같은데"): 이
  // 카드는 estimates.contract_status(가견적/계약됨/미계약 - 대시보드에서
  // 사람이 직접 배지를 눌러야만 바뀌는 별도 필드)를 보여주고 있었는데,
  // 정작 고객의 실제 진행상태는 customers.stage(칸반보드와 동일한
  // 소스, 결제 저장 등에 따라 이미 자동으로 갱신됨)가 훨씬 정확했음.
  // 별도 수동 필드 대신 실제 현재단계를 그대로 보여주도록 변경 - 칸반
  // 보드의 3그룹 색상 로직(dash-render.js)과 동일하게 맞춤.
  var currentCustomerStage = getCustomerCurrentStage(currentDetailName, currentDetailId);

  // 2026-09-09(선혜님 지시 - "니가 전문업체면 어떻게 하는게 낫겠니?"로
  // 확정): "계약된 견적이 2개 이상"(contractStatus==='contracted', 사람이
  // 직접 배지를 눌러야만 바뀌는 수동 필드) 기준은, 안 누르면 절대 재구매로
  // 안 잡히는 부정확한 방식이었음 - 실제 재구매 고객(김명석, 8/4·8/22 두
  // 프로젝트)으로 검증해본 결과, "서로 다른 날짜에 견적서가 만들어졌는지"
  // (createdAt, 자동으로 정확히 기록됨)가 훨씬 신뢰할 수 있고 실제로도
  // 정확히 재구매를 잡아냄 - 같은 날 여러 번 저장(가견적→최종 전환 등)은
  // 같은 프로젝트로 안 세고, 진짜 다른 날 다시 왔을 때만 재구매로 판단.
  var distinctDays = {};
  ests.forEach(function(e){ if (e.createdAt) distinctDays[String(e.createdAt).slice(0,10)] = true; });
  var repeatVisitCount = Object.keys(distinctDays).length;
  if (repeatVisitCount > 1) {
    var rebuyBanner = div('background:#FFF3EE;border:1px solid var(--terra);border-radius:12px;padding:10px 14px;margin-bottom:var(--sp-3);display:flex;align-items:center;gap:var(--sp-2)', [
      el('span', {style:'font-size:11px', text:'🔄'}),
      el('span', {style:'font-size:12px;font-weight:700;color:var(--terra)', text:'재구매 고객 — '+repeatVisitCount+'회 방문'})
    ]);
    estEl.appendChild(rebuyBanner);
  }

  ests.forEach(function(e, i) {
    var isFinal = e.status === 'final';
    // 2026-09-08: isContracted도 위와 같은 이유로 stage 기준으로 통일 -
    // 배지(현재단계)와 카드 배경색이 서로 다른 기준을 쓰면 오히려 더
    // 헷갈림(예: 배지는 "시공준비중"인데 카드는 흰색/미계약 배경).
    var isContracted = ['선금결제','실측준비중','확정견적','잔금결제','시공준비중','시공완료'].indexOf(currentCustomerStage) >= 0;

    var card = div(
      'border:1px solid '+(isContracted?'#B0D4B0':'var(--border)')+';border-radius:12px;padding:14px;margin-bottom:10px;' +
      'background:'+(isContracted?'#FAFFF9':'#fff'),
      []
    );

    // 순번 표시 (최신순)
    var orderBadge = el('span', {style:'font-size:11px;color:var(--sub)', text: (i+1)+'번째 견적'});

    // 상단: 번호 + 유형 + 계약상태 + 확정여부
    var topItems = [
      orderBadge,
      el('span', {style:'font-size:11px;font-weight:800;color:var(--dark)', text: e.no||'—'}),
      el('span', {style:'font-size:12px;font-weight:700;padding:2px 6px;border-radius:6px;background:'+(isFinal?'var(--dark)':'#F5F2EE')+';color:'+(isFinal?'#fff':'var(--sub)'), text: STATUS_KO[e.status]||'가견적서'})
    ];
    if (e.confirmedAt) {
      topItems.push(el('span', {style:'font-size:11px;font-weight:700;color:#fff;background:var(--dark);padding:2px 8px;border-radius:20px', text:'✓ 확정'}));
    }
    topItems.push(el('span', {style:'margin-left:auto;font-size:12px;font-weight:700;padding:3px 9px;border-radius:6px;background:#F5F2EE;color:'+stageColorFor(currentCustomerStage), text: currentCustomerStage || '—'}));
    var top = div('display:flex;align-items:center;gap:6px;margin-bottom:10px', topItems);

    // 금액 크게
    var priceRow = div('margin-bottom:var(--sp-2)', [
      el('div', {style:'font-size:22px;font-weight:900;color:var(--dark);letter-spacing:-1px', text: (Number(e.price)||0).toLocaleString()+'원'}),
    ]);

    // 상세 정보 그리드
    var infoGrid = div('display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px', []);
    var infoItems = [
      {label:'공간', value: e.space||'—'},
      {label:'원단', value: e.fabric||'—'},
      {label:'실측일', value: e.date||'—'},
      {label:'시공일', value: e.installDate||'—'},
    ];
    infoItems.forEach(function(item){
      infoGrid.appendChild(div('background:#F5F2EE;border-radius:12px;padding:8px 10px', [
        el('div', {style:'font-size:11px;color:var(--sub);margin-bottom:2px', text:item.label}),
        el('div', {style:'font-size:12px;font-weight:700;color:var(--dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis', text:item.value})
      ]));
    });

    // 저장일
    var savedDate = e.savedAt ? e.savedAt.slice(0,10) : (e.date||'');
    var dateRow = el('div', {style:'font-size:11px;color:var(--sub);margin-bottom:10px', text:'저장일: ' + savedDate});

    // 액션 버튼
    var actions = div('display:flex;gap:6px', []);
    var kakaoBtn = btn('flex:1;padding:9px 0;background:#FAE100;color:#3C1E1E;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer', '📋 카카오 복사', function(){
      var text = '[드로잉엣홈] ' + (e.clientName||'') + '님 견적서\n' +
        '견적번호: ' + (e.no||'—') + '\n' +
        '금액: ' + (Number(e.price)||0).toLocaleString() + '원\n' +
        '공간: ' + (e.space||'—') + '\n' +
        '원단: ' + (e.fabric||'—');
      navigator.clipboard.writeText(text)
        .then(function(){ showToast('카카오톡에 붙여넣기 하세요 🙂'); })
        .catch(function(){ showToast('복사됐습니다'); });
    });
    var openBtn = btn('flex:1;padding:9px 0;background:var(--dark);color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer', '📄 견적서 앱', function(){
      openEstimate(currentDetailName);
    });
    actions.appendChild(kakaoBtn);
    actions.appendChild(openBtn);

    // 세부내용 보기 (2026-08-04 신규) — 저장된 품목 문자열("이름(금액원), 이름(금액원)...")을
    // 실제로 읽을 수 있는 목록으로 펼쳐서 보여줌. 예전엔 "공간"/"원단" 칸에 요약(또는
    // 지나치게 긴 원문)만 보이고 실제 항목별 내역을 확인할 방법이 없었음.
    // 2026-08-24(선혜님 요청 — "세부내용 보기 팝업은 의미없다, 대신 고객용
    // 견적서를 보여줘"): 내부 요약 팝업 대신, 실제 고객용 견적서 문서를
    // 저장 당시 금액 그대로 새 창에서 보여줌.
    var detailBtn = btn('width:100%;margin-top:6px;padding:9px 0;background:#fff;color:var(--dark);border:1px solid var(--border);border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer', '📄 고객용 견적서 보기', function(){
      if (!e.id) { showToast('이 견적은 세부 데이터가 없어서 미리보기를 만들 수 없어요'); return; }
      window.open('dah-estimate.html?loadEstDbId=' + encodeURIComponent(e.id) + '&mode=view', '_blank');
    });

    // 2026-08-29(선혜님 지시 - "견적서목록/고객상세의 이력탭에 버튼으로
    // 다시 붙이기"): 저장된 lineItems로 발주서/실측·시공 의뢰서를 다시
    // 만드는 기능 - 8/24에 세부내용팝업을 없애면서 같이 사라졌던 걸 복원.
    // lineItems가 없는 예전 견적(요약 문자열만 있던 시절)은 재구성할
    // 원본 데이터가 없으므로 버튼 자체를 안 보여줌.
    var reGenActions = null;
    if (e.lineItems && e.lineItems.length > 0) {
      reGenActions = div('display:flex;gap:6px;margin-top:6px', [
        btn('flex:1;padding:9px 0;background:#fff;color:var(--dark);border:1px solid var(--border);border-radius:12px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer', '📋 발주서', function(){ showVendorOrderFromEstimate(e); }),
        btn('flex:1;padding:9px 0;background:#fff;color:var(--dark);border:1px solid var(--border);border-radius:12px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer', '📐 실측의뢰서', function(){ showRequestFromEstimate('measure', e); }),
        btn('flex:1;padding:9px 0;background:#fff;color:var(--dark);border:1px solid var(--border);border-radius:12px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer', '🔧 시공의뢰서', function(){ showRequestFromEstimate('install', e); })
      ]);
    }

    var deleteEstBtn = btn('width:100%;margin-top:6px;padding:9px 0;background:#fff;color:#C0392B;border:1px solid #F5D6D0;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer', '삭제', function(){
      if (!confirm('⚠️ 이 견적서를 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
      archiveEstimate(e, function(err){
        if (err) { showToast('⚠️ 삭제가 서버에 반영되지 않았어요' + (err.zeroRows ? '(권한 문제일 수 있어요)' : '') + ' — 새로고침해서 확인해주세요'); return; }
        showToast('완전히 삭제했어요');
        loadEstimatesAsync(function(){ renderDetailEstTab(); }, true); // 서버 최신상태로 강제 재동기화 후 다시 그림
      });
    });

    card.appendChild(top);
    card.appendChild(priceRow);
    card.appendChild(infoGrid);
    card.appendChild(dateRow);
    card.appendChild(actions);
    card.appendChild(detailBtn);
    if (reGenActions) card.appendChild(reGenActions);
    card.appendChild(deleteEstBtn);
    estEl.appendChild(card);
  });

  // 새 견적 버튼
  var newEstBtn = btn('width:100%;padding:var(--sp-3);background:#F5F2EE;color:var(--dark);border:1px solid var(--border);border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:var(--sp-1)',
    '+ 새 견적서 작성', function(){ openEstimate(currentDetailName); });
  estEl.appendChild(newEstBtn);
}


// 2026-09-15(선혜님 지시 - "전문업체는 이런 일이 있을 수 있니??" 로
// 만든 안전장치): estimates 테이블에 DB 트리거(estimate_history)가
// 자동으로 직전 버전을 남기게 만들어둠 - 이걸 보고, 필요하면 그 버전
// 으로 되돌릴 수 있는 화면.
function showEstimateHistoryModal(dbId, clientName) {
  var existing = document.getElementById('est-history-overlay');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = 'est-history-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99998;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:var(--sp-5);width:420px;max-width:100%;max-height:80vh;overflow-y:auto';
  box.innerHTML = '<div style="font-size:15px;font-weight:700;color:var(--dark);margin-bottom:4px">📜 ' + escHtml(clientName||'') + ' 견적서 이력</div>' +
    '<div style="font-size:11px;color:var(--sub);margin-bottom:var(--sp-3)">수정/삭제되기 직전 버전이 자동으로 여기 남아요</div>' +
    '<div id="est-history-list" style="font-size:12px;color:var(--sub)">불러오는 중...</div>' +
    '<button id="est-history-close-btn" style="margin-top:var(--sp-3);width:100%;padding:11px;background:#fff;border:1px solid var(--border);border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;color:var(--dark)">닫기</button>';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  document.getElementById('est-history-close-btn').addEventListener('click', function(){ overlay.remove(); });

  sbXHR('GET', 'estimate_history?estimate_id=eq.' + encodeURIComponent(dbId) + '&order=changed_at.desc&limit=20', null, function(err, rows) {
    var listEl = document.getElementById('est-history-list');
    if (!listEl) return; // 로딩 중 모달 닫힘
    if (err || !Array.isArray(rows)) { listEl.textContent = '불러오지 못했어요. 다시 시도해주세요.'; return; }
    if (rows.length === 0) { listEl.textContent = '아직 수정된 적 없는 견적서예요(이력 없음).'; return; }
    listEl.innerHTML = '';
    rows.forEach(function(h) {
      var snap = h.snapshot || {};
      var dt = new Date(h.changed_at);
      var dateStr = (dt.getMonth()+1) + '/' + dt.getDate() + ' ' + dt.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
      var priceStr = (Number(snap.price)||0).toLocaleString() + '원';
      var itemCount = Array.isArray(snap.line_items) ? snap.line_items.length : 0;
      var row = document.createElement('div');
      row.style.cssText = 'padding:10px 0;border-bottom:1px solid var(--ivory1);display:flex;justify-content:space-between;align-items:center;gap:8px';
      row.innerHTML = '<div><div style="font-size:11px;color:var(--sub)">' + escHtml(dateStr) + ' 이전 (' + escHtml(h.change_type === 'before_delete' ? '삭제 전' : '수정 전') + ')</div>' +
        '<div style="font-size:13px;font-weight:700;color:var(--dark)">' + escHtml(priceStr) + ' · 품목 ' + itemCount + '개</div></div>';
      var restoreBtn = document.createElement('button');
      restoreBtn.textContent = '이 버전으로 복원';
      restoreBtn.style.cssText = 'flex-shrink:0;font-size:11px;font-weight:700;padding:7px 10px;border-radius:8px;border:1px solid var(--dark);background:#fff;color:var(--dark);cursor:pointer;font-family:inherit';
      restoreBtn.addEventListener('click', function(){
        if (!confirm(dateStr + ' 버전(' + priceStr + ')으로 되돌릴까요?\n\n지금 저장된 최신 내용은 사라지고 이 버전으로 바뀝니다.')) return;
        sbXHR('PATCH', 'estimates?id=eq.' + encodeURIComponent(dbId), {
          price: snap.price, line_items: snap.line_items, memo: snap.memo,
          estimate_status: snap.estimate_status, contract_status: snap.contract_status
        }, function(perr){
          if (perr) { showToast('⚠️ 복원이 서버에 반영되지 않았어요 — 다시 시도해주세요'); return; }
          showToast('✅ ' + dateStr + ' 버전으로 복원됐어요');
          overlay.remove();
          openDetail(currentDetailName, currentDetailId);
        });
      });
      row.appendChild(restoreBtn);
      listEl.appendChild(row);
    });
  });
}

// 2026-09-15: 견적서 카드 ⋮ 메뉴(이력/삭제)가 다른 곳 클릭해도 안 닫히면
// 안 되니, 문서 전체 클릭시 열려있는 메뉴를 한 번만 등록해서 항상 닫음.
if (!window._estMoreMenuGlobalListenerBound) {
  window._estMoreMenuGlobalListenerBound = true;
  document.addEventListener('click', function() {
    document.querySelectorAll('.est-more-menu-open').forEach(function(m){ m.style.display = 'none'; m.classList.remove('est-more-menu-open'); });
  });
} // 동명이인 구분용
/** @param {string} [editName] 편집 시 기존 고객명 */

// 견적서 품목 문자열("이름(금액원), 이름(금액원)...")을 파싱해서 항목별
// 2026-08-29(선혜님 지시 - "코드정리 누락없이 다했니" 재점검으로 발견):
// showEstimateDetailPopup을 지운 여파로 그 안에서만 쓰이던
// parseEstimateItems/confirmEstimateToFinal/showRequestFromEstimate/
// showVendorOrderFromEstimate가 연쇄적으로 고아 코드가 됐던 걸 발견해
// 2026-09-01(선혜님 지시 - "왜 2개를 만드니"로 발견): buildVendorOrderFromLineItems/
// buildRequestFromLineItems(저장된 lineItems로 대시보드가 직접 발주서/의뢰서를
// 재구성하던 로직)는 오늘 발견한 "쌍둥이 함수" 패턴의 또 다른 사례였음 - 견적서
// 앱(est-doc-vendor.js/est-doc-request.js)에 똑같은 목적의 원본 로직이 따로 있어서, 시공요청서를
// 개선할 때마다 두 곳을 매번 똑같이 고쳐야 했음. showRequestFromEstimate/
// showVendorOrderFromEstimate(아래)가 이제 견적서 앱을 새 창으로 열어서(autoDoc
// 파라미터로 조용히 자동실행) 진짜 데이터로 만들게 바뀌면서, 이 두 함수와
// 그 안에서만 쓰이던 헬퍼(extractSubLoc/curtainRole/groupLabel 등)는 완전히
// 불필요해져 제거함 - 문서 생성 로직이 이제 견적서 앱에만 존재
// (2026-09-16: est-documents.js가 커져서 est-doc-customer/vendor/request.js
// 3개로 나뉨 - 여전히 한 앱 안에만 있다는 핵심은 그대로).


// 2026-09-01(선혜님 지시 - "왜 2개를 만드니": 어제 되살렸던 두 wrapper가
// buildRequestFromLineItems/buildVendorOrderFromLineItems(저장된 lineItems로
// 대시보드가 직접 문서를 재구성하는 로직)를 불렀는데, 이게 오늘 발견한
// "쌍둥이 함수" 패턴의 새로운 사례였음 - 견적서 앱(est-documents.js)에도
// 똑같은 목적의 원본 로직이 따로 있어서, 시공요청서를 개선할 때마다
// 두 곳을 매번 똑같이 고쳐야 했음(실제로 오늘 여러 번 놓칠 뻔함).
// 근본 해결: 대시보드는 이제 문서를 직접 안 만들고, 견적서 앱을 새 창으로
// 열어서(autoDoc 파라미터로 조용히 자동 실행) 진짜 데이터로 만들게 함 -
// 문서 생성 로직이 이제 견적서 앱(est-doc-*.js)에만 존재.
function showRequestFromEstimate(kind, e) {
  if (!e.dbId) { showToast('이 견적은 세부 데이터가 없어서 다시 만들 수 없어요'); return; }
  window.open('dah-estimate.html?loadEstDbId=' + encodeURIComponent(e.dbId) + '&mode=view&autoDoc=' + encodeURIComponent(kind), '_blank');
}
// 2026-09-11(선혜님 지시 - "발주 하는 이 부분이 정말 신경이 많이
// 쓰이는데 이 방법이 최선인지는 모르겠어" + 대시보드 "발주 현황"
// 체크리스트를 보여주시며 하나씩 누르면 상세 발주서가 나오는 게 낫지
// 않냐는 방향 확인): category를 주면 그 카테고리(원단/제작/레일/블라인드)
// 만 걸러서 보여줌 - 안 주면(견적서 앱 안의 "발주서" 버튼) 기존처럼 전부 다.
function showVendorOrderFromEstimate(e, category) {
  if (!e.dbId) { showToast('이 견적은 세부 데이터가 없어서 다시 만들 수 없어요'); return; }
  var url = 'dah-estimate.html?loadEstDbId=' + encodeURIComponent(e.dbId) + '&mode=view&autoDoc=vendor';
  if (category) url += '&onlyCategory=' + encodeURIComponent(category);
  window.open(url, '_blank');
}

// 2026-09-21(선혜님 - "견적서 확인을 누르면... 제일 마지막 견적만
// 확인이 되고 있어" - 노지경 고객 사례): 견적서가 2건 이상인 고객이
// openEstimate()를 호출하면, 최신 하나로 바로 넘어가는 대신 이 모달로
// 골라서 열게 함. showEstimateHistoryModal()과 같은 오버레이 스타일
// 재사용 - 각 견적서의 날짜/금액/상태(가견적·확정견적)를 보여줌.
function showEstimatePickerModal(rows, clientName) {
  var existing = document.getElementById('est-picker-overlay');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = 'est-picker-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99998;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:var(--sp-5);width:420px;max-width:100%;max-height:80vh;overflow-y:auto';
  box.innerHTML = '<div style="font-size:15px;font-weight:700;color:var(--dark);margin-bottom:4px">📋 ' + escHtml(clientName||'') + ' 견적서 ' + rows.length + '건</div>' +
    '<div style="font-size:11px;color:var(--sub);margin-bottom:var(--sp-3)">어느 견적서를 여실지 골라주세요</div>' +
    '<div id="est-picker-list"></div>' +
    '<button id="est-picker-close-btn" style="margin-top:var(--sp-3);width:100%;padding:11px;background:#fff;border:1px solid var(--border);border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;color:var(--dark)">닫기</button>';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  document.getElementById('est-picker-close-btn').addEventListener('click', function(){ overlay.remove(); });
  overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.remove(); });

  var listEl = document.getElementById('est-picker-list');
  rows.forEach(function(r) {
    var dt = new Date(r.created_at);
    var dateStr = (dt.getMonth()+1) + '/' + dt.getDate() + ' 작성';
    var priceStr = (Number(r.price)||0).toLocaleString() + '원';
    var statusStr = r.estimate_status === 'final' ? '확정견적' : '가견적';
    var row = document.createElement('button');
    row.style.cssText = 'width:100%;text-align:left;padding:12px 10px;border:1px solid var(--border);border-radius:10px;background:#fff;font-family:inherit;cursor:pointer;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px';
    row.innerHTML = '<div><div style="font-size:11px;color:var(--sub)">' + escHtml(dateStr) + ' · ' + escHtml(statusStr) + '</div>' +
      '<div style="font-size:14px;font-weight:700;color:var(--dark)">' + escHtml(priceStr) + '</div></div>' +
      '<span style="font-size:11px;color:var(--terra);font-weight:700">열기 ›</span>';
    row.addEventListener('click', function(){
      window.location.href = 'dah-estimate.html?loadEstDbId=' + encodeURIComponent(r.id) + '&mode=edit';
    });
    listEl.appendChild(row);
  });
}

function openEstimate(name, id) {
  var useId = id || (typeof currentDetailId !== 'undefined' ? currentDetailId : null);
  // 2026-08-12: 예전엔 localStorage(dah_open_customer)로 고객정보를 넘기고
  // 페이지 이동했는데, 대시보드(dah-dashboard.vercel.app)와 견적서 앱
  // (dah-estimate.vercel.app)이 서로 다른 도메인이라 localStorage가 전혀
  // 공유되지 않아 "빈 화면"이 뜨는 버그였음(선혜님 실사용에서 확인됨).
  // URL 쿼리파라미터로 고객ID만 넘기고, 견적서 앱이 그 ID로 Supabase에서
  // 직접 조회하도록 변경 - 지역출장비/거래처목록과 동일한 해결 패턴.
  //
  // 2026-08-24(선혜님 발견 — "최시내 견적서 또 생겼다"): 이 버튼이 항상
  // loadCustId 경로로만 열려서, 기존 견적이 있는 고객이어도 window._estEditState.editingEstDbId가
  // 절대 세팅 안 되고 있었음 — 그래서 이 버튼으로 들어가서 "저장"만 눌러도
  // 매번 완전히 새 견적이 만들어졌음(오늘 발견된 다른 중복들 — Gbn, Hbug 등도
  // 같은 경로로 생겼을 가능성이 높음). 고객에게 이미 견적이 있으면
  // loadEstDbId+mode=edit로 열어서 "이어서 수정"이 되도록, 없으면(진짜 신규
  // 고객) 기존처럼 loadCustId로 열리도록 분기함.
  if (useId) {
    // 2026-09-21(선혜님 - "견적서 확인을 누르면 2개의 견적서를 선택하는게
    // 아니라 그 중 제일 마지막 견적만 확인이 되고 있어" - 노지경 고객
    // 사례): limit=1로 무조건 최신 견적서 하나만 가져와서 곧바로 그
    // 견적서로 이동해버려서, 견적서가 여러 건인 고객은 선택할 기회
    // 자체가 없었음(예전 것을 볼 방법이 없음) - 이 고객의 견적서가
    // 2건 이상이면 어느 것을 열지 고르는 화면을 먼저 보여주고, 1건
    // 이하면 예전처럼 바로 이동(불필요한 클릭 추가 안 함).
    var latestUrl = SUPABASE_URL + '/rest/v1/estimates?client_id=eq.' + encodeURIComponent(useId) +
      '&is_archived=is.false&order=created_at.desc&select=id,created_at,price,estimate_status';
    var lxhr = new XMLHttpRequest();
    lxhr.open('GET', latestUrl, true);
    lxhr.setRequestHeader('apikey', SUPABASE_KEY);
    lxhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
    lxhr.onload = function() {
      var rows = [];
      try { rows = JSON.parse(lxhr.responseText) || []; } catch(e) {}
      if (rows.length >= 2) {
        showEstimatePickerModal(rows, name || (typeof currentDetailName !== 'undefined' ? currentDetailName : ''));
        return;
      }
      var latestId = (rows[0] && rows[0].id) || null;
      if (latestId) {
        window.location.href = 'dah-estimate.html?loadEstDbId=' + encodeURIComponent(latestId) + '&mode=edit';
      } else {
        window.location.href = 'dah-estimate.html?loadCustId=' + encodeURIComponent(useId);
      }
    };
    lxhr.onerror = function() {
      // 조회 실패시엔 예전처럼 loadCustId로라도 열리게(완전히 막히는 것보단 나음)
      window.location.href = 'dah-estimate.html?loadCustId=' + encodeURIComponent(useId);
    };
    lxhr.send();
  } else if (name) {
    window.location.href = 'dah-estimate.html?loadCustName=' + encodeURIComponent(name);
  } else {
    window.location.href = 'dah-estimate.html';
  }
}



var STATUS_LABELS = {ga:'가견적서', final:'최종견적서'};

function renderEstimateHistory(container, clientName, clientId) {
  var estSec = el('div', {style:'margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)'});
  var hd = el('div', {style:'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px'});
  var lbl = el('div', {style:'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1px;text-transform:uppercase', text:'견적서'});
  hd.appendChild(lbl);
  estSec.appendChild(hd);

  var estimates = [];
  try {
    var all = JSON.parse(localStorage.getItem('dah_saved')||'[]');
    // 2026-08-31(선혜님 지시 - "더 디테일한 검사를 하길 바래"로 발견):
    // 고객상세 "정보" 탭의 견적서 목록도 id 체크 없이 무조건 이름으로만
    // 매칭하고 있었음 - 동명이인이면 여기서도 섞여 보일 수 있었음.
    estimates = all.filter(function(e){ return (clientId && e.clientId) ? e.clientId === clientId : e.clientName === clientName; });
  } catch(ex) {}

  if (estimates.length === 0) {
    var emptyEl = el('div', {style:'font-size:11px;color:var(--sub);padding:10px 0;text-align:center', text:'저장된 견적서 없음'});
    estSec.appendChild(emptyEl);
    container.appendChild(estSec);
    return;
  }

  var currentCustomerStageForHistory = getCustomerCurrentStage(clientName, clientId);
  estimates.forEach(function(e, ei) {
    var isLast = ei === estimates.length - 1;
    var card = el('div', {style:
      'border:1px solid var(--border);border-radius:12px;padding:12px 14px;' +
      'margin-bottom:' + (isLast?'0':'8px') + ';background:#fff'
    });

    
    var top = el('div', {style:'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-2)'});
    var noEl = el('div', {style:'display:flex;align-items:center;gap:6px'});
    var noSpan = el('span', {style:'font-size:12px;font-weight:700;color:var(--dark)', text:e.no||'—'});
    var typeSpan = el('span', {style:
      'font-size:11px;color:#6B6B6B;border:1px solid var(--border);' +
      'padding:1px 6px;border-radius:var(--r-btn)',
      text: STATUS_LABELS[e.status]||'가견적서'
    });
    noEl.appendChild(noSpan); noEl.appendChild(typeSpan);
    if (e.confirmedAt) {
      var confirmedSpan = el('span', {style:'font-size:11px;font-weight:700;color:#fff;background:var(--dark);padding:1px 8px;border-radius:20px', text:'✓ 확정'});
      noEl.appendChild(confirmedSpan);
    }

    
    var contractBadge = el('span', {style:
      'font-size:12px;font-weight:700;padding:3px 10px;border-radius:6px;' +
      'background:#F5F2EE;color:' + stageColorFor(currentCustomerStageForHistory),
      text: currentCustomerStageForHistory || '—'
    });

    top.appendChild(noEl); top.appendChild(contractBadge);
    card.appendChild(top);

    
    var mid = el('div', {style:'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px'});
    var spaceEl = el('span', {style:'font-size:11px;color:var(--dark)', text:e.space||'—'});
    var priceEl = el('span', {style:'font-size:12px;font-weight:700;color:var(--dark)', text:(Number(e.price)||0).toLocaleString()+'원'});
    mid.appendChild(spaceEl); mid.appendChild(priceEl);
    card.appendChild(mid);

    
    if (e.fabric) {
      var fabEl = el('div', {style:'font-size:11px;color:var(--sub);margin-bottom:var(--sp-1)', text:'원단: ' + e.fabric});
      card.appendChild(fabEl);
    }

    
    var bot = el('div', {style:'font-size:11px;color:var(--sub)'});
    var dateStr = e.savedAt ? e.savedAt.slice(0,10) : (e.date||'');
    bot.textContent = dateStr + (e.staffName ? ' · ' + e.staffName : '');
    card.appendChild(bot);

    if (e.dbId) {
      var actionRow = el('div', {style:'display:flex;gap:6px;margin-top:8px'});
      var editBtn = el('button', {style:
        'flex:1;font-size:11px;font-weight:600;padding:7px;border-radius:8px;' +
        'border:1px solid var(--border);background:#fff;color:var(--dark);cursor:pointer;font-family:inherit;min-height:32px'
      });
      editBtn.textContent = '열어서 수정';
      (function(dbId){
        editBtn.addEventListener('click', function(ev){
          ev.stopPropagation();
          window.location.href = 'dah-estimate.html?loadEstDbId=' + encodeURIComponent(dbId) + '&mode=edit';
        });
      })(e.dbId);
      var copyBtn = el('button', {style:
        'flex:1;font-size:11px;font-weight:600;padding:7px;border-radius:8px;' +
        'border:1px solid var(--border);background:#fff;color:var(--dark);cursor:pointer;font-family:inherit;min-height:32px'
      });
      copyBtn.textContent = '복사해서 새로 만들기';
      (function(dbId){
        copyBtn.addEventListener('click', function(ev){
          ev.stopPropagation();
          window.location.href = 'dah-estimate.html?loadEstDbId=' + encodeURIComponent(dbId) + '&mode=copy';
        });
      })(e.dbId);
      actionRow.appendChild(editBtn); actionRow.appendChild(copyBtn);
      // 2026-09-15(선혜님 지적 - "버튼이 4개라 빽빽해요, 전문업체 기준
      // 만족스럽니??"로 재검토): "이력"/"삭제"를 자주 안 쓰는 보조 동작으로
      // 보고, 점3개(⋮) 메뉴 하나 뒤로 모아서 자주 쓰는 열기/복사 2개만
      // 눈에 띄게 남김.
      var moreBtn = el('button', {style:
        'flex:0 0 36px;font-size:16px;font-weight:700;padding:7px 0;border-radius:8px;' +
        'border:1px solid var(--border);background:#fff;color:var(--sub);cursor:pointer;font-family:inherit;min-height:32px;position:relative'
      });
      moreBtn.className = 'est-card-more-btn';
      moreBtn.textContent = '⋮';
      var moreMenu = el('div', {style:
        'display:none;position:absolute;right:0;top:calc(100% + 4px);background:#fff;border:1px solid var(--border);' +
        'border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:50;overflow:hidden;min-width:100px'
      });
      var histItem = el('div', {style:'padding:10px 14px;font-size:12px;color:var(--dark);cursor:pointer;white-space:nowrap', text:'📜 이력 보기'});
      var delItem = el('div', {style:'padding:10px 14px;font-size:12px;color:#C0392B;cursor:pointer;white-space:nowrap;border-top:1px solid var(--ivory1)', text:'🗑 삭제'});
      moreMenu.appendChild(histItem); moreMenu.appendChild(delItem);
      moreBtn.appendChild(moreMenu);
      moreBtn.addEventListener('click', function(ev){
        ev.stopPropagation();
        var isOpen = moreMenu.style.display === 'block';
        document.querySelectorAll('.est-more-menu-open').forEach(function(m){ m.style.display = 'none'; m.classList.remove('est-more-menu-open'); });
        if (!isOpen) { moreMenu.style.display = 'block'; moreMenu.classList.add('est-more-menu-open'); }
      });
      (function(dbId, estObj){
        histItem.addEventListener('click', function(ev){
          ev.stopPropagation();
          moreMenu.style.display = 'none';
          showEstimateHistoryModal(dbId, estObj.clientName || currentDetailName);
        });
        delItem.addEventListener('click', function(ev){
          ev.stopPropagation();
          moreMenu.style.display = 'none';
          var label = (estObj.clientName || currentDetailName || '이름없음') + ' · ' + (Number(estObj.price)||0).toLocaleString() + '원';
          if (!confirm(label + '\n\n⚠️ 이 견적서를 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
          // archiveEstimate()는 est.id(서버 UUID)를 기준으로 판단하는데,
          // 이 카드 객체는 서버ID가 e.dbId에 들어있어서 명시적으로 매핑.
          archiveEstimate({ id: estObj.dbId, no: estObj.no, clientName: estObj.clientName, price: estObj.price }, function(err){
            if (err) { if (typeof showToast === 'function') showToast('⚠️ 삭제가 서버에 반영되지 않았어요' + (err.zeroRows ? '(권한 문제일 수 있어요)' : '') + ' — 새로고침해서 확인해주세요'); return; }
            if (typeof showToast === 'function') showToast('완전히 삭제했어요');
            openDetail(currentDetailName, currentDetailId); // 목록 새로고침
          });
        });
      })(e.dbId, e);
      actionRow.appendChild(moreBtn);
      card.appendChild(actionRow);
    } else {
      // 2026-08-12 이전에 저장된 견적서는 서버 레코드 id(dbId)가 없어서
      // 정확히 다시 열 방법이 없음 - 소급 적용 안 됨(confirmDate/custType과 동일한 한계)
      var noteEl = el('div', {style:'font-size:10px;color:var(--sub);margin-top:6px', text:'이전 저장 견적 — 열기/복사 불가 (새로 작성한 견적부터 가능)'});
      card.appendChild(noteEl);
    }

    estSec.appendChild(card);
  });

  container.appendChild(estSec);
}
