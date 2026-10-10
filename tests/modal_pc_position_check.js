const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9995;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  // 스크린샷에서 보였던 것과 비슷한 넓고 긴 PC창 크기로 설정
  await page.setViewport({ width: 1523, height: 1195 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  await page.evaluate(() => {
    saveCustomers([{ id: 9800, clientName: '모달테스트', phone:'01011112222', stage: '시공준비중', staffName:'마스터', date: todayStr(), price: 1000000 }]);
    openDetail('모달테스트', 9800);
  });
  await new Promise(r => setTimeout(r, 400));

  const pos = await page.evaluate(() => {
    var box = document.querySelector('#detail-overlay .modal-box');
    var rect = box.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, windowHeight: window.innerHeight, gapAbove: rect.top };
  });
  console.log('모달 위치:', JSON.stringify(pos));
  console.log('위쪽 여백:', pos.gapAbove, 'px (예전엔 큰 여백, 이제는 중앙정렬이라 상하 여백 비슷해야함)');
  console.log('모달이 화면 안에 다 들어옴:', pos.bottom <= pos.windowHeight ? '✅' : '❌ (아래로 잘림)');

  await page.screenshot({ path: path.join(dir, 'qa', 'modal_pc_center_check.png') });

  await browser.close();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 20000);
