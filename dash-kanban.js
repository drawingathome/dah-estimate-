/* ══════════════════════════════════════════════════
   DAH 대시보드 — 진행현황(칸반) 기능
   상담→계약금→실측→잔금→시공→완료 단계별 칸반보드,
   고객 정렬, 단계변경 메뉴.
   ══════════════════════════════════════════════════ */

var PIPE_STAGES = [
  { key:'계약금', dot:'var(--terra)' },
  { key:'실측',   dot:'var(--terra)' },
  { key:'잔금',   dot:'var(--dark)' },
  { key:'시공',   dot:'var(--dark)' },
  { key:'완료',   dot:'var(--border)' },
];

var STAGE_ORDER = ['상담','계약금','실측','잔금','시공','완료'];

function changeStageByName(customerName, newStage, id) {
  try {
    var customers = loadCustomers();
    var idx = id ? customers.findIndex(function(c) { return c.id === id; }) : customers.findIndex(function(c) { return c.clientName === customerName; });
    if (idx < 0) { showToast('고객을 찾을 수 없습니다'); return; }

    var oldStage = customers[idx].stage;
    customers[idx].stage = newStage;
    customers[idx].updatedAt = new Date().toISOString();
    saveCustomers(customers);

    // Supabase 동기화 (2026-08-04 버그수정: 예전엔 path 앞에 불필요한 슬래시가
    // 붙어있고(SUPABASE_URL+'/rest/v1/'+path 조합에서 이중슬래시가 됨), 콜백도
    // sbXHR가 기대하는 (err,data) 단일콜백 방식과 안 맞게 두 개로 나눠 넘겨서
    // 실제로는 클라우드 저장이 조용히 실패하고 있었음 — 화면엔 "이동됨" 토스트가
    // 떠서 성공한 것처럼 보였지만 새로고침하면 원래대로 돌아가 있었음)
    if (customers[idx].id) {
      sbXHR('PATCH', 'customers?id=eq.' + customers[idx].id,
        { stage: newStage },
        function(err) { if (err) console.warn('스테이지 동기화 실패:', err); }
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
            '<div class="kanban-item-name" style="flex:1">' + escHtml(c.clientName || '') + '</div>' +
            '<button class="ksb" data-n="' + escHtml((c.clientName||'').replace(/"/g,'')) + '" data-s="' + stage.key + '" data-id="' + escHtml(c.id||'') + '" ' +
              'onclick="event.stopPropagation();var t=this;showStageMenu(t.dataset.n,t.dataset.s,t,t.dataset.id)" ' +
              'style="border:none;background:none;color:var(--light);font-size:15px;cursor:pointer;padding:8px 10px;line-height:1;min-height:32px;min-width:32px">···</button>' +
          '</div>' +
          '<div class="kanban-item-sub">' + escHtml(c.phone || '') + '</div>' +
          (c.price ? '<div class="kanban-item-price">' + Number(c.price).toLocaleString() + '원</div>' : '');
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

