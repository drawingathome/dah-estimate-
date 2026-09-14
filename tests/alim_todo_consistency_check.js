const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9900;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 문지윤 사례 재현: 시공준비중 단계, 방문일이 아직 D-1이 아닌 경우
  // (8번 일정확정=즉시성이라 항상 뜸, 3번 방문전날안내=D-1 타이밍이라 아직 안 떠야 함)
  await page.evaluate(() => {
    saveCustomers([{ id: 8001, clientName: '탭일치테스트', phone: '01066660000', stage: '시공준비중', staffName: '마스터', installDate: '2026-09-30' }]);
    openDetail('탭일치테스트', 8001, 'info');
  });
  await new Promise(res => setTimeout(res, 500));

  const infoResult = await page.evaluate(() => {
    var body = document.getElementById('detail-body');
    var text = body ? body.textContent : '';
    var moreMatch = text.match(/(\d+)건 더 남음/);
    return { hasTodo: text.indexOf('지금 해야 할 일') !== -1, moreCount: moreMatch ? parseInt(moreMatch[1]) : 0, snippet: text.slice(0, 300) };
  });

  await page.evaluate(() => { switchDetailTab('alim'); });
  await new Promise(res => setTimeout(res, 300));
  // 2026-09-14(핀 박스를 소통탭에서 제거하고 정보탭 한 곳에만 남기기로
  // 함): 이제 소통탭엔 "지금 보낼 알림톡" 섹션 자체가 없어야 정상.
  const alimResult = await page.evaluate(() => {
    var body = document.getElementById('detail-alim-body');
    var text = body ? body.textContent : '';
    return { hasPinnedBox: text.indexOf('📌 지금 보낼 알림톡') !== -1 };
  });

  ok('1. 정보탭 "지금 해야 할 일"에 8번은 뜸(즉시성이라 항상 대상)', infoResult.hasTodo, infoResult.snippet);
  ok('2. 정보탭에 "1건 더 남음"이 안 뜸(3번은 아직 D-1 아니라 대상 아님 - 예전엔 여기서 잘못 1건으로 떴음)', infoResult.moreCount === 0, 'moreCount=' + infoResult.moreCount);
  ok('3. 소통탭엔 "지금 보낼 알림톡" 핀 박스가 더 이상 없음(정보탭 한 곳으로 통합됨)', !alimResult.hasPinnedBox, JSON.stringify(alimResult));

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 30000);
