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
  // 2026-09-08(선혜님 지적 - "김 은 고객님꺼 확정하고 최종견적서
  // 눌렀는데 다시 누르니 가견적서가 뜨네" → 실제 DB 데이터와 재현
  // 테스트로 근본원인 확인): 이름이 비어있을 때 "로컬에 저장된 아무
  // 가견적 항목이나(entry, 완전히 다른 고객일 수도 있음)" 가져와서
  // 폼 전체를 덮어쓰는 로직이 있었음 - 이게 실행되면 그 항목의 상태
  // (대부분 'ga')까지 함께 화면에 반영되어, 방금 최종견적서로 바꿨는데
  // 곧바로 가견적서로 되돌아가는 것처럼 보였음. 이름이 화면에 아직
  // 안 채워진 특정 순간(로딩 타이밍 등)에 이 탭을 누르면 트리거됐던
  // 것으로 추정. "다른 고객 정보로 조용히 덮어쓰기"는 그 자체로 위험한
  // 부작용이라(대표님이 지금 작성 중인 내용이 사라짐), 자동 채우기 없이
  // 안내만 하도록 안전하게 변경.
  if(!isRestoring && prev==='ga' && s==='final'){
    var cName = document.getElementById('c-name')?.value?.trim();
    if(cName){
      showToast('가견적 내용 기반으로 최종견적서를 작성합니다 🙂');
    } else {
      showToast('고객명을 먼저 입력해주세요 🙂');
    }
  }
  triggerSumPulse();
}

/* 저장된 가견적(dah_saved) 항목에서 고객 기본정보만 폼에 복원
   ※ 커튼/블라인드 제품행 상세정보는 저장 데이터 구조상 애초에 저장되지 않아 복원 불가 */
function loadEstimateEntry(entry) {
  if (!entry) return;
  // 2026-09-08(전수조사 중 발견 - 8/29에 다른 두 경로(loadCustId,
  // loadEstDbId)는 이미 고쳐져 있었는데, 이 경로(가견적→최종 전환시
  // 고객명이 비어있어 예전 가견적 항목에서 정보를 가져오는 특수
  // 케이스)만 estimate_status 복원 자체가 빠져있었음.
  if (entry.status && typeof setStatus === 'function') setStatus(entry.status, true);
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

function toggleDateTbd(dateFieldId) {
  var dateInp = document.getElementById(dateFieldId);
  var tbdCb = document.getElementById(dateFieldId + '-tbd');
  if (!dateInp || !tbdCb) return;
  if (tbdCb.checked) {
    dateInp.value = '';
    dateInp.disabled = true;
  } else {
    dateInp.disabled = false;
  }
}

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
// 2026-09-08(선혜님 지적 - "확정이 되더라도 수정이 되고, 수정후 저장을
// 해도 확정이 풀리지 않는다는거야 확정이 되면 수정이 안되어야 하는거
// 아니야" → "확정이 되면 아예 수정이 안되게 막아주고 수정을 원하면 확정을
// 한번 더 클릭해서 풀리면 수정이 되게"): 원래(8/19 이전)는 수정하면 확정이
// 조용히 자동으로 풀리는 방식이었는데, 그때 선혜님이 "수정해도 확정 표시는
// 유지"로 결정하시면서 감시 로직 자체를 제거함 - 근데 확정 버튼의 안내
// 문구는 그대로 "수정하면 확정이 자동으로 취소됩니다"로 남아있어서 실제
// 동작과 정반대인 채로 방치되어 있었음(진짜 버그). 이번엔 "확정하면 아예
// 수정 자체를 막고, 확정을 다시 눌러야 풀리는" 더 엄격한 방식으로 확정
// 지음 - 고객정보/커튼·블라인드/레일·시공비/AS폼 섹션 전체의 입력창·
// 선택창·버튼(추가/복사/삭제 등)을 disabled 처리.
function lockEstimateForm(locked) {
  var lockableIds = ['lockable-customer-info', 'lockable-products', 'lockable-rail-svc', 'as-form-section'];
  lockableIds.forEach(function(id) {
    var section = document.getElementById(id);
    if (!section) return;
    section.querySelectorAll('input, select, button, textarea').forEach(function(el) {
      el.disabled = locked;
    });
    section.classList.toggle('estimate-locked', locked);
  });
  // 2026-09-08(선혜님 발견 - "발주서는 아예 쓸 수가 없는 구조야" 논의 중
  // "실제로 원단/거래처는 계약(확정견적)된 후에야 정해진다"는 실제 업무
  // 흐름 확인): 원단명/거래처/가공소/컬러/레일거래처(.inner-fields) 칸은
  // 애초에 print-hide(고객용 견적서 출력물엔 안 보이는 순수 내부 발주용
  // 정보)로 설계되어 있었음 - 확정 버튼의 문구("이 견적 내용(사이즈·금액)을
  // 확정할까요")도 정확히 "고객에게 보여줄 견적 내용"을 잠그는 것이지
  // "내부 발주정보"까지 포함하는 게 아니었는데, 방금 전(같은 세션) 만든
  // 잠금 로직이 실수로 이 내부정보 칸까지 같이 잠가버려서 - 확정(계약) 후에
  // 원단/거래처를 정하는 실제 업무 흐름 자체가 막히는 정반대 상황이 될
  // 뻔했음. 견적 확정 여부와 무관하게 항상 입력 가능해야 하므로 잠금
  // 대상에서 제외.
  document.querySelectorAll('.inner-fields').forEach(function(wrap) {
    wrap.querySelectorAll('input, select, button, textarea').forEach(function(el) {
      el.disabled = false;
    });
  });
  // 2026-09-11(선혜님 지적 - "고객이 확정된 뒤에 시공일자를 바꾸면
  // 견적서에는 수정이 또 안되네"): 실측/시공 예정일도 원단/거래처와
  // 정확히 같은 이유(계약 확정 후에도 실제 일정은 얼마든지 바뀔 수
  // 있음 - 일정 변경, 지연 등)로 잠금 대상에서 빠져야 하는데, 확정
  // 잠금 섹션(lockable-customer-info) 안에 함께 있어서 실수로 같이
  // 잠기고 있었음.
  document.querySelectorAll('.schedule-fields').forEach(function(wrap) {
    wrap.querySelectorAll('input, select, button, textarea').forEach(function(el) {
      el.disabled = false;
    });
  });
  // 위 action-bar 예외처리와 마찬가지로, action-bar도 계속 활성 유지.
  var actionBar = document.querySelector('.action-bar');
  if (actionBar) {
    actionBar.querySelectorAll('input, select, button, textarea').forEach(function(el) {
      el.disabled = false;
    });
    actionBar.classList.remove('estimate-locked');
  }
}

function toggleConfirmEstimate() {
  if (window._estimateConfirmedAt) {
    if (!confirm('확정을 취소할까요? (다시 수정 가능한 상태로 돌아갑니다)')) return;
    window._estimateConfirmedAt = null;
    lockEstimateForm(false);
    showToast('견적 확정이 취소됐습니다 — 다시 수정 가능합니다');
  } else {
    if (!confirm('이 견적 내용(사이즈·금액)을 확정할까요?\n확정하면 수정할 수 없게 잠깁니다. 다시 수정하려면 확정을 한번 더 눌러 해제하세요.')) return;
    window._estimateConfirmedAt = new Date().toISOString();
    lockEstimateForm(true);
    showToast('견적이 확정됐습니다 — 수정하려면 확정을 다시 눌러 해제하세요');
  }
  renderConfirmBadge();
  if (typeof calcTotal === 'function') calcTotal(); // 저장 전이라도 상태를 즉시 반영
}

function renderConfirmBadge() {
  // 2026-08-26: 예전엔 배지(표시 전용, 확정시에만 보임)와 버튼(탭줄의
  // 액션, 항상 보임)이 따로 있었는데, 이제 hd-confirm-badge 하나가 표시+
  // 클릭 액션을 겸함(A안). 미확정=연한 테두리만, 확정=진한 배경으로 채움.
  // 2026-09-08: 견적서를 불러오는 모든 지점(4곳)에서 renderConfirmBadge가
  // 호출되니, 잠금 처리도 여기 한 곳에 포함시켜서 이미 확정된 견적서를
  // 열었을 때 바로 잠긴 상태로 보이게 함 - 호출부마다 따로 안 챙겨도 됨.
  if (typeof lockEstimateForm === 'function') lockEstimateForm(!!window._estimateConfirmedAt);
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
