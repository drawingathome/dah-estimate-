// 2026-10-16 이영욱 재결제 사례: (1) 환불 뒤 옛 결제 임시저장을 실제로 지움 (2) 선금이 견적금액 전액이면 50% 확인창을 띄우지 않음
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
async function run() {
  const dir = path.resolve(__dirname, '..'); const port = 9933;
  const server = await startServer(dir, port); const browser = await launchBrowser(); const page = await browser.newPage();
  const jsErrors = []; page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
  const r = await page.evaluate(() => {
    localStorage.setItem('dah_pay_draft_248', JSON.stringify({ dep: { method: '카드', amount: '1027000', date: '2026-10-05' } }));
    localStorage.setItem('dah_pay_draft_999', JSON.stringify({ dep: { amount: '1' } }));
    window.loadCustomersAsync = function(cb) { cb && cb(); }; window.closeDetail = function(){}; window.openDetail = function(){};
    reopenAfterRefund({ id: 248, clientName: '이영욱' });
    return {
      draftGone: localStorage.getItem('dah_pay_draft_248') === null,
      otherKept: localStorage.getItem('dah_pay_draft_999') !== null,
      half: depositRatioNeedsConfirm(513500, 1027000, false),
      full: depositRatioNeedsConfirm(1027000, 1027000, false),
      other: depositRatioNeedsConfirm(700000, 1027000, false),
      over: depositRatioNeedsConfirm(1200000, 1027000, true),
      zero: depositRatioNeedsConfirm(0, 1027000, false)
    };
  });
  const log = []; const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + ' — ' + d);
  ok('1. 환불 뒤 이 고객의 옛 결제 임시저장이 지워짐', r.draftGone, JSON.stringify(r));
  ok('2. 다른 고객의 임시저장은 그대로', r.otherKept, '');
  ok('3. 50% 금액은 확인창 없음', r.half === false, '');
  ok('4. 견적금액 전액(완납)도 확인창 없음', r.full === false, '');
  ok('5. 50%도 전액도 아닌 금액(70만)은 확인창 유지', r.other === true, '');
  ok('6. 초과·0원은 이 확인창 대상 아님(별도 처리)', r.over === false && r.zero === false, '');
  ok('7. JS 에러 없음', jsErrors.length === 0, jsErrors.join(';'));
  log.forEach(l => console.log(l)); await browser.close(); server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); }); setTimeout(() => process.exit(1), 60000);
