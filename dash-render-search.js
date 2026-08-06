/* ══════════════════════════════════════════════════
   고객목록(검색) 탭 렌더링
   ══════════════════════════════════════════════════
   dash-render.js에서 분리됨 (2026-07-17). */

function renderSearch() {
  var allLoaded = loadCustomers();
  var all = (currentUser && currentUser.role === 'staff') ? allLoaded.filter(function(c) { return (c.staffName||'마스터') === currentUser.name; }) : allLoaded;
  // 정렬 적용 (2026-07-20: 예전엔 정렬버튼을 눌러도 반영이 안 되던 버그 수정)
  all = (typeof sortCustomers === 'function' && typeof _currentSort !== 'undefined') ? sortCustomers(all, _currentSort) : all.slice().reverse();
  // 단계 필터 적용 (2026-07-20 신규) — "대기 리드"(parked)는 상담단계에서
  // 오래 진행없는 경우, "완료 보관함"(completed_archive)은 시공완료 후
  // 오래된 경우(2026-08-04 신규, 두 보관함을 명확히 분리)
  if (typeof _currentStageFilter !== 'undefined' && _currentStageFilter === 'parked') {
    all = all.filter(function(c){ return c.leadParked === true; });
  } else if (typeof _currentStageFilter !== 'undefined' && _currentStageFilter === 'completed_archive') {
    all = all.filter(function(c){ return isArchived(c) === true; });
  } else if (typeof _currentStageFilter !== 'undefined' && _currentStageFilter !== 'all') {
    all = all.filter(function(c){ return c.stage === _currentStageFilter; });
  } else {
    // 전체/일반 단계 필터에서는 대기 중인 리드는 기본적으로 숨김(따로 눌러야 보임)
    all = all.filter(function(c){ return !c.leadParked; });
  }
  var q = (document.getElementById('cust-search').value || '').trim();
  var showArchived = document.getElementById('show-archived')?.checked || false;
  var filtered = q
    ? all.filter(function(c) { return searchMatch(c, q); })
    : all;
  var isArchiveTab = _currentStageFilter === 'completed_archive';
  var customers = (showArchived || isArchiveTab) ? filtered : filtered.filter(function(c){ return !isArchived(c) && !isSoftDeleted(c); });
  var archivedCount = filtered.filter(function(c){ return isArchived(c) || isSoftDeleted(c); }).length;
  // 2026-08-06: "전체 N건"이라고 라벨을 붙이면서 실제로는 보관고객을 뺀 숫자만 세고 있었음 —
  // "전체"라는 말과 실제 숫자가 안 맞아서, 회원수가 갑자기 줄어든 것처럼 오해를 준 문제
  // (선혜님이 실제로 이 문제를 발견함). 이제 진짜 전체 인원(활성+보관)을 항상 보여주고,
  // 보관 고객을 숨기고 있을 땐 몇 명이 보관중이라 안 보이는지도 같이 표시.
  var countEl = document.getElementById('search-count');
  if (countEl) {
    if (q) {
      countEl.textContent = '검색 결과 ' + customers.length + '건';
    } else if (showArchived || isArchiveTab) {
      countEl.textContent = '전체 ' + filtered.length + '명';
    } else {
      var totalCount = customers.length + archivedCount;
      countEl.textContent = archivedCount > 0
        ? ('전체 ' + totalCount + '명 (활성 ' + customers.length + ' · 보관 ' + archivedCount + ')')
        : ('전체 ' + totalCount + '명');
    }
  }
  var listEl = document.getElementById('search-list'); listEl.innerHTML = '';
  if (customers.length === 0) { (function(){
    var _emp = document.createElement('div');
    _emp.className = 'empty-state';
    _emp.innerHTML = q
      ? '<div class="empty-state-emoji">🔍</div><div class="empty-state-title">검색 결과가 없습니다</div><div class="empty-state-desc">다른 이름으로 검색해보세요</div>'
      : '<div class="empty-state-emoji">📋</div><div class="empty-state-title">등록된 고객이 없습니다</div><div class="empty-state-desc">+ 고객 버튼으로<br>첫 고객을 등록해보세요</div>';
    listEl.appendChild(_emp);
  })(); return; }
  customers.forEach(function(c) {
    var row = el('div', {class:'cust-item'});
    var left = el('div', {class:'ci-left'});

    // 이름 + 재구매 뱃지
    var nameRow = el('div', {class:'ci-name'});
    var nameSpan = el('span', {}); nameSpan.textContent = c.clientName;
    nameRow.appendChild(nameSpan);
    if (c.visitCount > 1) {
      var rTag = el('span', {class:'rebuy-tag'}); rTag.textContent = '재구매';
      nameRow.appendChild(rTag);
    }
    left.appendChild(nameRow);

    // 연락처 + 공간
    var subSpan = el('span', {class:'ci-sub'});
    subSpan.textContent = [c.phone, c.space].filter(Boolean).join(' · ');
    left.appendChild(subSpan);

    // 주소 + 담당자 (2번째 서브라인)
    if (c.addr || (c.staffName && c.staffName !== '마스터')) {
      var sub2 = el('span', {style:'font-size:11px;color:var(--sub);display:block;margin-top:2px'});
      sub2.textContent = [c.addr, c.staffName && c.staffName!=='마스터' ? c.staffName : ''].filter(Boolean).join(' · ');
      left.appendChild(sub2);
    }

    var right = el('div', {class:'ci-right'});
    var priceEl = el('div', {class:'ci-price'}); priceEl.textContent = fmt(c.price);

    // 단계 뱃지 + 날짜
    var stageEl = el('div', {class:'ci-stage stage-pill '+c.stage}); stageEl.textContent = c.stage;
    var dateEl  = el('div', {style:'font-size:11px;color:var(--sub);margin-top:var(--sp-1);text-align:right'});
    if (c.date) {
      var diff = daysDiff(c.date);
      dateEl.textContent = diff === 0 ? '오늘' : diff > 0 ? diff+'일 경과' : Math.abs(diff)+'일 후';
    }

    right.appendChild(priceEl); right.appendChild(stageEl); right.appendChild(dateEl);
    if (c.leadParked) {
      var unparkBtn = el('button', {style:'margin-top:4px;padding:0 10px;min-height:32px;background:var(--dark);color:#fff;border:none;border-radius:8px;font-size:10px;font-weight:700;font-family:inherit;cursor:pointer'});
      unparkBtn.textContent = '복귀';
      unparkBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!confirm(c.clientName + ' 님을 다시 연락 온 것으로 표시하고 목록으로 복귀시킬까요?')) return;
        c.leadParked = false;
        var all2 = loadCustomers();
        var t = all2.find(function(x){ return x.id === c.id; }) || all2.find(function(x){ return x.clientName === c.clientName; });
        if (t) t.leadParked = false;
        saveCustomers(all2);
        unparkLead(c, function() {
          renderSearch();
          showToast(c.clientName + ' 님을 목록으로 복귀시켰어요');
        });
      });
      right.appendChild(unparkBtn);
    }
    row.appendChild(left); row.appendChild(right);
    (function(name, id) { row.addEventListener('click', function() { openDetail(name, id); }); })(c.clientName, c.id);
    listEl.appendChild(row);
  });
}
