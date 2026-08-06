/* ══════════════════════════════════════════════════
   고객목록(검색) 탭 렌더링
   ══════════════════════════════════════════════════
   dash-render.js에서 분리됨 (2026-07-17). */

function renderSearch() {
  var allLoaded = loadCustomers();
  var all = (currentUser && currentUser.role === 'staff') ? allLoaded.filter(function(c) { return (c.staffName||'마스터') === currentUser.name; }) : allLoaded;
  // 정렬 적용 (2026-07-20: 예전엔 정렬버튼을 눌러도 반영이 안 되던 버그 수정)
  all = (typeof sortCustomers === 'function' && typeof _currentSort !== 'undefined') ? sortCustomers(all, _currentSort) : all.slice().reverse();
  // 2026-08-06 중요 수정: "완료 후 14일 지나면 고객목록에서 자동으로 숨김"은
  // 잘못된 설계였음 — 선혜님이 명확히 "고객 정보는 그냥 다 보이게 해야지, 보관함은
  // 견적서 쪽(시공완료 보관함/계약 안한 보관함)에 있어야 하는 거였다"고 정정함.
  // 그래서 이 화면(고객목록)에선 isArchived 관련 필터/숨김을 전부 제거함.
  if (typeof _currentStageFilter !== 'undefined' && _currentStageFilter === 'parked') {
    all = all.filter(function(c){ return c.leadParked === true; });
  } else if (typeof _currentStageFilter !== 'undefined' && _currentStageFilter !== 'all') {
    all = all.filter(function(c){ return c.stage === _currentStageFilter; });
  } else {
    // 전체/일반 단계 필터에서는 대기 중인 리드는 기본적으로 숨김(따로 눌러야 보임)
    all = all.filter(function(c){ return !c.leadParked; });
  }
  var q = (document.getElementById('cust-search').value || '').trim();
  // "보관 고객 포함" 체크박스는 이제 완전삭제 전 소프트삭제된 고객만 담당
  // (isArchived 관련 로직은 위에서 이미 전부 제거됨 — 고객목록은 항상 전원 표시)
  var showDeleted = document.getElementById('show-archived')?.checked || false;
  var filtered = q
    ? all.filter(function(c) { return searchMatch(c, q); })
    : all;
  var customers = showDeleted ? filtered : filtered.filter(function(c){ return !isSoftDeleted(c); });
  var deletedCount = filtered.filter(function(c){ return isSoftDeleted(c); }).length;
  // 2026-08-06: "전체 N건"이라고 라벨을 붙이면서 실제로는 삭제고객 뺀 숫자만
  // 세고 있으면 오해를 줄 수 있어서, 소프트삭제 고객이 있을 땐 같이 표시.
  var countEl = document.getElementById('search-count');
  if (countEl) {
    if (q) {
      countEl.textContent = '검색 결과 ' + customers.length + '건';
    } else if (showDeleted) {
      countEl.textContent = '전체 ' + filtered.length + '명';
    } else {
      var totalCount = customers.length + deletedCount;
      countEl.textContent = deletedCount > 0
        ? ('전체 ' + totalCount + '명 (활성 ' + customers.length + ' · 삭제보관 ' + deletedCount + ')')
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
