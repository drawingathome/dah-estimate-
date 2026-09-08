const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9841;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const result = await page.evaluate(() => {
    saveCustomers([{ id: 9900, clientName: '우사랑재현2', phone:'01083444649', stage:'시공준비중', staffName:'마스터', date: '2026-06-20', price: 2670000 }]);
    openDetail('우사랑재현2', 9900);
    var tabRow = document.getElementById('dtab-info').parentElement;
    var rowRect = tabRow.getBoundingClientRect();
    var modalBox = document.querySelector('#detail-overlay .modal-box');
    var modalRect = modalBox.getBoundingClientRect();
    var lastTab = document.getElementById('dtab-est');
    var lastTabRect = lastTab.getBoundingClientRect();
    return {
      tabRowWidth: rowRect.width,
      modalWidth: modalRect.width,
      tabRowOverflows: rowRect.width > modalRect.width + 2,
      lastTabRight: lastTabRect.right,
      modalRight: modalRect.right,
      lastTabCutOff: lastTabRect.right > modalRect.right + 2,
      priceRowText: document.getElementById('price-edit-trigger') ? document.getElementById('price-edit-trigger').textContent : null
    };
  });

  console.log('탭 행 폭:', result.tabRowWidth, '/ 모달 폭:', result.modalWidth);
  console.log('탭 행이 모달보다 넘침:', result.tabRowOverflows ? '❌ 넘침' : '✅ 안 넘침');
  console.log('마지막 탭(이력) 오른쪽 끝 잘림:', result.lastTabCutOff ? '❌ 잘림' : '✅ 정상');
  console.log('매출계산기준금액 표시:', result.priceRowText);

  await browser.close();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 20000);
