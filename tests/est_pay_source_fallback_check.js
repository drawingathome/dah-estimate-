const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9931;
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
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // getLatestEstPay: 견적서엔 결제정보 없고 고객레벨엔 완납 기록
  const r1 = await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([{ clientId: 2001, clientName: '테스트A', price: 1000000, savedAt: '2026-09-20' }]));
    var c = { id: 2001, clientName: '테스트A', price: 1000000, depositAmount: 500000, balanceAmount: 500000 };
    return getLatestEstPay(c);
  });
  ok('1. getLatestEstPay - 견적서에 결제정보 없어도 고객레벨 완납 기록을 정확히 반환', r1.depositAmount === 500000 && r1.balanceAmount === 500000, JSON.stringify(r1));

  // getLatestEstPay 대조군: 견적서 쪽에 실제로 더 큰/정확한 결제기록이 있으면 그걸 우선
  const r2 = await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([{ clientId: 2002, clientName: '테스트B', price: 1000000, depositAmount: 700000, balanceAmount: 300000, savedAt: '2026-09-20' }]));
    var c = { id: 2002, clientName: '테스트B', price: 1000000, depositAmount: 0, balanceAmount: 0 };
    return getLatestEstPay(c);
  });
  ok('2. getLatestEstPay - 견적서 쪽에 실제 결제기록이 있으면(고객레벨보다 큼) 그대로 사용(회귀 없음)', r2.depositAmount === 700000 && r2.balanceAmount === 300000, JSON.stringify(r2));

  // getAllEstPays: 견적서 목록 전체가 0인데 고객레벨엔 완납
  const r3 = await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([{ clientId: 2003, clientName: '테스트C', price: 620000, savedAt: '2026-09-20' }]));
    var c = { id: 2003, clientName: '테스트C', price: 620000, depositAmount: 620000, balanceAmount: 0 };
    return getAllEstPays(c);
  });
  ok('3. getAllEstPays - 견적서 목록 전체 결제기록이 0이어도 고객레벨 완납을 대표항목으로 반환', r3.length === 1 && r3[0].depositAmount === 620000, JSON.stringify(r3));

  // getAllEstPays 대조군: 견적서 여러 건에 실제 결제기록이 있으면 그대로 배열 유지(회귀 없음)
  const r4 = await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([
      { clientId: 2004, clientName: '테스트D', price: 500000, depositAmount: 250000, balanceAmount: 250000, savedAt: '2026-09-10' },
      { clientId: 2004, clientName: '테스트D', price: 300000, depositAmount: 150000, balanceAmount: 0, savedAt: '2026-09-20' }
    ]));
    var c = { id: 2004, clientName: '테스트D', price: 0, depositAmount: 0, balanceAmount: 0 };
    return getAllEstPays(c);
  });
  ok('4. getAllEstPays - 여러 견적서에 실제 결제기록이 있으면 각각 그대로 배열로 반환(회귀 없음)', r4.length === 2 && r4[0].depositAmount === 250000 && r4[1].depositAmount === 150000, JSON.stringify(r4));

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 30000);
