/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 유틸함수 + API 설정
   견적번호 생성, 금액 포맷, HTML 이스케이프, Supabase/구글드라이브 설정,
   구글드라이브 문서저장/고객시트 동기화.
   ══════════════════════════════════════════════════ */

var DAH_LOGO_B64 = 'https://raw.githubusercontent.com/drawingathome/dah-estimate-/main/logo.png';

function fmtPrice(inp) {
  // 2026-08-14: getPriceVal을 고쳐도 여전히 음수가 안 살아나던 진짜 원인 —
  // 이 함수가 입력 즉시(oninput) 마이너스 부호를 지우고 data-raw에 저장해서,
  // getPriceVal이 읽는 시점엔 이미 양수로 바뀌어 있었음. 부자재 단가(sprice)만
  // "이 항목만 할인" 용도로 마이너스를 실제로 쓰신다고 확인(선혜님) — sprice에만
  // 마이너스 허용, 폭/높이/커튼단가/블라인드단가 등 나머지는 기존대로 방어.
  var allowNeg = inp.classList.contains('sprice');
  var raw = inp.value.replace(allowNeg ? /[^0-9-]/g : /[^0-9]/g, '');
  if (allowNeg) {
    var isNeg = raw.charAt(0) === '-';
    raw = raw.replace(/-/g, '');
    if (isNeg && raw) raw = '-' + raw;
  }
  inp.setAttribute('data-raw', raw);
  if(document.activeElement !== inp) {
    inp.value = raw ? parseInt(raw).toLocaleString() : '';
  }
}
function fmtPriceBlur(inp) {
  var allowNeg = inp.classList.contains('sprice');
  var raw = (inp.getAttribute('data-raw') || inp.value).replace(allowNeg ? /[^0-9-]/g : /[^0-9]/g, '');
  if (allowNeg) {
    var isNeg = raw.charAt(0) === '-';
    raw = raw.replace(/-/g, '');
    if (isNeg && raw) raw = '-' + raw;
  }
  inp.setAttribute('data-raw', raw);
  inp.value = raw ? parseInt(raw).toLocaleString() : '';
}
function fmtPriceFocus(inp) {
  var raw = inp.getAttribute('data-raw') || '';
  if(raw) inp.value = raw;
}
var INP = 'width:100%;padding:2px 0;border:none;font-size:11px;font-family:inherit;outline:none;background:transparent;color:#282828';
var SEL = 'width:100%;padding:2px 0;border:none;font-size:11px;font-family:inherit;outline:none;background:transparent;color:#282828;cursor:pointer';

function getPriceVal(el) {
  if(!el) return 0;
  var raw = el.getAttribute('data-raw') || el.value || '0';
  // 2026-08-14: 예전엔 [^0-9]로 숫자 아닌 문자를 다 지웠는데, 이때 마이너스
  // 부호(-)도 같이 사라져서 "-50000"이 "50000"으로 조용히 양수가 됐음
  // (불변조건 점검 중 발견, 선혜님 확인 — 부자재에 "이 항목만 할인" 용도로
  // 마이너스를 실제로 쓰신다고 하심). 앞쪽 마이너스 부호는 보존.
  // 음수를 막아야 하는 필드(폭/높이/커튼단가 등)는 각 호출부에서 이미
  // Math.max(0, ...)로 방어하고 있으므로, 여기서 값을 죽이지 않아도 안전함.
  var m = raw.match(/-?[0-9][0-9]*/);
  return m ? parseInt(m[0]) : 0;
}

const LOGO_SRC = 'logo.png';
const SUPABASE_URL = 'https://sradnglutbzbyyunjyah.supabase.co';
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const SUPABASE_KEY = 'sb_publishable_9nYjQBzwiyausr7-Cd-elw_S9inJlge';

// 지역별 실측비/시공비 (2026-07-31 신규) — 예전엔 코드에 고정값. 이제 대시보드
// 설정탭에서 관리하는 값을 Supabase에서 직접 조회해 옴 (견적서 앱은 dash-api.js를
// 안 불러오므로 최소한의 조회 로직만 여기 둠). 조회 실패해도 기본값으로 안전하게 동작.
var DEFAULT_REGION_FEES = { '서울': {'실측비':40000, '시공비':50000}, '경기': {'실측비':60000, '시공비':80000} };
function getRegionFees() {
  try {
    var cached = JSON.parse(localStorage.getItem('dah_region_fees') || 'null');
    return cached || DEFAULT_REGION_FEES;
  } catch(e) { return DEFAULT_REGION_FEES; }
}
function fetchRegionFeesFromCloud(callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', SUPABASE_URL + '/rest/v1/app_settings?key=eq.region_fees&select=value', true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.onload = function() {
    try {
      if (xhr.status === 200) {
        var rows = JSON.parse(xhr.responseText);
        if (rows && rows[0] && rows[0].value) {
          localStorage.setItem('dah_region_fees', JSON.stringify(rows[0].value));
        }
      }
    } catch(e) {}
    if (callback) callback();
  };
  xhr.onerror = function() { if (callback) callback(); };
  xhr.send();
}

// 2026-08-14: 할인 쿠폰 다중선택 기능(선혜님 확인) — 설정에서 마스터가 등록한
// 쿠폰 목록(당일결제5%/마케팅3%/입주10%/재구매5% 등)을 견적서 앱에서 체크박스로
// 보여주기 위해 클라우드에서 조회. 지역출장비/거래처목록과 동일 패턴.
function fetchDiscountCouponsFromCloud(callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', SUPABASE_URL + '/rest/v1/app_settings?key=eq.discount_coupons&select=value', true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.onload = function() {
    try {
      if (xhr.status === 200) {
        var rows = JSON.parse(xhr.responseText);
        if (rows && rows[0] && Array.isArray(rows[0].value)) {
          localStorage.setItem('dah_discount_coupons', JSON.stringify(rows[0].value));
          if (typeof renderCouponList === 'function') renderCouponList();
        }
      }
    } catch(e) {}
    if (callback) callback();
  };
  xhr.onerror = function() { if (callback) callback(); };
  xhr.send();
}
function renderCouponList() {
  var wrap = document.getElementById('coupon-list');
  if (!wrap) return;
  var coupons = [];
  try { coupons = JSON.parse(localStorage.getItem('dah_discount_coupons') || '[]'); } catch(e) {}
  wrap.innerHTML = '';
  coupons.forEach(function(c) {
    var label = document.createElement('label');
    label.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:5px 9px;border:1px solid #EEE6DC;border-radius:20px;cursor:pointer;background:#fff;min-height:32px;box-sizing:border-box';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'coupon-check';
    cb.dataset.id = c.id;
    cb.dataset.name = c.name;
    cb.dataset.type = c.type;
    cb.dataset.value = c.value;
    cb.style.cssText = 'margin:0;width:14px;height:14px';
    cb.onchange = function() { calcTotal(); };
    var span = document.createElement('span');
    span.textContent = c.name + ' ' + c.value + (c.type === 'pct' ? '%' : '원');
    label.appendChild(cb); label.appendChild(span);
    wrap.appendChild(label);
  });
}
// 2026-08-14: 불러오기(견적서앱에서열기/열어서수정/복사) 시 저장된
// applied_discounts를 정확히 복원 — 쿠폰목록이 클라우드에서 아직 로딩중일
// 수 있어(비동기) 체크박스가 없으면 잠깐 대기했다 재시도.
function restoreAppliedDiscounts(applied, attempt) {
  if (!applied) return;
  attempt = attempt || 0;
  var wrap = document.getElementById('coupon-list');
  var coupons = (applied.coupons || []);
  if (coupons.length > 0 && (!wrap || wrap.children.length === 0)) {
    if (attempt < 10) { setTimeout(function(){ restoreAppliedDiscounts(applied, attempt+1); }, 300); return; }
  }
  coupons.forEach(function(c) {
    var cb = wrap ? wrap.querySelector('.coupon-check[data-id="'+c.id+'"]') : null;
    if (cb) cb.checked = true;
  });
  if (applied.manual) {
    var dt = document.getElementById('discount-type');
    var di = document.getElementById('discount');
    if (dt) dt.value = applied.manual.type;
    if (di) di.value = applied.manual.value;
  }
  if (typeof calcTotal === 'function') calcTotal();
}

// 2026-08-10: 거래처 목록도 견적서 앱은 대시보드 설정탭에서 추가한 최신
// 목록을 전혀 못 보고 있었음 - dah-estimate.html의 <datalist id="vendor-list">가
// HTML에 하드코딩된 예전 목록만 쓰고 있어서, 설정탭에서 새 거래처를 추가해도
// 견적서 앱 자동완성엔 안 뜨는 문제 발견(선혜님 확인 요청으로 재검토 중 발견 —
// 실제로 Supabase엔 "다단다"가 있는데 견적서 앱 하드코딩 목록엔 없었음).
function fetchVendorListFromCloud(callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', SUPABASE_URL + '/rest/v1/app_settings?key=eq.vendor_list&select=value', true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.onload = function() {
    try {
      if (xhr.status === 200) {
        var rows = JSON.parse(xhr.responseText);
        if (rows && rows[0] && Array.isArray(rows[0].value)) {
          var dl = document.getElementById('vendor-list');
          if (dl) {
            dl.innerHTML = '';
            rows[0].value.forEach(function(v) {
              var name = (typeof v === 'string') ? v : v.name;
              if (!name) return;
              var opt = document.createElement('option');
              opt.value = name;
              dl.appendChild(opt);
            });
          }
        }
      }
    } catch(e) {}
    if (callback) callback();
  };
  xhr.onerror = function() { if (callback) callback(); };
  xhr.send();
}

// 구글드라이브 자동저장 웹훅 (배포 후 URL 채워넣을 예정)
var DRIVE_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyyNG-Y6sABngKqk2ttfXUK_LIrQtyqiLLaaEvUnhWs3Yn4YqFtsGTVoug7EQAbig6OgQ/exec';

// 거래처명 -> 카테고리 매핑 (발주서를 어느 폴더에 저장할지 결정)
var VENDOR_CATEGORY_MAP = {
  '캔가공소': '제작',
  '디테라': '원단', '아이엔티': '원단', '예원': '원단', '크바드라트': '원단',
  '이지패브릭': '원단', '리더스': '원단', '유니밋': '원단', '지오데코': '원단',
  '윈텍': '블라인드', '덱스터': '블라인드', '헌터더글라스': '블라인드',
  '솜피': '전동',
  '목성': '레일외 부자재'
};
function vendorCategory(vendor) {
  return VENDOR_CATEGORY_MAP[vendor] || '기타';
}

// 구글드라이브에 문서 저장 (실패해도 조용히 무시 — 화면 흐름을 절대 막지 않음)
function saveDocumentToDrive(category, customerName, vendor, htmlContent) {
  if (!DRIVE_WEBHOOK_URL) return;
  try {
    var estimateNo = document.getElementById('c-no')?.value || '';
    fetch(DRIVE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // Apps Script는 text/plain이 CORS 프리플라이트 없이 가장 안정적
      body: JSON.stringify({ action: 'saveDocument', category: category, customerName: customerName, vendor: vendor || '', estimateNo: estimateNo, htmlContent: htmlContent })
    }).catch(function(e) { console.warn('구글드라이브 저장 실패:', e); });
  } catch (e) { console.warn('구글드라이브 저장 실패:', e); }
}

// 고객명단 구글시트 동기화 (실패해도 조용히 무시)
function syncCustomerToSheet(customer) {
  if (!DRIVE_WEBHOOK_URL) return;
  try {
    fetch(DRIVE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'syncCustomer', clientName: customer.clientName, phone: customer.phone, addr: customer.addr, staffName: customer.staffName, stage: customer.stage, price: customer.price, performanceRevenue: customer.performanceRevenue, date: customer.date, measureDate: customer.measureDate, installDate: customer.installDate, memo: customer.memo })
    }).catch(function(e) { console.warn('고객명단 동기화 실패:', e); });
  } catch (e) { console.warn('고객명단 동기화 실패:', e); }
}
