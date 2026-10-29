// tests/pay-save-customer-price-sync-check.js
// 2026-10-20(시험카 사례: 침구 완납 + 커튼 선금 50% = 견적서 2개): 대시보드 결제 저장 뒤 고객의 매출 계산 기준금액(price)·성과매출이
// 입금이 기록된 견적서들의 합계로 맞춰지는지 확인(견적서 앱 저장과 같은 규칙). 입금된 견적서가 없거나 이미 같으면 건드리지 않고, 조회 실패해도 흐름이 끊기지 않음.
const path = require('path');
const fs = require('fs');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9961;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  let fail = 0;
  const check = (l, c, d) => { if (c) console.log('✅ ' + l); else { console.log('❌ ' + l + ' — ' + JSON.stringify(d)); fail++; } };
  const r = await page.evaluate(async () => {
    const out = {};
    const run = (cust, rows, getErr) => new Promise(resolve => {
      const calls = [];
      window.sbXHR = function (method, p, data, cb) {
        calls.push({ method, p, data });
        if (method === 'GET') { setTimeout(() => cb(getErr ? { status: 500 } : null, getErr ? null : rows), 0); }
        else { setTimeout(() => cb(null, [{}]), 0); }
      };
      let finished = false;
      syncCustomerPriceFromPaidEstimates(cust, () => { finished = true; resolve({ calls, finished, price: cust.price, perf: cust.performanceRevenue }); });
      setTimeout(() => { if (!finished) resolve({ calls, finished, timeout: true }); }, 1500);
    });
    // 시험카형: 침구 완납(1,763,000) + 커튼 선금 50%(1,559,000 / 총 3,118,000), 고객 칸은 아직 침구 금액만
    out.two = await run({ id: 271, price: 1763000, performanceRevenue: 1763000 }, [
      { id: 'a', price: 3118000, performance_revenue: 2900000, deposit_amount: 1559000, balance_amount: 0 },
      { id: 'b', price: 1763000, performance_revenue: 1763000, deposit_amount: 1763000, balance_amount: 0 }]);
    // 입금된 견적서 없음 → 건드리지 않음
    out.none = await run({ id: 5, price: 500000, performanceRevenue: 450000 }, [{ id: 'x', price: 700000, performance_revenue: 650000, deposit_amount: 0, balance_amount: 0 }]);
    // 이미 같음 → PATCH 없음
    out.same = await run({ id: 6, price: 1763000, performanceRevenue: 1763000 }, [{ id: 'b', price: 1763000, performance_revenue: 1763000, deposit_amount: 1763000, balance_amount: 0 }]);
    // 조회 실패 → PATCH 없이 흐름 계속
    out.err = await run({ id: 7, price: 1, performanceRevenue: 1 }, [], true);
    return out;
  });
  const patches = x => x.calls.filter(c => c.method === 'PATCH');
  check('견적서 2개(침구 완납+커튼 선금): 고객 기준금액이 4,881,000원으로 맞춰짐', patches(r.two).length === 1 && patches(r.two)[0].data.price === 4881000 && patches(r.two)[0].data.performance_revenue === 4663000 && r.two.price === 4881000, r.two);
  check('입금된 견적서가 없으면 고객 금액을 건드리지 않음', patches(r.none).length === 0 && r.none.finished, r.none);
  check('이미 같은 값이면 저장하지 않음', patches(r.same).length === 0 && r.same.finished, r.same);
  check('견적서 조회가 실패해도 저장 흐름은 계속되고 아무것도 안 바꿈', patches(r.err).length === 0 && r.err.finished, r.err);
  const src = fs.readFileSync(path.join(dir, 'dash-customer-pay.js'), 'utf8');
  const iSync = src.indexOf('syncCustomerPriceFromPaidEstimates(c, function');
  const iLock = src.indexOf("typeof fetchLatestUpdatedAt === 'function'", iSync);
  check('결제 저장 흐름에서 기준금액 동기화가 잠금값 갱신보다 먼저 호출됨(고객 수정시각 충돌 방지)', iSync > 0 && iLock > iSync, [iSync, iLock]);
  check('자바스크립트 오류 없음', errs.length === 0, errs);
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
