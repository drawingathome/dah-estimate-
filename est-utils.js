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
// 2026-09-08(선혜님 지적 - "견적서를 새로 누르면 왜 자꾸 기본 세트가
// 리드밴드로 올라가지?? 양개 편개도 이제 못믿겠는데" → 실제 유경진
// 고객 견적서로 재현 확인): 서로 다른 커튼 6개 항목이 전부 개폐형/시접
// 값이 기본값(양개형/리드) 그대로 저장되어 있었음 - select 자체가
// 숨겨져 있던 건 아니었지만(재현 확인), 터치 영역이 세로 19px밖에 안
// 돼서(최소 터치 타겟 기준 32px에 크게 못 미침) 실제로 정확히 탭해서
// 바꾸기 어려웠고, 배경도 투명(transparent)이라 "여기 선택할 게
// 있다"는 시각적 신호도 약했음 - 이미 기본값이 채워져 있어 숫자
// 입력창(비어있으면 눈에 띔)과 달리 놓치기 훨씬 쉬운 구조였음.
// 터치영역 확대(패딩) + 옅은 테두리/배경으로 시각적으로 더 눈에
// 띄게 개선.
var SEL = 'width:100%;padding:8px 4px;min-height:32px;border:1px solid #EEE6DC;border-radius:6px;font-size:11px;font-family:inherit;outline:none;background:#fff;color:#282828;cursor:pointer;box-sizing:border-box';

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

const SUPABASE_URL = 'https://sradnglutbzbyyunjyah.supabase.co';
// 2026-09-10(선혜님 지시 - "쌍둥이함수찾아"로 발견): "YYYY년 M월 D일"
// 형태로 날짜를 포맷하는 지역함수 today()가 buildCustomerHTML/
// buildVendorHTML/buildRequestHTML 세 곳에 완전히 동일한 코드로 각자
// 독립 구현되어 있었음 - 날짜 형식을 바꿔야 할 때 한 곳만 고치고
// 나머지를 놓치기 쉬운 구조. 전역 헬퍼로 통일.
// 2026-09-11(선혜님이 알려주신 실제 레일 계산 방식 - "우리가 레일
// 계산할때 -자 조절레일로 적는거 아니야?"): 원단 폭(cm)을 자(尺)
// 단위로 환산 - est-product-calc.js(견적 화면 표시용)와
// est-documents.js(발주서용) 둘 다 이 계산이 필요해서 전역 헬퍼로 통일.
function calcRailJa(mwCm) {
  var ja = mwCm / 30, jaR = Math.ceil(ja);
  if (jaR % 2 !== 0) jaR++;
  return jaR;
}
function formatKoreanDate(d) {
  d = d || new Date();
  return d.getFullYear()+'년 '+(d.getMonth()+1)+'월 '+d.getDate()+'일';
}
// 2026-09-10(선혜님 - "전문업체는 그롷게 안하잖아"로 에러 자동기록을
// 만들려다 발견): 처음엔 새로 만들려고 했으나, 이 파일 아래쪽(약 550번
// 줄)에 이미 reportClientError()라는 훨씬 성숙한 시스템이 있었음(build
// 번호, 로그인한 사용자 role/name까지 포함, unhandledrejection도 커버) -
// 이걸 몰라서 진짜로 쌍둥이를 만들 뻔한 사례. 아래는 그 기존 시스템을
// 그대로 재사용.

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
  // 2026-08-20(선혜님 실제 확인 — 쿠폰이 아예 안 뜨던 문제로 발견): app_settings
  // 테이블의 SELECT는 RLS상 로그인된 사용자만 허용되는데(auth.uid() IS NOT NULL),
  // 이 함수는 Authorization 헤더 자체를 아예 안 보내고 있었음 — 로그인 여부와
  // 무관하게 항상 조회가 거부되고 있었음. 지역요금/거래처목록도 동일 버그.
  xhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
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
  xhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
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
  // 2026-09-06(선혜님 지적 - "할인 쿠폰이 적용이 되었다가 안됐다가 하는데
  // 그때그때 달라"로 발견, 실제 재현 성공): renderCouponList가 최소 2번
  // 호출됨(로컬캐시로 즉시 1차 렌더링 → 서버에서 최신 쿠폰목록 도착 후
  // 2차 재렌더링) - 이 두 렌더링 사이의 시간(느린 네트워크일수록 길어짐)
  // 동안 사용자가 쿠폰 체크박스를 눌렀다면, 재렌더링이 체크박스를 통째로
  // 새로 만들면서 방금 체크한 상태가 조용히 사라지고 있었음. 재네더링
  // 직전에 현재 체크되어 있던 쿠폰 id들을 기억해뒀다가, 새로 그린 뒤
  // 그대로 복원함.
  var previouslyChecked = {};
  wrap.querySelectorAll('.coupon-check:checked').forEach(function(cb) { previouslyChecked[cb.dataset.id] = true; });
  var coupons = [];
  try { coupons = JSON.parse(localStorage.getItem('dah_discount_coupons') || '[]'); } catch(e) {}
  // 2026-08-14: 쿠폰 기간(시작일/종료일) 필터링 - 설정화면에서 기간만료
  // 쿠폰을 자동삭제하지만, 그 사이(마스터가 설정을 아직 안 연 시점)
  // 스태프가 견적서 앱을 먼저 열 수도 있으므로 여기서도 한 번 더 방어.
  // 아직 시작 안 됐거나(startDate가 미래) 이미 끝난(endDate가 과거) 쿠폰은
  // 체크박스 목록에서 아예 안 보이게 함.
  var todayStr = new Date().toISOString().slice(0,10);
  coupons = coupons.filter(function(c) {
    if (c.startDate && c.startDate > todayStr) return false;
    if (c.endDate && c.endDate < todayStr) return false;
    return true;
  });
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
    cb.checked = !!previouslyChecked[c.id];
    cb.style.cssText = 'margin:0;width:14px;height:14px';
    cb.onchange = function() {
      // 2026-08-14: 쿠폰을 해제해서 금액이 바뀌면 안내 토스트 표시(선혜님 요청).
      // 체크 해제(할인 제거) 시에만 - 체크(할인 추가)는 이미 화면 금액이
      // 바로 줄어드는 걸로 충분히 보이니 안내가 불필요.
      var wasUnchecked = !cb.checked;
      var beforeText = document.getElementById('sum-total')?.textContent || '';
      calcTotal();
      if (wasUnchecked) {
        var afterText = document.getElementById('sum-total')?.textContent || '';
        if (beforeText && afterText && beforeText !== afterText && typeof showToast === 'function') {
          showToast(cb.dataset.name + ' 쿠폰이 해제되어 금액이 ' + beforeText + ' → ' + afterText + '로 변경됐어요');
        }
      }
    };
    var span = document.createElement('span');
    span.textContent = c.name + ' ' + c.value + (c.type === 'pct' ? '%' : '원');
    label.appendChild(cb); label.appendChild(span);
    wrap.appendChild(label);
  });
  // 위에서 cb.checked를 프로그래밍적으로 설정한 건 onchange 이벤트가
  // 자동으로 발생하지 않으므로, 체크 상태를 복원한 경우 금액도 최신
  // 상태로 맞춰지도록 명시적으로 재계산.
  if (Object.keys(previouslyChecked).length > 0 && typeof calcTotal === 'function') calcTotal();
}
// 2026-08-14: 불러오기(견적서앱에서열기/열어서수정/복사) 시 저장된
// applied_discounts를 정확히 복원 — 쿠폰목록이 클라우드에서 아직 로딩중일
// 수 있어(비동기) 체크박스가 없으면 잠깐 대기했다 재시도.
function restoreAppliedDiscounts(applied, attempt, onComplete) {
  // 2026-09-04(선혜님 지시 - "다시보기 속도 개선 바로 하자"): 이 함수가
  // 끝나는 시점(재시도 완료 또는 애초에 쿠폰이 없어 즉시 끝나는 경우)을
  // 호출부가 알 수 있도록 완료 콜백을 추가 - 아래 다시보기(autoDoc) 흐름이
  // 항상 최악의 경우(8초)만큼 고정으로 기다리는 대신, 실제로 끝나는
  // 즉시 다음 단계로 넘어갈 수 있게 함.
  if (!applied) { if (typeof onComplete === 'function') onComplete(); return; }
  attempt = attempt || 0;
  var wrap = document.getElementById('coupon-list');
  var coupons = (applied.coupons || []);
  var saveBtn = document.getElementById('btn-save-estimate');
  if (coupons.length > 0 && (!wrap || wrap.children.length === 0)) {
    // 2026-08-29(선혜님 지적 - "저장을 해도 할인이 빠진다"로 재점검):
    // 기존 10회x300ms(최대 3초) 재시도는 네트워크가 느리면 부족할 수
    // 있음 - 쿠폰목록 클라우드 조회가 3초 안에 안 끝나면 복원 자체가
    // 포기되고 "쿠폰이 삭제된 것"처럼 취급돼서 직접입력으로 강제 대체
    // 되거나 경고만 뜨고 반영이 안 됨. 20회x400ms(최대 8초)로 여유를 늘림.
    if (attempt < 20) {
      // 2026-09-04(선혜님 지적 - "현은지 할인 쿠폰 또 빠지네"로 재확인,
      // 실제 DB 데이터로 재현 성공): 재시도(최대 8초)가 아직 안 끝난
      // 상태에서 사용자가 저장 버튼을 누르면, calcTotal()이 아직 "쿠폰
      // 복원 완료 후" 상태로 재실행되기 전이라 window._lastAppliedDiscounts
      // 가 여전히 빈 상태({coupons:[]})로 남아있고, 그 빈 상태 그대로
      // 저장돼서 쿠폰 정보가 통째로 사라짐(실제 DB에서 applied_discounts
      // 가 빈 배열로 저장된 것 확인) - 복원 중엔 저장 버튼을 잠시
      // 비활성화해서 이 레이스컨디션을 원천 차단.
      if (saveBtn) { saveBtn.disabled = true; saveBtn.style.opacity = '0.5'; saveBtn.title = '쿠폰 정보를 불러오는 중이에요. 잠시만 기다려주세요.'; }
      setTimeout(function(){ restoreAppliedDiscounts(applied, attempt+1, onComplete); }, 400);
      return;
    }
  }
  if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = ''; saveBtn.title = ''; }
  // 2026-08-14: 저장 당시 적용됐던 쿠폰이 그 사이 설정에서 삭제되거나
  // 2026-08-14: 쿠폰이 "삭제"만이 아니라 "값만 수정"(예: 재구매 5%→7%)돼도
  // 똑같이 조용히 다른 금액으로 재계산되던 문제 확인(재현: 5%/10,000원 할인
  // 이었던 190,000원 견적서가 7%로 수정 후 열면 186,000원으로 바뀜). id만
  // 보고 매칭하면 값이 바뀐 것도 "성공"으로 오인하므로, type/value까지
  // 저장 당시와 정확히 같아야만 매칭 성공으로 보고, 하나라도 다르면
  // 삭제된 경우와 동일하게 "사라진 쿠폰"으로 취급해 저장 당시 금액을 보존.
  var missingAmount = 0;
  coupons.forEach(function(c) {
    var cb = wrap ? wrap.querySelector('.coupon-check[data-id="'+c.id+'"]') : null;
    var valueMatches = cb && cb.dataset.type === c.type && parseFloat(cb.dataset.value) === parseFloat(c.value);
    if (cb && valueMatches) {
      cb.checked = true;
    } else {
      missingAmount += (c.amount || 0);
    }
  });
  if (applied.manual) {
    var dt = document.getElementById('discount-type');
    var di = document.getElementById('discount');
    if (dt) dt.value = applied.manual.type;
    if (di) di.value = applied.manual.value;
  }
  if (missingAmount > 0) {
    var dt2 = document.getElementById('discount-type');
    var di2 = document.getElementById('discount');
    var existing = di2 ? (parseFloat(di2.value) || 0) : 0;
    if (existing === 0 && dt2 && di2) {
      // 직접입력이 비어있으면 사라진 쿠폰 금액을 그대로 채움
      dt2.value = 'won';
      di2.value = missingAmount;
      if (typeof showToast === 'function') showToast('⚠️ 저장 당시 적용됐던 쿠폰 중 일부가 삭제/변경되어, 그 금액(' + missingAmount.toLocaleString() + '원)을 직접입력으로 대신 채워뒀어요. 확인해주세요.');
    } else if (typeof showToast === 'function') {
      // 직접입력이 이미 다른 용도로 쓰이고 있으면 자동으로 합치지 않고 경고만
      showToast('⚠️ 저장 당시 적용됐던 쿠폰 중 일부(' + missingAmount.toLocaleString() + '원 상당)가 삭제/변경되어 반영이 안 됐어요. 금액을 확인해주세요.');
    }
  }
  if (typeof calcTotal === 'function') calcTotal();
  if (typeof onComplete === 'function') onComplete();
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
  xhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
  xhr.onload = function() {
    try {
      if (xhr.status === 200) {
        var rows = JSON.parse(xhr.responseText);
        if (rows && rows[0] && Array.isArray(rows[0].value)) {
          // 2026-08-26: datalist(이름 자동완성)용으로만 쓰던 걸, 카테고리/연락처까지
          // 포함한 원본 그대로도 보관 - printRequest()에서 '실측·시공' 담당 거래처의
          // 연락처를 자동으로 채우는 데 사용.
          window._dahVendorListRaw = rows[0].value;
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
          // 2026-09-09: 거래처 목록이 방금 로드/갱신됐으니, 블라인드
          // 거래처 필수선택 드롭다운들도 최신 목록으로 채움.
          if (typeof refreshBlindVendorOptions === 'function') refreshBlindVendorOptions();
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

// 2026-09-04(선혜님 지시 - "1번(발주서→발주현황판 자동연결) 먼저 하자"):
// 지금까지 견적서 앱에서 "발주서(거래처별)" 문서를 만드는 것과, 대시보드의
// "발주 현황판"(품목 카테고리별로 완료/거래처/날짜를 기록하는 곳)이 완전히
// 분리되어 있었음 - 발주서를 만들어 실제로 거래처에 보내도, 대시보드에 가서
// 똑같은 내용을 수동으로 또 체크해야 하는 이중 작업이었음(선혜님께 "전문업체라면
// 만족스러울까"라는 질문에 정직하게 확인해서 발견한 gap). 발주서 생성이 성공하면
// 그 안의 각 항목(orderCategory: fabric/material/blind/production)과 거래처명을
// 모아서, customers.order_status(jsonb)를 자동으로 갱신함 - 기존 다른 카테고리
// (예: install)를 실수로 지우지 않도록 먼저 현재 값을 읽어와 병합한 뒤 저장.
// 2026-09-09(선혜님 지시 - "실측/시공/발주가 다 따로 되어있다"는 지적으로
// "업무처리" 통합 탭을 만들기로 함): order_status(GET→병합→PATCH) 로직을
// 범용 헬퍼로 분리 - 발주(fabric/production/material/blind)뿐 아니라
// 실측(measure)/시공(install)도 이 하나의 함수로 기록하도록 함. 지금까지
// order_status에는 발주 카테고리만 기록되고, 실측/시공 완료 여부는 전혀
// 추적이 안 되고 있었음(printRequest 성공시 이 함수를 부르는 곳 자체가
// 없었음) - "업무처리" 탭에서 셋 다의 진행상태를 보여주려면 이 공백부터
// 메워야 함.
// 2026-09-09(선혜님 지시 - "커튼은 무조건 제작을 해애해 담만 가공소는
// 차 후에 바꿀 수 있어"로, 가공소를 항목별 체크박스 없이 자동 적용하기로
// 결정): 등록된 production(가공소) 카테고리 거래처가 정확히 1곳이면
// 자동으로 그 이름을 반환 - 이 값이 있으면 모든 커튼에 무조건 적용됨.
// 나중에 2곳 이상 등록되면(설치업체 자동선택과 같은 패턴) 빈 문자열을
// 반환해서, 그때부터는 선택 UI가 필요하다는 신호가 됨.
function getAutoProductionVendorName() {
  if (!Array.isArray(window._dahVendorListRaw)) return '';
  var prodVendors = window._dahVendorListRaw.filter(function(v) {
    return v && Array.isArray(v.categories) && v.categories.indexOf('production') >= 0;
  });
  return prodVendors.length === 1 ? (prodVendors[0].name || '') : '';
}
// 2026-09-09(선혜님 지시 - "업무처리" 통합탭 마지막 단계): 현재 고객의
// order_status를 조회하는 전용 헬퍼 - 업무처리 카드가 실측/발주/시공
// 각각의 완료 여부를 보여줄 때 사용.
// 2026-09-09(업무처리 통합탭 마지막 단계): 발주/실측/시공 세 카드의
// 진행상태를 order_status 기준으로 채움. 발주는 4개 카테고리
// (fabric/production/material/blind) 중 완료된 것 개수로 표시 -
// 사용자가 커튼만 있는지 블라인드만 있는지에 따라 필요한 카테고리
// 수가 다르므로, "전부 완료"보다는 "몇 건 완료"가 더 정직한 표현.
function renderWorkStatusCards() {
  if (typeof getCustomerOrderStatus !== 'function') return;
  getCustomerOrderStatus(function(status) {
    var orderEl = document.getElementById('work-order-status');
    var measureEl = document.getElementById('work-measure-status');
    var installEl = document.getElementById('work-install-status');

    if (orderEl) {
      var orderCats = ['fabric', 'production', 'material', 'blind'].filter(function(c){ return status[c] && status[c].done; });
      if (orderCats.length > 0) {
        orderEl.textContent = orderCats.length + '건 완료';
        orderEl.style.color = '#2F6690';
      } else {
        orderEl.textContent = '아직 없음';
      }
    }
    [['measure', measureEl], ['install', installEl]].forEach(function(pair){
      var key = pair[0], el = pair[1];
      if (!el) return;
      if (status[key] && status[key].done) {
        el.textContent = (status[key].orderDate || '완료') + ' 완료';
        el.style.color = '#2F6690';
      } else {
        el.textContent = '아직 없음';
      }
    });
  });
}

function getCustomerOrderStatus(callback) {
  if (!window._estSaveCustomerId || typeof SUPABASE_URL === 'undefined') { callback({}); return; }
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', SUPABASE_URL + '/rest/v1/customers?id=eq.' + encodeURIComponent(window._estSaveCustomerId) + '&select=order_status', true);
    xhr.setRequestHeader('apikey', SUPABASE_KEY);
    xhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
    xhr.onload = function() {
      try {
        var rows = JSON.parse(xhr.responseText);
        callback((rows[0] && rows[0].order_status) || {});
      } catch (e) { callback({}); }
    };
    xhr.onerror = function() { callback({}); };
    xhr.send();
  } catch (e) { callback({}); }
}

function updateOrderStatus(updates) {
  if (!window._estSaveCustomerId || typeof SUPABASE_URL === 'undefined') return;
  if (!updates || Object.keys(updates).length === 0) return;
  try {
    var xhrGet = new XMLHttpRequest();
    xhrGet.open('GET', SUPABASE_URL + '/rest/v1/customers?id=eq.' + encodeURIComponent(window._estSaveCustomerId) + '&select=order_status', true);
    xhrGet.setRequestHeader('apikey', SUPABASE_KEY);
    xhrGet.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
    xhrGet.onload = function() {
      var current = {};
      try {
        var rows = JSON.parse(xhrGet.responseText);
        if (rows[0] && rows[0].order_status) current = rows[0].order_status;
      } catch (e) {}
      Object.keys(updates).forEach(function(cat){
        if (current[cat] && typeof current[cat] === 'object' && current[cat].dueDate) {
          updates[cat].dueDate = current[cat].dueDate;
        }
      });
      var merged = Object.assign({}, current, updates);
      try {
        var xhrPatch = new XMLHttpRequest();
        xhrPatch.open('PATCH', SUPABASE_URL + '/rest/v1/customers?id=eq.' + encodeURIComponent(window._estSaveCustomerId), true);
        xhrPatch.setRequestHeader('apikey', SUPABASE_KEY);
        xhrPatch.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
        xhrPatch.setRequestHeader('Content-Type', 'application/json');
        xhrPatch.onload = function() {
          if (xhrPatch.status < 300 && typeof showToast === 'function') {
            showToast('📋 업무 현황판에도 자동으로 기록됐어요');
          }
        };
        xhrPatch.send(JSON.stringify({ order_status: merged }));
      } catch (e) { console.warn('현황 자동갱신 실패:', e); typeof reportClientError==='function' && reportClientError('업무현황 자동갱신 실패: ' + (e && e.message || e), e && e.stack); }
    };
    xhrGet.onerror = function() { console.warn('현황 자동갱신 실패(조회 실패)'); typeof reportClientError==='function' && reportClientError('업무현황 자동갱신 실패(조회)'); };
    xhrGet.send();
  } catch (e) { console.warn('현황 자동갱신 실패:', e); typeof reportClientError==='function' && reportClientError('업무현황 자동갱신 실패: ' + (e && e.message || e), e && e.stack); }
}
function updateOrderStatusFromVendorGroups(groups) {
  var todayISO = new Date().toISOString().slice(0, 10);
  var updates = {};
  // 2026-09-10(전문업체 관점 종합 시뮬레이션으로 발견): 같은 발주
  // 종류(orderCategory)에 거래처가 여러 곳이면(예: 블라인드를 윈텍+
  // 덱스터 두 곳에 나눠 발주), 마지막 거래처가 이전 거래처 정보를
  // 그대로 덮어써서 먼저 처리된 거래처 정보가 조용히 사라지고 있었음 -
  // 실제 발주서 문서(구글드라이브)는 거래처별로 전부 정확히 저장되고
  // 있었지만, 이 요약 정보(order_status)만 부정확했음. vendor를 배열로
  // 모아서 전부 남기도록 수정.
  Object.keys(groups).forEach(function(vendor){
    if (vendor === '미지정') return;
    (groups[vendor] || []).forEach(function(item){
      var cat = item.orderCategory;
      if (!cat) return;
      if (!updates[cat]) updates[cat] = { done: true, vendors: [], orderDate: todayISO };
      if (updates[cat].vendors.indexOf(vendor) < 0) updates[cat].vendors.push(vendor);
    });
  });
  // vendor(단일, 예전 형식과의 호환) 필드도 함께 채워서 기존 코드가
  // 안 깨지게 함 - 여러 곳이면 쉼표로 이어붙임.
  Object.keys(updates).forEach(function(cat){
    updates[cat].vendor = updates[cat].vendors.join(', ');
  });
  updateOrderStatus(updates);
}

// 구글드라이브에 문서 저장 (실패해도 조용히 무시 — 화면 흐름을 절대 막지 않음)
function saveDocumentToDrive(category, customerName, vendor, htmlContent, staffName) {
  if (!DRIVE_WEBHOOK_URL) return;
  try {
    var estimateNo = document.getElementById('c-no')?.value || '';
    fetch(DRIVE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // Apps Script는 text/plain이 CORS 프리플라이트 없이 가장 안정적
      body: JSON.stringify({ action: 'saveDocument', category: category, customerName: customerName, vendor: vendor || '', estimateNo: estimateNo, htmlContent: htmlContent, staffName: staffName || '' })
    }).catch(function(e) { console.warn('구글드라이브 저장 실패:', e); typeof reportClientError==='function' && reportClientError('구글드라이브 저장 실패: ' + (e && e.message || e), e && e.stack); });
  } catch (e) { console.warn('구글드라이브 저장 실패:', e); typeof reportClientError==='function' && reportClientError('구글드라이브 저장 실패: ' + (e && e.message || e), e && e.stack); }
}

// 고객명단 구글시트 동기화 (실패해도 조용히 무시)
function syncCustomerToSheet(customer) {
  if (!DRIVE_WEBHOOK_URL) return;
  try {
    fetch(DRIVE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'syncCustomer', clientName: customer.clientName, phone: customer.phone, addr: customer.addr, staffName: customer.staffName, stage: customer.stage, price: customer.price, performanceRevenue: customer.performanceRevenue, date: customer.date, measureDate: customer.measureDate, installDate: customer.installDate, memo: customer.memo })
    }).catch(function(e) { console.warn('고객명단 동기화 실패:', e); typeof reportClientError==='function' && reportClientError('고객명단 동기화 실패: ' + (e && e.message || e), e && e.stack); });
  } catch (e) { console.warn('고객명단 동기화 실패:', e); typeof reportClientError==='function' && reportClientError('고객명단 동기화 실패: ' + (e && e.message || e), e && e.stack); }
}

// ══════════════════════════════════════════════════
// 2026-08-25: 자동 에러 수집 (선혜님 요청 — "대기업처럼 에러를 자동으로 받아보자")
// 화면에서 나는 JS 에러/처리안된 오류를 자동으로 Supabase에 기록.
// 캡처 없이도 Claude가 바로 정확한 원인을 조회할 수 있게 함.
// ══════════════════════════════════════════════════
(function () {
  function reportClientError(message, stack, extra) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', SUPABASE_URL + '/rest/v1/client_error_logs', true);
      xhr.setRequestHeader('apikey', SUPABASE_KEY);
      xhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Prefer', 'return=minimal');
      var role = null, name = null;
      try {
        var u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : (typeof window._estCurrentUser !== 'undefined' ? window._estCurrentUser : null);
        if (u) { role = u.role || null; name = u.name || null; }
      } catch (e) {}
      xhr.send(JSON.stringify({
        app: (location.pathname.indexOf('dashboard') >= 0 ? 'dashboard' : 'estimate'),
        message: String(message || '').slice(0, 2000),
        stack: String(stack || '').slice(0, 4000),
        url: location.href,
        user_role: role,
        user_name: name,
        build: (typeof window.DAH_BUILD !== 'undefined' ? window.DAH_BUILD : null),
        extra: extra || null
      }));
    } catch (e) { /* 에러 리포팅 자체가 실패해도 화면엔 절대 영향 없게 조용히 무시 */ }
  }
  // 2026-08-31(선혜님 지적 - "복구 못하는게 말이 되니"로 실패한 저장을
  // 서버에도 백업하려다 발견): 지금까지 이 함수가 이 IIFE 안에서만
  // 정의돼있어서, window.error 리스너 자체에서만 자동으로 쓰이고 있었고
  // 다른 파일(est-save.js 등)에서 특정 상황에 맞춰 명시적으로 호출할
  // 방법이 없었음 - 전역에 노출해서 재사용 가능하게 함.
  window.reportClientError = reportClientError;

  window.addEventListener('error', function (ev) {
    reportClientError(ev.message, ev.error && ev.error.stack, { filename: ev.filename, lineno: ev.lineno, colno: ev.colno });
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var reason = ev.reason;
    reportClientError(
      '(Promise rejection) ' + (reason && reason.message ? reason.message : String(reason)),
      reason && reason.stack
    );
  });
  window.reportClientError = reportClientError; // 수동으로도 기록 가능(예: catch 블록에서)
})();
