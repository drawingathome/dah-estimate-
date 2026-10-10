const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9904;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch(e){} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 실제 결제선생 링크(https:// 포함해서 저장) 넣고 6번 발송 미리보기 확인
  await page.evaluate(() => {
    saveCustomers([{ id: 9600, clientName: '결제테스트', phone: '01044440000', stage: '선금결제', staffName: '마스터', paymentLink: 'https://bill.payssam.kr/receipt/bill/VbecUPmHqR', price: 1000000 }]);
    openDetail('결제테스트', 9600, 'alim');
  });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => { sendAlimtalk('tC_payment'); });
  await new Promise(r => setTimeout(r, 300));
  const r = await page.evaluate(() => {
    var ta = document.getElementById('alimtalk-msg-textarea');
    return ta ? ta.value : null;
  });
  console.log('실제 미리보기 내용:\n' + r);
  ok('1. "https://https://" 이중 접두어 없음', r && r.indexOf('https://https://') === -1, r);
  ok('2. 링크가 정확히 한 번의 https://로 나옴', r && r.indexOf('https://bill.payssam.kr/receipt/bill/VbecUPmHqR') !== -1, r);

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
