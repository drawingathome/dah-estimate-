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

function checkDuplicate(name, phone) {
  try {
    var customers = loadCustomers();
    var cleanPhone = (phone || '').replace(/[^0-9]/g, '');

    // 이름 중복
    var nameDup = customers.filter(function(c) {
      return c.clientName && c.clientName.trim() === name.trim();
    });
    // 연락처 중복
    var phoneDup = customers.filter(function(c) {
      return c.phone && c.phone.replace(/[^0-9]/g, '') === cleanPhone && cleanPhone.length >= 10;
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
function validateAmount(val) {
  var num = Number(String(val).replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) return { ok: false, msg: '올바른 금액을 입력해주세요' };
  if (num < 0)    return { ok: false, msg: '금액은 0원 이상이어야 합니다' };
  if (num > 999999999) return { ok: false, msg: '금액이 너무 큽니다' };
  return { ok: true, value: num };
}

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
    errEl.style.cssText = 'font-size:11px;color:var(--danger);margin-top:4px;font-weight:600';
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
