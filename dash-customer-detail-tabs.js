/* ══════════════════════════════════════════════════
   DAH 대시보드 — 고객상세 모달: 뒷부분(정보/견적/이력/버튼/단계변경/삭제·복구)
   2026-09-24(선혜님 - "바꿔보자" - 큰 파일 쪼개기 1차): dash-customer-
   detail.js(1,619줄)가 너무 커서 절반으로 나눔. dash-customer-detail.js
   에는 모달 열기/헤더/단계표시(읽기전용)가 남고, 이 파일엔 각 탭 내용
   (정보/견적/할일)과 실제 액션(닫기/단계변경/삭제/복구/견적서
   열기·이력·불러오기)이 있음. 순수 전역 스크립트라 두 파일이 서로의
   함수(currentDetailId, closeDetail 등)를 자유롭게 참조해도 문제없음 -
   각 함수의 정확한 위치는 CONCEPT_REGISTRY.json에서 다시 확인할 것.
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

function renderDetailTodoSection(c, body) {
  // 2026-09-14(선혜님 지적 - 문지윤 고객 실제 캡처로 발견): 여기가 소통
  // 탭과 다른 로직(단순 단계매칭)을 써서 서로 다른 개수가 나오고 있었음 -
  // 공용 함수(getDueAlimKeys)로 통일해서 두 탭이 항상 같은 답을 보여주게 함.
  var todoKeys = getDueAlimKeys(c);
  // 2026-09-24(선혜님 - "카카오 등록 전에 한번 더 파자"로 발견): 이
  // "지금 해야 할 일"도 결국 getAlimSentMap(로컬전용)에 기반해서, 다른
  // 기기에서 이미 보낸 걸 "아직 안 보냄"으로 잘못 보여줄 위험이 소통탭과
  // 똑같이 있었음 - 같은 서버재확인 안전장치 적용.
  if (typeof refreshAlimSentMapFromServer === 'function') {
    refreshAlimSentMapFromServer(c, function() {
      if (currentDetailId === c.id && typeof renderDetailTodoSection === 'function') renderDetailTodoSection(c, body);
    });
  }
  var manualKeys = todoKeys; // '선택' 태그가 있던 옛 22개 체계의 흔적 - 지금 13개엔 '선택' 태그 자체가 없어져서 그대로 사용
  if (manualKeys.length > 0) {
    var todoSec = div('margin-bottom:14px;padding:var(--sp-3);background:var(--ivory1);border:1.5px solid var(--dark);border-radius:12px', []);
    todoSec.appendChild(el('div', {style:'font-size:12px;font-weight:700;color:var(--dark);letter-spacing:1.5px;margin-bottom:var(--sp-2)', text:'지금 해야 할 일'}));
    // 가장 급한 것 1개만 크게 보여주고, 나머지는 "N건 더 남음" 뒤에 접어둠(눌러야만 펼쳐짐)
    var firstKey = manualKeys[0];
    var firstMeta = ALIM_META[firstKey];
    var primaryBtn = btn('width:100%;padding:11px;background:var(--dark);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-bottom:6px', firstMeta.label + ' 발송하기', function(){ sendAlimtalk(firstKey); });
    todoSec.appendChild(primaryBtn);
    if (manualKeys.length > 1) {
      var moreRow = div('display:flex;align-items:center;justify-content:space-between', [
        el('span', {style:'font-size:11px;color:var(--sub)', text:(manualKeys.length-1)+'건 더 남음'}),
        btn('font-size:11px;color:var(--dark);background:none;border:1px solid var(--border);padding:4px 10px;border-radius:10px;cursor:pointer;font-family:inherit;min-height:32px', '전체 보기', function(){
          var wrap = document.getElementById('todo-rest');
          if (wrap) wrap.style.display = wrap.style.display === 'none' ? '' : 'none';
        })
      ]);
      todoSec.appendChild(moreRow);
      var restWrap = div('display:none;margin-top:var(--sp-2)', []);
      restWrap.id = 'todo-rest';
      manualKeys.slice(1).forEach(function(key) {
        var meta = ALIM_META[key]; if(!meta) return;
        var row = div('display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:5px', [
          div('', [
            el('span', {style:'font-size:12px;font-weight:700;color:var(--dark);display:block', text:meta.label}),
            el('span', {style:'font-size:11px;color:var(--sub)', text:meta.desc})
          ]),
          el('span', {style:'font-size:12px;font-weight:600;color:var(--dark);background:#fff;border:1px solid var(--dark);padding:5px 12px;border-radius:12px;flex-shrink:0', text:'발송'})
        ]);
        (function(k){ row.addEventListener('click', function(){ sendAlimtalk(k); }); })(key);
        restWrap.appendChild(row);
      });
      todoSec.appendChild(restWrap);
    }
    body.appendChild(todoSec);
  }

}

// 2026-09-15: 견적서 카드 ⋮ 메뉴(이력/삭제)가 다른 곳 클릭해도 안 닫히면
// 안 되니, 문서 전체 클릭시 열려있는 메뉴를 한 번만 등록해서 항상 닫음.
if (!window._estMoreMenuGlobalListenerBound) {
  window._estMoreMenuGlobalListenerBound = true;
  document.addEventListener('click', function() {
    document.querySelectorAll('.est-more-menu-open').forEach(function(m){ m.style.display = 'none'; m.classList.remove('est-more-menu-open'); });
  });
}

function renderDetailInfoSection(c, body) {
  var infoSec = div('margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)', []);
  infoSec.appendChild(el('div', {style:'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px', text:'고객 정보'}));

  // 연락처/주소는 헤더에 항상 고정 표시되므로 여기선 생략 (중복 방지).
  // 단, 전화 클릭 기능은 정보바의 연락처 칸에서 그대로 사용 가능.

  // 메모 (2026-07-21: 읽기전용 표시 -> 탭하면 편집+빠른문구버튼 나오는 방식으로 개편.
  // 예전엔 메모를 실제로 입력/수정할 방법이 앱 어디에도 없었음 — 표시만 되고 편집 UI가 없었음)
  function renderMemoDisplay(memoBlock, val) {
    memoBlock.innerHTML = '';
    memoBlock.appendChild(el('div', {style:'font-size:11px;color:var(--terra);letter-spacing:0.8px;margin-bottom:3px', text:'메모 (탭해서 편집)'}));
    memoBlock.appendChild(el('div', {style:'font-size:11px;color:'+(val?'var(--dark)':'var(--light)')+';line-height:1.6', text: val || '메모를 추가하려면 눌러주세요'}));
  }
  // 2026-08-10: 메모도 blur(포커스 아웃) 전에 새로고침 등으로 중단되면
  // 타이핑 내용이 날아가던 문제 - 고객ID별 임시저장 키로 해결.
  var memoDraftKey = 'dah_memo_draft_' + c.id;
  function getMemoDraft() { try { return localStorage.getItem(memoDraftKey) || ''; } catch(e) { return ''; } }
  function saveMemoDraft(v) { try { localStorage.setItem(memoDraftKey, v); } catch(e) {} }
  function clearMemoDraft() { try { localStorage.removeItem(memoDraftKey); } catch(e) {} }

  var memoBlock = div('background:#FFFBF5;border:1px solid #FFE5CC;border-radius:12px;padding:10px 14px;margin-bottom:var(--sp-2);cursor:pointer', []);
  renderMemoDisplay(memoBlock, c.memo || '');
  memoBlock.addEventListener('click', function() {
    if (memoBlock.querySelector('textarea')) return; // 이미 편집중이면 무시
    memoBlock.innerHTML = '';
    memoBlock.appendChild(el('div', {style:'font-size:11px;color:var(--terra);letter-spacing:0.8px;margin-bottom:4px', text:'메모'}));
    var textarea = document.createElement('textarea');
    var draftVal = getMemoDraft();
    textarea.value = draftVal || c.memo || '';
    textarea.style.cssText = 'width:100%;min-height:60px;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:12px;font-family:inherit;resize:vertical;box-sizing:border-box';
    textarea.addEventListener('input', function() { saveMemoDraft(textarea.value); });
    memoBlock.appendChild(textarea);
    var quickWrap = div('display:flex;flex-wrap:wrap;gap:4px;margin-top:6px', []);
    (typeof getMempoPhrases === 'function' ? getMempoPhrases() : []).slice(0, 9).forEach(function(p) {
      var qbtn = el('button', {type: 'button', style: 'font-size:11px;padding:6px 10px;min-height:32px;background:var(--ivory1);border:1px solid var(--border);border-radius:20px;cursor:pointer;font-family:inherit'});
      qbtn.textContent = p;
      qbtn.addEventListener('click', function(e) {
        e.stopPropagation();
        textarea.value = textarea.value ? textarea.value + ' / ' + p : p;
        saveMemoDraft(textarea.value);
        textarea.focus();
      });
      quickWrap.appendChild(qbtn);
    });
    memoBlock.appendChild(quickWrap);
    textarea.focus();
    textarea.addEventListener('blur', function() {
      var newVal = textarea.value.trim();
      var arr = loadCustomers();
      var target = findCurrentDetailCustomer(arr);
      if (target) {
        target.memo = newVal;
        saveCustomers(arr);
        clearMemoDraft();
        saveCustomerToDb(target, function(err){
          showToast(err ? '⚠️ 메모: 로컬엔 저장됨(서버 재시도 대기)' : '메모가 저장됐습니다');
        });
      }
      renderMemoDisplay(memoBlock, newVal);
    });
  });
  infoSec.appendChild(memoBlock);

  // 2026-08-29: 카카오 알림톡 v3 재작성 시 추가 — #{결제링크} 변수용 저장란.
  // 결제선생/네이버페이 등에서 발급한 링크를 여기 한 번 저장해두면, 4-3/7-C/8-B 등
  // 카드결제 안내 알림톡 발송 때마다 다시 입력할 필요 없이 자동으로 채워짐.
  function renderPaymentLinkDisplay(block, val) {
    block.innerHTML = '';
    block.appendChild(el('div', {style:'font-size:11px;color:var(--terra);letter-spacing:0.8px;margin-bottom:3px', text:'결제 링크 (탭해서 편집 · #{결제링크} 변수로 사용)'}));
    block.appendChild(el('div', {style:'font-size:11px;color:'+(val?'var(--dark)':'var(--light)')+';line-height:1.6;word-break:break-all', text: val || '결제 링크를 추가하려면 눌러주세요'}));
  }
  var paymentLinkBlock = div('background:#FFFBF5;border:1px solid #FFE5CC;border-radius:12px;padding:10px 14px;margin-bottom:var(--sp-2);cursor:pointer', []);
  renderPaymentLinkDisplay(paymentLinkBlock, c.paymentLink || '');
  paymentLinkBlock.addEventListener('click', function() {
    if (paymentLinkBlock.querySelector('input')) return;
    paymentLinkBlock.innerHTML = '';
    paymentLinkBlock.appendChild(el('div', {style:'font-size:11px;color:var(--terra);letter-spacing:0.8px;margin-bottom:4px', text:'결제 링크'}));
    var input = document.createElement('input');
    input.type = 'text';
    input.value = c.paymentLink || '';
    input.placeholder = 'https://...';
    input.style.cssText = 'width:100%;min-height:36px;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:12px;font-family:inherit;box-sizing:border-box';
    paymentLinkBlock.appendChild(input);
    input.focus();
    input.addEventListener('blur', function() {
      var newVal = input.value.trim();
      var arr = loadCustomers();
      var target = findCurrentDetailCustomer(arr);
      if (target) {
        target.paymentLink = newVal;
        saveCustomers(arr);
        saveCustomerToDb(target, function(err){
          showToast(err ? '⚠️ 결제링크: 로컬엔 저장됨(서버 재시도 대기)' : '결제 링크가 저장됐습니다');
        });
      }
      renderPaymentLinkDisplay(paymentLinkBlock, newVal);
    });
  });
  infoSec.appendChild(paymentLinkBlock);

  // 날짜 3개 가로 배열 — 실측예정/시공예정은 클릭하면 바로 날짜를 고쳐 저장할 수 있음
  // (기존엔 전체 "수정" 모달을 열어야만 했음 — 선혜님 피드백으로 원클릭 편집 추가)
  var dateGrid = div('display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px', []);
  var dateFields = [
    {label:'상담일', value:c.date||'—', key:null},
    {label:'실측 예정', value:c.measureDate||'—', key:'measureDate'},
    {label:'시공 예정', value:c.installDate||'—', key:'installDate'}
  ];
  dateFields.forEach(function(item){
    var box = div('background:var(--ivory1);border:1px solid var(--border);border-radius:12px;padding:10px 8px;text-align:center;position:relative'+(item.key?';cursor:pointer':''),[
      el('div',{style:'font-size:11px;color:var(--sub);letter-spacing:0.8px;margin-bottom:var(--sp-1)',text:item.label}),
      el('div',{style:'font-size:12px;font-weight:700;color:'+(item.value==='—'?'var(--light)':'var(--dark)'),text:item.value})
    ]);
    if (item.key) {
      box.addEventListener('click', function(){
        openCustomDatePicker(box, c[item.key] || null, function(newVal){
          var valueDiv = box.children[1];
          var arr = loadCustomers();
          var target = findCurrentDetailCustomer(arr);
          if (target) {
            target[item.key] = newVal || '';
            // 2026-09-21(선혜님 - 전보현/민소아 고객 실제 발생 확인):
            // 실제 날짜를 입력하는데도 예전에 "미정"으로 체크해뒀던
            // 플래그(measureDateTbd/installDateTbd)가 그대로 남아있으면,
            // 이 값이 견적서에 동기화될 때 "미정" 상태로 잘못 복원돼서
            // 날짜칸이 자동으로 비워지고 실측/시공 의뢰서에 "미정"이
            // 뜨는 버그로 이어짐 - 실제 날짜를 입력하는 순간 그 플래그를
            // 명확히 꺼줌(dash-api.js의 customerToDbRow가 이 필드를
            // 서버로 함께 전송하도록 오늘 같이 수정함).
            if (newVal && (item.key === 'installDate' || item.key === 'measureDate')) {
              target[item.key === 'installDate' ? 'installDateTbd' : 'measureDateTbd'] = false;
            }
            saveCustomers(arr);
            saveCustomerToDb(target, function(err){
              showToast(err ? '⚠️ ' + item.label + ': 로컬엔 저장됨(서버 재시도 대기)' : item.label + '이 저장됐습니다');
            });
            // 2026-09-11(선혜님 지적 - "고객이 확정된 뒤에 시공일자를
            // 바꾸면 견적서에는 수정이 또 안되네 심지어 대시보드에
            // 수정해도 변경이 안되고 반영도 안되네"): 지금까지 견적서를
            // 저장할 때 그 안의 날짜가 고객 레코드로 동기화되는 방향만
            // 있었고, 반대(대시보드에서 고객 날짜를 고치면 견적서에도
            // 반영)는 없었음 - 실제 시공일정은 계약 후에도 바뀌는 게
            // 정상인데, 대시보드에서 고쳐도 견적서를 다시 열면 예전
            // 날짜가 그대로 보이던 원인. 이 고객의 가장 최근 견적서도
            // 함께 갱신.
            if (typeof SUPABASE_URL !== 'undefined' && target.id) {
              // 2026-09-21(선혜님 - "전문업체라면 어떻게 하겠니? 제대로 좀
              // 해봐" 요청으로 전체 DB 스키마 재점검 중 발견 - 심각한
              // 회귀): estimates 테이블엔 measure_date라는 컬럼 자체가
              // 없음(실측 예정일은 이 테이블에서 'date' 컬럼에 저장됨,
              // est-save.js의 "date: document.getElementById('c-measure')
              // ?.value" 로 확인) - 오늘 아침 이 자리에 measure_date로
              // PATCH를 보내고 있었는데, 실제로 Supabase에 재현해보니
              // "column measure_date of relation estimates does not exist"
              // 로 요청 자체가 거부됨. 즉 오늘 아침 만든 tbd 수정이 실측
              // 예정일 케이스에서는 이 PATCH 자체가 실패해서 tbd 플래그도
              // 같이 반영이 안 됐을 가능성이 매우 높음(재현 테스트가
              // 네트워크를 mock해서 항상 성공 응답을 줬기 때문에 못 잡음).
              var estField = item.key === 'installDate' ? 'install_date' : 'date';
              try {
                var findXhr = new XMLHttpRequest();
                findXhr.open('GET', SUPABASE_URL + '/rest/v1/estimates?client_id=eq.' + encodeURIComponent(target.id) + '&order=created_at.desc&limit=1&select=id', true);
                findXhr.setRequestHeader('apikey', SUPABASE_KEY);
                findXhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
                findXhr.onload = function() {
                  try {
                    var rows = JSON.parse(findXhr.responseText);
                    if (rows && rows[0] && rows[0].id) {
                      var patchXhr = new XMLHttpRequest();
                      patchXhr.open('PATCH', SUPABASE_URL + '/rest/v1/estimates?id=eq.' + encodeURIComponent(rows[0].id), true);
                      patchXhr.setRequestHeader('apikey', SUPABASE_KEY);
                      patchXhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
                      patchXhr.setRequestHeader('Content-Type', 'application/json');
                      var patchBody = {};
                      patchBody[estField] = newVal || null;
                      // 2026-09-21(선혜님 - 전보현/민소아 고객 실제
                      // 발생 확인 - 진짜 근본 원인): 견적서 앱이 실제로
                      // 참조하는 건 estimates.measure_date_tbd/
                      // install_date_tbd(applyScheduleAndDepositToForm이
                      // 이 견적서 레코드의 필드를 직접 읽음)인데, 지금까지
                      // 이 PATCH가 날짜(estField)만 갱신하고 그 옆의 tbd
                      // 플래그는 전혀 안 건드리고 있었음 - 실제 날짜를
                      // 입력했는데도 이 견적서에 예전 "미정" 값이 그대로
                      // 남아있으면, 다음에 견적서를 열 때 "미정" 체크가
                      // 켜진 채로 복원돼서 날짜칸이 도로 비워짐(이번
                      // 버그의 진짜 발생 지점). 날짜를 실제로 입력하는
                      // 경우에만 그 tbd도 함께 꺼줌.
                      if (newVal) {
                        var estTbdField = item.key === 'installDate' ? 'install_date_tbd' : 'measure_date_tbd';
                        patchBody[estTbdField] = false;
                      }
                      patchXhr.send(JSON.stringify(patchBody));
                    }
                  } catch (eFind) {}
                };
                findXhr.send();
              } catch (eOuter) {}
            }
          } else {
            showToast(item.label + '이 저장됐습니다');
          }
          valueDiv.textContent = newVal || '—';
          valueDiv.style.color = newVal ? 'var(--dark)' : 'var(--light)';
        });
      });
    }
    dateGrid.appendChild(box);
  });
  infoSec.appendChild(dateGrid);
  body.appendChild(infoSec);

}

function renderDetailBottomButtons(c, isMaster, body) {
  var bottomBtns = [btn('flex:2;padding:11px;background:var(--dark);color:#fff;border:none;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;border-radius:12px;letter-spacing:0.2px', '닫기', closeDetail)];
  // 2026-08-27(선혜님 지시 - "실장도 삭제 권한 줘야 할 것 같아") →
  // 2026-08-28(선혜님 지시 - "삭제하면 보관처리 하지마", "실장도 완전삭제"):
  // 이제 "삭제"는 항상 완전삭제이므로, 앞으로는 이 isSoftDeleted 분기 자체를
  // 새로 만들 일이 없음(예전에 이미 보관 처리됐던 레거시 데이터만 여기 걸림).
  // 그런 레거시 건에 대해서도 마스터+본인담당실장 둘 다 완전삭제/복구
  // 가능하게 일관되게 맞춤.
  var canActOnThis = isMaster || (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'staff' && (c.staffName||'마스터') === currentUser.name);
  if (isSoftDeleted(c)) {
    if (canActOnThis) {
      bottomBtns.unshift(btn('flex:1;padding:11px;background:#fff;border:1px solid var(--dark);font-size:11px;font-family:inherit;cursor:pointer;color:var(--dark);font-weight:700;border-radius:12px', '↩ 복구', function(){ restoreCustomer(c.clientName, c.id); }));
      bottomBtns.unshift(btn('flex:1;padding:11px;background:#fff;border:1px solid #C0392B;font-size:11px;font-family:inherit;cursor:pointer;color:#C0392B;font-weight:700;border-radius:12px', '완전 삭제', function(){ permanentlyDeleteCustomer(c); }));
    }
  } else {
    bottomBtns.unshift(btn('flex:1;padding:11px;background:#fff;border:1px solid var(--border);font-size:11px;font-family:inherit;cursor:pointer;color:var(--dark);border-radius:12px', '삭제', deleteCustomer));
  }
  body.appendChild(div('display:flex;gap:var(--sp-2)', bottomBtns));

}

function closeDetail() {
  document.getElementById('detail-overlay').className = 'overlay';
  currentDetailName = null;
  currentDetailId = null;
  // 2026-09-13: 화면을 닫으면 "나 지금 보고 있음" 상태도 같이 정리 -
  // 안 그러면 화면을 닫은 뒤에도 계속 "누가 보고 있다"고 잘못 표시됨.
  if (typeof leaveCustomerPresence === 'function') leaveCustomerPresence();
}

function changeStage(stage) {
  var arr = loadCustomers();
  var target = findCurrentDetailCustomer(arr);
  if (!target) return;
  if (currentUser && currentUser.role === 'staff') {
    if ((target.staffName||'마스터') !== currentUser.name) { alert('본인 담당 고객만 단계를 변경할 수 있습니다.'); return; }
  }
  // 2026-08-05: 옛 이름 '완료' 잔여참조 수정 — 실제 값은 '시공완료'라 이 확인창이 영원히 안 뜨고 있었음
  if (stage === '시공완료') { if (!confirm(currentDetailName + ' 고객을 "시공 완료"로 변경할까요?')) return; }
  var fromStage = target.stage;
  target.stage = stage;
  // 2026-08-10: 확정일 기록 - "확정견적" 단계로 처음 전환될 때만 기록(이미
  // confirmDate가 있으면 덮어쓰지 않음 - 나중에 단계를 왔다갔다해도 최초
  // 확정일 유지). 엑셀 다운로드에 확정일 컬럼 추가하면서 필요해진 필드.
  if (stage === '확정견적' && !target.confirmDate) {
    target.confirmDate = todayStr();
  }
  saveCustomers(arr);
  if (typeof logEvent === 'function') logEvent('stage_change', { from: fromStage, to: stage, customerId: target.id, customerName: target.clientName });
  renderHome(true); openDetail(currentDetailName, target.id);
  saveCustomerToDb(target, function(err){
    showToast(err ? ('⚠️ "' + stage + '"으로 변경(로컬만) — 서버 재시도 대기중') : ('"' + stage + '"으로 변경됐습니다'));
  });
}

// 2026-08-28(선혜님 지시 — "삭제하면 보관처리 하지마"): 예전엔 이 함수가
// 보관처리(is_archived=true)를 했었는데, 그게 나중에 "이미 등록된 고객"
// 오판 등 계속 혼란을 만들어서, 이제 "삭제"는 항상 완전삭제로 감. 별도
// 로직을 여기 다시 짜지 않고 permanentlyDeleteCustomer를 그대로 재사용함
// (같은 개념이 두 곳에 따로 있으면 한쪽만 고치고 잊어버리는 실수가
// 오늘 하루 계속 반복됐음 - 체크리스트 24번).
function deleteCustomer() {
  var arr = loadCustomers();
  var target = findCurrentDetailCustomer(arr);
  if (!target) { if (typeof showToast === 'function') showToast('고객 정보를 찾을 수 없어요'); return; }
  permanentlyDeleteCustomer(target);
}

// 2026-08-05: 진짜 완전 삭제 — 이중 확인(경고 문구 + 이름 재확인)을 거쳐야
// 실행됨. 되돌릴 방법이 전혀 없음.
//
// 2026-08-28(선혜님 지시 — "삭제하면 보관처리 하지마 그러면 자꾸 이런
// 헷갈리거나 중복되는 일이 생기는거 같아", 배재연 사례로 확인됨): 보관처리
// (소프트삭제)가 나중에 "이미 등록된 고객"으로 잘못 잡히는 등 계속 혼란을
// 만들어서, 이제 "삭제"는 항상 이 완전삭제 함수 하나로 통일함(deleteCustomer는
// 이 함수를 그대로 재사용 - 같은 로직을 두 번 안 짜기 위함, 체크리스트 24번).
// 마스터는 항상 가능, 실장은 본인 담당 고객만 가능(일관성 우선으로 선혜님
// 확인) - DB RLS(customers_delete)도 함께 확장해뒀음.
function permanentlyDeleteCustomer(c) {
  var isMasterUser = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'master';
  var isOwnStaffCustomer = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'staff' &&
    c && (c.staffName || '마스터') === currentUser.name;
  if (!isMasterUser && !isOwnStaffCustomer) {
    if (typeof showToast === 'function') showToast('본인 담당 고객만 삭제할 수 있어요');
    return;
  }
  var name = c.clientName || '고객';
  if (!confirm('⚠️ ' + name + '님 정보를 삭제할까요?\n\n이 작업은 절대 되돌릴 수 없어요. 견적서·결제기록 등 모든 정보가 완전히 사라져요.')) return;
  var typed = prompt('정말 삭제하려면 고객명을 정확히 입력해주세요: "' + name + '"');
  if (typed !== name) { showToast('입력한 이름이 정확하지 않아 취소됐어요'); return; }
  permanentlyDeleteCustomerFromDb(c, function(err) {
    if (err) { showToast('삭제 실패 — 다시 시도해주세요'); return; }
    var arr = loadCustomers().filter(function(x){ return String(x.id) !== String(c.id); });
    saveCustomers(arr);
    showToast(name + '님 정보가 완전히 삭제됐습니다');
    closeDetail(); renderHome(true);
  });
}

function restoreCustomer(clientName, id) {
  if (!confirm((clientName||'고객') + ' 정보를 복구할까요?')) return;
  var arr = loadCustomers();
  var target = id ? arr.find(function(c) { return String(c.id) === String(id); }) : arr.find(function(c) { return c.clientName === clientName; });
  restoreCustomerFromDb(target || clientName, null);
  if (target) target.is_archived = false;
  saveCustomers(arr);
  showToast(clientName + ' 정보가 복구됐습니다');
  closeDetail();
  if (typeof renderSearch === 'function') renderSearch();
}

var editingCustomerName = null;
var editingCustomerId = null; // 동명이인 구분용
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
