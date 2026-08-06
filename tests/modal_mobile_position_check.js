const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9996;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 844 }); // 모바일
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  await page.evaluate(() => {
    saveCustomers([{ id: 9801, clientName: '모바일모달테스트', phone:'01011112222', stage: '시공준비중', staffName:'마스터', date: todayStr(), price: 1000000 }]);
    openDetail('모바일모달테스트', 9801);
  });
  await new Promise(r => setTimeout(r, 400));

  const pos = await page.evaluate(() => {
    var box = document.querySelector('#detail-overlay .modal-box');
    var rect = box.getBoundingClientRect();
    var cs = getComputedStyle(document.getElementById('detail-overlay'));
    return { bottom: rect.bottom, windowHeight: window.innerHeight, alignItems: cs.alignItems, top: rect.top };
  });
  console.log('모바일에서 align-items:', pos.alignItems, pos.alignItems === 'flex-end' ? '✅ (바텀시트 유지)' : '❌ (모바일 스타일 깨짐!)');
  console.log('모달이 화면 하단에 붙어있음:', Math.abs(pos.bottom - pos.windowHeight) < 5 ? '✅' : '❌ (bottom=' + pos.bottom + ', window=' + pos.windowHeight + ')');

  await page.screenshot({ path: path.join(dir, 'qa', 'modal_mobile_check.png') });

  await browser.close();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 20000);
