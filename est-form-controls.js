/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 폼 상태/타입 제어
   가견적↔최종견적 전환, 고객유형(신규/재구매/AS) 전환,
   AS비용 표시, 내부정보 접기/펼치기, 공간선택 팝업, 전화번호 포맷.
   ══════════════════════════════════════════════════ */

function setStatus(s, isRestoring) {
  var prev = currentTab;
  currentTab = s;
  ['ga','final'].forEach(function(t){
    document.getElementById('status-'+t).className = 'est-status-btn'+(t===s?' on':'');
  });
  var titles = {ga:'가견적서', final:'최종 견적서'};
  document.getElementById('hd-title').textContent = titles[s];
  
  // 2026-08-29(선혜님 지적 - "확정견적서를 눌러도 왜 계속 다시 가견적서로
  // 돌아가니"로 발견, 수정 중 추가 발견): 견적서를 "열어서 수정"할 때
  // 저장된 확정상태를 복원하려고 이 함수를 부르면, 로드 직후 currentTab이
  // 항상 초기값('ga')이라 아래 "가견적→확정 전환" 로직이 실수로 함께
  // 실행됨 - "지금 막 전환하는 것"으로 오인해 부적절한 안내 토스트가
  // 뜨고, 고객명이 비어있는 특정 상황에선 localStorage의 다른 가견적
  // 항목으로 고객정보를 덮어쓸 위험까지 있었음. isRestoring=true로
  // 부르면 이 전환 로직 전체를 건너뛰고 상태표시만 조용히 갱신함.
  if(!isRestoring && prev==='ga' && s==='final'){
    var cName = document.getElementById('c-name')?.value?.trim();
    if(cName){
      
      showToast('가견적 내용 기반으로 최종견적서를 작성합니다 🙂');
    } else {
      
      try {
        var saved = JSON.parse(localStorage.getItem('dah_saved')||'[]');
        var gaEntry = saved.find(function(e){ return e.status==='ga'; });
        if(gaEntry){ loadEstimateEntry(gaEntry); showToast('고객 정보를 불러왔습니다. 제품 목록은 다시 입력해주세요 🙂'); }
        else { showToast('가견적 내용을 기반으로 최종견적서를 작성합니다 🙂'); }
      } catch(e){ showToast('가견적 내용을 기반으로 최종견적서를 작성합니다 🙂'); }
    }
  }
  triggerSumPulse();
}

/* 저장된 가견적(dah_saved) 항목에서 고객 기본정보만 폼에 복원
   ※ 커튼/블라인드 제품행 상세정보는 저장 데이터 구조상 애초에 저장되지 않아 복원 불가 */
function loadEstimateEntry(entry) {
  if (!entry) return;
  var nameEl = document.getElementById('c-name');
  if (nameEl && entry.clientName) nameEl.value = entry.clientName;
  var phoneEl = document.getElementById('c-phone');
  if (phoneEl && entry.phone) phoneEl.value = entry.phone;
  var addrEl = document.getElementById('c-addr');
  if (addrEl && entry.addr) addrEl.value = entry.addr;
  var staffEl = document.getElementById('c-staff');
  if (staffEl && entry.staffName) staffEl.value = entry.staffName;
  var memoEl = document.getElementById('c-memo');
  if (memoEl && entry.memo) memoEl.value = entry.memo;
  var measureEl = document.getElementById('c-measure');
  if (measureEl && entry.date) measureEl.value = entry.date;
  var installEl = document.getElementById('c-install');
  if (installEl && entry.installDate) installEl.value = entry.installDate;
  window._estimateConfirmedAt = entry.confirmedAt || null;
  if (typeof renderConfirmBadge === 'function') renderConfirmBadge();
}

var currentCustType = 'new';
function setCustType(type) {
  currentCustType = type;
  ['new','rebuy','as'].forEach(function(t){
    var btn = document.getElementById('type-'+t);
    if(btn) btn.className = 'cust-type-btn' + (t===type?' on':'');
  });
  
  var ctypeMap = {new:'신규', rebuy:'재구매', as:'AS'};
  var ctypeEl = document.getElementById('c-type');
  if(ctypeEl) ctypeEl.value = ctypeMap[type]||'신규';

  var curtainSec  = document.querySelector('.section:has(#curtain-table)') ||
                    document.getElementById('curtain-table')?.closest('.section');
  var summaryEl   = document.querySelector('.summary-section');
  var asForm      = document.getElementById('as-form-section');
  var regionRow   = document.querySelector('.region-row');

  if(type === 'as') {
    
    if(curtainSec) curtainSec.style.display = 'none';
    if(summaryEl)  summaryEl.style.display  = 'none';
    if(regionRow)  regionRow.style.display  = 'none';
    if(asForm)     asForm.style.display     = 'block';
  } else {
    
    if(curtainSec) curtainSec.style.display = '';
    if(summaryEl)  summaryEl.style.display  = '';
    if(regionRow)  regionRow.style.display  = '';
    if(asForm)     asForm.style.display     = 'none';

    if(type === 'rebuy') {
      
      setTimeout(openCustomerLoad, 150);
    }
  }
}

function setAsFee(radio) {
  var note = document.getElementById('as-fee-note');
  if(!note) return;
  note.textContent = radio.value === 'free' ? '무상 처리' : '유상 — 비용 별도 안내';
  note.style.color = radio.value === 'paid' ? '#282828' : '#B0A99F';
}

function toggleInternal(btn) {
  btn.classList.toggle('open');
  var box = btn.nextElementSibling;
  box.classList.toggle('open');
}

var _spaceTarget = null;
var SPACES = ['거실','안방','자녀방','서재','주방','욕실','기타'];

function openSpacePicker(inp) {
  _spaceTarget = inp;
  var rect = inp.getBoundingClientRect();
  var box = document.getElementById('space-picker-box');
  var top = rect.bottom + 4;
  var left = rect.left;
  if(top + 260 > window.innerHeight) top = rect.top - 260;
  if(left + 260 > window.innerWidth) left = window.innerWidth - 272;
  if(left < 8) left = 8;
  box.style.top = top+'px'; box.style.left = left+'px';
  document.getElementById('space-btns').innerHTML = SPACES.map(function(s){
    var on = inp.value === s ? ' on' : '';
    return '<button class="space-btn'+on+'" data-space="'+s+'" onclick="pickSpace(this)">'+s+'</button>';
  }).join('');
  // 2026-09-04: 이미 입력된 값이 고정 버튼 목록에 없는 직접입력 값이면
  // (예: "드레스룸"), 다시 열었을 때도 그 값이 보이도록 미리 채워둠 -
  // 프리셋 중 하나면 버튼 클릭이 명확하니 직접입력 칸은 비워둠.
  var customInp = document.getElementById('space-custom-input');
  if (customInp) customInp.value = (inp.value && SPACES.indexOf(inp.value) < 0) ? inp.value : '';
  document.getElementById('space-picker').style.display = 'block';
}

function pickCustomSpace() {
  var customInp = document.getElementById('space-custom-input');
  var val = customInp ? customInp.value.trim() : '';
  if (!val) return;
  if (_spaceTarget) _spaceTarget.value = val;
  document.getElementById('space-picker').style.display = 'none';
}

function pickSpace(btn) {
  if(_spaceTarget) _spaceTarget.value = btn.dataset.space;
  document.getElementById('space-picker').style.display = 'none';
}

function closeSpacePicker(e) {
  if(e.target === document.getElementById('space-picker'))
    document.getElementById('space-picker').style.display = 'none';
}

function fmtPhone(el) {
  var v = el.value.replace(/\D/g,'');
  // 2026-08-28(선혜님 지적 - "너는 왜 자꾸 버그를 못찾니"로 시작한 재점검 중
  // 발견): 대시보드(dash-utils.js)의 fmtPhone은 서울 지역번호(02)를 2자리
  // 프리픽스로 정확히 처리하는데, 이 견적서 앱 버전엔 그 처리가 아예 없어서
  // "02-XXXX-XXXX"(서울 유선전화)를 입력하면 무조건 3자리 프리픽스로
  // 잘못 나뉘어 포맷되고 있었음(예: "023-4567-890"처럼). 두 앱이 완전히
  // 별도 배포(다른 도메인)라 코드를 공유할 수 없어서 각자 따로 구현돼있는데,
  // 이번에 대시보드 버전과 동작이 어긋나 있던 걸 발견 - 같은 로직으로 맞춤.
  if (v.slice(0,2) === '02') {
    if (v.length<=6) el.value = v.slice(0,2)+'-'+v.slice(2);
    else if (v.length<=9) el.value = v.slice(0,2)+'-'+v.slice(2,5)+'-'+v.slice(5);
    else el.value = v.slice(0,2)+'-'+v.slice(2,6)+'-'+v.slice(6,10);
    return;
  }
  if(v.length<=3) el.value=v;
  else if(v.length<=7) el.value=v.slice(0,3)+'-'+v.slice(3);
  else el.value=v.slice(0,3)+'-'+v.slice(3,7)+'-'+v.slice(7,11);
}

// 견적 확정: "이 견적 내용(사이즈/금액)이 더 이상 안 바뀐다"는 걸 명시하는 기능.
// 대시보드의 "계약상태"(가견적/계약됨/미계약)와는 별개 개념 —
// 계약상태는 "고객이 계약금을 냈는지", 이 확정은 "견적 세부내용이 확정됐는지"를 나타냄.
// (선혜님 워크플로우: 실측 후 확정견적서를 고객과 조율 → 더 안 바뀌면 [확정] 클릭)
var _estimateConfirmedAt = null;
function toggleConfirmEstimate() {
  if (window._estimateConfirmedAt) {
    if (!confirm('확정을 취소할까요? (다시 수정 가능한 상태로 돌아갑니다)')) return;
    window._estimateConfirmedAt = null;
    showToast('견적 확정이 취소됐습니다 — 다시 수정 가능합니다');
  } else {
    if (!confirm('이 견적 내용(사이즈·금액)을 확정할까요?\n확정 후에도 수정할 수 있지만, 수정하면 확정이 자동으로 취소됩니다.')) return;
    window._estimateConfirmedAt = new Date().toISOString();
    showToast('견적이 확정됐습니다');
  }
  renderConfirmBadge();
  if (typeof calcTotal === 'function') calcTotal(); // 저장 전이라도 상태를 즉시 반영
}

function renderConfirmBadge() {
  // 2026-08-26: 예전엔 배지(표시 전용, 확정시에만 보임)와 버튼(탭줄의
  // 액션, 항상 보임)이 따로 있었는데, 이제 hd-confirm-badge 하나가 표시+
  // 클릭 액션을 겸함(A안). 미확정=연한 테두리만, 확정=진한 배경으로 채움.
  var badge = document.getElementById('hd-confirm-badge');
  if (!badge) return;
  if (window._estimateConfirmedAt) {
    var d = new Date(window._estimateConfirmedAt);
    var dateStr = d.getFullYear() + '.' + (d.getMonth()+1) + '.' + d.getDate();
    badge.textContent = '✓ 확정됨 (' + dateStr + ')';
    badge.style.background = '#3B6D11';
    badge.style.borderColor = '#3B6D11';
    badge.style.color = '#EAF3DE';
  } else {
    badge.textContent = '✓ 확정';
    badge.style.background = 'transparent';
    badge.style.borderColor = 'rgba(255,255,255,0.25)';
    badge.style.color = 'rgba(255,255,255,0.5)';
  }
}

// 2026-08-19(선혜님 확인): 견적 내용을 수정해도 "확정" 표시가 자동으로 취소되지
// 않도록 함 — 예전엔 사이즈/금액 입력이 바뀌면 확정이 조용히 풀렸는데, 선혜님이
// "수정해도 확정 표시 그대로 유지"로 확정하셔서 이 감시 로직 자체를 제거함.
