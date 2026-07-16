/* ══════════════════════════════════════════════════
   DAH 대시보드 — 진행현황(칸반) 기능
   상담→계약금→실측→잔금→시공→완료 단계별 칸반보드,
   고객 정렬, 단계변경 메뉴.
   ══════════════════════════════════════════════════ */

var PIPE_STAGES = [
  { key:'계약금', dot:'#F06E2D' },
  { key:'실측',   dot:'#F06E2D' },
  { key:'잔금',   dot:'#282828' },
  { key:'시공',   dot:'#282828' },
  { key:'완료',   dot:'#EEE6DC' },
];

var STAGE_ORDER = ['상담','계약금','실측','잔금','시공','완료'];

function changeStageByName(customerName, newStage) {
  try {
    var customers = loadCustomers();
    var idx = customers.findIndex(function(c) { return c.clientName === customerName; });
    if (idx < 0) { showToast('고객을 찾을 수 없습니다'); return; }

    var oldStage = customers[idx].stage;
    customers[idx].stage = newStage;
    customers[idx].updatedAt = new Date().toISOString();
    saveCustomers(customers);

    // Supabase 동기화
    if (customers[idx].id) {
      sbXHR('PATCH', '/customers?id=eq.' + customers[idx].id,
        { stage: newStage },
        function() {},
        function(e) { console.warn('스테이지 동기화 실패:', e); }
      );
    }
    showToast(customerName + ' → ' + newStage);
    renderPipe(loadCustomers());
  } catch(e) { showToast('변경 실패: ' + e.message); }
}

function showStageMenu(customerName, currentStage, anchorEl) {
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
      if (stage !== currentStage) changeStageByName(customerName, stage);
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
  document.querySelectorAll('.sort-btn').forEach(function(b) {
    b.classList.toggle('on', b.getAttribute('data-sort') === key);
  });
  loadCustomersAsync(function(all) {
    renderSearch(sortCustomers(all, _currentSort));
  });
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
        var stageChangeName = c.clientName;
        var stageChangeCurrent = stage.key;
        item.innerHTML =
          '<div style="display:flex;align-items:flex-start;justify-content:space-between">' +
            '<div class="kanban-item-name" style="flex:1">' + escHtml(c.clientName || '') + '</div>' +
            '<button class="ksb" data-n="' + escHtml((c.clientName||'').replace(/"/g,'')) + '" data-s="' + stage.key + '" ' +
              'onclick="event.stopPropagation();var t=this;showStageMenu(t.dataset.n,t.dataset.s,t)" ' +
              'style="border:none;background:none;color:var(--light);font-size:15px;cursor:pointer;padding:8px 10px;line-height:1;min-height:32px;min-width:32px">···</button>' +
          '</div>' +
          '<div class="kanban-item-sub">' + escHtml(c.phone || '') + '</div>' +
          (c.price ? '<div class="kanban-item-price">' + Number(c.price).toLocaleString() + '원</div>' : '');
        item.addEventListener('click', function() { openDetail(c.clientName); });
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
  renderPipeKanban(customers);
}

