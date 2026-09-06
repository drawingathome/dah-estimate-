const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9999;
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
    function daysAgo(n) { var d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
    // 활성 3명 + 보관대상(시공완료+15일전) 5명 = 총 8명
    var custs = [];
    for (var i = 0; i < 3; i++) custs.push({ id: 100+i, clientName: '활성'+i, phone:'010111100'+i, stage:'상담', staffName:'마스터', date: daysAgo(1) });
    for (var i = 0; i < 5; i++) custs.push({ id: 200+i, clientName: '보관'+i, phone:'010222200'+i, stage:'시공완료', staffName:'마스터', date: daysAgo(30), installDate: daysAgo(20) });
    saveCustomers(custs);
    goTab('search'); renderSearch();
    var labelDefault = document.getElementById('search-count').textContent;

    document.getElementById('show-archived').checked = true;
    renderSearch();
    var labelWithArchived = document.getElementById('search-count').textContent;

    return { labelDefault, labelWithArchived };
  });

  console.log('기본(보관 숨김) 라벨:', result.labelDefault);
  console.log('  → "전체 8명" 포함, 활성/보관 구분 표시:', result.labelDefault.includes('전체 8명') && result.labelDefault.includes('활성 3') && result.labelDefault.includes('보관 5') ? '✅' : '❌');
  console.log('보관고객 포함 라벨:', result.labelWithArchived);
  console.log('  → "전체 8명":', result.labelWithArchived.includes('전체 8명') ? '✅' : '❌');

  await browser.close();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 20000);
