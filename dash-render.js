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


// 홈 화면 "처리 필요" 목록에서 오래된 리드를 "대기 중인 리드"로 보관 처리
// (2026-08-02 신규) — 삭제가 아니라, 목록만 정리하고 고객목록에서는 계속 찾을 수 있음.
function parkLeadFromHome(btnEl) {
  var cname = btnEl.getAttribute('data-cname');
  var cid = btnEl.getAttribute('data-cid');
  var all = loadCustomers();
  var target = cid ? all.find(function(c){ return String(c.id) === cid; }) : all.find(function(c){ return c.clientName === cname; });
  if (!target) return;
  if (!confirm(cname + ' 고객을 "대기 중인 리드"로 보관할까요? (고객목록에서는 계속 찾아볼 수 있어요)')) return;
  target.leadParked = true;
  saveCustomers(all);
  parkLead(target, function() {
    renderHome();
    showToast(cname + ' 님을 대기 중인 리드로 보관했어요');
  });
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
    // 스태프 권한 필터 (2026-08-04 추가) — 고객목록/매출탭엔 있는데 홈 화면만
    // 빠져있어서, 스태프 계정에도 전체(다른 담당자 포함) 통계가 보이던 권한 누락
    if (currentUser && currentUser.role === 'staff') {
      customers = customers.filter(function(c) { return (c.staffName||'마스터') === currentUser.name; });
    }
    customers = customers.filter(function(c){ return !isSoftDeleted(c); });

    // ── 이달 매출 계산 ──────────────────────────────
    // 목표 달성률은 순수 실적매출(제품가격만, 실측비/시공비/레일비 등 제외) 기준으로 계산.
    // 선금/잔금이 서로 다른 달에 입금되면 각각의 입금월에 비율대로 반영됨(2026-07-20 통일).
    var _thisMonthKey = _year + '-' + String(_today.getMonth()+1).padStart(2,'0');
    var thisMonthRev = typeof getMonthPerformanceRevenue === 'function'
      ? getMonthPerformanceRevenue(customers, _thisMonthKey)
      : 0;
    // 2026-08-28(선혜님 지시 — "이번달 매출은 실장님의 인센매출_제품매출만
    // 되어야 해, 오늘이 8월 28일이라면 이번달 매출은 7월 31일까지의
    // 제품매출이 되어야 하고 현재 매출은 8월 28일까지의 제품매출이 되어야
    // 해 이거는 마스터도 동일해"): 용어를 명확히 나눔 —
    //   "현재 매출" = 이번달(진행중인 달) 1일부터 오늘까지 누적(위 thisMonthRev,
    //                기존 "이달 매출"과 같은 계산, 이름만 명확히 함)
    //   "이번달 매출" = 직전에 마감된 달(예: 오늘이 8/28이면 7월 전체) 확정
    //                  실적 - 아직 진행 중인 이번달과 섞이지 않는 "마감된
    //                  지난달 총 제품매출"
    // 둘 다 제품매출(perf)만 집계하는 getMonthPerformanceRevenue를 그대로
    // 재사용 - 마스터/스태프 모두 이 화면 자체가 이미 스태프면 본인담당만
    // 필터링된 customers를 쓰므로 자동으로 동일 기준 적용됨.
    var _prevMonthDate = new Date(_year, _today.getMonth()-1, 1);
    var _prevMonthKey = _prevMonthDate.getFullYear() + '-' + String(_prevMonthDate.getMonth()+1).padStart(2,'0');
    var lastMonthRev = typeof getMonthPerformanceRevenue === 'function'
      ? getMonthPerformanceRevenue(customers, _prevMonthKey)
      : 0;
    var thisMonthContracts = customers.filter(function(c) {
      return ['선금결제','실측준비중','확정견적','잔금결제','시공준비중'].indexOf(c.stage) >= 0;
    }).length;
    // 2026-08-28(선혜님 지시 - "3번만 지우고 나머지는 살려보자"):
    // getMonthContractCount(이번달 계약일 기준 신규 건수)가 계산은 되는데
    // 화면 어디에도 안 보이던 걸 되살림 - "진행 건수"(현재 스냅샷)와는
    // 다른 개념(이번달 신규 계약)이라 카드를 새로 안 늘리고 그 아래
    // 작은 글씨로 곁들임.
    var thisMonthNewContracts = typeof getMonthContractCount === 'function'
      ? getMonthContractCount(customers, _thisMonthKey)
      : 0;

    // ── 목표 설정 ────────────────────────────────────
    var s = typeof getSettings === 'function' ? getSettings() : {};
    var goalWan = parseInt((s.monthlyGoal || '5000').replace(/[^0-9]/g,'')) || 5000;
    var goalAmt = goalWan * 10000;
    var pct = goalAmt > 0 ? Math.min(Math.round(thisMonthRev / goalAmt * 100), 100) : 0;
    var remain = Math.max(0, goalAmt - thisMonthRev);
    var isOver = thisMonthRev >= goalAmt && goalAmt > 0;

    // ── 스테이지별 카운트 ────────────────────────────
    var stageCounts = {};
    ['방문예약','상담','가견적','선금결제','실측준비중','확정견적','잔금결제','시공준비중','시공완료'].forEach(function(s) { stageCounts[s] = 0; });
    customers.forEach(function(c) { if (stageCounts[c.stage] !== undefined) stageCounts[c.stage]++; });

    // ── 처리 필요 항목 ───────────────────────────────
    // "계약금/잔금 단계" 조건과 "발주 시작 안 됨" 조건을 하나의 목록으로 통합.
    // (선혜님 피드백으로 별도 카드를 만들었다가, 두 조건이 겹치는 고객이 화면에
    // 중복으로 나타나는 문제를 발견해 하나로 병합함 — 각 항목에 이유를 표시)
    // 2026-07-20 추가: "상담" 단계에서 오래 진행 없는 고객(놓친 리드)도 여기 포함.
    // 기준은 7일로 우선 정함 — 필요하면 조정 가능.
    var LEAD_STALE_DAYS = (typeof getLeadStaleDays === 'function') ? getLeadStaleDays() : 7;
    // 2026-08-06 수정: 발주는 실측이 끝나고 사이즈가 확정된 뒤(확정견적~)에나 의미가
    // 있음 — 선금결제/실측준비중 단계는 아직 실측 전이라 뭘 발주할지 알 수도 없는데
    // "발주 필요"가 뜨던 버그(선혜님이 실제로 발견: "실측만 해야 하는데 발주만 뜬다").
    var ORDER_STAGES_FOR_ACTION = ['확정견적', '잔금결제', '시공준비중'];
    var needActionMap = {};
    customers.forEach(function(c) {
      var reasons = [];
      // 2026-08-06 수정: "선금결제 단계에 있으면 무조건 결제처리 필요"가 아니라
      // "실제로 입금이 안 됐을 때만" 뜨도록 변경 — 이미 입금 다 받고 실측 일정까지
      // 잡아놨는데도(선혜님 실데이터로 확인: 구정화/현은지/문혜자 전부 입금액 있음)
      // 계속 "결제처리 필요"로 잘못 뜨던 버그.
      if (c.stage === '선금결제' && !(Number(c.depositAmount) > 0)) reasons.push('선금결제 처리');
      if (c.stage === '잔금결제' && !(Number(c.balanceAmount) > 0)) reasons.push('잔금결제 처리');
      // 2026-08-28(선혜님 요청 - "잔금 리마인더", "다음단계 하자"): 위
      // 두 줄은 딱 그 단계에 있을 때만 걸림 - 그 단계를 지나쳐서
      // 실측준비중/확정견적/시공준비중/시공완료까지 진행됐는데도 여전히
      // 다 못 받은 경우는 못 잡고 있었음. getUnpaidAmount 공용함수로
      // "결제가 진행된 어느 단계든 아직 미수금이 있으면" 놓치지 않게 함.
      // 위 두 항목과 중복돼도 무방(reasons는 Set이 아니라 배열이라
      // 그대로 두 줄 다 뜰 수 있음 - 어차피 아래에서 "결제 처리" 카테고리로
      // 하나로 묶여 표시되므로 사용자에게 중복으로 안 보임).
      var unpaidHere = (typeof getUnpaidAmount === 'function') ? getUnpaidAmount(c) : 0;
      if (unpaidHere > 0 && c.stage !== '선금결제' && c.stage !== '잔금결제') {
        reasons.push('미수금 ' + unpaidHere.toLocaleString() + '원');
      }
      if (ORDER_STAGES_FOR_ACTION.indexOf(c.stage) >= 0) {
        // 2026-07-21 수정: 예전엔 "5개 항목 전부 미체크"일 때만 발주필요로 떴는데,
        // 하나라도 체크하면 나머지를 깜빡해도 목록에서 사라지는 심각한 버그였음.
        // 이제 "관련 있는 항목 중 하나라도 안 끝난 게 있으면" 정확히 감지함.
        if (typeof hasIncompleteOrder === 'function' && hasIncompleteOrder(c)) reasons.push('발주 필요');
        // 2026-08-06: 견적서는 있는데 품목데이터가 비어서(우사랑님 케이스) 조용히
        // "발주할 거 없음"으로 판단돼 처리필요에서 사라지던 문제 — 선혜님이 실제로
        // 발견함("처리필요가 다시 입력해야 뜬다는 게 이상하다"). 데이터가 없어서
        // 판단 자체가 불가능한 경우는 별도 이유로 계속 표시해서 놓치지 않게 함.
        else if (typeof hasOrderDataGap === 'function' && hasOrderDataGap(c)) reasons.push('발주정보 확인 필요(견적서 재입력 필요)');
      }
      if (['방문예약','상담','가견적'].indexOf(c.stage) >= 0 && c.date && !c.leadParked) {
        var daysSince = Math.floor((_today - new Date(c.date)) / (1000*60*60*24));
        if (daysSince >= LEAD_STALE_DAYS) reasons.push(c.stage + ' 후 ' + daysSince + '일째 진행없음');
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
      '<div id="sec-hero" style="padding:16px 20px 12px;border-bottom:1px solid var(--border);background:#fff">',
        '<div style="font-size:11px;color:var(--sub);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;letter-spacing:0.06em;margin-bottom:var(--sp-1)">',
          _year + '. ' + _month + '. ' + _date + ' ' + _dowKo,
        '</div>',
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">',
          '<div style="font-size:36px;font-weight:700;color:var(--dark);min-width:0;flex:1">',
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
            '<span style="font-size:12px;font-weight:700;color:' + (isOver ? '#2F6690' : 'var(--terra)') + '">' + pct + '% <span style="font-size:12px;font-weight:400;color:var(--sub)">/ ' + goalWan.toLocaleString() + '만원</span></span>',
          '</div>',
          '<div style="background:var(--ivory2);border-radius:6px;height:8px;overflow:hidden">',
            '<div style="height:100%;border-radius:6px;width:' + pct + '%;background:' + (isOver ? 'linear-gradient(90deg,#2F6690,#4A85AC)' : 'linear-gradient(90deg,var(--terra),var(--orange))') + ';transition:width 0.8s cubic-bezier(0.4,0,0.2,1)"></div>',
          '</div>',
        '</div>',
        '<div id="sec-kpi" style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border-top:1px solid var(--border)">',
          '<div style="background:#fff;padding:14px 20px">',
            '<div style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;margin-bottom:6px;text-transform:uppercase">현재 매출</div>',
            '<div style="font-size:26px;font-weight:700;color:var(--dark);line-height:1">' + Math.round(thisMonthRev/10000).toLocaleString() + '<span style="font-size:12px;font-weight:400;color:var(--sub)">만원</span></div>',
          '</div>',
          '<div style="background:#fff;padding:14px 20px">',
            '<div style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;margin-bottom:6px;text-transform:uppercase">이번달 매출(전월 마감)</div>',
            '<div style="font-size:26px;font-weight:700;color:var(--dark);line-height:1">' + Math.round(lastMonthRev/10000).toLocaleString() + '<span style="font-size:12px;font-weight:400;color:var(--sub)">만원</span></div>',
          '</div>',
          '<div style="background:#fff;padding:14px 20px">',
            '<div style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;margin-bottom:6px;text-transform:uppercase">진행 건수</div>',
            '<div style="font-size:26px;font-weight:700;color:var(--dark);line-height:1">' + thisMonthContracts + '<span style="font-size:12px;font-weight:400;color:var(--sub)">건</span></div>',
            '<div style="font-size:10px;color:var(--sub);margin-top:2px">이번달 신규계약 ' + thisMonthNewContracts + '건</div>',
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
        '<div style="display:flex;gap:6px;flex-wrap:wrap">',
          ['방문예약','상담','가견적','선금결제','실측준비중','확정견적','잔금결제','시공준비중','시공완료'].map(function(stage) {
            var cnt = stageCounts[stage] || 0;
            var isGray = ['방문예약','상담','가견적'].indexOf(stage) >= 0;
            var isGreen = stage === '시공완료';
            var bg    = isGray ? '#F0EFEC' : isGreen ? '#EAF3F0' : 'var(--bg-org)';
            var color = isGray ? '#8A8378' : isGreen ? '#2F6690' : 'var(--terra)';
            var bdr   = isGray ? '#8A8378' : isGreen ? '#2F6690' : 'var(--terra)';
            return '<div style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:var(--r-btn);border:1.5px solid ' + bdr + ';background:' + bg + '">' +
              '<span style="font-size:11px;font-weight:800;color:' + color + ';line-height:1">' + cnt + '</span>' +
              '<span style="font-size:12px;font-weight:600;color:' + color + '">' + stage + '</span>' +
            '</div>';
          }).join(''),
        '</div>',
      '</div>',

      // 2026-08-31(선혜님 지적 - "보기 편한 구도인거 같니??"로 발견):
      // sec-todo/sec-staff-perf 각각에 grid-row를 지정하니, 왼쪽 컬럼
      // (3개 행)과 grid 행을 공유하게 되어 서로의 높이에 영향을 줌 -
      // 오른쪽 두 섹션을 wrapper 하나로 감싸서, 이 wrapper 자체만
      // grid 2열에 배치하고 내부는 일반 흐름(세로로 자연스럽게 쌓임)을
      // 쓰게 함 - 왼쪽 컬럼과 완전히 독립적으로 높이가 정해짐.
      '<div id="home-right-col">',

      // 4. 지금 챙길 것 (처리필요 + 오늘/내일 일정을 하나로 병합)
      '<div id="sec-todo" style="background:#fff;border-bottom:1px solid var(--border)">',
        '<div style="padding:14px 20px 10px;display:flex;align-items:center;justify-content:space-between">',
          '<span style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;text-transform:uppercase">처리 필요</span>',
          needAction.length > 0 ? '<span style="font-size:12px;font-weight:700;color:var(--terra);background:var(--bg-org);padding:2px 8px;border-radius:10px">' + needAction.length + '건</span>' : '',
        '</div>',
        needAction.length === 0
          ? '<div class="empty-inline">처리 필요한 항목이 없습니다 <svg width="13" height="13" viewBox="0 0 20 20" style="vertical-align:-2px"><circle cx="10" cy="10" r="10" fill="#2F6690"/><path d="M6 10l3 3 5-6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
          : (function(){
              // 2026-08-06: 사유별로 그룹화(결제처리/발주필요/리드팔로업) — 선혜님 요청.
              // 예전엔 다 섞인 flat 목록이라 "지금 결제처리부터 몰아서 하고 싶다" 같은
              // 작업이 어려웠음. 한 고객이 여러 사유에 해당하면(예: 선금결제 처리 +
              // 발주 필요 둘 다) 해당하는 그룹에 각각 나타남 — 그룹별로 그 사유만 표시.
              function renderRow(c, reasonText, targetTab, showParkBtn) {
                var stageColor = (['방문예약','상담','가견적'].indexOf(c.stage) >= 0) ? '#8A8378' : (c.stage === '시공완료') ? '#2F6690' : 'var(--terra)';
                // 2026-08-28(선혜님 지시 - "3번만 지우고 나머지는 살려보자"):
                // parkLeadFromHome(홈화면에서 바로 리드를 "대기중"으로 보관
                // 처리하는 기능, 2026-08-02 신규)이 UI 연결이 끊겨서 죽은
                // 코드로 남아있던 걸 되살림 - 리드 팔로업 항목에만 "보관"
                // 버튼을 추가.
                var parkBtnHtml = showParkBtn
                  ? '<button data-cname="' + escHtml((c.clientName||'').replace(/"/g,'')) + '" data-cid="' + escHtml(c.id||'') + '" onclick="event.stopPropagation();parkLeadFromHome(this)" ' +
                    'style="flex-shrink:0;padding:5px 10px;min-height:28px;background:#fff;border:1px solid var(--border);border-radius:8px;font-size:10px;font-weight:700;color:var(--sub);cursor:pointer;font-family:inherit">보관</button>'
                  : '';
                return '<div data-cname="' + escHtml((c.clientName||'').replace(/"/g,'')) + '" data-cid="' + escHtml(c.id||'') + '" data-tab="' + targetTab + '" onclick="openDetail(this.getAttribute(\'data-cname\'),this.getAttribute(\'data-cid\')||undefined,this.getAttribute(\'data-tab\'))" ' +
                  'style="padding:10px 20px;border-top:1px solid var(--ivory2);display:flex;align-items:center;gap:var(--sp-3);cursor:pointer"><div style="width:6px;height:6px;border-radius:50%;background:' + stageColor + ';flex-shrink:0"></div>' +
                  '<div style="flex:1;min-width:0">' +
                    '<div style="display:flex;align-items:center;gap:6px">' +
                      '<span style="font-size:12px;font-weight:700;color:var(--dark);overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + escHtml(c.clientName||'') + '</span>' +
                      '<span style="font-size:10px;font-weight:700;color:' + stageColor + ';background:' + (stageColor==='var(--terra)'?'var(--bg-org)':'#F0F0F0') + ';padding:1px 6px;border-radius:6px;flex-shrink:0">' + escHtml(c.stage||'') + '</span>' +
                    '</div>' +
                    '<div style="font-size:11px;color:var(--sub);margin-top:2px">' + escHtml(c.phone||'') + '</div>' +
                  '</div>' +
                  '<span style="font-size:11px;font-weight:700;color:' + stageColor + ';flex-shrink:0;text-align:right">' + escHtml(reasonText) + '</span>' +
                  parkBtnHtml +
                  '<span style="color:var(--sub);font-size:14px;flex-shrink:0">›</span>' +
                '</div>';
              }
              var groups = [
                { title: '결제 처리', test: function(r){ return r.indexOf('선금결제 처리')>=0 || r.indexOf('잔금결제 처리')>=0 || r.indexOf('미수금')>=0; }, tab: 'pay' },
                { title: '발주 필요', test: function(r){ return r.indexOf('발주 필요')>=0 || r.indexOf('발주정보 확인 필요')>=0; }, tab: 'order' },
                { title: '리드 팔로업', test: function(r){ return r.indexOf('진행없음')>=0; }, tab: 'info', park: true }
              ];
              return groups.map(function(g){
                var rows = [];
                needAction.forEach(function(item){
                  item.reasons.forEach(function(r){
                    if (g.test(r)) rows.push(renderRow(item.customer, r, g.tab, g.park));
                  });
                });
                if (rows.length === 0) return '';
                return '<div style="padding:8px 20px 2px;background:var(--ivory1)"><span style="font-size:11px;font-weight:700;color:var(--sub)">' + g.title + ' ' + rows.length + '건</span></div>' + rows.join('');
              }).join('');
            })(),
        '<div style="padding:12px 20px 10px;border-top:1px solid var(--border);margin-top:2px">',
          '<span style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;text-transform:uppercase">오늘/내일 일정</span>',
        '</div>',
        (todaySchedule.length === 0 && tomorrowSchedule.length === 0)
          ? '<div class="empty-inline">예정된 일정이 없습니다</div>'
          : [].concat(
              todaySchedule.map(function(c) {
                var type = c.measureDate === todayStr ? '실측' : c.installDate === todayStr ? '시공' : '방문';
                var targetTab2 = (type === '실측' || type === '시공') ? 'order' : 'info';
                return '<div data-cname="' + escHtml((c.clientName||'').replace(/"/g,'')) + '" data-cid="' + escHtml(c.id||'') + '" data-tab="' + targetTab2 + '" onclick="openDetail(this.getAttribute(\'data-cname\'),this.getAttribute(\'data-cid\')||undefined,this.getAttribute(\'data-tab\'))" ' +
                  'style="padding:12px 20px;border-top:1px solid var(--ivory2);display:flex;align-items:center;gap:var(--sp-3);cursor:pointer">' +
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
                var targetTab3 = (type === '실측' || type === '시공') ? 'order' : 'info';
                return '<div data-cname="' + escHtml((c.clientName||'').replace(/"/g,'')) + '" data-cid="' + escHtml(c.id||'') + '" data-tab="' + targetTab3 + '" onclick="openDetail(this.getAttribute(\'data-cname\'),this.getAttribute(\'data-cid\')||undefined,this.getAttribute(\'data-tab\'))" ' +
                  'style="padding:12px 20px;border-top:1px solid var(--ivory2);display:flex;align-items:center;gap:var(--sp-3);cursor:pointer">' +
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
      // 2026-07-20: 예전엔 월 구분 없이 전체 누적이라 인센티브 정산에 못 썼음.
      // 이제 "이번달" 입금(선금/잔금) 기준으로 집계 — 매달 정산 가능하도록 수정.
      // 2026-08-31(선혜님 지적 — "9월이 됐는데 8월분 매출은 보여야 인센을
      // 정리할 수 있는데 왜 안되지"): 이 섹션이 "이번달"(_thisMonthKey)만
      // 계산하고 있어서, 매달 1일에 열어보면 항상 0에 가까운 이번달 것만
      // 보이고 정작 인센티브 정산에 필요한 "방금 마감된 지난달" 실적은
      // 볼 방법이 아예 없었음 - "이번달/지난달" 토글 추가.
      (function() {
        if (!currentUser || currentUser.role !== 'master') return '';
        var staffPerfMonthKey = (window._staffPerfViewMode === 'prev') ? _prevMonthKey : _thisMonthKey;
        var byStaff = typeof getMonthStaffPerformance === 'function'
          ? getMonthStaffPerformance(customers, staffPerfMonthKey)
          : {};
        // 2026-08-28(선혜님 요청 — "담당자별 실적 비교"): 오늘 만든 공용
        // 뱃지함수(renderStaffBadge, dash-utils.js)로 통일(체크리스트
        // 24번 - 이 화면만 따로 하드코딩된 뱃지를 쓰고 있었음), 매출
        // 큰 순서로 정렬해서 한눈에 비교되게 함.
        var staffNames = Object.keys(byStaff).sort(function(a, b) { return byStaff[b].rev - byStaff[a].rev; });
        var rows = staffNames.map(function(s, idx) {
          var rankBadge = staffNames.length > 1 ? '<span style="font-size:10px;font-weight:700;color:' + (idx===0?'var(--terra)':'var(--sub)') + ';margin-right:4px">' + (idx+1) + '위</span>' : '';
          return '<div style="padding:10px 20px;border-top:1px solid var(--ivory2);display:flex;align-items:center">' +
            (typeof renderStaffBadge === 'function' ? renderStaffBadge(s, 28) : '<div style="width:28px;height:28px;border-radius:50%;background:var(--dark);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">' + (s[0]||'?') + '</div>') +
            '<div style="flex:1;font-size:12px;font-weight:700;color:var(--dark);margin-left:10px">' + rankBadge + s + '</div>' +
            '<div style="text-align:right">' +
              '<div style="font-size:12px;font-weight:700;color:var(--dark)">' + Math.round(byStaff[s].rev/10000).toLocaleString() + '만원</div>' +
              '<div style="font-size:11px;color:var(--sub)">' + byStaff[s].count + '건</div>' +
            '</div>' +
          '</div>';
        }).join('');
        var isPrev = window._staffPerfViewMode === 'prev';
        var toggleHtml = '<div style="display:flex;gap:6px" onclick="event.stopPropagation()">' +
          '<button onclick="window._staffPerfViewMode=\'this\';renderHome(true);" style="padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:' + (!isPrev?'var(--dark)':'#fff') + ';color:' + (!isPrev?'#fff':'var(--sub)') + ';font-size:10px;font-weight:700;cursor:pointer;font-family:inherit">이번달</button>' +
          '<button onclick="window._staffPerfViewMode=\'prev\';renderHome(true);" style="padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:' + (isPrev?'var(--dark)':'#fff') + ';color:' + (isPrev?'#fff':'var(--sub)') + ';font-size:10px;font-weight:700;cursor:pointer;font-family:inherit">지난달</button>' +
        '</div>';
        // 2026-08-31(선혜님 지적 — "확인해보고 검토하고 말하니?? 없잖아"로
        // 스크린샷을 직접 찍어보고서야 발견): 토글 버튼을 누르면
        // renderHome(true)가 전체 홈 화면을 처음부터 다시 그리는데, 이
        // 아코디언 섹션이 항상 "닫힘"(display:none) 상태로 새로 만들어져서,
        // 데이터는 바뀌어도 화면이 접힌 채로 다시 렌더링되어 사용자 눈에는
        // 아무 반응이 없는 것처럼 보였음(코드 리뷰나 텍스트 검증만으로는
        // 못 잡고, 실제 화면을 봐야만 드러나는 버그였음). 펼침 상태를
        // 전역변수로 기억해뒀다가 렌더링 시 반영 + 헤더 클릭시에도 갱신.
        var wasOpen = !!window._staffPerfExpanded;
        return (
          '<div id="sec-staff-perf" style="background:#fff;border-bottom:1px solid var(--border)">' +
            '<div style="padding:14px 20px;display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="window._staffPerfExpanded=!window._staffPerfExpanded;toggleHomeAccordion(this)">' +
              '<span style="font-size:11px;font-weight:700;color:var(--sub);letter-spacing:0.08em;text-transform:uppercase">' + (isPrev?'지난달':'이번달') + ' 담당자별 성과</span>' +
              toggleHtml +
            '</div>' +
            '<div style="display:' + (wasOpen?'block':'none') + '">' + (rows || '<div style="padding:14px 20px;font-size:12px;color:var(--sub);text-align:center">해당 기간에 담당자별 실적이 없어요</div>') + '</div>' +
          '</div>'
        );
      })(),

      '</div>', // 오른쪽 컬럼 wrapper 닫기

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

  // 2026-08-04: loadCustomersAsync(renderHome)처럼 콜백으로 호출되면 첫 인자에
  // 고객배열이 들어오는데, 예전엔 이게 skipServerFetch 자리에서 항상 truthy로
  // 오판되어 의도와 다른 분기를 타고 있었음(결과값은 우연히 같아서 안 보였지만
  // 설계상 위험한 패턴). 진짜 boolean true일 때만 스킵하도록 엄격비교로 수정.
  if (skipServerFetch === true) {
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

