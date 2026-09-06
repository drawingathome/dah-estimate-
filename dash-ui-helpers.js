/* ══════════════════════════════════════════════════
   DAH 대시보드 — UI 헬퍼 / 입력값 검증 함수 모음
   화면 전체를 그리는 큰 함수는 아니지만, 여러 화면에서
   공통으로 가져다 쓰는 작은 도구함수들 (DOM 생성, 입력값 검증,
   중복고객 확인). 다른 큰 render 함수들보다 먼저 로드되어야 함.
   ══════════════════════════════════════════════════ */

function el(tag, attrs, children) {
  var e = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function(k) {
    if (k === 'style') e.style.cssText = attrs[k];
    else if (k === 'class') e.className = attrs[k];
    else if (k === 'text') e.textContent = attrs[k];
    else e.setAttribute(k, attrs[k]);
  });
  if (children) children.forEach(function(c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function div(style, children) { return el('div', {style: style}, children); }
function span(style, text) { return el('span', {style: style, text: text}); }
function btn(style, text, onClick) { var b = el('button', {style: style, text: text}); b.addEventListener('click', onClick); return b; }

// ── 빠른이동 내비게이션 (PC 전용, 섹션 많은 화면에서 우측 고정 목차) ──
// 사용법: renderQuickNav([{id:'sec-goal', label:'목표'}, ...])
// 화면(탭)을 벗어나면 반드시 hideQuickNav()로 제거해야 다른 화면에 남아있지 않음.
function hideQuickNav() {
  var existing = document.getElementById('quick-nav');
  if (existing) existing.remove();
  document.body.classList.remove('has-quicknav');
}
function renderQuickNav(items) {
  hideQuickNav();
  if (!items || items.length === 0) return;
  if (window.innerWidth < 1024) return; // 모바일/태블릿은 섹션 자체가 짧아 생략

  var nav = document.createElement('div');
  nav.id = 'quick-nav';
  nav.className = 'quick-nav';
  items.forEach(function(item) {
    var link = document.createElement('a');
    link.href = '#' + item.id;
    link.textContent = item.label;
    link.onclick = function(e) {
      e.preventDefault();
      var target = document.getElementById(item.id);
      if (!target) return;
      // 아코디언 패턴(헤더+본문 2개 자식, 본문이 접혀있음)이면 먼저 펼침
      if (target.children.length === 2 && target.children[1].style.display === 'none') {
        target.children[0].click();
      }
      target.scrollIntoView({behavior:'smooth', block:'start'});
    };
    nav.appendChild(link);
  });
  document.body.appendChild(nav);
  document.body.classList.add('has-quicknav');
}

function checkDuplicate(name, phone) {
  try {
    var customers = loadCustomers();
    var cleanPhone = (phone || '').replace(/[^0-9]/g, '');

    // 2026-08-28(선혜님 지적 — "등록이 되어있다고 등록이 안되는데 여기서
    // 검토도 안되네", 배재연 사례): 오지은 실장이 등록했던 배재연을
    // 선혜님이 보관처리(삭제)하고 마스터 계정으로 새로 등록하려 했는데,
    // 이 중복확인이 "이미 등록된 연락처예요"라고 막았음(실제로는 새
    // 등록이 아예 안 됐음 - DB 확인 결과 마스터 버전은 존재하지 않고
    // 오지은의 보관된 기록만 남아있었음). 원인: 이름/연락처 중복 판정이
    // is_archived(보관처리됨) 여부를 전혀 확인 안 하고 있었음 - 이미
    // 지운(보관한) 예전 기록도 "아직 있는 고객"으로 취급해서 정당한
    // 재등록을 막고 있었음. 활성(보관 안 된) 고객만 중복으로 본다.
    var nameDup = customers.filter(function(c) {
      return !c.is_archived && c.clientName && c.clientName.trim() === name.trim();
    });
    // 연락처 중복
    var phoneDup = customers.filter(function(c) {
      return !c.is_archived && c.phone && c.phone.replace(/[^0-9]/g, '') === cleanPhone && cleanPhone.length >= 10;
    });

    if (phoneDup.length > 0) {
      return { isDup: true, type: 'phone', customer: phoneDup[0],
        msg: '이미 등록된 연락처예요 (' + phoneDup[0].clientName + ')' };
    }
    if (nameDup.length > 0) {
      return { isDup: true, type: 'name', customer: nameDup[0],
        msg: '같은 이름의 고객이 있어요 (' + nameDup[0].clientName + '). 그래도 등록할까요?' };
    }
    return { isDup: false };
  } catch(e) { return { isDup: false }; }
}

function validatePhone(phone) {
  if (!phone) return { ok: false, msg: '연락처를 입력해주세요' };
  var clean = phone.replace(/[^0-9]/g, '');
  if (clean.length < 10 || clean.length > 11) {
    return { ok: false, msg: '연락처 형식이 올바르지 않습니다 (예: 010-1234-5678)' };
  }
  if (!clean.startsWith('01')) {
    return { ok: false, msg: '올바른 휴대폰 번호를 입력해주세요' };
  }
  return { ok: true };
}

// 고객명 검증
function validateName(name) {
  if (!name || !name.trim()) return { ok: false, msg: '고객명을 입력해주세요' };
  if (name.trim().length < 2) return { ok: false, msg: '고객명은 2자 이상 입력해주세요' };
  if (name.trim().length > 20) return { ok: false, msg: '고객명은 20자 이하로 입력해주세요' };
  return { ok: true };
}

// 금액 검증 (음수 방지)
// 2026-08-28: validateAmount(음수 방지 금액검증 헬퍼)도 어디서도 호출
// 안 되고 있어서 제거.


// 날짜 검증
function validateDate(dateStr) {
  if (!dateStr) return { ok: true }; // 날짜는 선택사항
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return { ok: false, msg: '올바른 날짜를 선택해주세요' };
  // 너무 과거/미래 체크
  var now = new Date();
  var minDate = new Date(now.getFullYear() - 5, 0, 1);
  var maxDate = new Date(now.getFullYear() + 3, 11, 31);
  if (d < minDate || d > maxDate) {
    return { ok: false, msg: '날짜 범위를 확인해주세요' };
  }
  return { ok: true };
}

// 연락처 자동 포맷 (010-1234-5678)
function formatPhone(input) {
  var clean = input.replace(/[^0-9]/g, '');
  // 2026-08-29(선혜님 지시 - HTML 파일 전체 재검토로 발견): 대시보드/견적서
  // 앱의 fmtPhone 2개(오늘 이미 발견·통일함)와는 완전히 별개인 세 번째
  // 전화번호 포맷 함수 - "고객 추가" 폼(add-name)에서 지금 실제로 쓰이고
  // 있는데, 정확히 같은 버그(서울 지역번호 02 처리 누락)가 있었음. 서울
  // 유선전화(02-XXXX-XXXX)를 입력하면 3자리 프리픽스로 잘못 나뉘어
  // 포맷되고 있었음 - fmtPhone과 동일한 로직으로 맞춤.
  if (clean.slice(0,2) === '02') {
    if (clean.length<=6) return clean.slice(0,2)+'-'+clean.slice(2);
    if (clean.length<=9) return clean.slice(0,2)+'-'+clean.slice(2,5)+'-'+clean.slice(5);
    return clean.slice(0,2)+'-'+clean.slice(2,6)+'-'+clean.slice(6,10);
  }
  if (clean.length <= 3)  return clean;
  if (clean.length <= 7)  return clean.slice(0,3) + '-' + clean.slice(3);
  if (clean.length <= 11) return clean.slice(0,3) + '-' + clean.slice(3,7) + '-' + clean.slice(7);
  return clean.slice(0,3) + '-' + clean.slice(3,7) + '-' + clean.slice(7,11);
}

// 입력 필드 오류 표시
function showFieldError(inputEl, msg) {
  inputEl.style.borderColor = 'var(--danger)';
  var errEl = inputEl.parentNode.querySelector('.field-err');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.className = 'field-err';
    errEl.style.cssText = 'font-size:11px;color:var(--danger);margin-top:var(--sp-1);font-weight:600';
    inputEl.parentNode.appendChild(errEl);
  }
  errEl.textContent = msg;
}

function clearFieldError(inputEl) {
  inputEl.style.borderColor = '';
  var errEl = inputEl.parentNode.querySelector('.field-err');
  if (errEl) errEl.remove();
}

/* ── 로딩 스피너 ── */
function showLoading(msg) {
  var overlay = document.getElementById('loading-overlay');
  var text    = document.getElementById('loading-text');
  if (overlay) overlay.classList.add('show');
  if (text)    text.textContent = msg || '불러오는 중...';
}
function hideLoading() {
  var overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.remove('show');
}

/* ── 주소검색(다음 우편번호) ── */
function openKakaoAddr(targetId) {
  var script = document.createElement('script');
  script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  script.onload = function() {
    new daum.Postcode({
      oncomplete: function(data) {
        var addr = data.roadAddress || data.jibunAddress;
        var el = document.getElementById(targetId);
        if (el) {
          el.value = addr;
          el.dispatchEvent(new Event('input'));
          el.dispatchEvent(new Event('change'));
        }
      }
    }).open();
  };
  
  if (window.daum && window.daum.Postcode) {
    script.onload = null;
    new daum.Postcode({
      oncomplete: function(data) {
        var addr = data.roadAddress || data.jibunAddress;
        var el = document.getElementById(targetId);
        if (el) {
          el.value = addr;
          el.dispatchEvent(new Event('input'));
          el.dispatchEvent(new Event('change'));
        }
      }
    }).open();
  } else {
    document.head.appendChild(script);
  }
}
