/* ══════════════════════════════════════════════════
   DAH 대시보드 — 홈/견적목록/고객검색 화면 렌더링
   ══════════════════════════════════════════════════ */

function renderGoalProgress(currentAmount) {
  var s = getSettings ? getSettings() : {};
  var goalStr = (s.monthlyGoal || '5000').replace(/[^0-9]/g, '');
  var goal = parseInt(goalStr) * (s.monthlyGoal && s.monthlyGoal.includes('만') ? 10000 : 1);
  if (!goal) goal = 50000000; // 기본 5,000만원

  var pct = goal > 0 ? Math.min(Math.round(currentAmount / goal * 100), 999) : 0;
  var isOver = pct >= 100;

  var bar = document.getElementById('goal-progress-bar');
  var pctEl = document.getElementById('goal-pct');
  if (bar) {
    bar.style.width = Math.min(pct, 100) + '%';
    bar.className = 'goal-progress-bar' + (isOver ? ' over' : '');
  }
  if (pctEl) {
    pctEl.textContent = pct + '%';
    pctEl.className = 'goal-pct' + (isOver ? ' over' : '');
  }
}


/** 홈 화면 렌더링 — 오늘 배너, 처리 필요, 일정 */
function renderHome() {
  var wrap = document.getElementById('home');
  if (!wrap) return;

  var _today = new Date();
  var _dowKo = ['일','월','화','수','목','금','토'][_today.getDay()]+'요일';
  var _month = _today.getMonth() + 1;
  var _date  = _today.getDate();
  var _year  = _today.getFullYear();

  loadCustomersAsync(function(customers) {
    if (!customers) customers = [];
    customers = customers.filter(function(c){ return !isSoftDeleted(c); });

    // ── 이달 매출 계산 ──────────────────────────────
    var thisMonthCustomers = customers.filter(function(c) {
      var d = new Date(c.depositDate || c.createdAt || '');
      return d.getFullYear() === _year && d.getMonth() === _today.getMonth();
    });
    var thisMonthRev = thisMonthCustomers.reduce(function(sum, c) {
      // 목표 달성률은 순수 실적매출(제품가격만, 실측비/시공비/레일비 등 제외) 기준으로 계산.
      // 입금액(depositAmount+balanceAmount)은 시공서비스 금액까지 포함된 전체 결제액이라
      // 목표관리 용도로는 맞지 않음 (선혜님 피드백: 시공서비스 금액이 목표매출에 안 섞이게).
      return sum + (Number(c.performanceRevenue) || 0);
    }, 0);
    var thisMonthContracts = customers.filter(function(c) {
      return c.stage === '계약금' || c.stage === '실측' || c.stage === '잔금' || c.stage === '시공';
    }).length;

    // ── 목표 설정 ────────────────────────────────────
    var s = typeof getSettings === 'function' ? getSettings() : {};
    var goalWan = parseInt((s.monthlyGoal || '5000').replace(/[^0-9]/g,'')) || 5000;
    var goalAmt = goalWan * 10000;
    var pct = goalAmt > 0 ? Math.min(Math.round(thisMonthRev / goalAmt * 100), 100) : 0;
    var remain = Math.max(0, goalAmt - thisMonthRev);
    var isOver = thisMonthRev >= goalAmt && goalAmt > 0;

    // ── 스테이지별 카운트 ────────────────────────────
    var stageCounts = {};
    ['상담','계약금','실측','잔금','시공','완료'].forEach(function(s) { stageCounts[s] = 0; });
    customers.forEach(function(c) { if (stageCounts[c.stage] !== undefined) stageCounts[c.stage]++; });

    // ── 처리 필요 항목 ───────────────────────────────
    var needAction = customers.filter(function(c) {
      return c.stage === '계약금' || c.stage === '잔금';
    });

    // ── 오늘/내일 일정 ───────────────────────────────
    var tomorrow = new Date(_today); tomorrow.setDate(_today.getDate()+1);
    var fmt = function(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
    var todayStr = fmt(_today), tomorrowStr = fmt(tomorrow);
    var todaySchedule = customers.filter(function(c) {
      return c.measureDate === todayStr || c.installDate === todayStr || c.date === todayStr;
    });
    var tomorrowSchedule = customers.filter(function(c) {
      return c.measureDate === tomorrowStr || c.installDate === tomorrowStr || c.date === tomorrowStr;
    });

    // ── HTML 조립 ────────────────────────────────────
    wrap.innerHTML = [

      // 1. 날짜 헤더
      '<div style="padding:16px 20px 12px;border-bottom:1px solid var(--border);background:#fff">',
        '<div style="font-size:11px;color:var(--sub);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;letter-spacing:0.06em;margin-bottom:4px">',
          _year + '. ' + _month + '. ' + _date + ' ' + _dowKo,
        '</div>',
        '<div style="display:flex;align-items:center;justify-content:space-between">',
          '<div style="font-size:36px;font-weight:700;color:var(--dark)">',
            isOver
              ? '🎉 ' + _month + '월 목표 달성!'
              : _month + '월, 목표까지 <span style="color:var(--terra)">' + Math.round(remain/10000).toLocaleString() + '만원</span> 남았어요',
          '</div>',
          '<button onclick="openAdd()" style="height:36px;padding:0 16px;background:var(--orange);color:#fff;border:none;border-radius:var(--r-btn);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;flex-shrink:0">+ 고객 추가</button>',
        '</div>',
      '</div>',

      // 2. 목표 달성률 바
      '<div style="padding:12px 20px;background:#fff;border-bottom:1px solid var(--border)">',
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">',
          '<span style="font-size:12px;font-weight:600;color:var(--sub)">이달 목표 달성률</span>',
          '<span style="font-size:12px;font-weight:700;color:' + (isOver ? '#2E7D32' : 'var(--terra)') + '">' + pct + '% <span style="font-size:12px;font-weight:400;color:var(--sub)">/ ' + goalWan.toLocaleString() + '만원</span></span>',
        '</div>',
        '<div style="background:var(--ivory2);border-radius:6px;height:8px;overflow:hidden">',
          '<div style="height:100%;border-radius:6px;width:' + pct + '%;background:' + (isOver ? 'linear-gradient(90deg,#2E7D32,#43A047)' : 'linear-gradient(90deg,var(--terra),var(--orange))') + ';transition:width 0.8s cubic-bezier(0.4,0,0.2,1)"></div>',
        '</div>',
      '</div>',

      // 3. KPI 카드 3개
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--border);border-bottom:1px solid var(--border)">',
        // 이달 매출
        '<div style="background:#fff;padding:16px 20px">',
          '<div style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;margin-bottom:8px;text-transform:uppercase">이달 매출</div>',
          '<div style="font-size:36px;font-weight:700;color:var(--dark);line-height:1">' + Math.round(thisMonthRev/10000).toLocaleString() + '<span style="font-size:13px;font-weight:400;color:var(--sub)">만원</span></div>',
          '<div style="font-size:11px;color:var(--terra);margin-top:4px;font-weight:600">' + pct + '% 달성</div>',
        '</div>',
        // 진행 건수
        '<div style="background:#fff;padding:16px 20px">',
          '<div style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;margin-bottom:8px;text-transform:uppercase">진행 건수</div>',
          '<div style="font-size:36px;font-weight:700;color:var(--dark);line-height:1">' + thisMonthContracts + '<span style="font-size:13px;font-weight:400;color:var(--sub)">건</span></div>',
          '<div style="font-size:11px;color:var(--sub);margin-top:4px">계약~시공 진행중</div>',
        '</div>',
        // 전체 고객
        '<div style="background:#fff;padding:16px 20px">',
          '<div style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;margin-bottom:8px;text-transform:uppercase">전체 고객</div>',
          '<div style="font-size:36px;font-weight:700;color:var(--dark);line-height:1">' + customers.length + '<span style="font-size:13px;font-weight:400;color:var(--sub)">명</span></div>',
          '<div style="font-size:11px;color:var(--sub);margin-top:4px">누적 등록 고객</div>',
        '</div>',
      '</div>',

      // 4. 스테이지 현황 칩
      '<div style="background:#fff;padding:14px 20px 12px;border-bottom:1px solid var(--border)">',
        '<div style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;margin-bottom:10px;text-transform:uppercase">진행 현황</div>',
        '<div style="display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:4px">',
          ['상담','계약금','실측','잔금','시공','완료'].map(function(stage) {
            var cnt = stageCounts[stage] || 0;
            var isOrange = stage === '계약금' || stage === '실측';
            var isDark   = stage === '잔금'   || stage === '시공';
            var bg    = isOrange ? 'var(--bg-org)'  : isDark ? '#F0F0F0' : 'var(--ivory2)';
            var color = isOrange ? 'var(--terra)'   : isDark ? 'var(--dark)' : 'var(--mid)';
            var bdr   = isOrange ? 'var(--terra)'   : isDark ? 'var(--dark)' : 'var(--border)';
            return '<div style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:var(--r-btn);border:1.5px solid ' + bdr + ';background:' + bg + '">' +
              '<span style="font-size:11px;font-weight:800;color:' + color + ';line-height:1">' + cnt + '</span>' +
              '<span style="font-size:12px;font-weight:600;color:' + color + '">' + stage + '</span>' +
            '</div>';
          }).join(''),
        '</div>',
      '</div>',

      // 5. 처리 필요
      '<div style="background:#fff;border-bottom:1px solid var(--border);min-height:80px">',
        '<div style="padding:14px 20px 10px;display:flex;align-items:center;justify-content:space-between">',
          '<span style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;text-transform:uppercase">처리 필요</span>',
          needAction.length > 0 ? '<span style="font-size:12px;font-weight:700;color:var(--terra);background:var(--bg-org);padding:2px 8px;border-radius:10px">' + needAction.length + '건</span>' : '',
        '</div>',
        needAction.length === 0
          ? '<div class="empty-inline">처리 필요한 항목이 없습니다 ✅</div>'
          : needAction.slice(0,5).map(function(c) {
              var stageColor = (c.stage === '계약금' || c.stage === '실측') ? 'var(--terra)' : 'var(--dark)';
              return '<div data-cname="' + escHtml((c.clientName||'').replace(/"/g,'')) + '" onclick="openDetail(this.getAttribute(\'data-cname\'))" ' +
                'style="padding:12px 20px;border-top:1px solid var(--ivory2);display:flex;align-items:center;gap:12px;cursor:pointer">' +
                '<div style="width:6px;height:6px;border-radius:50%;background:' + stageColor + ';flex-shrink:0"></div>' +
                '<div style="flex:1;min-width:0">' +
                  '<div style="font-size:12px;font-weight:700;color:var(--dark);overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + escHtml(c.clientName||'') + '</div>' +
                  '<div style="font-size:11px;color:var(--sub);margin-top:2px">' + escHtml(c.phone||'') + '</div>' +
                '</div>' +
                '<span style="font-size:12px;font-weight:700;color:' + stageColor + ';flex-shrink:0">' + (c.stage||'') + '</span>' +
              '</div>';
            }).join(''),
      '</div>',

      // 6. 오늘/내일 일정
      '<div style="background:#fff;border-bottom:1px solid var(--border);min-height:80px">',
        '<div style="padding:14px 20px 10px">',
          '<span style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;text-transform:uppercase">오늘/내일 일정</span>',
        '</div>',
        (todaySchedule.length === 0 && tomorrowSchedule.length === 0)
          ? '<div class="empty-inline">예정된 일정이 없습니다</div>'
          : [].concat(
              todaySchedule.map(function(c) {
                var type = c.measureDate === todayStr ? '실측' : c.installDate === todayStr ? '시공' : '방문';
                return '<div style="padding:12px 20px;border-top:1px solid var(--ivory2);display:flex;align-items:center;gap:12px">' +
                  '<div style="width:34px;height:34px;border-radius:50%;background:var(--bg-org);display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
                    '<span style="font-size:12px;font-weight:700;color:var(--terra)">오늘</span>' +
                  '</div>' +
                  '<div style="flex:1">' +
                    '<div style="font-size:12px;font-weight:700;color:var(--dark)">' + escHtml(c.clientName||'') + '</div>' +
                    '<div style="font-size:11px;color:var(--sub);margin-top:2px">' + escHtml(type) + ' · ' + escHtml(c.addr||'주소 미입력') + '</div>' +
                  '</div>' +
                '</div>';
              }),
              tomorrowSchedule.map(function(c) {
                var type = c.measureDate === tomorrowStr ? '실측' : c.installDate === tomorrowStr ? '시공' : '방문';
                return '<div style="padding:12px 20px;border-top:1px solid var(--ivory2);display:flex;align-items:center;gap:12px">' +
                  '<div style="width:34px;height:34px;border-radius:50%;background:var(--ivory2);display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
                    '<span style="font-size:11px;font-weight:700;color:var(--sub)">내일</span>' +
                  '</div>' +
                  '<div style="flex:1">' +
                    '<div style="font-size:12px;font-weight:700;color:var(--dark)">' + escHtml(c.clientName||'') + '</div>' +
                    '<div style="font-size:11px;color:var(--sub);margin-top:2px">' + escHtml(type) + ' · ' + escHtml(c.addr||'주소 미입력') + '</div>' +
                  '</div>' +
                '</div>';
              })
            ).join(''),
      '</div>',

      // 7. 담당자별 성과
      (function() {
        if (!currentUser || currentUser.role !== 'master') return '';
        var byStaff = {};
        customers.forEach(function(c) {
          var s = c.staffName || '미지정';
          if (!byStaff[s]) byStaff[s] = { count: 0, rev: 0 };
          byStaff[s].count++;
          // 담당자별 성과도 목표매출과 동일하게 순수 실적매출 기준(시공서비스 금액 제외)
          byStaff[s].rev += (Number(c.performanceRevenue) || 0);
        });
        var rows = Object.keys(byStaff).map(function(s) {
          return '<div style="padding:10px 20px;border-top:1px solid var(--ivory2);display:flex;align-items:center">' +
            '<div style="width:28px;height:28px;border-radius:50%;background:var(--dark);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-right:10px">' + (s[0]||'?') + '</div>' +
            '<div style="flex:1;font-size:12px;font-weight:700;color:var(--dark)">' + s + '</div>' +
            '<div style="text-align:right">' +
              '<div style="font-size:12px;font-weight:700;color:var(--dark)">' + Math.round(byStaff[s].rev/10000).toLocaleString() + '만원</div>' +
              '<div style="font-size:11px;color:var(--sub)">' + byStaff[s].count + '건</div>' +
            '</div>' +
          '</div>';
        }).join('');
        return rows ? (
          '<div style="background:#fff;border-bottom:1px solid var(--border)">' +
            '<div style="padding:14px 20px 10px">' +
              '<span style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;text-transform:uppercase">담당자별 성과</span>' +
            '</div>' + rows +
          '</div>'
        ) : '';
      })(),

    ].join('');

    // 목표 달성률 바 업데이트
    if (typeof renderGoalProgress === 'function') renderGoalProgress(thisMonthRev);

    applyPermissions();
  });
}

function renderEstList() {
  var body = document.getElementById('est-list-body');
  var cntEl = document.getElementById('est-list-count');
  if (!body) return;
  body.innerHTML = '';

  var all = [];
  try { all = JSON.parse(localStorage.getItem('dah_saved') || '[]'); } catch(e) {}

  var q = (document.getElementById('est-search')?.value || '').trim();
  var list = q
    ? all.filter(function(e){ return (e.clientName||'').indexOf(q)>=0 || (e.no||'').indexOf(q)>=0; })
    : all;

  if (cntEl) cntEl.textContent = '총 ' + list.length + '건';

  var CONTRACT_KO = {pending:'가견적', contracted:'계약됨', rejected:'미계약'};
  var CONTRACT_COLOR = {pending:'#9A9490', contracted:'#2E7D6B', rejected:'#C0392B'};
  var STATUS_KO = {ga:'가견적서', final:'최종견적서'};

  if (list.length === 0) {
    body.innerHTML = '<div class="empty-state"><span class="empty-state-emoji">📋</span><div class="empty-state-title">저장된 견적서가 없습니다</div><div class="empty-state-desc">견적서 앱에서 견적서를 작성하고 저장하면 여기에 표시됩니다</div></div>';
    return;
  }

  var card = el('div', {class:'card'});
  var hd = el('div', {class:'card-head'});
  var hdRow = el('div', {class:'card-head-row'});
  var lbl = el('span', {class:'card-title'}); lbl.textContent = '견적서 목록';
  var cnt = el('span', {class:'card-count'}); cnt.textContent = list.length + '건';
  hdRow.appendChild(lbl); hdRow.appendChild(cnt);
  hd.appendChild(hdRow); card.appendChild(hd);

  list.forEach(function(e, i) {
    var isLast = i === list.length - 1;
    var cs = e.contractStatus || 'pending';
    var isFinal = e.status === 'final';

    var row = el('div', {style:
      'padding:12px 16px;border-bottom:' + (isLast?'none':'1px solid #EEE6DC') + ';' +
      'cursor:pointer;transition:background 0.12s'
    });
    row.addEventListener('mouseover', function(){ this.style.background='#FAF7F5'; });
    row.addEventListener('mouseout',  function(){ this.style.background=''; });

    // 상단 행: 번호 + 유형 + 계약상태
    var top = el('div', {style:'display:flex;align-items:center;gap:6px;margin-bottom:6px'});

    var noSpan = el('span', {style:'font-size:12px;font-weight:700;color:#282828'});
    noSpan.textContent = e.no || '—';

    var typeTag = el('span', {style:
      'font-size:12px;font-weight:700;padding:2px 6px;border-radius:4px;' +
      'background:' + (isFinal?'#282828':'#F5F2EE') + ';' +
      'color:' + (isFinal?'#fff':'#9A9490')
    });
    typeTag.textContent = STATUS_KO[e.status] || '가견적서';

    var csBadge = el('span', {style:
      'margin-left:auto;font-size:12px;font-weight:700;padding:2px 8px;border-radius:4px;' +
      'background:' + (cs==='contracted'?'#EEF5F2':cs==='rejected'?'#FDECEA':'#F5F2EE') + ';' +
      'color:' + CONTRACT_COLOR[cs]
    });
    csBadge.textContent = CONTRACT_KO[cs] || '가견적';

    top.appendChild(noSpan); top.appendChild(typeTag); top.appendChild(csBadge);

    // 중간 행: 고객명 + 금액
    var mid = el('div', {style:'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px'});
    var nameEl = el('span', {style:'font-size:12px;font-weight:700;color:#282828'});
    nameEl.textContent = e.clientName || '—';
    var priceEl = el('span', {style:'font-size:11px;font-weight:800;color:#282828;letter-spacing:-0.5px'});
    priceEl.textContent = (Number(e.price)||0).toLocaleString() + '원';
    mid.appendChild(nameEl); mid.appendChild(priceEl);

    // 하단 행: 공간 + 원단 + 날짜
    var bot = el('div', {style:'font-size:11px;color:#9A9490;display:flex;gap:8px;flex-wrap:wrap'});
    if (e.space) { var s1=el('span'); s1.textContent=e.space; bot.appendChild(s1); }
    if (e.fabric) { var s2=el('span',{style:'color:var(--light)'}); s2.textContent=e.fabric; bot.appendChild(s2); }
    var dateStr = e.savedAt ? e.savedAt.slice(0,10) : (e.date||'');
    if (dateStr) { var s3=el('span',{style:'margin-left:auto'}); s3.textContent=dateStr; bot.appendChild(s3); }

    row.appendChild(top); row.appendChild(mid); row.appendChild(bot);

    // 빠른 액션 버튼 행
    var actions = el('div', {style:'display:flex;gap:6px;margin-top:8px'});
    var kakaoBtn2 = el('button', {style:'flex:1;padding:6px 0;background:#FAE100;color:#3C1E1E;border:none;border-radius:5px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer'});
    kakaoBtn2.textContent = '📋 카카오 복사';
    (function(est){ kakaoBtn2.addEventListener('click', function(ev){
      ev.stopPropagation();
      var text = '[드로잉엣홈] ' + (est.clientName||'') + '님 견적서 (' + (est.no||'') + ')\n금액: ' + (Number(est.price)||0).toLocaleString() + '원\n공간: ' + (est.space||'') + '\n원단: ' + (est.fabric||'');
      navigator.clipboard.writeText(text).then(function(){ showToast('카카오톡에 붙여넣기 하세요 🙂'); }).catch(function(){ showToast('복사됐습니다'); });
    }); })(e);

    var openBtn2 = el('button', {style:'flex:1;padding:6px 0;background:#282828;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer'});
    openBtn2.textContent = '📄 견적서 앱';
    (function(clientN){ openBtn2.addEventListener('click', function(ev){
      ev.stopPropagation();
      openEstimate(clientN);
    }); })(e.clientName);

    actions.appendChild(kakaoBtn2); actions.appendChild(openBtn2);
    row.appendChild(actions);

    // 클릭 시 고객 상세
    (function(name){ row.addEventListener('click', function(){ if(name) openDetail(name); }); })(e.clientName);

    card.appendChild(row);
  });

  body.appendChild(card);
}

/** @param {Array} customers 고객 목록 */
function renderSearch() {
  var allLoaded = loadCustomers();
  var all = (currentUser && currentUser.role === 'staff') ? allLoaded.filter(function(c) { return (c.staffName||'마스터') === currentUser.name; }) : allLoaded;
  var q = (document.getElementById('cust-search').value || '').trim();
  var showArchived = document.getElementById('show-archived')?.checked || false;
  var filtered = q
    ? all.filter(function(c) { return searchMatch(c, q); })
    : all.slice().reverse();
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
    var dateEl  = el('div', {style:'font-size:11px;color:var(--sub);margin-top:4px;text-align:right'});
    if (c.date) {
      var diff = daysDiff(c.date);
      dateEl.textContent = diff === 0 ? '오늘' : diff > 0 ? diff+'일 경과' : Math.abs(diff)+'일 후';
    }

    right.appendChild(priceEl); right.appendChild(stageEl); right.appendChild(dateEl);
    row.appendChild(left); row.appendChild(right);
    (function(name) { row.addEventListener('click', function() { openDetail(name); }); })(c.clientName);
    listEl.appendChild(row);
  });
}
