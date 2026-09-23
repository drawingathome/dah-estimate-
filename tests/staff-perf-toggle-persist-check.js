const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9953;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  await page.evaluate(() => {
    saveCustomers([
      { id: 1, clientName: '토글재현마스터', staffName: '마스터', stage: '시공완료', price: 3000000, contractDate: new Date().toISOString().slice(0,10) },
      { id: 2, clientName: '토글재현실장', staffName: '오지은 실장', stage: '시공완료', price: 2000000, contractDate: new Date().toISOString().slice(0,10) }
    ]);
    renderHome(true);
  });
  await new Promise(r => setTimeout(r, 300));

  // 2026-09-01(355c8ef) 실제사고 재현: "확인해보고 검토하고 말하니??
  // 없잖아" - 헤더를 클릭해 펼친 뒤(display:block), 홈 화면 전체가
  // 다시 그려져도(renderHome(true) - "이번달/지난달" 토글 클릭시 등에
  // 항상 발생) 펼침 상태가 그대로 유지되는지(예전엔 항상 닫힘으로
  // 되돌아갔음, 데이터는 맞는데 화면만 접힌 채라 텍스트 검증으로는
  // 못 잡히던 버그)
  const beforeRerender = await page.evaluate(() => {
    var header = document.querySelector('#sec-staff-perf > div');
    if (header) header.click();
    var panel = document.querySelector('#sec-staff-perf > div:nth-child(2)');
    return panel ? panel.style.display : null;
  });
  ok('1. 헤더 클릭시 펼쳐짐(display:block)', beforeRerender === 'block', 'before=' + beforeRerender);

  const afterRerender = await page.evaluate(() => {
    renderHome(true); // "이번달/지난달" 토글 클릭 등으로 실제 발생하는 전체 재렌더링
    var panel = document.querySelector('#sec-staff-perf > div:nth-child(2)');
    return panel ? panel.style.display : null;
  });
  ok('2. [핵심] 홈 전체 재렌더링 후에도 펼침 상태가 그대로 유지됨(닫힘으로 안 되돌아감)', afterRerender === 'block', 'after=' + afterRerender);

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
