// tests/multi-estimate-revenue-check.js
// 2026-10-13: 견적서가 여러 건인 고객의 성과매출이 과다 계산되던 버그(시험가 9월 약 609만 원, 시험오 약 630만 원 과다) 재발 방지.
// 규칙: 견적서가 있는 고객은 "각 견적서 자신의 성과매출"을 입금 비율대로 인식. 고객 칸 합계는 견적서 없는 옛 이관 고객에만 사용.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9963;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (!cond && detail !== undefined ? ' — ' + detail : '')); }

  const r = await page.evaluate(() => {
    const sum = a => Math.round(a.reduce((s, x) => s + x.perf, 0));
    const rev = a => Math.round(a.reduce((s, x) => s + x.revenue, 0));
    function run(cust, ests) {
      localStorage.setItem('dah_saved', JSON.stringify(ests));
      const parts = splitCustomerPayments(cust);
      return { perf: sum(parts), revenue: rev(parts), n: parts.length };
    }
    const out = {};
    // 1) 견적서 2건 모두 입금(시험가 실사례): 고객 칸 성과매출은 합계(6,399,600)
    out.both = run(
      { id: 1, clientName: '두건입금', stage: '선금결제', price: 6972000, performanceRevenue: 6399600, depositAmount: 3820000, balanceAmount: 0, date: '2026-09-15' },
      [{ clientId: 1, clientName: '두건입금', price: 6352000, performanceRevenue: 5779600, depositAmount: 3200000, depositDate: '2026-09-15', savedAt: '1' },
       { clientId: 1, clientName: '두건입금', price: 620000, performanceRevenue: 620000, depositAmount: 620000, depositDate: '2026-09-16', savedAt: '2' }]);
    // 2) 입금 없는 가견적 + 입금한 견적(시험오 실사례): 입금 없는 가견적은 매출에 안 잡힘
    out.unpaidPlusPaid = run(
      { id: 2, clientName: '가견적섞임', stage: '시공완료', price: 80000, performanceRevenue: 6380000, depositAmount: 0, balanceAmount: 80000, date: '2026-01-01' },
      [{ clientId: 2, clientName: '가견적섞임', price: 6300000, performanceRevenue: 6300000, depositAmount: 0, balanceAmount: 0, savedAt: '1' },
       { clientId: 2, clientName: '가견적섞임', price: 80000, performanceRevenue: 80000, depositAmount: 0, balanceAmount: 80000, balanceDate: '2026-03-01', savedAt: '2' }]);
    // 3) 견적서 1건 고객은 예전과 같음(회귀 없음): 성과매출 900,000 × 선금 비율 50%
    out.single = run(
      { id: 3, clientName: '한건', stage: '선금결제', price: 1000000, performanceRevenue: 900000, depositAmount: 500000, balanceAmount: 0, date: '2026-09-01' },
      [{ clientId: 3, clientName: '한건', price: 1000000, performanceRevenue: 900000, depositAmount: 500000, depositDate: '2026-09-01', savedAt: '1' }]);
    // 4) 견적서가 아예 없는 옛 이관 고객: 고객 칸 성과매출을 그대로 존중
    out.legacy = run(
      { id: 4, clientName: '옛이관', stage: '시공완료', price: 2500000, performanceRevenue: 2000000, depositAmount: 0, balanceAmount: 2500000, balanceDate: '2026-03-01', date: '2026-03-01' },
      []);
    // 5) 견적서의 성과매출이 비어 있으면(0) 그 견적서 총액으로 대체(고객 칸 합계를 쓰지 않음)
    out.missingPerf = run(
      { id: 5, clientName: '성과매출없음', stage: '시공완료', price: 3320000, performanceRevenue: 574000, depositAmount: 0, balanceAmount: 3320000, date: '2026-04-01' },
      [{ clientId: 5, clientName: '성과매출없음', price: 574000, performanceRevenue: 574000, depositAmount: 0, balanceAmount: 0, savedAt: '1' },
       { clientId: 5, clientName: '성과매출없음', price: 3320000, performanceRevenue: 0, depositAmount: 0, balanceAmount: 3320000, balanceDate: '2026-04-05', savedAt: '2' }]);
    // 6) 견적서엔 입금이 없고 고객 칸에만 입금이 있으면 고객 칸 값을 대표로 사용(기존 동작 유지)
    out.custOnly = run(
      { id: 6, clientName: '고객칸입금', stage: '시공완료', price: 975000, performanceRevenue: 975000, depositAmount: 0, balanceAmount: 975000, balanceDate: '2026-05-01', date: '2026-05-01' },
      [{ clientId: 6, clientName: '고객칸입금', price: 0, performanceRevenue: 0, depositAmount: 0, balanceAmount: 0, savedAt: '1' }]);
    return out;
  });

  ok('1. 견적서 2건 모두 입금: 성과매출 = 각 견적서 비율 합계 3,531,637 (예전 9,623,580)', r.both.perf === 3531637, JSON.stringify(r.both));
  ok('1-1. 입금액(revenue)은 실제 입금 합계 3,820,000 그대로', r.both.revenue === 3820000, JSON.stringify(r.both));
  ok('2. 입금 없는 가견적은 성과매출에 안 잡힘: 80,000 (예전 6,380,000)', r.unpaidPlusPaid.perf === 80000, JSON.stringify(r.unpaidPlusPaid));
  ok('3. 견적서 1건 고객은 예전과 동일: 450,000', r.single.perf === 450000, JSON.stringify(r.single));
  ok('4. 견적서 없는 옛 이관 고객은 고객 칸 성과매출 2,000,000 그대로', r.legacy.perf === 2000000, JSON.stringify(r.legacy));
  ok('5. 견적서 성과매출이 0이면 그 견적서 총액 3,320,000으로 대체(고객 칸 합계 574,000을 쓰지 않음)', r.missingPerf.perf === 3320000, JSON.stringify(r.missingPerf));
  ok('6. 견적서에 입금이 없고 고객 칸에만 있으면 고객 칸 값 사용: 975,000', r.custOnly.perf === 975000, JSON.stringify(r.custOnly));

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');
  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 40000);
