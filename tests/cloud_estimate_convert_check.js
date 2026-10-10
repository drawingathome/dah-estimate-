const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9981;
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
    // 우사랑님과 비슷한 클라우드 row 형태를 직접 변환
    var row = {
      id: 'test-est-1', customer_name: '변환테스트', client_id: 9700,
      price: 500000,
      line_items: [
        { type: 'curtain', space: '거실', vendor: '커튼업체A' },
        { type: 'curtain', space: '안방', vendor: '커튼업체B' },
        { type: 'blind', space: '주방', vendor: '블라인드업체C' }
      ]
    };
    var local = estimateDbRowToLocal(row);
    return {
      curtainCount: local.curtainCount,
      blindCount: local.blindCount,
      curtainVendors: local.curtainVendors,
      blindVendors: local.blindVendors
    };
  });

  console.log('변환 결과:', JSON.stringify(result));
  console.log('커튼 개수 2개 정확:', result.curtainCount === 2 ? '✅' : '❌');
  console.log('블라인드 개수 1개 정확:', result.blindCount === 1 ? '✅' : '❌');
  console.log('커튼 거래처 2곳 정확:', JSON.stringify(result.curtainVendors) === JSON.stringify(['커튼업체A','커튼업체B']) ? '✅' : '❌');

  await browser.close();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 20000);
