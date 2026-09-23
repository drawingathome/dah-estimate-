const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9951;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 300));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 체크리스트 30번(iOS 사파리 지연호출 함정) 재검증: window.print()를
  // 실제로 가로채서, "인쇄/PDF저장" 클릭이 시작된 시점부터 실제 print()
  // 호출까지 걸린 시간을 직접 측정 - 조금이라도 비동기(Promise/setTimeout)
  // 를 거치면 iOS 사파리가 조용히 차단하므로, 반드시 같은 태스크(0ms
  // 수준)에서 호출돼야 안전함.
  await page.evaluate(() => {
    document.getElementById('c-name').value = '인쇄타이밍테스트';
    document.getElementById('c-phone').value = '01099990006';
    var addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '+ 커튼 추가');
    addBtn.click();
    var tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.mw').value = 300; calcCurtainRow(tr.querySelector('.mw'));
    tr.querySelector('.cprice').value = 100000; calcCurtainRow(tr.querySelector('.cprice'));
  });

  const result = await page.evaluate(() => {
    return new Promise(function(resolve) {
      var printCalledAtMs = null;
      var origPrint = window.print;
      window.print = function() { printCalledAtMs = performance.now(); };

      var t0 = performance.now();
      if (typeof selectPdfOpt === 'function') selectPdfOpt('a4');
      if (typeof previewEstimate === 'function') previewEstimate();
      else if (typeof printForCustomer === 'function') printForCustomer();

      setTimeout(function() {
        if (typeof confirmPdfPrint === 'function') {
          var t1 = performance.now();
          confirmPdfPrint();
          var elapsedFromClickToPrint = printCalledAtMs !== null ? (printCalledAtMs - t1) : null;
          window.print = origPrint;
          resolve({ printWasCalled: printCalledAtMs !== null, elapsedMs: elapsedFromClickToPrint });
        } else {
          window.print = origPrint;
          resolve({ printWasCalled: false, elapsedMs: null, note: 'confirmPdfPrint 함수 없음' });
        }
      }, 500);
    });
  });

  ok('1. window.print()가 실제로 호출됨', result.printWasCalled === true, JSON.stringify(result));
  ok('2. [핵심] confirmPdfPrint() 호출부터 실제 print()까지 5ms 이내 - 비동기 지연 없이 클릭과 같은 태스크 안에서 동기 호출됨(iOS 사파리 차단 방지)', result.elapsedMs !== null && result.elapsedMs < 5, JSON.stringify(result));

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
