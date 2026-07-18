/* ══════════════════════════════════════════════════
   견적서 탭(가견적/확정견적 목록) 렌더링
   ══════════════════════════════════════════════════
   dash-render.js에서 분리됨 (2026-07-17). */

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
      'font-size:12px;font-weight:700;padding:2px 6px;border-radius:6px;' +
      'background:' + (isFinal?'#282828':'#F5F2EE') + ';' +
      'color:' + (isFinal?'#fff':'#9A9490')
    });
    typeTag.textContent = STATUS_KO[e.status] || '가견적서';

    var csBadge = el('span', {style:
      'margin-left:auto;font-size:12px;font-weight:700;padding:2px 8px;border-radius:6px;' +
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

    // 클릭 시 고객 상세 (이력 탭에 카카오복사/견적서앱 액션이 이미 있어 여기선 중복 버튼 생략)
    (function(name){ row.addEventListener('click', function(){ if(name) openDetail(name, null, 'est'); }); })(e.clientName);

    card.appendChild(row);
  });

  body.appendChild(card);
}

