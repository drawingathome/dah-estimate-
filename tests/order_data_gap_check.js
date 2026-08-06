const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9802;
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
    // 우사랑 케이스 재현: 시공준비중 단계 + 견적서는 있지만 line_items/curtainCount 다 0
    saveCustomers([{ id: 700, clientName: '데이터갭테스트', phone:'01099990000', stage:'시공준비중', staffName:'마스터', date: todayStr(), price: 2670000, orderStatus: {} }]);
    localStorage.setItem('dah_saved', JSON.stringify([
      { no:'E1', clientId: 700, clientName:'데이터갭테스트', price:2670000, curtainCount:0, blindCount:0, lineItems:[], staffName:'마스터', savedAt: todayStr() }
    ]));
    goTab('home'); renderHome(true);
    var todoText = document.getElementById('sec-todo').textContent;
    return { todoText };
  });

  console.log('처리필요에 표시됨:', result.todoText.includes('데이터갭테스트') ? '✅' : '❌');
  console.log('사유가 "발주정보 확인 필요"로 뜸:', result.todoText.includes('발주정보 확인 필요') ? '✅' : '❌');

  await browser.close();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 20000);
