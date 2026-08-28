/* ══════════════════════════════════════════════════
   DAH 대시보드 — 진행현황(칸반) 기능
   상담→계약금→실측→잔금→시공→완료 단계별 칸반보드,
   고객 정렬, 단계변경 메뉴.
   ══════════════════════════════════════════════════ */

// 2026-08-05: 색상 3그룹으로 단순화(제안1 확정) — 방문예약~가견적(계약 전)=회색,
// 선금결제~시공준비중(결제·진행 중)=오렌지, 시공완료=그린. 예전 4색조합(그린/레드/오렌지/다크)은
// 한눈에 안 들어온다는 피드백으로 폐기.
var PIPE_STAGES = [
  { key:'방문예약', dot:'#8A8378' },
  { key:'상담',   dot:'#8A8378' },
  { key:'가견적', dot:'#8A8378' },
  { key:'선금결제', dot:'var(--terra)' },
  { key:'실측준비중', dot:'var(--terra)' },
  { key:'확정견적', dot:'var(--terra)' },
  { key:'잔금결제', dot:'var(--terra)' },
  { key:'시공준비중', dot:'var(--terra)' },
  { key:'시공완료', dot:'#2F6690' },
];

// 2026-08-05: 6단계→9단계 세분화(선혜님 요청). 기존 6단계 데이터는
// 자동 매핑됨: 상담(그대로) / 계약금→선금결제 / 실측→실측준비중 /
// 잔금→잔금결제 / 시공→시공준비중 / 완료→시공완료.
// "방문예약/가견적/확정견적"은 신규 고객부터 실제로 거치는 새 단계.
var STAGE_ORDER = ['방문예약','상담','가견적','선금결제','실측준비중','확정견적','잔금결제','시공준비중','시공완료'];

function changeStageByName(customerName, newStage, id) {
  try {
    var customers = loadCustomers();
    var idx = id ? customers.findIndex(function(c) { return String(c.id) === String(id); }) : customers.findIndex(function(c) { return c.clientName === customerName; });
    if (idx < 0) { showToast('고객을 찾을 수 없습니다'); return; }

    var oldStage = customers[idx].stage;
    customers[idx].stage = newStage;
    customers[idx].updatedAt = new Date().toISOString();
    // 2026-08-10: 칸반 드래그로 전환할 때도 확정일 기록 (changeStage와 동일 로직)
    if (newStage === '확정견적' && !customers[idx].confirmDate) {
      customers[idx].confirmDate = todayStr();
    }
    saveCustomers(customers);

    // Supabase 동기화 (2026-08-04 버그수정: 예전엔 path 앞에 불필요한 슬래시가
    // 붙어있고(SUPABASE_URL+'/rest/v1/'+path 조합에서 이중슬래시가 됨), 콜백도
    // sbXHR가 기대하는 (err,data) 단일콜백 방식과 안 맞게 두 개로 나눠 넘겨서
    // 실제로는 클라우드 저장이 조용히 실패하고 있었음 — 화면엔 "이동됨" 토스트가
    // 떠서 성공한 것처럼 보였지만 새로고침하면 원래대로 돌아가 있었음)
    if (customers[idx].id) {
      var patchBody = { stage: newStage };
      if (newStage === '확정견적' && customers[idx].confirmDate) patchBody.confirm_date = customers[idx].confirmDate;
      sbXHR('PATCH', 'customers?id=eq.' + customers[idx].id,
        patchBody,
        function(err) {
          if (err) {
            console.warn('스테이지 동기화 실패:', err);
            showToast('⚠️ 단계 이동이 서버에 반영되지 않았어요' + (err.zeroRows ? '(권한 문제일 수 있어요)' : '') + ' — 새로고침해서 확인해주세요');
          }
        }
      );
    }
    showToast(customerName + ' → ' + newStage);
    renderPipe(loadCustomers());
  } catch(e) { showToast('변경 실패: ' + e.message); }
}

function showStageMenu(customerName, currentStage, anchorEl, id) {
  // 기존 메뉴 제거
  var existing = document.getElementById('stage-menu');
  if (existing) { existing.remove(); return; }

  var menu = document.createElement('div');
  menu.id = 'stage-menu';
  menu.style.cssText = [
    'position:fixed',
    'background:#fff',
    'border:1px solid var(--border)',
    'border-radius:var(--r-card)',
    'box-shadow:0 4px 20px rgba(0,0,0,0.15)',
    'z-index:9999',
    'overflow:hidden',
    'min-width:120px',
  ].join(';');

  var rect = anchorEl.getBoundingClientRect();
  menu.style.top  = (rect.bottom + 6) + 'px';
  menu.style.left = Math.max(8, rect.left - 40) + 'px';

  STAGE_ORDER.forEach(function(stage) {
    var item = document.createElement('button');
    item.style.cssText = [
      'display:block', 'width:100%',
      'padding:10px 16px',
      'border:none',
      'border-bottom:1px solid var(--ivory2)',
      'background:' + (stage === currentStage ? 'var(--ivory2)' : '#fff'),
      'color:' + (stage === currentStage ? 'var(--terra)' : 'var(--dark)'),
      'font-size:11px',
      'font-weight:' + (stage === currentStage ? '700' : '500'),
      'text-align:left',
      'cursor:pointer',
      'font-family:inherit',
    ].join(';');
    item.textContent = (stage === currentStage ? '✓ ' : '') + stage;
    item.addEventListener('click', function() {
      menu.remove();
      if (stage !== currentStage) changeStageByName(customerName, stage, id);
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  setTimeout(function() {
    document.addEventListener('click', function handler(e) {
      if (!menu.contains(e.target)) { menu.remove(); }
      document.removeEventListener('click', handler);
    });
  }, 10);
}

/* ── 고객 목록 정렬 ── */
var _currentSort = 'date_desc';

function sortCustomers(customers, sortKey) {
  var sorted = customers.slice();
  switch(sortKey) {
    case 'name_asc':
      sorted.sort(function(a,b) { return (a.clientName||'').localeCompare(b.clientName||'', 'ko'); });
      break;
    case 'name_desc':
      sorted.sort(function(a,b) { return (b.clientName||'').localeCompare(a.clientName||'', 'ko'); });
      break;
    case 'date_desc':
      sorted.sort(function(a,b) { return new Date(b.createdAt||0) - new Date(a.createdAt||0); });
      break;
    case 'date_asc':
      sorted.sort(function(a,b) { return new Date(a.createdAt||0) - new Date(b.createdAt||0); });
      break;
    case 'amount_desc':
      sorted.sort(function(a,b) { return (Number(b.price)||0) - (Number(a.price)||0); });
      break;
    case 'amount_asc':
      sorted.sort(function(a,b) { return (Number(a.price)||0) - (Number(b.price)||0); });
      break;
  }
  return sorted;
}

function setSort(key) {
  _currentSort = key;
  document.querySelectorAll('.sort-wrap .sort-btn').forEach(function(b) {
    b.classList.toggle('on', b.getAttribute('data-sort') === key);
  });
  renderSearch();
}

/* ── 고객 목록 단계별 필터 (2026-07-20 추가) ──
   배경: 상담이 매일 여러 건 들어오는데, 계약금/실측/시공 등 다른 단계
   고객들과 다 섞여서 나오다 보니 "아직 처리 안 한 신규 상담"만 골라볼
   방법이 없었음. 단계 필터를 추가해서 놓치지 않게 함. */
var _currentStageFilter = 'all';
function setStageFilter(stage) {
  _currentStageFilter = stage;
  document.querySelectorAll('.stage-filter-wrap .stage-filter-btn').forEach(function(b) {
    b.classList.toggle('on', b.getAttribute('data-stage') === stage);
  });
  renderSearch();
}

function renderPipeKanban(customers) {
  customers = (customers || []).filter(function(c){ return !isSoftDeleted(c); });
  var wrap = document.getElementById('pipe');
  if (!wrap) return;
  wrap.innerHTML = '';

  // 검색바
  var searchWrap = document.createElement('div');
  searchWrap.className = 'search-top';
  searchWrap.style.cssText = 'padding:10px 16px 8px;position:sticky;top:52px;z-index:90;background:var(--ivory2)';
  searchWrap.innerHTML = '<div class="search-bar-wrap"><svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--light)" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input type="search" id="pipe-search" class="search-input-clean" placeholder="고객명 검색" oninput="filterPipe(this.value)"></div>';
  wrap.appendChild(searchWrap);

  // 칸반 래퍼
  var kanbanWrap = document.createElement('div');
  kanbanWrap.className = 'kanban-wrap';
  kanbanWrap.id = 'kanban-wrap';
  wrap.appendChild(kanbanWrap);

  renderKanbanCols(customers, kanbanWrap);
}

function renderKanbanCols(customers, kanbanWrap) {
  kanbanWrap.innerHTML = '';
  PIPE_STAGES.forEach(function(stage) {
    var stageCustomers = customers.filter(function(c) { return c.stage === stage.key; });

    var col = document.createElement('div');
    col.className = 'kanban-col';

    // 헤더
    var head = document.createElement('div');
    head.className = 'kanban-head';
    head.innerHTML = '<div class="kanban-dot" style="background:' + stage.dot + '"></div>' +
      '<span class="kanban-label">' + stage.key + '</span>' +
      '<span class="kanban-count">' + stageCustomers.length + '</span>';
    col.appendChild(head);

    // 드래그앤드롭 (2026-07-21 신규 — PC 마우스 드래그로 카드를 다른 단계 컬럼에 놓으면
    // 그 단계로 변경됨. HTML5 드래그 API는 마우스 기반이라 모바일 터치에서는 지원 안 되므로,
    // 모바일에서는 기존 케밥(⋮) 메뉴로 단계 변경)
    col.addEventListener('dragover', function(e) {
      e.preventDefault();
      col.style.background = 'var(--ivory1)';
    });
    col.addEventListener('dragleave', function() {
      col.style.background = '';
    });
    col.addEventListener('drop', function(e) {
      e.preventDefault();
      col.style.background = '';
      var draggedName = e.dataTransfer.getData('text/customer-name');
      var draggedId = e.dataTransfer.getData('text/customer-id');
      var draggedStage = e.dataTransfer.getData('text/customer-stage');
      if (draggedName && draggedStage !== stage.key) {
        changeStageByName(draggedName, stage.key, draggedId || undefined);
      }
    });

    if (stageCustomers.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'kanban-empty';
      empty.textContent = '진행 없음';
      col.appendChild(empty);
    } else {
      stageCustomers.forEach(function(c) {
        var item = document.createElement('div');
        item.className = 'kanban-item';
        item.style.position = 'relative';
        item.draggable = !('ontouchstart' in window || navigator.maxTouchPoints > 0);
        var stageChangeName = c.clientName;
        var stageChangeCurrent = stage.key;
        item.innerHTML =
          '<div style="display:flex;align-items:flex-start;justify-content:space-between">' +
            '<div class="kanban-item-name" style="flex:1;display:flex;align-items:center;gap:5px">' +
              (typeof renderStaffBadge === 'function' ? renderStaffBadge(c.staffName, 16) : '') +
              '<span>' + escHtml(c.clientName || '') + '</span>' +
            '</div>' +
            '<button class="ksb" data-n="' + escHtml((c.clientName||'').replace(/"/g,'')) + '" data-s="' + stage.key + '" data-id="' + escHtml(c.id||'') + '" ' +
              'onclick="event.stopPropagation();var t=this;showStageMenu(t.dataset.n,t.dataset.s,t,t.dataset.id)" ' +
              'style="border:none;background:none;color:var(--light);font-size:15px;cursor:pointer;padding:8px 10px;line-height:1;min-height:32px;min-width:32px">···</button>' +
          '</div>' +
          '<div class="kanban-item-sub">' + escHtml(c.phone || '') + '</div>' +
          (function() {
            // 2026-08-28(선혜님 재지적 — "어떤거는 선금 금액이 있고 어떤거는
            // 토탈 금액이 있지????", 오늘 아침부터 반복된 지적): c.price(전체
            // 계약금액)만 보여주던 게, 손현영님처럼 우연히 선금=전체금액인
            // 경우와 조승희님처럼 선금<전체금액인 경우가 겉보기에 구분이
            // 안 돼서 "어떤 카드는 선금, 어떤 카드는 전체가 보인다"는 착시로
            // 계속 오해를 샀음. "착시다"라고 설명만 하지 않고, 실제로 받은
            // 금액과 전체 금액을 카드에 둘 다 명확히 구분해서 보여주도록 변경.
            var price = Number(c.price) || 0;
            var received = (Number(c.depositAmount) || 0) + (Number(c.balanceAmount) || 0);
            if (!price) return '';
            var totalLine = '<div class="kanban-item-price">' + price.toLocaleString() + '원</div>';
            if (received > 0 && received < price) {
              // 일부만 받은 상태 - "받은 X원" 을 전체금액 위에 작게 별도 표시
              return '<div style="font-size:11px;color:#2F6690;font-weight:700;margin-top:2px">받은 ' + received.toLocaleString() + '원</div>' + totalLine;
            }
            return totalLine;
          })();
        item.addEventListener('click', function() { openDetail(c.clientName, c.id); });
        item.addEventListener('dragstart', function(e) {
          e.dataTransfer.setData('text/customer-name', c.clientName || '');
          e.dataTransfer.setData('text/customer-id', c.id || '');
          e.dataTransfer.setData('text/customer-stage', stage.key);
          item.style.opacity = '0.4';
        });
        item.addEventListener('dragend', function() { item.style.opacity = '1'; });
        col.appendChild(item);
      });
    }
    kanbanWrap.appendChild(col);
  });
}

function filterPipe(q) {
  loadCustomersAsync(function(all) {
    var filtered = q ? all.filter(function(c) { return searchMatch(c, q); }) : all;
    var kw = document.getElementById('kanban-wrap');
    if (kw) renderKanbanCols(filtered, kw);
  });
}


function renderPipe(customers) {
  // 스태프 권한 필터 (2026-08-04 추가) — 고객목록/매출탭엔 이미 있는데
  // 진행현황(칸반)만 빠져있어서, 스태프 계정으로도 다른 담당자 고객이
  // 전부 보이던 권한 누락이었음
  var filtered = (currentUser && currentUser.role === 'staff')
    ? (customers || []).filter(function(c) { return (c.staffName||'마스터') === currentUser.name; })
    : customers;
  renderPipeKanban(filtered);
}

