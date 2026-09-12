/* ══════════════════════════════════════════════════
   고객상세 - 소통(알림톡) 탭 렌더링
   ══════════════════════════════════════════════════
   dash-customer-detail.js에서 분리됨 (2026-07-17). */

// 2026-09-11(선혜님 지시 — 트리거감지 1단계): 기존엔 "이 단계면 무조건
// 지금 보낼 것"으로만 판단해서, 방문예약 단계에 들어오자마자 "내일 방문
// 예정" 문구(D-1용)가 실제로는 열흘 뒤 방문인데도 떠버리는 문제가 있었음.
// 오늘 정한 9개 정책 중 시점 계산이 필요한 5개(자동 태그: t01,tA,t04,t11,
// t12)만 이 규칙으로 걸러내고, 나머지 8개(즉시성 항목)는 기존처럼 "단계
// 진입 즉시 할 일"로 그대로 둠. 아직 자동발송 채널이 없어 실제 발송은
// 여전히 사람이 클릭해야 하지만, "지금 진짜 보낼 때가 됐는지"는 이제
// 정확히 계산됨.
function daysBetween(dateStr, now) {
  if (!dateStr) return null;
  var d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d - today) / 86400000);
}
var TIMED_ALIM_RULES = {
  // 정책: 예약 확인 30분~1시간 후 — 정확한 시각 대신 생성시각(createdAt)으로 판단,
  // 없는 예전 데이터는 판단 불가하니 그냥 즉시 노출(구데이터 호환)
  t01_survey: function(c, sent, now) {
    if (!c.createdAt) return true;
    var created = new Date(c.createdAt);
    if (isNaN(created.getTime())) return true;
    return (now - created) >= 30 * 60 * 1000;
  },
  // 정책: 방문일 D-1, 단 당일/익일 촉박 예약이면 D-1을 기다리지 않고 즉시.
  // 일정이 재조정되면(재예약 등) forDate가 달라져서 자동으로 다시 떠오름 —
  // 별도의 "초기화" 로직 없이 날짜비교 자체로 재예약 케이스가 해결됨.
  tA_visit_dday: function(c, sent, now) {
    var ctx = guessContextVars(c);
    var d = daysBetween(ctx.visitDate, now);
    if (d === null) return false;
    if (sent && sent.forDate === ctx.visitDate) return false;
    return d <= 1;
  },
  // 정책: 상담 3일 후, 단 그 시점에 "아직 미결제인지" 매번 재확인(예약이 아니라 재검사)
  t04_followup: function(c, sent, now) {
    if (['선금결제','실측준비중','확정견적','잔금결제','시공준비중','시공완료'].indexOf(c.stage) >= 0) return false;
    var d = daysBetween(c.date, now);
    return d !== null && d <= -3; // daysBetween은 미래가 양수라, "3일 지남"은 -3 이하
  },
  t11_after_install: function(c, sent, now) {
    var d = daysBetween(c.installDate, now);
    return d !== null && d <= -3;
  },
  t12_repeat_purchase: function(c, sent, now) {
    var d = daysBetween(c.installDate, now);
    return d !== null && d <= -182;
  }
};
function isAlimDueNow(key, c, sent, now) {
  var rule = TIMED_ALIM_RULES[key];
  if (!rule) return !sent; // 즉시성 8개 항목은 기존 방식 그대로
  return rule(c, sent, now);
}

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

  // ── "지금 할 일" — 현재 단계에 맞는 항목 중, 시점이 실제로 된 것만(트리거감지) ──
  var recommendedKeys = STAGE_ALIM[c.stage] || [];
  var _now = new Date();
  var todoKeys = recommendedKeys.filter(function(k){ return isAlimDueNow(k, c, sentMap[k], _now); });
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
// 2026-09-11: 13개 통합안 반영. A(방문전날)/B(일정확정)/C(결제안내)/D(취소안내)는
// 옛 여러 문구를 하나로 합친 대신 상황별 변수(#{방문유형} 등)가 생겼음. 아직
// 트리거감지 함수가 없어서(다음 단계) 지금은 고객의 현재 단계(c.stage)로 최선의
// 기본값을 추정해서 채워두고, 발송 전 미리보기에서 사람이 확인·수정할 수 있게 함
// — 자동추정이 틀려도 발송 사고로 이어지지 않도록 항상 사람 확인을 거치는 구조.
function guessContextVars(c) {
  var stage = c.stage || '';
  var visitType, visitDate, scheduleType, scheduleDate, amountType, amount, refundNote;

  if (['시공준비중','시공완료'].indexOf(stage) >= 0) { visitType = '시공'; visitDate = c.installDate; }
  else if (['선금결제','실측준비중'].indexOf(stage) >= 0) { visitType = '실측'; visitDate = c.measureDate; }
  else { visitType = '쇼룸'; visitDate = c.date; }

  if (['잔금결제','시공준비중'].indexOf(stage) >= 0) { scheduleType = '시공'; scheduleDate = c.installDate; }
  else { scheduleType = '실측'; scheduleDate = c.measureDate; }

  if (['확정견적','잔금결제','시공준비중'].indexOf(stage) >= 0) {
    amountType = '잔금';
    amount = Math.max((Number(c.price)||0) - (Number(c.depositAmount)||0), 0) || c.balanceAmount;
  } else {
    amountType = '계약금';
    amount = c.depositAmount;
  }

  refundNote = (['실측준비중','확정견적','잔금결제','시공준비중','시공완료'].indexOf(stage) >= 0 && c.measureDate)
    ? '실측 진행 후 취소의 경우 실측 수수료 10만원을 제외한 금액을 환불해드려요.'
    : '계약금 전액을 환불해드릴게요.';

  return { visitType: visitType, visitDate: visitDate, scheduleType: scheduleType, scheduleDate: scheduleDate, amountType: amountType, amount: amount, refundNote: refundNote };
}

function fillAlimTemplate(tpl, c) {
  var fmt = function(n) { return (Number(n) || 0).toLocaleString('ko-KR'); };
  var ctx = guessContextVars(c || {});
  var map = {
    '고객명': c.clientName || '',
    '방문일시': c.date || '미정',
    '방문유형': ctx.visitType,
    '일정': ctx.visitDate || ctx.scheduleDate || '미정',
    '일정유형': ctx.scheduleType,
    '금액유형': ctx.amountType,
    '금액': fmt(ctx.amount),
    '공간': c.space ? (c.space + ' ') : '',
    '환불안내': ctx.refundNote,
    '결제링크': c.paymentLink || '(결제링크 미등록 — 고객상세에서 먼저 입력해주세요)'
  };
  var filled = (tpl || '').replace(/#\{([^}]+)\}/g, function(_, key) {
    return (key in map) ? map[key] : ('#{' + key + '}');
  });
  // #{공간}처럼 빈 값이 될 수 있는 변수가 문장 중간에 있으면 공백이 두 번
  // 겹치는 경우가 생김(예: "님,  상담") — 줄 단위로 중복 공백만 정리
  return filled.split('\n').map(function(line) { return line.replace(/ {2,}/g, ' '); }).join('\n');
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
    (meta.button ? '<div style="font-size:11px;color:var(--sub);background:var(--ivory1);padding:6px 10px;border-radius:8px;margin-bottom:var(--sp-2)">🔘 딜러사 등록 시 버튼: ' + escHtml(meta.button) + '</div>' : '') +
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
      var ctxForLog = (typeof guessContextVars === 'function') ? guessContextVars(c) : {};
      logs.unshift({
        name: c.clientName,
        custId: c.id || null,
        type: key,
        label: meta.label,
        date: (now.getMonth()+1)+'월 '+now.getDate()+'일',
        time: now.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}),
        method: meta.tag,
        message: finalMsg,
        forDate: key === 'tA_visit_dday' ? ctxForLog.visitDate : (key === 'tB_schedule_confirm' ? ctxForLog.scheduleDate : undefined)
      });
      localStorage.setItem('dah_kakao_log', JSON.stringify(logs.slice(0,200)));
    } catch(e){}
    if (typeof logEvent === 'function') logEvent('alimtalk_send', { type: key, label: meta.label, customerId: c.id, customerName: c.clientName });
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
