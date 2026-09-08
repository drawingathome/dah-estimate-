const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  for (const vp of [{name:'PC', width:1523, height:1195}, {name:'모바일', width:390, height:844}]) {
    const port = vp.name === 'PC' ? 9993 : 9994;
    const server = await startServer(dir, port);
    const browser = await launchBrowser();
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await blockRealNetwork(page);
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    await page.evaluate(() => { openAdd(); });
    await new Promise(r => setTimeout(r, 400));

    const pos = await page.evaluate(() => {
      var box = document.querySelector('#add-overlay .modal-box');
      var rect = box.getBoundingClientRect();
      var cs = getComputedStyle(document.getElementById('add-overlay'));
      return { top: rect.top, bottom: rect.bottom, windowHeight: window.innerHeight, alignItems: cs.alignItems };
    });
    console.log(`[${vp.name}] align-items: ${pos.alignItems}, top=${pos.top.toFixed(0)}, bottom=${pos.bottom.toFixed(0)}, windowH=${pos.windowHeight}`);
    if (vp.name === 'PC') {
      console.log(`  → 중앙정렬 확인:`, pos.alignItems === 'center' ? '✅' : '❌');
    } else {
      console.log(`  → 바텀시트 유지 확인:`, pos.alignItems === 'flex-end' ? '✅' : '❌');
    }

    await browser.close();
  }
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 30000);
