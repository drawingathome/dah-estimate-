/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 유틸함수 + API 설정
   견적번호 생성, 금액 포맷, HTML 이스케이프, Supabase/구글드라이브 설정,
   구글드라이브 문서저장/고객시트 동기화.
   ══════════════════════════════════════════════════ */

var DAH_LOGO_B64 = 'https://raw.githubusercontent.com/drawingathome/dah-estimate-/main/logo.png';

function fmtPrice(inp) {
  var raw = inp.value.replace(/[^0-9]/g,'');
  inp.setAttribute('data-raw', raw);
  if(document.activeElement !== inp) {
    inp.value = raw ? parseInt(raw).toLocaleString() : '';
  }
}
function fmtPriceBlur(inp) {
  var raw = (inp.getAttribute('data-raw') || inp.value).replace(/[^0-9]/g,'');
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
  return parseInt(raw.replace(/[^0-9]/g,'')) || 0;
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

// 구글드라이브 자동저장 웹훅 (배포 후 URL 채워넣을 예정)
var DRIVE_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyPGuFy8etPQUb3R8AnHFUtTRGnB2gnCc98m9JXCt1o8Sjbfj4wlEQb3MGpYEXDJ4sKGw/exec';

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
