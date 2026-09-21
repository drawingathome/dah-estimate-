const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9933;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 준비: 저장이 정상 진행될 수 있게 기본 정보 채움
  await page.evaluate(() => {
    document.getElementById('c-name').value = '고착테스트';
    document.getElementById('c-phone').value = '01011110000';
    document.getElementById('c-addr').value = '서울시 어딘가';
    if (document.getElementById('c-measure-tbd')) document.getElementById('c-measure-tbd').checked = true;
    if (document.getElementById('c-install-tbd')) document.getElementById('c-install-tbd').checked = true;
  });

  // 1) 버튼이 "방금" 비활성화된 상태(15초 안 지남) - 이번 클릭은 무시돼야 함
  const r1 = await page.evaluate(() => {
    var btn = document.getElementById('btn-save-estimate');
    btn.disabled = true;
    btn.dataset.disabledAt = String(Date.now()); // 방금 막 비활성화됨
    JSON.parse(localStorage.getItem('dah_save_diagnostics') || '[]'); // 참고용
    saveEstimate();
    return { stillDisabled: btn.disabled };
  });
  ok('1. 방금 비활성화된 버튼(15초 안 지남)은 정상적으로 무시됨', r1.stillDisabled === true, JSON.stringify(r1));

  const toastText1 = await page.evaluate(() => document.getElementById('toast')?.textContent || '');
  ok('2. 무시될 때 "이미 진행 중" 안내가 뜸(예전엔 아무 표시 없었음)', toastText1.indexOf('이미 진행 중') !== -1, toastText1);

  const diagLog1 = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_save_diagnostics') || '[]'));
  ok('3. "버튼-이미비활성-무시" 단계가 로그에 남음(예전엔 로그 자체가 없었음)', diagLog1.some(function(l){ return l.stage === '버튼-이미비활성-무시'; }), JSON.stringify(diagLog1.slice(-2)));

  // 2) 버튼이 "오래(15초 넘게)" 비활성화 상태로 고착된 경우 - 자동으로 풀리고 저장이 진행돼야 함
  const r2 = await page.evaluate(() => {
    var btn = document.getElementById('btn-save-estimate');
    btn.disabled = true;
    btn.dataset.disabledAt = String(Date.now() - 20000); // 20초 전에 멈춘 것처럼 위조
    saveEstimate();
    return { disabledRightAfterCall: btn.disabled }; // saveEstimate 내부에서 다시 true로 세팅되므로 true가 정상(진행 중이라)
  });
  await new Promise(res => setTimeout(res, 300));
  const diagLog2 = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_save_diagnostics') || '[]'));
  ok('4. 15초 넘게 고착된 버튼은 자동으로 복구 감지됨("버튼-고착감지-자동복구" 로그)', diagLog2.some(function(l){ return l.stage === '버튼-고착감지-자동복구'; }), JSON.stringify(diagLog2.slice(-3)));
  ok('5. 고착 복구 후 실제로 저장 흐름이 계속 진행됨(멈춰있지 않고 다음 단계로 넘어감)', diagLog2.some(function(l){ return l.stage === '검증통과' || l.stage === '검증실패-중단'; }), JSON.stringify(diagLog2.slice(-3)));

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
