const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9804;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const result = await page.evaluate(() => {
    saveCustomers([{ id: 800, clientName: '재입력불필요테스트', phone:'01088880000', stage:'시공준비중', staffName:'마스터', date: todayStr(), price: 2670000, orderStatus: {} }]);
    localStorage.setItem('dah_saved', JSON.stringify([
      { no:'E1', clientId: 800, clientName:'재입력불필요테스트', price:2670000, curtainCount:0, blindCount:0, lineItems:[], staffName:'마스터', savedAt: todayStr() }
    ]));

    openDetail('재입력불필요테스트', 800, 'order');
    var bodyText = document.body.textContent;
    var hasNoDataMsg = bodyText.includes('저장된 견적서가 없어');
    var hasCheckboxes = document.querySelectorAll('input[type="checkbox"]').length;

    goTab('home'); renderHome(true);
    var todoText = document.getElementById('sec-todo').textContent;
    var hasNormalReason = todoText.includes('발주 필요') && !todoText.includes('발주정보 확인 필요');

    return { hasNoDataMsg, hasCheckboxes, hasNormalReason };
  });

  console.log('"저장된 견적서가 없어" 메시지 사라짐:', !result.hasNoDataMsg ? '✅' : '❌');
  console.log('체크박스 개수:', result.hasCheckboxes);
  console.log('처리필요에 정상 "발주 필요"로 뜸(재입력 문구 없이):', result.hasNormalReason ? '✅' : '❌');

  await browser.close();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 20000);
