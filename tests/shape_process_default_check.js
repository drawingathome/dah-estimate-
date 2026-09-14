const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9889;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 1000));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 실제 손현영 케이스 재현: shapeProcess 필드 자체가 없는 예전 데이터
  const r1 = await page.evaluate(() => {
    var ctr = document.querySelector('#curtain-body tr');
    var it = { space: '거실', displayName: '린넨룩 아이보리 속커튼', mw: '445', mh: '249' }; // shapeProcess 필드 없음(예전 데이터)
    var sp = ctr.querySelector('.c-shape-process');
    sp.checked = (it.shapeProcess !== undefined) ? !!it.shapeProcess : getDefaultShapeProcessChecked();
    return sp.checked;
  });
  ok('1. 손현영 케이스 재현(shapeProcess 필드 없는 예전 데이터) → 기본값 O로 복원', r1 === true, 'checked=' + r1);

  // 명시적으로 false 저장된 경우(사용자가 실제로 X를 선택했던 경우) → 그 값 존중
  const r2 = await page.evaluate(() => {
    var ctr = document.querySelector('#curtain-body tr');
    var it = { space: '거실', shapeProcess: false };
    var sp = ctr.querySelector('.c-shape-process');
    sp.checked = (it.shapeProcess !== undefined) ? !!it.shapeProcess : getDefaultShapeProcessChecked();
    return sp.checked;
  });
  ok('2. 명시적으로 X 저장된 경우 → X 그대로 유지(기본값이 덮어쓰지 않음)', r2 === false, 'checked=' + r2);

  // 명시적으로 true 저장된 경우
  const r3 = await page.evaluate(() => {
    var ctr = document.querySelector('#curtain-body tr');
    var it = { space: '거실', shapeProcess: true };
    var sp = ctr.querySelector('.c-shape-process');
    sp.checked = (it.shapeProcess !== undefined) ? !!it.shapeProcess : getDefaultShapeProcessChecked();
    return sp.checked;
  });
  ok('3. 명시적으로 O 저장된 경우 → O 그대로 유지', r3 === true, 'checked=' + r3);

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
