/* ══════════════════════════════════════════════════
   고객상세 - 소통(알림톡) 탭 렌더링
   ══════════════════════════════════════════════════
   dash-customer-detail.js에서 분리됨 (2026-07-17). */

function renderAlimSection(c, alimBody) {
  var alimSec = div('margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)', []);
  alimSec.appendChild(el('div', {style:'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px', text:'알림톡 발송 현황'}));

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
