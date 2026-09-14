const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9903;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 시공준비중 = 8번째 단계 (전체 9단계 중)
  await page.evaluate(() => {
    saveCustomers([{ id: 9500, clientName: '진행단계테스트', phone: '01055550000', stage: '시공준비중', staffName: '마스터' }]);
    openDetail('진행단계테스트', 9500, 'info');
  });
  await new Promise(res => setTimeout(res, 500));

  let r = await page.evaluate(() => {
    var body = document.getElementById('detail-body');
    return body ? body.textContent.slice(0, 100) : '';
  });
  ok('1. "8/9" 형식으로 전체 대비 현재 단계가 표시됨(시공준비중=8번째/총 9단계)', r.indexOf('8/9') !== -1, r);

  // 다른 단계(상담=2번째)로도 확인
  await page.evaluate(() => {
    saveCustomers([{ id: 9501, clientName: '진행단계테스트2', phone: '01055550001', stage: '상담', staffName: '마스터' }]);
    openDetail('진행단계테스트2', 9501, 'info');
  });
  await new Promise(res => setTimeout(res, 500));
  r = await page.evaluate(() => {
    var body = document.getElementById('detail-body');
    return body ? body.textContent.slice(0, 100) : '';
  });
  ok('2. 상담 단계(2번째)도 "2/9"로 정확히 표시됨', r.indexOf('2/9') !== -1, r);

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
