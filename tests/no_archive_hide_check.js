const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9800;
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
    var custs = [];
    for (var i = 0; i < 3; i++) custs.push({ id: 300+i, clientName: '활성'+i, phone:'010333300'+i, stage:'상담', staffName:'마스터', date: daysAgo(1) });
    // 시공완료 + 30일전(예전이면 숨겨졌을 대상)
    for (var i = 0; i < 5; i++) custs.push({ id: 400+i, clientName: '완료오래됨'+i, phone:'010444400'+i, stage:'시공완료', staffName:'마스터', date: daysAgo(60), installDate: daysAgo(30) });
    saveCustomers(custs);
    goTab('search'); renderSearch();
    var label = document.getElementById('search-count').textContent;
    var listText = document.getElementById('search-list').textContent;
    var allVisible = custs.every(c => listText.includes(c.clientName));
    return { label, allVisible, totalCreated: custs.length };
  });

  console.log('라벨:', result.label);
  console.log('생성한 8명(완료+30일 지난 5명 포함) 전부 화면에 보임:', result.allVisible ? '✅' : '❌');
  console.log('라벨에 정확한 총원(8명) 표시:', result.label.includes('8명') ? '✅' : '❌ (' + result.label + ')');

  await browser.close();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 20000);
