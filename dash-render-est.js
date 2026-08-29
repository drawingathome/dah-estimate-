/* ══════════════════════════════════════════════════
   견적서 탭(가견적/확정견적 목록) 렌더링
   ══════════════════════════════════════════════════
   dash-render.js에서 분리됨 (2026-07-17).
   2026-08-06: "보관함" 개념을 고객목록에서 이쪽(견적서)으로 이동함.
   고객목록은 항상 전원 표시하고, 대신 견적서 목록을 진행중/시공완료 보관함/
   계약 안한 보관함/전체로 나눠서 볼 수 있게 함(선혜님 지시). */

var _estArchiveFilter = 'active'; // 'active' | 'completed_archive' | 'rejected_archive' | 'all'

function setEstArchiveFilter(f) {
  _estArchiveFilter = f;
  document.querySelectorAll('.est-archive-filter-btn').forEach(function(b){
    b.classList.toggle('on', b.getAttribute('data-filter') === f);
  });
  renderEstList();
}

function renderEstList() {
  var body = document.getElementById('est-list-body');
  var cntEl = document.getElementById('est-list-count');
  if (!body) return;
  body.innerHTML = '';

  var all = [];
  try { all = JSON.parse(localStorage.getItem('dah_saved') || '[]'); } catch(e) {}
  // 스태프 권한 필터 (2026-08-04 추가) — 다른 화면엔 있는데 견적서 목록만
  // 빠져있어서, 스태프 계정에도 다른 담당자 견적서까지 다 보이던 권한 누락
  if (currentUser && currentUser.role === 'staff') {
    all = all.filter(function(e){ return (e.staffName||'마스터') === currentUser.name; });
  }

  // 2026-08-06: 이 견적서와 연결된 고객의 실제 단계(시공완료 여부)를 알아야
  // "시공완료 보관함"을 판단할 수 있어서, 고객 배열과 매칭해둠(id 우선, 이름 폴백)
  var customersArr = (typeof loadCustomers === 'function') ? loadCustomers() : [];
  var custById = {}; var custByName = {};
  customersArr.forEach(function(c){ if (c.id) custById[c.id] = c; if (c.clientName) custByName[c.clientName] = c; });
  function linkedCustomer(e) { return (e.clientId && custById[e.clientId]) || custByName[e.clientName] || null; }
  function isInstallDone(e) { var c = linkedCustomer(e); return !!(c && c.stage === '시공완료'); }
  function isRejected(e) {
    // 2026-08-24(선혜님 발견 — "견적서 목록 총 0건" 재현됨): 이 함수가
    // "확정 안 됨" 전부를 "미계약(거절)"으로 취급하고 있어서, 정상적으로
    // 진행 중인 가견적(pending)까지 전부 미계약 보관함으로 잘못 분류되고
    // 있었음. 그 결과 "진행중" 탭 필터(isRejected가 아닌 것만)에서 정상
    // 가견적들이 통째로 사라져 "0건"으로 보이는 게 실제 재현됨(테스트 데이터로
    // 직접 확인). contractStatus는 'pending'/'contracted'/'rejected' 세
    // 값을 명시적으로 구분해서 쓰고 있으므로(dash-customer-detail.js에서도
    // 동일하게 3분류 사용), '미계약'이라고 명시적으로 표시된 것만 걸러야 함.
    var cs = e.contractStatus || (e.status === 'final' ? 'contracted' : 'pending');
    return cs === 'rejected' && !isInstallDone(e);
  }

  if (_estArchiveFilter === 'completed_archive') all = all.filter(isInstallDone);
  else if (_estArchiveFilter === 'rejected_archive') all = all.filter(isRejected);
  else if (_estArchiveFilter === 'active') all = all.filter(function(e){ return !isInstallDone(e) && !isRejected(e); });
  // 'all'이면 필터 없음
  // 2026-08-24(선혜님 발견 — 견적서 목록에 삭제 기능 자체가 없던 문제):
  // archiveEstimate()는 이미 있었는데(customer-detail 화면 전용) 이 목록에는
  // 연결이 안 돼 있었고, 심지어 여기선 isArchived 필터조차 없어서 보관 처리를
  // 해도 이 화면에선 안 사라졌음. 삭제(보관) 버튼을 추가하면서 필터도 같이 적용.
  all = all.filter(function(e){ return !e.isArchived; });

  var q = (document.getElementById('est-search')?.value || '').trim();
  var list = q
    ? all.filter(function(e){ return (e.clientName||'').indexOf(q)>=0 || (e.no||'').indexOf(q)>=0; })
    : all;

  if (cntEl) cntEl.textContent = '총 ' + list.length + '건';

  var CONTRACT_KO = {pending:'가견적', contracted:'계약됨', rejected:'미계약'};
  var CONTRACT_COLOR = {pending:'var(--sub)', contracted:'#2F6690', rejected:'#C0392B'};
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
    // contractStatus가 비어있으면(예전 이관데이터 등) status 기준으로 유추
    // — "최종견적서"인데 "가견적" 배지가 붙는 모순을 방지 (2026-08-04)
    var cs = e.contractStatus || (e.status === 'final' ? 'contracted' : 'pending');
    var isFinal = e.status === 'final';

    var row = el('div', {class: 'est-list-item', style:
      'padding:12px 16px;border-bottom:' + (isLast?'none':'1px solid var(--border)') + ';' +
      'cursor:pointer;transition:background 0.12s'
    });
    row.addEventListener('mouseover', function(){ this.style.background='var(--ivory1)'; });
    row.addEventListener('mouseout',  function(){ this.style.background=''; });

    // 상단 행: 번호 + 유형 + 계약상태
    var top = el('div', {style:'display:flex;align-items:center;gap:6px;margin-bottom:6px'});

    var noSpan = el('span', {style:'font-size:12px;font-weight:700;color:var(--dark)'});
    noSpan.textContent = e.no || '—';

    var typeTag = el('span', {style:
      'font-size:12px;font-weight:700;padding:2px 6px;border-radius:6px;' +
      'background:' + (isFinal?'var(--dark)':'#F5F2EE') + ';' +
      'color:' + (isFinal?'#fff':'var(--sub)')
    });
    typeTag.textContent = STATUS_KO[e.status] || '가견적서';

    var csBadge = el('span', {style:
      'margin-left:auto;font-size:12px;font-weight:700;padding:2px 8px;border-radius:6px;cursor:pointer;' +
      'background:' + (cs==='contracted'?'#EEF5F2':cs==='rejected'?'#FDECEA':'#F5F2EE') + ';' +
      'color:' + CONTRACT_COLOR[cs]
    });
    csBadge.textContent = CONTRACT_KO[cs] || '가견적';
    // 2026-08-24(선혜님 발견 — "확정 미계약 이런 부분은 안보인다"): 고객상세
    // 화면의 배지는 눌러서 바뀌는데, 이 메인 견적서 목록 화면의 배지는 그냥
    // 보여주기만 하는 텍스트라 눌러도 아무 반응이 없었음. 똑같이 클릭해서
    // 바뀌도록(계약됨↔미계약 한번에 토글) 추가.
    (function(entry, badge){
      badge.addEventListener('click', function(ev){
        ev.stopPropagation(); // row 클릭(고객상세 이동)으로 안 번지게
        var cur = entry.contractStatus || (entry.status === 'final' ? 'contracted' : 'pending');
        var next = cur === 'rejected' ? 'contracted' : cur === 'contracted' ? 'rejected' : 'contracted';
        // 2026-08-24(선혜님 요청 — "확인창이 한번 더 떠야 전문성이 있지"):
        // 고객상세 화면과 동일하게, 바꾸기 전 한 번 확인받도록 함.
        var label = entry.clientName || '이 고객';
        if (!confirm(label + ' 님을 "' + CONTRACT_KO[next] + '"(으)로 변경할까요?')) return;
        entry.contractStatus = next;
        try {
          var arr = JSON.parse(localStorage.getItem('dah_saved')||'[]');
          var idx = arr.findIndex(function(x){ return x.id === entry.id || x.no === entry.no; });
          if (idx>=0) { arr[idx].contractStatus = next; localStorage.setItem('dah_saved', JSON.stringify(arr)); }
        } catch(ex2){}
        if (entry.id && typeof entry.id === 'string' && entry.id.length > 20 && typeof sbXHR === 'function') {
          sbXHR('PATCH', 'estimates?id=eq.' + entry.id, { contract_status: next }, function(err){
            if (err) console.warn('계약상태 서버 저장 실패:', err);
          });
        }
        badge.textContent = CONTRACT_KO[next];
        badge.style.background = next==='contracted'?'#EEF5F2':next==='rejected'?'#FDECEA':'#F5F2EE';
        badge.style.color = CONTRACT_COLOR[next];
      });
    })(e, csBadge);

    top.appendChild(noSpan); top.appendChild(typeTag);
    if (e.custType === 'rebuy') {
      var rebuyTag = el('span', {style:
        'font-size:12px;font-weight:700;padding:2px 6px;border-radius:6px;' +
        'background:#FFF3EE;color:var(--orange)'
      });
      rebuyTag.textContent = '재구매';
      top.appendChild(rebuyTag);
    }
    if (e.custType === 'as' && e.asFeeType === 'paid') {
      var paidAsTag = el('span', {style:
        'font-size:12px;font-weight:700;padding:2px 6px;border-radius:6px;' +
        'background:#FDECEA;color:#C0392B'
      });
      paidAsTag.textContent = '유상 AS';
      top.appendChild(paidAsTag);
    }
    top.appendChild(csBadge);

    // 2026-08-24: 목록에서 바로 삭제(보관처리) 가능하게 — 고객 연결이 없는
    // 견적(client_id가 비어있어 고객상세로 진입 자체가 안 되는 테스트/오류
    // 데이터 등)도 지울 방법이 있어야 해서 추가.
    var delBtn = el('button', {type:'button', title:'삭제', style:
      'margin-left:6px;flex-shrink:0;width:22px;height:22px;border:none;background:transparent;' +
      'color:var(--sub);font-size:13px;cursor:pointer;border-radius:6px;line-height:1'
    });
    delBtn.textContent = '🗑';
    delBtn.addEventListener('mouseover', function(){ this.style.background='#FDECEA'; this.style.color='#C0392B'; });
    delBtn.addEventListener('mouseout',  function(){ this.style.background='transparent'; this.style.color='var(--sub)'; });
    delBtn.addEventListener('click', function(ev){
      ev.stopPropagation(); // row 클릭(고객상세 이동)으로 안 번지게
      var label = (e.clientName || '이름없음') + ' · ' + (Number(e.price)||0).toLocaleString() + '원';
      if (!confirm(label + '\n\n⚠️ 이 견적서를 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
      archiveEstimate(e, function(err){
        renderEstList();
        // 2026-08-25(선혜님 발견 — "오지은 실장으로 삭제가 안 된다"): 서버가
        // 실제로 거부해도(권한 불일치 등) 확인 없이 무조건 "삭제했어요"라고
        // 뜨고 있었음 — 아까 sbXHR에 넣은 실패감지가 무색해지고 있었음.
        if (err) showToast('⚠️ 삭제가 서버에 반영되지 않았어요' + (err.zeroRows ? '(권한 문제일 수 있어요)' : '') + ' — 새로고침해서 확인해주세요');
        else showToast('완전히 삭제했어요');
      });
    });
    top.appendChild(delBtn);

    // 중간 행: 고객명 + 금액
    var mid = el('div', {style:'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-1)'});
    var nameEl = el('span', {style:'font-size:12px;font-weight:700;color:var(--dark);display:flex;align-items:center;gap:5px'});
    // 2026-08-28(선혜님 지시 — 담당자 구분 표시): 칸반과 동일한 공용 뱃지
    // 재사용(체크리스트 24번 - 같은 표시를 여러 화면에 따로 안 짜기 위함).
    nameEl.innerHTML = (typeof renderStaffBadge === 'function' ? renderStaffBadge(e.staffName, 15) : '') +
      '<span>' + escHtml(e.clientName || '—') + '</span>';
    var priceEl = el('span', {style:'font-size:11px;font-weight:800;color:var(--dark);letter-spacing:-0.5px'});
    priceEl.textContent = (Number(e.price)||0).toLocaleString() + '원';
    mid.appendChild(nameEl); mid.appendChild(priceEl);

    // 하단 행: 총 품목 개수 + 날짜 (공간/원단 상세는 대부분 집 전체 시공이라 나열해도 의미 없어서 제거)
    var bot = el('div', {style:'font-size:11px;color:var(--sub);display:flex;gap:var(--sp-2);flex-wrap:wrap'});
    var itemCount = Number(e.itemCount) || 0;
    if (itemCount > 0) { var s1=el('span'); s1.textContent='총 '+itemCount+'개 품목'; bot.appendChild(s1); }
    var dateStr = e.savedAt ? e.savedAt.slice(0,10) : (e.date||'');
    if (dateStr) { var s3=el('span',{style:'margin-left:auto'}); s3.textContent=dateStr; bot.appendChild(s3); }

    row.appendChild(top); row.appendChild(mid); row.appendChild(bot);

    // 2026-08-10: 견적서의 "내부 메모"(현장 참고용, 예: 이사 날짜)가 저장은
    // 되는데 목록 어디에서도 다시 안 보이던 문제 - 선혜님 요청으로 추가.
    if (e.memo && e.memo.trim()) {
      var memoRow = el('div', {style:
        'font-size:11px;color:var(--terra);background:#FFF8F3;border-radius:6px;' +
        'padding:5px 8px;margin-top:6px;line-height:1.4'
      });
      memoRow.textContent = '📝 ' + e.memo.trim();
      row.appendChild(memoRow);
    }

    // 2026-08-29(선혜님 지시 - "견적서목록/고객상세의 이력탭에 버튼으로
    // 다시 붙이기"): 저장된 lineItems로 발주서/실측·시공 의뢰서를 다시
    // 만드는 기능 복원. 목록 화면이라 공간이 좁아 작은 아이콘 버튼으로.
    if (e.lineItems && e.lineItems.length > 0) {
      var reGenRow = el('div', {style:'display:flex;gap:5px;margin-top:6px'});
      var mkMiniBtn = function(label, fn) {
        var b = el('button', {style:'flex:1;padding:6px 0;background:#fff;border:1px solid var(--border);border-radius:8px;font-size:10px;font-weight:700;color:var(--sub);font-family:inherit;cursor:pointer'});
        b.textContent = label;
        b.addEventListener('click', function(ev){ ev.stopPropagation(); fn(); });
        return b;
      };
      reGenRow.appendChild(mkMiniBtn('📋 발주서', function(){ showVendorOrderFromEstimate(e); }));
      reGenRow.appendChild(mkMiniBtn('📐 실측', function(){ showRequestFromEstimate('measure', e); }));
      reGenRow.appendChild(mkMiniBtn('🔧 시공', function(){ showRequestFromEstimate('install', e); }));
      row.appendChild(reGenRow);
    }

    // 클릭 시 고객 상세 (이력 탭에 카카오복사/견적서앱 액션이 이미 있어 여기선 중복 버튼 생략)
    (function(entry){ row.addEventListener('click', function(ev){
      if (ev.target.closest('button')) return; // 삭제/계약상태 버튼 클릭은 여기로 안 번지게
      if (!entry.clientName) return;
      // 2026-08-25(선혜님 발견 — 신화경님 사례): 견적서 앱에서 고객명을
      // 직접 타이핑만 하고 저장하면(고객 등록/불러오기를 안 거치면) 그
      // 견적이 어떤 고객 레코드와도 연결이 안 된 채(client_id 없이) 저장됨.
      // 그런 견적을 목록에서 클릭하면 openDetail이 그 이름의 고객을 찾다가
      // 실패해서 그냥 오류만 뜨고 끝났음 — "고객으로 등록할까요?"로 안내해서
      // 그 자리에서 바로 등록하고 이어갈 수 있게 함.
      if (!entry.clientId) {
        if (confirm('"' + entry.clientName + '" 님은 아직 고객으로 등록이 안 됐어요.\n지금 고객으로 등록하고 이 견적과 연결할까요?')) {
          // 2026-08-25(선혜님 발견 — "고객 등록할지 물어보지만 실패하는데??"):
          // 담당자(staff_name)를 안 넣어서 기본값('선혜')으로 들어가고 있었음.
          // 최근 적용된 보안규칙(RLS) 때문에 직원 계정은 "내 담당 고객"만
          // 볼 수 있어서, 방금 본인이 만든 고객인데도 담당자가 자기 이름이
          // 아니면 못 보고 그 직후 이어지는 화면이동이 실패한 것처럼 보였음.
          var staffName3 = (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'staff') ? currentUser.name : '마스터';
          var payload = { client_name: entry.clientName, phone: entry.phone || null, stage: '가견적', price: entry.price || 0, staff_name: staffName3 };
          sbXHR('POST', 'customers', payload, function(err, rows){
            if (err || !rows || !rows[0]) { showToast('고객 등록 실패 — 다시 시도해주세요'); return; }
            var newId = rows[0].id;
            sbXHR('PATCH', 'estimates?id=eq.' + entry.id, { client_id: newId }, function(err){
              if (err) { showToast('⚠️ 고객은 등록됐지만 이 견적과 연결이 안 됐어요 — 새로고침해서 다시 시도해주세요'); return; }
              entry.clientId = newId;
              try {
                var arr = JSON.parse(localStorage.getItem('dah_saved')||'[]');
                var idx = arr.findIndex(function(x){ return x.id === entry.id; });
                if (idx>=0) { arr[idx].clientId = newId; localStorage.setItem('dah_saved', JSON.stringify(arr)); }
              } catch(ex){}
              showToast('고객으로 등록했어요');
              openDetail(entry.clientName, newId, 'est');
            });
          });
        }
        return;
      }
      openDetail(entry.clientName, entry.clientId, 'est');
    }); })(e);

    card.appendChild(row);
  });

  body.appendChild(card);
}

