/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 계산 규칙 (순수 함수: 화면/저장소를 전혀 안 만짐)
   2026-09-28(선혜님 - "밑에 세개를 그러면 놔두는게 베스트야? 전문업체서 잡으면 어떻게 하겠니"):
   est-product-calc.js는 버그 수정이 71번 중 51번 몰린 재발 버그의 중심이었는데, 계산 규칙이
   "화면에서 값 읽기 / 화면에 결과 쓰기"와 한 함수 안에 섞여 있었고, 같은 규칙이 여러 곳에 복사돼
   있었음(예: 블라인드 면적 계산이 calcBlindRow와 calcTotal에 똑같이 2곳, 자동 계약금 계산이
   calcTotal 안에 2곳). 그래서 규칙 하나를 고칠 때 한 곳만 고치고 나머지를 놓치는 일이 반복됐음.

   이 파일의 원칙 (tests/calc-rules-unit-check.js가 자동으로 지킴)
   1) document / window / localStorage 등 화면·저장소를 절대 쓰지 않음 - 숫자를 받아 숫자를 돌려줄 뿐.
      → 브라우저 없이 1초 만에 테스트할 수 있고, 어디서 불러도 결과가 같음.
   2) 각 규칙은 여기 딱 한 곳에만 있음(복사 금지). 화면 코드(est-calc-curtain.js / est-calc-blind.js /
      est-product-calc.js)는 값을 읽어서 이 함수를 부르고 결과를 화면에 쓰기만 함.
   3) 규칙을 바꿀 땐 tests/calc-golden-master-check.js(4천여 개 조합 기록)와
      tests/calc-rules-unit-check.js(손으로 계산한 기대값)가 함께 알려줌.
   ══════════════════════════════════════════════════ */

// 커튼 폭수 추천: 가로(cm) × 주름배율 ÷ 130(원단 1폭 기준).
// 2026-08-27(선혜님 지시 - "무조건 반올림하니 폭수가 너무 많다"):
// 예전엔 Math.ceil()로 소수점이 조금만 넘어도(예: 4.015배) 무조건 한
// 폭 전체를 더 잡았음. 이제 주름형태별로 "이 정도 여유분까지는 그냥
// 내려도 된다"는 허용 기준을 둠 — 민자형은 소수점 0.2 이하, 나비주름형은
// 0.1 이하면 올리지 않고 내림. 그 기준을 넘는 소수점은 여전히 올림
// (원단 부족 방지). 예: 나비주름형 300cm → 4.615배 → 소수점 0.615는
// 허용범위(0.1) 밖이라 여전히 5폭. 나비주름형 261cm → 4.015배 → 소수점
// 0.015는 허용범위(0.1) 이내라 4폭으로 내려감(예전엔 5폭이었음).
function calcSuggestedPanels(mw, pleat) {
  var ratio = pleat==='나비주름형' ? 2.0 : 1.5;
  var rawP = (mw*ratio)/130;
  var floorP = Math.floor(rawP);
  var decimalP = rawP - floorP;
  var tolerance = pleat==='나비주름형' ? 0.1 : 0.2;
  return Math.max(0, decimalP <= tolerance ? floorP : Math.ceil(rawP));
}

// 2026-08-10: 세로(mh) 250/270/290cm 이상이면 금액 추가 검토 안내만 표시
// (선혜님 확인: 계산에는 반영하지 말고 알림만 띄울 것). 실측 세로값(mh)
// 기준으로 판단 — 제작높이 보정(fh)이 아니라 원래 실측값 기준.
// 안내할 게 없으면 빈 문자열.
function curtainHeightFeeWarning(mh) {
  if (mh >= 290) return '⚠️ 높이 290cm 이상 30% 추가';
  if (mh >= 270) return '⚠️ 높이 270cm 이상 20% 추가';
  if (mh >= 250) return '⚠️ 높이 250cm 이상 10% 추가';
  return '';
}

// 2026-08-09: 블라인드 최소면적 규칙 — 원래 calcBlindRow/calcTotal 두 곳에
// 각각 따로 정의돼있어서, 규칙이 바뀔 때 한쪽만 고치면 값이 어긋날 위험이
// 있었음. 공용 함수로 통합.
// 전체 규칙(선혜님 확인, 2026-08-09): 모든 블라인드 종류에 최소면적이 있음
// - 로만쉐이드, 롤스크린: 2.0㎡
// - 우드, 허니콤, 알루미늄, 기타: 1.5㎡
// 2026-09-11(선혜님 지적 - "더블 블라인드 최소회배가 롤블라인드와
// 동일하게 2회배리고~ 너는 다르게 해석했지??"): "회배"는 가격에 곱하는
// 배수가 아니라, 바로 이 최소면적 기준(1.5㎡ 그룹/2.0㎡ 그룹)을 가리키는
// 말이었음 - 처음엔 "원단이 2겹이라 가격도 2배"로 잘못 해석해서
// getBlindMultiplier()라는 별도 가격배수 함수를 만들었었는데, 완전히
// 틀린 해석이었음(제거함). 더블 롤블라인드는 그냥 롤스크린과 같은
// 최소면적 그룹(2.0㎡)에 속할 뿐, 가격 계산 자체는 다른 블라인드와
// 동일(price*sqm).
// 블라인드 종류별 최소 청구 면적(㎡): 로만쉐이드/롤스크린/더블 롤블라인드 2.0, 그 밖엔 1.5
function getBlindMinSqm(kind) {
  if (kind === '로만쉐이드' || kind === '롤스크린' || kind === '더블 롤블라인드') return 2.0;
  return 1.5;
}

// 블라인드 청구 면적: 가로×세로(㎡)가 최소면적보다 작으면 최소면적으로 올리고, 0.1㎡ 단위로 올림.
// (예전엔 calcBlindRow와 calcTotal에 이 계산이 똑같이 복사돼 있었음 - 이제 이 함수 하나만 씀)
// sqmRaw는 "(최소)" 표시 판단용(최소면적이 적용됐는지), sqm이 실제 청구 면적.
function calcBlindBillableSqm(bw, bh, minSqm) {
  var sqmRaw = (bw*bh)/10000;
  if (sqmRaw<minSqm && sqmRaw>0) sqmRaw = minSqm;
  return { sqmRaw: sqmRaw, sqm: Math.ceil(sqmRaw*10)/10 };
}

// 2026-08-14: 할인 다중선택(쿠폰) 순차적용 방식으로 교체(선혜님 확인).
// 검증된 공식(기존 견적서 실 데이터로 역산 검증 완료): 각 %할인은 "남은
// 제품소계"를 기준으로 순차 계산하고(첫 할인 뺀 금액에서 다음 % 계산),
// 계산된 할인액들의 합을 "제품소계+부자재/시공비" 총합계에서 차감한다.
//
// 2026-08-14: 쿠폰 적용 순서를 "설정에 등록한 순서"가 아니라 "타입 기준
// 자동 정렬(원단위 항상 먼저 → %는 나중)"로 변경(선혜님 요청).
// 수학적으로 증명됨: %할인은 그 시점 "남은 금액"을 기준으로 계산되므로,
// 원단위를 먼저 빼서 남은 금액을 줄인 뒤 %를 적용해야 %할인액 자체가
// 작아진다(차이 = 원단위금액 × %비율, 항상 0 이상 — 원단위 금액이
// 5,000원이든 10만원이든 이 방향은 절대 바뀌지 않음). 즉 이 순서가
// 쿠폰 금액이 나중에 바뀌어도 항상 총 할인을 최소화(최종 단가를 최대화)한다.
// 여러 원단위끼리, 여러 %끼리는 순서 무관(덧셈 교환법칙 / 반올림오차 수준).
// 직접입력도 이 정렬에 함께 포함시킴 — 직접입력을 원단위로 쓰면 등록된
// %쿠폰들보다 먼저 적용돼야 같은 원칙이 유지되는데, 예전엔 직접입력이
// 무조건 맨 마지막으로 고정돼 있어서 이 원칙이 깨지는 구멍이 있었음.
//
// items: [{ source:'coupon'|'manual', type:'won'|'pct', value, label, id, name }]
function applyDiscountItems(baseTotal, items) {
  var discountRunning = baseTotal; // 순차 계산용 - 매 쿠폰마다 줄어듦
  var totalDiscount = 0;
  var discountBreakdown = [];
  var appliedCoupons = []; // 저장용 - 쿠폰ID로 불러오기시 정확히 재선택하기 위함
  var manualDiscount = null;
  var sorted = items.slice();
  sorted.sort(function(a, b) {
    var aRank = a.type === 'won' ? 0 : 1;
    var bRank = b.type === 'won' ? 0 : 1;
    return aRank - bRank;
  });
  sorted.forEach(function(item) {
    var amt = item.type === 'pct' ? Math.round(discountRunning * item.value / 100) : Math.min(item.value, discountRunning);
    amt = Math.max(0, amt);
    totalDiscount += amt;
    discountRunning -= amt;
    if (item.source === 'coupon') {
      discountBreakdown.push({ label: item.label + ' ' + item.value + (item.type==='pct'?'%':'원'), amount: amt });
      appliedCoupons.push({ id: item.id, name: item.name, type: item.type, value: item.value, amount: amt });
    } else {
      discountBreakdown.push({ label: '직접입력 '+(item.type==='pct'?item.value+'%':item.value.toLocaleString()+'원'), amount: amt });
      manualDiscount = { type: item.type, value: item.value, amount: amt };
    }
  });
  return { totalDiscount: totalDiscount, discountBreakdown: discountBreakdown, appliedCoupons: appliedCoupons, manualDiscount: manualDiscount };
}

// 총액 = 제품소계 - 할인 + 부자재/시공비 (음수면 0)
function calcGrandBeforeTruncation(curtainTotal, discount, svcTotal) {
  var grand = curtainTotal - discount + svcTotal;
  if (grand < 0) grand = 0;
  return grand;
}

// 2026-08-12: 최종 견적금액 천원단위 절사(내림) 적용 - 당일결제5%/마케팅3%/
// 입주10%/재구매5% 등 % 할인 적용 후 끝자리가 지저분하게 나오는 걸 방지
// (선혜님 확인: 반올림이 아니라 절사, 천원단위). 계약금/잔금은 이 절사된
// 금액을 기준으로 계산되므로 자연히 깔끔한 값이 됨. 총액이 0 이하면 그대로.
function truncateToThousand(grand) {
  if (!(grand > 0)) return { grand: grand, truncAmt: 0 };
  var flooredGrand = Math.floor(grand/1000)*1000;
  return { grand: flooredGrand, truncAmt: grand - flooredGrand };
}

// 2026-09-18(선혜님 - "침구 러그는 결제가 50%가 아니라 100% 결제로
// 해야하는데"): 커튼/블라인드는 시공이 남아있어서 계약금 50%+잔금
// 50%가 맞지만, 침구/러그는 시공 자체가 없어 배송 시점에 전액을
// 받아야 함 - 커튼/블라인드 품목이 하나도 없으면(침구만 있으면)
// 자동계산 비율을 100%로, 있으면 기존대로 50%로.
function calcDepositRatio(hasCurtainOrBlind) {
  return hasCurtainOrBlind ? 0.5 : 1;
}

// 자동 계약금 = 총액 × 비율(반올림). (예전엔 calcTotal 안에 이 계산이 2곳에 복사돼 있었음)
function calcAutoDeposit(grand, depositRatio) {
  return Math.round(grand*depositRatio);
}

// 계약금/잔금: 수동입력 등으로 계약금이 총액보다 큰 경우 잔금이 음수가 되는 것도 함께 방지
function calcDepositAndBalance(grand, depositRaw) {
  var deposit = depositRaw > 0 ? depositRaw : 0;
  if (deposit > grand) deposit = grand;
  return { deposit: deposit, balance: grand - deposit };
}

// 2026-08-05: 성과매출이 할인을 반영 안 하고 있었음(할인 전 curtainTotal 그대로) —
// 할인해준 만큼은 실제로 못 받은 돈이니 성과에서도 빠져야 함
function calcPerformanceRevenue(curtainTotal, discount) {
  return Math.max(0, curtainTotal - discount);
}

// ── 레일 자동 산정 규칙 ────────────────────────────────────────────
// 2026-09-11(선혜님이 알려주신 실제 레일 계산 방식 - "우리가 레일
// 계산할때 -자 조절레일로 적는거 아니야?"): 원단 폭(cm)을 자(尺)
// 단위로 환산 - est-calc-curtain.js의 autoUpdateRail(견적 화면 표시용)와
// est-doc-vendor.js(발주서용) 둘 다 이 계산이 필요해서 전역 헬퍼로 통일.
function calcRailJa(mwCm) {
  var ja = mwCm / 30, jaR = Math.ceil(ja);
  if (jaR % 2 !== 0) jaR++;
  return jaR;
}

// 2026-08-05: 레일단가(1,600원)를 변수로 추출 — 예전엔 autoUpdateRail의 두 분기(기존행 수정/신규행 생성)에
// 리터럴 '1600'이 각각 따로 있어서, 나중에 단가가 바뀌면 한쪽만 고치고 다른쪽을 놓칠 위험이 있었음.
// 2026-09-28: 그 변수마저 함수 안 지역변수였는데, 이제 코드 전체에서 이 한 곳에만 둠.
var RAIL_UNIT_PRICE = 1600;
// 2026-08-05: 레일시공비(25,000원)도 동일한 이유로 변수 추출. 레일수와 무관, 창문(커튼 한 줄) 1개 시공당 고정.
var RAIL_INSTALL_FEE = 25000;

// 레일 (자재) 행: 단가 1,600원 × 레일수(자). 2026-09-01(선혜님 - "조절레일 (타공형) 이 기본이야"):
// 그냥 "레일"이라고만 나오던 것을 실제 기본 레일 종류(조절레일/타공형)로 명시 - 시공요청서도 이 텍스트에서
// 레일길이를 추출해 보여줌. (발주서는 "6자 조절레일(타공형)"처럼 일부러 다른 어순으로 est-doc-vendor.js가 만듦)
function railMaterialSpec(mw) {
  var ja = calcRailJa(mw);
  return { ja: ja, content: '조절레일(타공형) ' + ja + '자', unitPrice: RAIL_UNIT_PRICE, qty: ja };
}

// 레일 시공비 행: 단가 25,000원 × 1개
function railInstallSpec() {
  return { content: '레일 시공비', price: RAIL_INSTALL_FEE, qty: 1 };
}

// ── 지역별 실측비/시공비 규칙 ────────────────────────────────────────
// 요금 결정: 설정(regionFees)에 등록된 값이 우선, 없으면 기본 요금(defaults), '기타'는 직접 입력한 금액을
// 실측비/시공비 둘 다에 씀. 서울/경기/기타 밖(지역 미선택 등)이면 undefined.
// 기본 요금표의 정식 위치는 shared-common-utils.js의 DEFAULT_REGION_FEES(대시보드 설정 화면과 공유) -
// 예전엔 autoAddSvcFee 안에 같은 기본값이 3곳 더 복사돼 있었음(2026-09-28 정리).
function resolveRegionPrices(region, regionFees, customBase, defaults) {
  var priceMap = {
    '서울': regionFees['서울'] || defaults['서울'],
    '경기': regionFees['경기'] || defaults['경기'],
    '기타': {'실측비':customBase, '시공비':customBase}
  };
  return priceMap[region];
}

// 실측비/시공비가 둘 다 0이거나 요금 자체가 없으면 "시공 없음(배송)" 취급 - 실측비/시공비/레일 행을 모두 지움
function isNoInstallFee(prices) {
  return !prices || (prices['실측비']===0 && prices['시공비']===0);
}
var NO_INSTALL_HINT = '시공 없음 (배송)';

// 서비스 행 문구("서울 실측비" / "서울 시공비")와 지역 옆 안내 문구
function regionFeeContent(region, type) {
  return region + (type==='실측비' ? ' 실측비' : ' 시공비');
}
function regionFeeHint(prices) {
  return '→ 실측 '+prices['실측비'].toLocaleString()+'원 + 시공 '+prices['시공비'].toLocaleString()+'원 자동추가';
}

// ── 블라인드 옵션추가금 / 시공비 규칙 ──────────────────────────────────
// 2026-08-15(선혜님 확인): 옵션추가금(전동 부품비 등)은 지역 시공비 행에 합치지 않고 독립 행으로 -
// 지역/시공 여부와 무관하게 항상 받아야 하는 금액이라, 지역 미선택 상태에서도 화면에 남고 저장도 막히지 않음.
// extras: 블라인드 각 행의 [{ value, optName }] - value는 옵션추가금 입력값, optName은 옵션 이름(빈 문자열 가능)
function summarizeBlindOptionExtras(extras) {
  var extraSum = 0;
  var optNames = [];
  extras.forEach(function(e) {
    var v = Math.max(0, e.value || 0);
    extraSum += v;
    if (v > 0) {
      var name = (e.optName || '').trim();
      if (name && optNames.indexOf(name) < 0) optNames.push(name);
    }
  });
  return { extraSum: extraSum, content: optNames.length ? optNames.join(', ') : '옵션 추가금' };
}

// 블라인드 시공비: 단가 10,000원 × 블라인드 개수(레일과 달리 1개당이 아니라 창문 1개=블라인드 1개 기준)
var BLIND_INSTALL_UNIT_PRICE = 10000;
function blindInstallSpec(blindCount) {
  return { content: '블라인드 시공비 ('+blindCount+'개)', unitPrice: BLIND_INSTALL_UNIT_PRICE, qty: blindCount };
}
