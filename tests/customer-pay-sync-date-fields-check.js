#!/usr/bin/env node
// tests/customer-pay-sync-date-fields-check.js
// ══════════════════════════════════════════════════
// 2026-10-02(선혜님 - "이민선 100만원 선금 입금 했는데 돼 상담에 뜨니 니가 먼저 답해봐"
// 신고로 발견): dash-customer-pay.js의 "여러 견적서 합계를 customers에 동기화"하는
// 로직(2026-10-01 최금희 사례로 도입)이 estimates에서 deposit_amount/balance_amount
// 금액만 select해서, 그 뒤 customers PATCH에 deposit_date/deposit_method/
// deposit_receipt(잔금도 동일)가 통째로 빠지고 있었음 - estimates(진짜 소스)엔 날짜가
// 정확히 있는데 customers만 빈 채로 남아 화면 표시가 어긋남.
//
// 수정: select절에 날짜/수단/영수확인 필드 추가, 금액은 합산하되 날짜/수단/영수확인은
// "가장 최근(늦은) 날짜를 가진 값"을 대표로 채택(dash-utils.js getReceivedSummary와
// 동일한 패턴).
//
// 사용법: node tests/customer-pay-sync-date-fields-check.js
// ══════════════════════════════════════════════════
// dash-customer-pay.js의 수정된 집계 로직을 그대로 복제해서 단위 검증
function simulate(rows) {
  var sumDep = 0, sumBal = 0;
  var repDepDate = '', repDepMethod = '', repDepReceipt = false;
  var repBalDate = '', repBalMethod = '', repBalReceipt = false;
  rows.forEach(function (r) {
    sumDep += Number(r.deposit_amount) || 0; sumBal += Number(r.balance_amount) || 0;
    if (r.deposit_date && r.deposit_date > repDepDate) { repDepDate = r.deposit_date; repDepMethod = r.deposit_method || ''; repDepReceipt = !!r.deposit_receipt; }
    if (r.balance_date && r.balance_date > repBalDate) { repBalDate = r.balance_date; repBalMethod = r.balance_method || ''; repBalReceipt = !!r.balance_receipt; }
  });
  return { sumDep, sumBal, repDepDate, repDepMethod, repDepReceipt, repBalDate, repBalMethod, repBalReceipt };
}

// 이민선 케이스: 견적서 1건, deposit만 있음
var r1 = simulate([
  { deposit_amount: 1000000, deposit_date: '2026-10-02', deposit_method: '현금', deposit_receipt: true, balance_amount: 0, balance_date: '', balance_method: '', balance_receipt: false }
]);
console.log('케이스1(이민선 유형):', JSON.stringify(r1));
var ok1 = r1.sumDep === 1000000 && r1.repDepDate === '2026-10-02' && r1.repDepMethod === '현금' && r1.repDepReceipt === true;

// 여러 견적서 혼재: 날짜가 다른 2건 중 더 최근 것이 대표값으로 채택되는지
var r2 = simulate([
  { deposit_amount: 500000, deposit_date: '2026-09-01', deposit_method: '카드', deposit_receipt: false, balance_amount: 0, balance_date: '', balance_method: '', balance_receipt: false },
  { deposit_amount: 300000, deposit_date: '2026-09-15', deposit_method: '현금', deposit_receipt: true, balance_amount: 200000, balance_date: '2026-09-20', balance_method: '현금', balance_receipt: true }
]);
console.log('케이스2(여러 견적서, 최신값 대표):', JSON.stringify(r2));
var ok2 = r2.sumDep === 800000 && r2.repDepDate === '2026-09-15' && r2.repDepMethod === '현금' && r2.repDepReceipt === true
  && r2.sumBal === 200000 && r2.repBalDate === '2026-09-20';

console.log('\n' + ((ok1 && ok2) ? '✅ 집계 로직 정확히 작동(금액 합산 + 날짜/수단/영수증은 최신값 대표)' : '❌ 문제 있음'));
process.exit((ok1 && ok2) ? 0 : 1);
