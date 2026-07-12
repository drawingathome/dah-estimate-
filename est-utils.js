/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 유틸함수 + API 설정
   견적번호 생성, 금액 포맷, HTML 이스케이프, Supabase/구글드라이브 설정,
   구글드라이브 문서저장/고객시트 동기화.
   ══════════════════════════════════════════════════ */

function generateEstNo() {
  var now = new Date();
  var yy = String(now.getFullYear()).slice(2);
  var mm = String(now.getMonth() + 1).padStart(2, '0');
  var dd = String(now.getDate()).padStart(2, '0');
  
  // localStorage에서 오늘 마지막 번호 가져오기
  var key = 'dah_est_seq_' + yy + mm + dd;
  var seq = parseInt(localStorage.getItem(key) || '0') + 1;
  localStorage.setItem(key, String(seq));
  
  return 'DAH-' + yy + mm + dd + '-' + String(seq).padStart(3, '0');
  // 예: DAH-260627-001
}

function setEstNo() {
  var el = document.getElementById('est-no');
  if (el && !el.value) {
    el.value = generateEstNo();
  }
}

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
