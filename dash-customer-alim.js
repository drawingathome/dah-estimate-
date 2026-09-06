/* ══════════════════════════════════════════════════
   고객상세 - 소통(알림톡) 탭 렌더링
   ══════════════════════════════════════════════════
   dash-customer-detail.js에서 분리됨 (2026-07-17). */

function renderAlimSection(c, alimBody) {
  var alimSec = div('margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)', []);

  var logs = [];
  try { logs = JSON.parse(localStorage.getItem('dah_kakao_log')||'[]'); } catch(e){}
  var sentMap = {};
  // 2026-08-05: 이름으로만 매칭하던 버그 수정 — 동명이인이면 서로 다른 사람의
  // 발송이력이 섞여서 "이미 보냈음" 체크가 잘못 뜰 위험이 있었음. 로그에 custId가
  // 있으면(신규 발송분) id로 정확히 매칭, 없으면(기존 발송이력) 이름으로 폴백해서
  // 과거 발송이력이 안 사라지게 함.
  logs.forEach(function(l){ var match = l.custId ? (l.custId === c.id) : (l.name===c.clientName); if (match) sentMap[l.type]=l; });

  function makeRow(key) {
    var meta = ALIM_META[key]; if(!meta) return null;
    var sent = sentMap[key];
    var tagColor = meta.tag==='자동'?'#6B6B6B':(meta.tag==='선택'?'var(--light)':'var(--dark)');
    var row = div('display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--ivory1)', []);
    var left = div('flex:1;min-width:0', []);
    var labelRow = div('display:flex;align-items:center;gap:6px', []);
    labelRow.appendChild(el('span', {style:'font-size:11px;font-weight:600;color:var(--dark)', text:meta.label}));
    labelRow.appendChild(el('span', {style:'font-size:11px;color:'+tagColor+';background:var(--ivory1);padding:2px 5px;border-radius:var(--r-btn)', text:meta.tag}));
    left.appendChild(labelRow);
    if (sent) left.appendChild(el('span', {style:'font-size:11px;color:var(--sub)', text:sent.date+' '+sent.time+' 발송됨'}));
    row.appendChild(left);
    if (!sent) {
      var sendBtn = el('span', {style:'font-size:12px;font-weight:700;color:var(--dark);cursor:pointer;flex-shrink:0;padding:4px 8px;border:1px solid var(--dark);border-radius:10px;min-height:32px;display:flex;align-items:center', text:'발송'});
      (function(k){ sendBtn.addEventListener('click', function(){ sendAlimtalk(k); }); })(key);
      row.appendChild(sendBtn);
    } else {
      var resendBtn = el('span', {style:'font-size:11px;color:var(--sub);cursor:pointer;flex-shrink:0;padding:4px 8px;min-height:32px;display:flex;align-items:center', text:'재발송'});
      (function(k){ resendBtn.addEventListener('click', function(){ if(confirm('재발송할까요?')) sendAlimtalk(k); }); })(key);
      row.appendChild(resendBtn);
    }
    return row;
  }

  // ── "지금 할 일" — 현재 단계에 맞는 미발송 알림톡만 상단에 강조 표시 ──
  var recommendedKeys = STAGE_ALIM[c.stage] || [];
  var todoKeys = recommendedKeys.filter(function(k){ return !sentMap[k]; });
  var todoWrap = div('background:var(--ivory1);border-radius:var(--r-card);padding:10px 12px;margin-bottom:12px', []);
  todoWrap.appendChild(el('div', {style:'font-size:11px;font-weight:700;color:var(--terra);letter-spacing:0.05em;margin-bottom:4px', text:'📌 지금 보낼 알림톡'}));
  if (todoKeys.length > 0) {
    todoKeys.forEach(function(k){ var r = makeRow(k); if (r) { r.style.borderBottom = '1px solid var(--border)'; todoWrap.appendChild(r); } });
  } else {
    todoWrap.appendChild(el('div', {style:'font-size:11px;color:var(--sub);padding:4px 0', text:'이 단계에서 보낼 알림톡을 다 보냈어요'}));
  }
  alimSec.appendChild(todoWrap);

  // ── 단계별 카테고리 아코디언 (전부 보기용, 현재 단계만 기본 펼침) ──
  var categories = [
    ['방문예약', STAGE_ALIM.방문예약], ['상담', STAGE_ALIM.상담], ['가견적', STAGE_ALIM.가견적],
    ['선금결제', STAGE_ALIM.선금결제], ['실측준비중', STAGE_ALIM.실측준비중], ['확정견적', STAGE_ALIM.확정견적],
    ['잔금결제', STAGE_ALIM.잔금결제], ['시공준비중', STAGE_ALIM.시공준비중], ['시공완료', STAGE_ALIM.시공완료],
    // 2026-08-29: v3 재작성 시 추가 — 특정 단계에 속하지 않는 취소/노쇼/재고/AS 문구 모음
    ['취소·기타', OTHER_ALIM_KEYS]
  ];
  var catListWrap = div('', []);
  catListWrap.appendChild(el('div', {style:'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.5px;text-transform:uppercase;margin:8px 0 4px', text:'단계별 전체 보기'}));
  categories.forEach(function(cat) {
    var stageName = cat[0], keys = cat[1] || [];
    var isCurrentStage = (stageName === c.stage);
    var sentCount = keys.filter(function(k){ return sentMap[k]; }).length;
    var header = div('display:flex;align-items:center;justify-content:space-between;padding:8px 0;cursor:pointer', [
      span('font-size:12px;font-weight:700;color:var(--dark)', stageName + ' (' + sentCount + '/' + keys.length + ')'),
      span('font-size:11px;color:var(--sub)', isCurrentStage ? '▾' : '▸')
    ]);
    header.onclick = function(){ toggleHomeAccordion(header); };
    var body = div('display:' + (isCurrentStage ? 'block' : 'none'), []);
    keys.forEach(function(k){ var r = makeRow(k); if (r) body.appendChild(r); });
    catListWrap.appendChild(header);
    catListWrap.appendChild(body);
  });
  alimSec.appendChild(catListWrap);

  if (alimBody) alimBody.appendChild(alimSec);
}

// ── 아래부터는 dash-customer-detail.js에서 이동됨 (2026-07-19, 파일명과 책임 일치시키기 위함) ──
// 2026-08-29: v3 문서의 #{변수} 형식(카카오 알림톡 실제 템플릿 변수 표기와 동일)에 맞춰
// 여러 변수를 한번에 치환. 값이 없으면 '미정'/안내문구로 대체해 빈칸 발송을 방지.
function fillAlimTemplate(tpl, c) {
  var fmt = function(n) { return (Number(n) || 0).toLocaleString('ko-KR'); };
  var map = {
    '고객명': c.clientName || '',
    '방문일시': c.date || '미정',
    '실측일시': c.measureDate || '미정',
    '시공일시': c.installDate || '미정',
    'AS일시': c.asDate || '미정', // 2026-08-29: as_records UI 미구현 — 값 저장처가 아직 없음, 항상 '미정'
    '계약금': fmt(c.depositAmount),
    '잔금': fmt(c.balanceAmount),
    '결제링크': c.paymentLink || '(결제링크 미등록 — 고객상세에서 먼저 입력해주세요)'
  };
  return (tpl || '').replace(/#\{([^}]+)\}/g, function(_, key) {
    return (key in map) ? map[key] : ('#{' + key + '}');
  });
}

function sendAlimtalk(key) {
  var arr = loadCustomers();
  var c = findCurrentDetailCustomer(arr);
  if (!c) return;
  var meta = ALIM_META[key]; if (!meta) return;
  var initialMsg = fillAlimTemplate(meta.template, c);
  _openAlimtalkPreview(meta, key, c, initialMsg);
}

// 알림톡 발송 전 미리보기+수정 모달 — "제목만 보고 바로 발송확인" 대신 실제 내용을 보여주고 고칠 수 있게 함
function _openAlimtalkPreview(meta, key, c, initialMsg) {
  var existing = document.getElementById('alimtalk-preview-overlay');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = 'alimtalk-preview-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99998;display:flex;align-items:center;justify-content:center';
  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:var(--sp-5);width:360px;max-width:90vw;max-height:85vh;overflow-y:auto';
  box.innerHTML =
    '<div style="font-size:12px;font-weight:700;color:var(--sub);letter-spacing:0.08em;margin-bottom:var(--sp-1)">' + escHtml(meta.tag) + ' · ' + escHtml(meta.desc) + '</div>' +
    '<div style="font-size:15px;font-weight:700;color:var(--dark);margin-bottom:var(--sp-3)">' + escHtml(meta.label) + '</div>' +
    '<textarea id="alimtalk-msg-textarea" style="width:100%;min-height:140px;padding:10px;border:1.5px solid var(--border);border-radius:10px;font-size:12px;font-family:inherit;box-sizing:border-box;resize:vertical;outline:none"></textarea>' +
    '<div style="display:flex;gap:var(--sp-2);margin-top:var(--sp-3)">' +
      '<button id="alimtalk-cancel-btn" style="flex:1;padding:11px;background:#fff;border:1px solid var(--border);border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;color:var(--dark)">취소</button>' +
      '<button id="alimtalk-send-btn" style="flex:2;padding:11px;background:var(--dark);color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer">발송</button>' +
    '</div>';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  var textarea = document.getElementById('alimtalk-msg-textarea');
  textarea.value = initialMsg;
  textarea.focus();
  document.getElementById('alimtalk-cancel-btn').addEventListener('click', function(){ overlay.remove(); });
  document.getElementById('alimtalk-send-btn').addEventListener('click', function(){
    var finalMsg = textarea.value;
    overlay.remove();
    try {
      var logs = JSON.parse(localStorage.getItem('dah_kakao_log')||'[]');
      var now = new Date();
      logs.unshift({
        name: c.clientName,
        custId: c.id || null,
        type: key,
        label: meta.label,
        date: (now.getMonth()+1)+'월 '+now.getDate()+'일',
        time: now.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}),
        method: meta.tag,
        message: finalMsg
      });
      localStorage.setItem('dah_kakao_log', JSON.stringify(logs.slice(0,200)));
    } catch(e){}
    if (typeof logEvent === 'function') logEvent('alimtalk_send', { type: key });
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(finalMsg).then(function(){ showToast('['+meta.label+'] 메시지가 복사됐어요 — 카카오톡에 붙여넣기 하세요'); });
      }
    } catch(e){}
    closeDetail(); openDetail(c.clientName, c.id);
  });
}

// 2026-08-05: 여기 있던 copyKakao()/KAKAO_LABELS는 어디서도 호출되지 않는
// 죽은 코드였음(감사 중 발견, 제거함) — sendAlimtalk()/ALIM_META 체계로 이미 대체됨.

function renderKakaoLog() {
  var logEl = document.getElementById('kakao-log'); if (!logEl) return;
  try {
    // 2026-08-05: 이름으로만 매칭하던 버그 수정 — sentMap과 동일한 방식(id우선, 레거시는 이름폴백)
    var logs = JSON.parse(localStorage.getItem('dah_kakao_log') || '[]').filter(function(l) {
      return l.custId ? (l.custId === currentDetailId) : (l.name === currentDetailName);
    });
    if (logs.length === 0) { logEl.textContent = '발송 이력 없음'; return; }
    logEl.innerHTML = '';
    logs.slice(0,3).forEach(function(l) {
      var methodBadge = l.method === '알림톡' ? ' [알림톡]' : ' [복사]';
      logEl.appendChild(div('font-size:11px;color:var(--dark);padding:3px 0;border-bottom:1px solid var(--border)', [span('', l.date + ' ' + l.time + ' — ' + l.type + methodBadge)]));
    });
  } catch(e) {}
}
