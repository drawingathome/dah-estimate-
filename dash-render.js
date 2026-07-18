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
function renderHome(skipServerFetch) {
  var wrap = document.getElementById('home');
  if (!wrap) return;

  var _today = new Date();
  var _dowKo = ['일','월','화','수','목','금','토'][_today.getDay()]+'요일';
  var _month = _today.getMonth() + 1;
  var _date  = _today.getDate();
  var _year  = _today.getFullYear();

  // skipServerFetch=true: 방금 로컬(localStorage)을 이미 최신으로 갱신한 직후 호출되는 경우
  // (고객 등록/수정/삭제 직후). 이때 서버 재조회를 하면, 저장 요청(POST/PATCH)이 아직
  // 서버에 반영되기 전에 조회 응답이 먼저 와서 "방금 한 작업이 없던 옛날 상태"로
  // 로컬을 덮어써버리는 경쟁조건이 생길 수 있어 방지함. 이미 로컬이 최신이므로 그대로 사용.
  var doRender = function(customers) {
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
    // "계약금/잔금 단계" 조건과 "발주 시작 안 됨" 조건을 하나의 목록으로 통합.
    // (선혜님 피드백으로 별도 카드를 만들었다가, 두 조건이 겹치는 고객이 화면에
    // 중복으로 나타나는 문제를 발견해 하나로 병합함 — 각 항목에 이유를 표시)
    var ORDER_STAGES_FOR_ACTION = ['계약금', '실측', '잔금', '시공'];
    var needActionMap = {};
    customers.forEach(function(c) {
      var reasons = [];
      if (c.stage === '계약금' || c.stage === '잔금') reasons.push(c.stage + ' 처리');
      if (ORDER_STAGES_FOR_ACTION.indexOf(c.stage) >= 0) {
        var os = c.orderStatus || {};
        if (!os.fabric && !os.production && !os.blind && !os.material && !os.install) reasons.push('발주 필요');
      }
      if (reasons.length > 0) needActionMap[c.clientName] = { customer: c, reasons: reasons };
    });
    var needAction = Object.keys(needActionMap).map(function(k) { return needActionMap[k]; });

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

      // 2. 목표 및 이달 현황 (목표달성률 + KPI 3분할을 하나의 섹션으로 병합)
      '<div id="sec-goal" style="background:#fff;border-bottom:1px solid var(--border)">',
        '<div style="padding:12px 20px">',
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">',
            '<span style="font-size:12px;font-weight:600;color:var(--sub)">이달 목표 달성률</span>',
            '<span style="font-size:12px;font-weight:700;color:' + (isOver ? '#2E7D32' : 'var(--terra)') + '">' + pct + '% <span style="font-size:12px;font-weight:400;color:var(--sub)">/ ' + goalWan.toLocaleString() + '만원</span></span>',
          '</div>',
          '<div style="background:var(--ivory2);border-radius:6px;height:8px;overflow:hidden">',
            '<div style="height:100%;border-radius:6px;width:' + pct + '%;background:' + (isOver ? 'linear-gradient(90deg,#2E7D32,#43A047)' : 'linear-gradient(90deg,var(--terra),var(--orange))') + ';transition:width 0.8s cubic-bezier(0.4,0,0.2,1)"></div>',
          '</div>',
        '</div>',
        '<div id="sec-kpi" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--border);border-top:1px solid var(--border)">',
          '<div style="background:#fff;padding:14px 20px">',
            '<div style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;margin-bottom:6px;text-transform:uppercase">이달 매출</div>',
            '<div style="font-size:26px;font-weight:700;color:var(--dark);line-height:1">' + Math.round(thisMonthRev/10000).toLocaleString() + '<span style="font-size:12px;font-weight:400;color:var(--sub)">만원</span></div>',
          '</div>',
          '<div style="background:#fff;padding:14px 20px">',
            '<div style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;margin-bottom:6px;text-transform:uppercase">진행 건수</div>',
            '<div style="font-size:26px;font-weight:700;color:var(--dark);line-height:1">' + thisMonthContracts + '<span style="font-size:12px;font-weight:400;color:var(--sub)">건</span></div>',
          '</div>',
          '<div style="background:#fff;padding:14px 20px">',
            '<div style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;margin-bottom:6px;text-transform:uppercase">전체 고객</div>',
            '<div style="font-size:26px;font-weight:700;color:var(--dark);line-height:1">' + customers.length + '<span style="font-size:12px;font-weight:400;color:var(--sub)">명</span></div>',
          '</div>',
        '</div>',
      '</div>',

      // 3. 스테이지 현황 칩
      '<div id="sec-stage" style="background:#fff;padding:14px 20px 12px;border-bottom:1px solid var(--border)">',
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

      // 4. 지금 챙길 것 (처리필요 + 오늘/내일 일정을 하나로 병합)
      '<div id="sec-todo" style="background:#fff;border-bottom:1px solid var(--border)">',
        '<div style="padding:14px 20px 10px;display:flex;align-items:center;justify-content:space-between">',
          '<span style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;text-transform:uppercase">처리 필요</span>',
          needAction.length > 0 ? '<span style="font-size:12px;font-weight:700;color:var(--terra);background:var(--bg-org);padding:2px 8px;border-radius:10px">' + needAction.length + '건</span>' : '',
        '</div>',
        needAction.length === 0
          ? '<div class="empty-inline">처리 필요한 항목이 없습니다 ✅</div>'
          : needAction.slice(0,8).map(function(item) {
              var c = item.customer;
              var stageColor = (c.stage === '계약금' || c.stage === '실측') ? 'var(--terra)' : 'var(--dark)';
              var targetTab = 'info';
              var reasonStr = item.reasons.join(' ');
              if (reasonStr.indexOf('계약금 처리') >= 0 || reasonStr.indexOf('잔금 처리') >= 0) targetTab = 'pay';
              else if (reasonStr.indexOf('발주 필요') >= 0) targetTab = 'order';
              return '<div data-cname="' + escHtml((c.clientName||'').replace(/"/g,'')) + '" data-cid="' + escHtml(c.id||'') + '" data-tab="' + targetTab + '" onclick="openDetail(this.getAttribute(\'data-cname\'),this.getAttribute(\'data-cid\')||undefined,this.getAttribute(\'data-tab\'))" ' +
                'style="padding:12px 20px;border-top:1px solid var(--ivory2);display:flex;align-items:center;gap:12px;cursor:pointer"><div style="width:6px;height:6px;border-radius:50%;background:' + stageColor + ';flex-shrink:0"></div>' +
                '<div style="flex:1;min-width:0">' +
                  '<div style="font-size:12px;font-weight:700;color:var(--dark);overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + escHtml(c.clientName||'') + '</div>' +
                  '<div style="font-size:11px;color:var(--sub);margin-top:2px">' + escHtml(c.phone||'') + '</div>' +
                '</div>' +
                '<span style="font-size:11px;font-weight:700;color:' + stageColor + ';flex-shrink:0;text-align:right">' + item.reasons.map(escHtml).join('<br>') + '</span>' +
              '</div>';
            }).join(''),
        '<div style="padding:12px 20px 10px;border-top:1px solid var(--border);margin-top:2px">',
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

      // 5. 담당자별 성과 (마스터 전용, 기본 접힘 — 펼쳐진 섹션 개수에 안 잡히도록)
      (function() {
        if (!currentUser || currentUser.role !== 'master') return '';
        var byStaff = {};
        customers.forEach(function(c) {
          var s = c.staffName || '미지정';
          if (!byStaff[s]) byStaff[s] = { count: 0, rev: 0 };
          byStaff[s].count++;
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
          '<div id="sec-staff-perf" style="background:#fff;border-bottom:1px solid var(--border)">' +
            '<div style="padding:14px 20px;display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="toggleHomeAccordion(this)">' +
              '<span style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;text-transform:uppercase">담당자별 성과</span>' +
              '<span style="font-size:11px;color:#B0A99F">▸</span>' +
            '</div>' +
            '<div style="display:none">' + rows + '</div>' +
          '</div>'
        ) : '';
      })(),

    ].join('');

    // 목표 달성률 바 업데이트
    if (typeof renderGoalProgress === 'function') renderGoalProgress(thisMonthRev);

    applyPermissions();

    // 빠른이동 내비게이션 (PC 전용)
    if (typeof renderQuickNav === 'function') {
      var homeNavItems = [
        {id:'sec-goal', label:'목표·현황'},
        {id:'sec-stage', label:'진행현황'},
        {id:'sec-todo', label:'지금챙길것'}
      ];
      if (currentUser && currentUser.role === 'master' && document.getElementById('sec-staff-perf')) {
        homeNavItems.push({id:'sec-staff-perf', label:'담당자성과'});
      }
      renderQuickNav(homeNavItems);
    }
  };

  if (skipServerFetch) {
    doRender(loadCustomers());
  } else {
    loadCustomersAsync(doRender);
  }
}

// 홈 화면 접이식 섹션(담당자별 성과 등) 토글 — 헤더 클릭시 바로 아래 형제 요소를 펼침/접음
function toggleHomeAccordion(headerEl) {
  var body = headerEl.nextElementSibling;
  if (!body) return;
  var arrow = headerEl.querySelector('span:last-child');
  var isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.textContent = isOpen ? '▸' : '▾';
}

