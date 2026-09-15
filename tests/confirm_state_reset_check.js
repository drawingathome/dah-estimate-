const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9926;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 1280, height: 1200 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 허서진 사례 재현: 이전 고객(노지경) 견적을 확정한 뒤 "새 견적서"로 새 고객 시작
  const r1 = await page.evaluate(() => {
    document.getElementById('c-name').value = '노지경';
    toggleConfirmEstimate(); // 확정
    return { confirmedAtSet: !!window._estimateConfirmedAt, badgeText: document.getElementById('hd-confirm-badge').textContent };
  });
  ok('1. 이전 고객(노지경) 견적을 확정하면 확정 상태/배지가 켜짐(사전조건 확인)', r1.confirmedAtSet && r1.badgeText.indexOf('확정됨') !== -1, JSON.stringify(r1));

  const r2 = await page.evaluate(() => {
    newEstimate(); // "새 견적서" 버튼과 동일한 함수
    return {
      confirmedAtAfterNew: window._estimateConfirmedAt,
      badgeTextAfterNew: document.getElementById('hd-confirm-badge').textContent,
      nameFieldDisabled: document.getElementById('c-name').disabled,
      nameFieldValue: document.getElementById('c-name').value
    };
  });
  ok('2. "새 견적서" 누르면 확정 상태(_estimateConfirmedAt)가 null로 초기화됨(예전엔 안 됐음)', r2.confirmedAtAfterNew === null, JSON.stringify(r2));
  ok('3. 배지도 다시 "✓ 확정"(미확정 상태)으로 돌아옴', r2.badgeTextAfterNew.trim() === '✓ 확정', r2.badgeTextAfterNew);
  ok('4. 새 견적서 시작 후 고객명 입력칸이 잠겨있지 않음(실제 입력 가능)', r2.nameFieldDisabled === false, JSON.stringify(r2));

  // 실제로 새 고객(허서진) 정보를 입력해서 정상적으로 값이 들어가는지까지 확인
  const r3 = await page.evaluate(() => {
    document.getElementById('c-name').value = '허서진';
    document.getElementById('c-phone').value = '010-9114-0737';
    var row = document.querySelector('#curtain-body tr');
    if (row) row.querySelector('.c-display-name').value = '테스트커튼';
    return {
      name: document.getElementById('c-name').value,
      displayName: row ? row.querySelector('.c-display-name').value : null
    };
  });
  ok('5. 새 고객 정보(허서진)를 실제로 입력하면 정상적으로 값이 들어감(잠겨서 안 들어가던 문제 해결)', r3.name === '허서진' && r3.displayName === '테스트커튼', JSON.stringify(r3));

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
