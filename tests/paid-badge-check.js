// tests/paid-badge-check.js
// 2026-09-19(선혜님 - "결제를 선금 잔금을 해서 넣어서 토탈 금액이
// 일치한지 그리고 일치하면 완납 표시가 제대로 표시 되야 하는데 그런게
// 없네"): 결제 관리 화면에 선금+잔금 합계가 총액과 일치하면 "완납"
// 배지를 보여주는 기능 자체가 없었음 - 신설. 정확히 일치, 미수금 있음
// (안 뜸), 결제 입력 자체가 없음(안 뜸), 총액 자체가 없음(안 뜸) 4가지
// 조건으로 검증.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27100;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 1) 선금+잔금 = 총액 정확히 일치 → 완납 배지 떠야 함
  await page.evaluate(() => {
    saveCustomers([{ id: 9301, clientName: '완납테스트고객', phone: '01011112222', stage: '시공완료', staffName: '마스터',
      price: 1000000, depositAmount: 500000, balanceAmount: 500000 }]);
    openDetail('완납테스트고객', 9301);
  });
  await new Promise(r => setTimeout(r, 500));
  const paidState = await page.evaluate(() => {
    var payBody = document.getElementById('detail-pay-body') || document.getElementById('pay-body');
    return payBody ? payBody.textContent.indexOf('완납') !== -1 : (document.body.textContent.indexOf('완납') !== -1);
  });
  ok('1. 선금+잔금이 총액과 정확히 일치하면 "완납" 배지가 표시됨', paidState);

  // 2) 선금+잔금 < 총액(미수금 있음) → 완납 배지 안 떠야 함
  await page.evaluate(() => {
    saveCustomers([{ id: 9302, clientName: '미수금테스트고객', phone: '01033334444', stage: '시공완료', staffName: '마스터',
      price: 1000000, depositAmount: 500000, balanceAmount: 300000 }]);
    openDetail('미수금테스트고객', 9302);
  });
  await new Promise(r => setTimeout(r, 500));
  const unpaidState = await page.evaluate(() => document.body.textContent.indexOf('완납') !== -1);
  ok('2. [회귀방지] 선금+잔금이 총액보다 적으면(미수금) "완납" 배지가 안 뜸', !unpaidState);

  // 3) 결제 입력이 아예 없는 고객 → 완납 배지 안 떠야 함(불필요한 정보 방지)
  await page.evaluate(() => {
    saveCustomers([{ id: 9303, clientName: '무결제테스트고객', phone: '01055556666', stage: '가견적', staffName: '마스터',
      price: 1000000, depositAmount: 0, balanceAmount: 0 }]);
    openDetail('무결제테스트고객', 9303);
  });
  await new Promise(r => setTimeout(r, 500));
  const noPayState = await page.evaluate(() => document.body.textContent.indexOf('완납') !== -1);
  ok('3. 결제 입력이 아예 없으면 "완납" 배지가 안 뜸', !noPayState);

  // 4) 총액이 0(견적 미확정)인 고객 → 완납 배지 안 떠야 함(비교 기준 자체가 없으므로)
  await page.evaluate(() => {
    saveCustomers([{ id: 9304, clientName: '총액없음테스트고객', phone: '01077778888', stage: '가견적', staffName: '마스터',
      price: 0, depositAmount: 0, balanceAmount: 0 }]);
    openDetail('총액없음테스트고객', 9304);
  });
  await new Promise(r => setTimeout(r, 500));
  const noPriceState = await page.evaluate(() => document.body.textContent.indexOf('완납') !== -1);
  ok('4. 총액이 아직 없으면 "완납" 배지가 안 뜸', !noPriceState);

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
