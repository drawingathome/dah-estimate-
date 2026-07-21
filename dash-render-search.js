/* ══════════════════════════════════════════════════
   고객목록(검색) 탭 렌더링
   ══════════════════════════════════════════════════
   dash-render.js에서 분리됨 (2026-07-17). */

function renderSearch() {
  var allLoaded = loadCustomers();
  var all = (currentUser && currentUser.role === 'staff') ? allLoaded.filter(function(c) { return (c.staffName||'마스터') === currentUser.name; }) : allLoaded;
  // 정렬 적용 (2026-07-20: 예전엔 정렬버튼을 눌러도 반영이 안 되던 버그 수정)
  all = (typeof sortCustomers === 'function' && typeof _currentSort !== 'undefined') ? sortCustomers(all, _currentSort) : all.slice().reverse();
  // 단계 필터 적용 (2026-07-20 신규)
  if (typeof _currentStageFilter !== 'undefined' && _currentStageFilter !== 'all') {
    all = all.filter(function(c){ return c.stage === _currentStageFilter; });
  }
  var q = (document.getElementById('cust-search').value || '').trim();
  var showArchived = document.getElementById('show-archived')?.checked || false;
  var filtered = q
    ? all.filter(function(c) { return searchMatch(c, q); })
    : all;
  var customers = showArchived ? filtered : filtered.filter(function(c){ return !isArchived(c) && !isSoftDeleted(c); });
  var archivedCount = filtered.filter(function(c){ return isArchived(c) || isSoftDeleted(c); }).length;
  var countEl = document.getElementById('search-count'); if (countEl) countEl.textContent = q ? ('검색 결과 ' + customers.length + '건') : (showArchived ? '전체 ' + customers.length + '건 (보관 포함)' : '전체 ' + customers.length + '건')
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
    row.appendChild(left); row.appendChild(right);
    (function(name, id) { row.addEventListener('click', function() { openDetail(name, id); }); })(c.clientName, c.id);
    listEl.appendChild(row);
  });
}
