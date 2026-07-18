/* ══════════════════════════════════════════════════
   고객상세 - 소통(알림톡) 탭 렌더링
   ══════════════════════════════════════════════════
   dash-customer-detail.js에서 분리됨 (2026-07-17). */

function renderAlimSection(c, alimBody) {
  var alimSec = div('margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)', []);
  alimSec.appendChild(el('div', {style:'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:var(--sp-2)', text:'알림톡 발송 현황'}));

  var allKeys = ['t01_reservation','t02_reminder','t03_estimate','t31_deposit','t04_followup',
    't05_measure_confirm','t06_measure_dday','t07_final_estimate','t71_balance_request',
    't08_balance_remind','t09_order_confirm','t10_install_confirm','t11_install_dday',
    't12_after_install','t13_cancel','t14_noshow'];

  var logs = [];
  try { logs = JSON.parse(localStorage.getItem('dah_kakao_log')||'[]'); } catch(e){}
  var sentMap = {};
  logs.forEach(function(l){ if(l.name===c.clientName) sentMap[l.type]=l; });

  
  var recommendedKeys = STAGE_ALIM[c.stage] || [];

  allKeys.forEach(function(key) {
    var meta = ALIM_META[key]; if(!meta) return;
    var sent = sentMap[key];
    var isRecommended = recommendedKeys.indexOf(key) >= 0;
    var tagColor = meta.tag==='자동'?'#6B6B6B':(meta.tag==='선택'?'var(--light)':'var(--dark)');

    var row = div(
      'display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--ivory1)',
      []
    );
    var left = div('flex:1;min-width:0', []);
    var labelRow = div('display:flex;align-items:center;gap:6px', []);
    labelRow.appendChild(el('span', {style:'font-size:11px;font-weight:'+(isRecommended?'700':'500')+';color:'+(isRecommended?'var(--dark)':'#6B6B6B'), text:meta.label}));
    labelRow.appendChild(el('span', {style:'font-size:11px;color:'+tagColor+';background:var(--ivory1);padding:2px 5px;border-radius:var(--r-btn)', text:meta.tag}));
    left.appendChild(labelRow);
    if (sent) {
      left.appendChild(el('span', {style:'font-size:11px;color:var(--sub)', text:'✅ '+sent.date+' '+sent.time}));
    }
    row.appendChild(left);

    if (!sent) {
      var sendBtn = el('span', {style:'font-size:12px;font-weight:700;color:'+(isRecommended?'var(--dark)':'var(--light)')+';cursor:pointer;flex-shrink:0;padding:4px 8px;border:1px solid '+(isRecommended?'var(--dark)':'var(--border)')+';border-radius:10px', text:'발송'});
      (function(k){ sendBtn.addEventListener('click', function(){ sendAlimtalk(k); }); })(key);
      row.appendChild(sendBtn);
    } else {
      var resendBtn = el('span', {style:'font-size:11px;color:var(--sub);cursor:pointer;flex-shrink:0;padding:4px 8px', text:'재발송'});
      (function(k){ resendBtn.addEventListener('click', function(){ if(confirm('재발송할까요?')) sendAlimtalk(k); }); })(key);
      row.appendChild(resendBtn);
    }
    alimSec.appendChild(row);
  });
  if (alimBody) alimBody.appendChild(alimSec);
}

// ── 아래부터는 dash-customer-detail.js에서 이동됨 (2026-07-19, 파일명과 책임 일치시키기 위함) ──
function sendAlimtalk(key) {
  var arr = loadCustomers();
  var c = findCurrentDetailCustomer(arr);
  if (!c) return;
  var meta = ALIM_META[key]; if (!meta) return;
  var initialMsg = (meta.template || '').replace(/\{name\}/g, c.clientName || '');
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

var KAKAO_LABELS = {followup:'팔로업', contract:'계약금 안내', measure:'실측 안내', balance:'잔금 안내'};
function copyKakao(type) {
  var arr = loadCustomers(); var c = findCurrentDetailCustomer(arr);
  if (!c) return; var n = c.clientName;
  var msgs = {
    followup: '안녕하세요, ' + n + '님 🙂\n드로잉엣홈입니다.\n상담 후 궁금하신 점은 없으셨나요?\n편하게 말씀해 주세요!',
    contract: '안녕하세요, ' + n + '님 🙂\n드로잉엣홈입니다.\n계약금(50%)이 확인되면 실측 일정을 잡아드리겠습니다.',
    measure: '안녕하세요, ' + n + '님 🙂\n드로잉엣홈입니다.\n실측 방문 일정을 조율하고 싶습니다.\n편하신 날짜와 시간을 알려주세요!',
    balance: '안녕하세요, ' + n + '님 🙂\n드로잉엣홈입니다.\n잔금 납부가 완료되면 시공 일정이 확정됩니다. 감사합니다!'
  };
  var msg = msgs[type] || '';
  if (!confirm('발송할 메시지:\n\n' + msg + '\n\n복사하시겠습니까?')) return;
  try { var logs = JSON.parse(localStorage.getItem('dah_kakao_log') || '[]'); logs.unshift({ name: n, type: KAKAO_LABELS[type]||type, date: todayStr(), time: new Date().toLocaleTimeString() }); localStorage.setItem('dah_kakao_log', JSON.stringify(logs.slice(0,100))); } catch(e) {}
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(msg).then(function() { showToast('복사됐습니다 — 카카오톡에 붙여넣기 하세요'); renderKakaoLog(); }); } else { var ta = document.createElement('textarea'); ta.value = msg; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast('복사됐습니다 — 카카오톡에 붙여넣기 하세요'); renderKakaoLog(); } } catch(e) { showToast('복사 실패'); }
}

function renderKakaoLog() {
  var logEl = document.getElementById('kakao-log'); if (!logEl) return;
  try {
    var logs = JSON.parse(localStorage.getItem('dah_kakao_log') || '[]').filter(function(l) { return l.name === currentDetailName; });
    if (logs.length === 0) { logEl.textContent = '발송 이력 없음'; return; }
    logEl.innerHTML = '';
    logs.slice(0,3).forEach(function(l) {
      var methodBadge = l.method === '알림톡' ? ' [알림톡]' : ' [복사]';
      logEl.appendChild(div('font-size:11px;color:var(--dark);padding:3px 0;border-bottom:1px solid var(--border)', [span('', l.date + ' ' + l.time + ' — ' + l.type + methodBadge)]));
    });
  } catch(e) {}
}
