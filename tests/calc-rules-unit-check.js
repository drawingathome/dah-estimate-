// tests/calc-rules-unit-check.js
// ══════════════════════════════════════════════════
// est-calc-rules.js(계산 규칙 순수 함수) 단위 테스트 - 브라우저 없이 1초 안에 끝남
//
// 2026-09-28(선혜님 - "밑에 세개를 그러면 놔두는게 베스트야?"): 계산 규칙을 화면 코드에서 떼어낸
// est-calc-rules.js가 앞으로도 "순수"하게 유지되는지, 그리고 각 규칙이 사람이 손으로 계산한
// 기대값과 맞는지 확인함.
//   1) 순수성 강제: 화면/저장소(document, window, localStorage 등)를 쓰면 실패.
//      실행도 "아무 전역도 없는 빈 환경"에서 하므로, 몰래 쓰면 그 자리에서 에러가 남.
//   2) 기대값은 코드를 돌려서 얻은 게 아니라 손으로 계산해서 적음(코드와 계산이 어긋나면 알 수 있게).
// ══════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'est-calc-rules.js');
const src = fs.readFileSync(file, 'utf-8');
let pass = 0, fail = 0;
function ok(cond, label, detail) { if (cond) { pass++; } else { fail++; console.log('❌ ' + label + (detail !== undefined ? ' — ' + detail : '')); } }
function eq(actual, expected, label) { ok(JSON.stringify(actual) === JSON.stringify(expected), label, '기대 ' + JSON.stringify(expected) + ' / 실제 ' + JSON.stringify(actual)); }

// ── 1) 순수성: 화면/저장소 접근 금지 (주석은 제외하고 검사)
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
['document', 'window', 'localStorage', 'sessionStorage', 'getElementById', 'querySelector', 'XMLHttpRequest', 'fetch\\(', 'alert\\(', 'confirm\\(', 'Date\\.now', 'new Date', 'Math\\.random'].forEach(w => {
  ok(!new RegExp('\\b' + w).test(code), '순수성: est-calc-rules.js가 ' + w.replace('\\\\(', '(') + '을(를) 쓰면 안 됨');
});
// 아무 전역도 없는 빈 환경에서 실행(화면을 몰래 쓰면 여기서 에러)
const ctx = vm.createContext(Object.create(null));
vm.runInContext(src, ctx);
const R = ctx;
const names = ['calcRailJa', 'railMaterialSpec', 'railInstallSpec', 'calcSuggestedPanels', 'curtainHeightFeeWarning', 'getBlindMinSqm', 'calcBlindBillableSqm', 'applyDiscountItems', 'calcGrandBeforeTruncation', 'truncateToThousand', 'calcDepositRatio', 'calcAutoDeposit', 'calcDepositAndBalance', 'calcPerformanceRevenue'];
names.forEach(n => ok(typeof R[n] === 'function', '함수 존재: ' + n));

// ── 2) 커튼 폭수 추천 (가로 × 배율 ÷ 130, 허용 소수점: 민자형 0.2 / 나비주름형 0.1)
// (손계산) 나비 300cm: 300×2/130 = 4.615 → 소수점 .615 > .1 → 올림 5
eq(R.calcSuggestedPanels(300, '나비주름형'), 5, '폭수: 나비 300cm → 5폭(4.615배)');
// 나비 261cm: 261×2/130 = 4.0154 → .0154 ≤ .1 → 내림 4
eq(R.calcSuggestedPanels(261, '나비주름형'), 4, '폭수: 나비 261cm → 4폭(4.015배는 여유분 이내라 내림) - 2026-08-27 선혜님 지시');
// 나비 72cm: 72×2/130 = 1.1077 → .1077 > .1 → 올림 2 (허용 기준 바로 위)
eq(R.calcSuggestedPanels(72, '나비주름형'), 2, '폭수: 나비 72cm → 2폭(1.108배, 허용 0.1 초과)');
// 나비 65cm: 65×2/130 = 1.0 → 소수점 0 → 1
eq(R.calcSuggestedPanels(65, '나비주름형'), 1, '폭수: 나비 65cm → 정확히 1폭');
// 민자 190cm: 190×1.5/130 = 2.1923 → .1923 ≤ .2 → 내림 2
eq(R.calcSuggestedPanels(190, '민자형'), 2, '폭수: 민자 190cm → 2폭(2.192배는 여유분 이내)');
// 민자 195cm: 195×1.5/130 = 2.25 → .25 > .2 → 올림 3
eq(R.calcSuggestedPanels(195, '민자형'), 3, '폭수: 민자 195cm → 3폭(2.25배는 허용 0.2 초과)');
// 민자 130cm: 130×1.5/130 = 1.5 → 올림 2
eq(R.calcSuggestedPanels(130, '민자형'), 2, '폭수: 민자 130cm → 2폭(1.5배)');
eq(R.calcSuggestedPanels(0, '민자형'), 0, '폭수: 가로 0 → 0');
eq(R.calcSuggestedPanels(260, '알수없는주름'), R.calcSuggestedPanels(260, '민자형'), '폭수: 모르는 주름형태는 민자형 기준');

// ── 3) 높이 추가요금 안내 (250/270/290cm 이상, 안내만 - 금액엔 반영 안 함)
eq(R.curtainHeightFeeWarning(249), '', '높이 249cm → 안내 없음');
eq(R.curtainHeightFeeWarning(250), '⚠️ 높이 250cm 이상 10% 추가', '높이 250cm → 10%');
eq(R.curtainHeightFeeWarning(269), '⚠️ 높이 250cm 이상 10% 추가', '높이 269cm → 10%');
eq(R.curtainHeightFeeWarning(270), '⚠️ 높이 270cm 이상 20% 추가', '높이 270cm → 20%');
eq(R.curtainHeightFeeWarning(289), '⚠️ 높이 270cm 이상 20% 추가', '높이 289cm → 20%');
eq(R.curtainHeightFeeWarning(290), '⚠️ 높이 290cm 이상 30% 추가', '높이 290cm → 30%');
eq(R.curtainHeightFeeWarning(400), '⚠️ 높이 290cm 이상 30% 추가', '높이 400cm → 30%');
eq(R.curtainHeightFeeWarning(0), '', '높이 0 → 안내 없음');

// ── 4) 블라인드 최소면적 / 청구 면적
['로만쉐이드', '롤스크린', '더블 롤블라인드'].forEach(k => eq(R.getBlindMinSqm(k), 2.0, '최소면적 2.0㎡: ' + k));
['알루미늄', '우드', '허니콤', '기타', ''].forEach(k => eq(R.getBlindMinSqm(k), 1.5, '최소면적 1.5㎡: ' + (k || '(빈 값)')));
// (손계산) 100×100cm = 1.0㎡ < 최소 2.0 → 2.0
eq(R.calcBlindBillableSqm(100, 100, 2.0), { sqmRaw: 2, sqm: 2 }, '면적: 1.0㎡는 최소 2.0㎡로 올림');
// 150×200 = 3.0㎡ (최소 이상) → 3.0
eq(R.calcBlindBillableSqm(150, 200, 1.5), { sqmRaw: 3, sqm: 3 }, '면적: 3.0㎡ 그대로');
// 143×150 = 2.145㎡ → 0.1 단위 올림 2.2
eq(R.calcBlindBillableSqm(143, 150, 1.5).sqm, 2.2, '면적: 2.145㎡ → 2.2㎡(0.1 올림)');
// 140×150 = 2.1㎡ → 2.1 (정확히 떨어지면 그대로)
eq(R.calcBlindBillableSqm(140, 150, 1.5).sqm, 2.1, '면적: 2.1㎡ → 2.1㎡');
eq(R.calcBlindBillableSqm(0, 100, 2.0), { sqmRaw: 0, sqm: 0 }, '면적: 가로 0이면 0(최소면적도 적용 안 함)');
eq(R.calcBlindBillableSqm(101, 101, 1.5).sqm, 1.5, '면적: 1.0201㎡ → 최소 1.5');

// ── 5) 쿠폰/직접입력 순차 할인 (원단위 먼저 → % 나중, %는 남은 금액 기준)
const d1 = R.applyDiscountItems(1000000, [{ source: 'coupon', type: 'pct', value: 10, label: 'A', id: 'a', name: 'A' }, { source: 'coupon', type: 'won', value: 50000, label: 'B', id: 'b', name: 'B' }]);
// (손계산) 원 먼저: 50,000 → 남은 950,000의 10% = 95,000 → 합계 145,000
eq(d1.totalDiscount, 145000, '할인: 5만원 + 10%는 원단위 먼저 → 합계 145,000원(입력 순서와 무관)');
eq(d1.discountBreakdown.map(x => x.amount), [50000, 95000], '할인 내역: 원단위가 먼저 나옴');
eq(d1.appliedCoupons.map(x => x.id), ['b', 'a'], '적용 쿠폰 순서: 원단위 쿠폰 → % 쿠폰');
const d2 = R.applyDiscountItems(30000, [{ source: 'coupon', type: 'won', value: 50000, label: 'X', id: 'x', name: 'X' }]);
eq(d2.totalDiscount, 30000, '할인: 원단위 할인은 남은 금액을 넘지 못함(30,000원까지만)');
const d3 = R.applyDiscountItems(1000, [{ source: 'manual', type: 'pct', value: 100, label: '직접입력' }]);
eq(d3.totalDiscount, 1000, '할인: 100% → 전액');
eq(d3.manualDiscount, { type: 'pct', value: 100, amount: 1000 }, '직접입력 할인 정보 기록');
const d4 = R.applyDiscountItems(999, [{ source: 'coupon', type: 'pct', value: 5, label: 'P', id: 'p', name: 'P' }]);
eq(d4.totalDiscount, 50, '할인: 999원의 5% = 49.95 → 반올림 50');
const d5 = R.applyDiscountItems(1000000, [{ source: 'coupon', type: 'pct', value: 10, label: 'A', id: 'a', name: 'A' }, { source: 'coupon', type: 'pct', value: 5, label: 'B', id: 'b', name: 'B' }]);
// (손계산) 100만의 10% = 100,000 → 남은 90만의 5% = 45,000 → 145,000
eq(d5.totalDiscount, 145000, '할인: 10% 다음 5%는 남은 금액 기준 순차 계산 → 145,000원');
eq(R.applyDiscountItems(500, []).totalDiscount, 0, '할인: 없으면 0');
const orig = [{ source: 'coupon', type: 'pct', value: 10, label: 'A', id: 'a', name: 'A' }, { source: 'coupon', type: 'won', value: 1, label: 'B', id: 'b', name: 'B' }];
R.applyDiscountItems(1000, orig);
eq(orig.map(x => x.id), ['a', 'b'], '할인: 넘겨준 목록의 순서를 바꾸지 않음(부작용 없음)');

// ── 6) 총액 / 절사 / 계약금 / 잔금 / 성과매출
eq(R.calcGrandBeforeTruncation(1000000, 145000, 150000), 1005000, '총액: 제품 100만 - 할인 14.5만 + 부자재 15만 = 1,005,000');
eq(R.calcGrandBeforeTruncation(100, 500, 0), 0, '총액: 할인이 더 크면 0(음수 없음)');
eq(R.truncateToThousand(1234567), { grand: 1234000, truncAmt: 567 }, '절사: 1,234,567 → 1,234,000 (567원 절사)');
eq(R.truncateToThousand(1000), { grand: 1000, truncAmt: 0 }, '절사: 1,000은 그대로');
eq(R.truncateToThousand(999), { grand: 0, truncAmt: 999 }, '절사: 999 → 0 (999원 절사)');
eq(R.truncateToThousand(0), { grand: 0, truncAmt: 0 }, '절사: 0은 그대로');
eq(R.calcDepositRatio(true), 0.5, '계약금 비율: 커튼/블라인드 있으면 50%');
eq(R.calcDepositRatio(false), 1, '계약금 비율: 침구/러그만이면 100%(2026-09-18 선혜님)');
eq(R.calcAutoDeposit(1234000, 0.5), 617000, '자동 계약금: 1,234,000의 50% = 617,000');
eq(R.calcAutoDeposit(999000, 1), 999000, '자동 계약금: 100%');
eq(R.calcDepositAndBalance(1000000, 400000), { deposit: 400000, balance: 600000 }, '잔금: 100만 - 계약금 40만 = 60만');
eq(R.calcDepositAndBalance(1000000, 2000000), { deposit: 1000000, balance: 0 }, '계약금이 총액보다 크면 총액으로 제한, 잔금 0');
eq(R.calcDepositAndBalance(1000000, -5), { deposit: 0, balance: 1000000 }, '음수 계약금은 0으로');
eq(R.calcDepositAndBalance(0, 0), { deposit: 0, balance: 0 }, '총액 0이면 둘 다 0');
eq(R.calcPerformanceRevenue(1000000, 145000), 855000, '성과매출: 제품소계 - 할인(2026-08-05: 할인해준 만큼은 성과에서 빠짐)');
eq(R.calcPerformanceRevenue(100, 500), 0, '성과매출: 음수 없음');

// ── 7) 레일 자동 산정 (원단 폭 → 자(尺) 수, 항상 짝수로 올림 / 자재 단가 1,600원 / 시공비 25,000원)
// (손계산) 30cm = 1자 → 홀수라 짝수로 올려 2자 / 60cm = 2자 그대로 / 61cm = 2.03 → 3 → 짝수로 4자
eq(R.calcRailJa(30), 2, '레일: 30cm(1자) → 홀수라 2자로 올림');
eq(R.calcRailJa(29), 2, '레일: 29cm(0.97자→1) → 2자');
eq(R.calcRailJa(60), 2, '레일: 60cm → 2자 그대로');
eq(R.calcRailJa(61), 4, '레일: 61cm(2.03→3) → 짝수 4자');
eq(R.calcRailJa(90), 4, '레일: 90cm(3자) → 4자');
eq(R.calcRailJa(300), 10, '레일: 300cm → 10자');
eq(R.calcRailJa(301), 12, '레일: 301cm(10.03→11) → 12자');
eq(R.calcRailJa(450), 16, '레일: 450cm(15자) → 16자');
eq(R.calcRailJa(600), 20, '레일: 600cm → 20자');
eq(R.calcRailJa(601), 22, '레일: 601cm(20.03→21) → 22자');
eq(R.calcRailJa(0), 0, '레일: 0cm → 0');
eq(R.RAIL_UNIT_PRICE, 1600, '레일 자재 단가 1,600원');
eq(R.RAIL_INSTALL_FEE, 25000, '레일 시공비 25,000원');
eq(R.railMaterialSpec(300), { ja: 10, content: '조절레일(타공형) 10자', unitPrice: 1600, qty: 10 }, '레일 자재 행: 300cm → 10자 × 1,600원');
// (손계산) 150cm = 5자 → 홀수라 6자 → 6 × 1,600 = 9,600원
eq(R.railMaterialSpec(150).qty * R.railMaterialSpec(150).unitPrice, 9600, '레일 자재비: 150cm → 6자 × 1,600원 = 9,600원');
eq(R.railInstallSpec(), { content: '레일 시공비', price: 25000, qty: 1 }, '레일 시공비 행: 25,000원 × 1개(레일수와 무관)');

console.log('\n' + pass + '건 통과, ' + fail + '건 실패');
process.exit(fail === 0 ? 0 : 1);
