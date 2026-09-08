const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9801;
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
    saveCustomers([
      { id: 500, clientName: '진행중고객', phone:'01055551111', stage:'선금결제', staffName:'마스터', date: todayStr(), price: 1000000 },
      { id: 501, clientName: '완료고객', phone:'01055552222', stage:'시공완료', staffName:'마스터', date: todayStr(), price: 1000000 },
      { id: 502, clientName: '미계약고객', phone:'01055553333', stage:'가견적', staffName:'마스터', date: todayStr(), price: 1000000 }
    ]);
    localStorage.setItem('dah_saved', JSON.stringify([
      { no:'E1', clientId: 500, clientName:'진행중고객', price:1000000, contractStatus:'contracted', status:'final', staffName:'마스터', savedAt: todayStr() },
      { no:'E2', clientId: 501, clientName:'완료고객', price:1000000, contractStatus:'contracted', status:'final', staffName:'마스터', savedAt: todayStr() },
      { no:'E3', clientId: 502, clientName:'미계약고객', price:1000000, contractStatus:'pending', status:'ga', staffName:'마스터', savedAt: todayStr() }
    ]));

    goTab('est-list'); renderEstList();
    var activeText = document.getElementById('est-list-body').textContent;

    setEstArchiveFilter('completed_archive');
    var completedText = document.getElementById('est-list-body').textContent;

    setEstArchiveFilter('rejected_archive');
    var rejectedText = document.getElementById('est-list-body').textContent;

    setEstArchiveFilter('all');
    var allCount = document.getElementById('est-list-count').textContent;

    return { activeText, completedText, rejectedText, allCount };
  });

  console.log('[진행중] 진행중고객만 포함:', result.activeText.includes('진행중고객') && !result.activeText.includes('완료고객') && !result.activeText.includes('미계약고객') ? '✅' : '❌');
  console.log('[시공완료보관함] 완료고객만 포함:', result.completedText.includes('완료고객') && !result.completedText.includes('진행중고객') ? '✅' : '❌');
  console.log('[계약안한보관함] 미계약고객만 포함:', result.rejectedText.includes('미계약고객') && !result.rejectedText.includes('완료고객') ? '✅' : '❌');
  console.log('[전체] 3건 전부:', result.allCount.includes('3건') ? '✅' : '❌ (' + result.allCount + ')');

  await browser.close();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 20000);
