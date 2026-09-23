const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9949;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 300));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // daum.Postcode를 직접 흉내내서(실제 CDN 로드 없이) oncomplete 콜백만 재현
  const result = await page.evaluate(() => {
    window.daum = { Postcode: function(opts) { this.open = function() { opts.oncomplete({ roadAddress: '서울 서초구 신반포로 20' }); }; } };
    openKakaoAddr('c-addr', 'c-addr2');
    return new Promise(function(resolve) {
      setTimeout(function() {
        resolve({ addrValue: document.getElementById('c-addr').value, focusedId: document.activeElement && document.activeElement.id });
      }, 150);
    });
  });
  ok('1. 주소가 정상적으로 채워짐', result.addrValue === '서울 서초구 신반포로 20', JSON.stringify(result));
  ok('2. [핵심] 주소검색 완료 직후 상세주소(c-addr2) 칸으로 자동 포커스 이동됨', result.focusedId === 'c-addr2', JSON.stringify(result));

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
