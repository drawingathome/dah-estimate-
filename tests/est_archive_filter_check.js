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
      // 2026-09-15(코드정리 중 발견 - 이 테스트가 8/24 수정 이전 기준으로
      // 짜여있었음): "미계약보관함"은 그냥 "아직 계약 전(pending)"이 아니라
      // "명시적으로 거절된(rejected)" 것만 들어가야 함(dash-render-est.js의
      // isRejected() 참고, 8/24에 수정됨) - contractStatus를 'pending'이
      // 아니라 'rejected'로 바꿔서 실제 시나리오에 맞춤.
      { id: 502, clientName: '거절된고객', phone:'01055553333', stage:'가견적', staffName:'마스터', date: todayStr(), price: 1000000 }
    ]);
    localStorage.setItem('dah_saved', JSON.stringify([
      { no:'E1', clientId: 500, clientName:'진행중고객', price:1000000, contractStatus:'contracted', status:'final', staffName:'마스터', savedAt: todayStr() },
      { no:'E2', clientId: 501, clientName:'완료고객', price:1000000, contractStatus:'contracted', status:'final', staffName:'마스터', savedAt: todayStr() },
      { no:'E3', clientId: 502, clientName:'거절된고객', price:1000000, contractStatus:'rejected', status:'ga', staffName:'마스터', savedAt: todayStr() }
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

  var failed = 0;
  function ok(label, cond) { console.log((cond ? '✅' : '❌') + ' ' + label); if (!cond) failed++; }
  ok('[진행중] 진행중고객만 포함(거절된고객은 안 보임)', result.activeText.includes('진행중고객') && !result.activeText.includes('완료고객') && !result.activeText.includes('거절된고객'));
  ok('[시공완료보관함] 완료고객만 포함', result.completedText.includes('완료고객') && !result.completedText.includes('진행중고객'));
  ok('[계약안한보관함] 거절된고객만 포함', result.rejectedText.includes('거절된고객') && !result.rejectedText.includes('완료고객'));
  ok('[전체] 3건 전부', result.allCount.includes('3건'));

  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 20000);
