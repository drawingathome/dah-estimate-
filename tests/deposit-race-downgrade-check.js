const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9940;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setViewport({ width: 1280, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 시나리오: 견적서 자체값(750,000)이 먼저 정확히 채워진 뒤, 나중에
  // 비동기로 도착한 고객레벨의 오래된/다른 값(0 또는 더 작은 값)이
  // 이걸 덮어쓰면 안 됨
  const r1 = await page.evaluate(() => {
    applyRealDepositToForm(750000); // 먼저 정확한 값이 채워짐(견적서 자체값 시뮬레이션)
    var afterFirst = document.getElementById('deposit-input').value;
    applyRealDepositToForm(0); // 나중에 도착한 값이 0(가드에 걸려 애초에 무시됨)
    var afterZero = document.getElementById('deposit-input').value;
    applyRealDepositToForm(300000); // 나중에 도착한 더 작은 값(고객레벨 옛날 값 시뮬레이션)
    var afterSmaller = document.getElementById('deposit-input').value;
    return { afterFirst, afterZero, afterSmaller };
  });
  ok('1. 먼저 채워진 정확한 값(750,000)이 정상 반영됨', r1.afterFirst.indexOf('750,000') !== -1, JSON.stringify(r1));
  ok('2. [핵심] 나중에 도착한 더 작은 값(300,000)이 먼저 채워진 큰 값을 덮어쓰지 않음', r1.afterSmaller.indexOf('750,000') !== -1, JSON.stringify(r1));

  // 대조군: 나중에 도착한 값이 더 크면(더 정확한 최신값일 수 있음) 정상 반영돼야 함
  const r2 = await page.evaluate(() => {
    document.getElementById('deposit-input').dataset.raw = '';
    document.getElementById('deposit-input').value = '';
    applyRealDepositToForm(300000);
    var afterFirst = document.getElementById('deposit-input').value;
    applyRealDepositToForm(750000);
    var afterLarger = document.getElementById('deposit-input').value;
    return { afterFirst, afterLarger };
  });
  ok('3. 나중에 도착한 값이 더 크면(진짜 최신값일 수 있음) 정상적으로 반영됨(회귀 없음)', r2.afterLarger.indexOf('750,000') !== -1, JSON.stringify(r2));

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
