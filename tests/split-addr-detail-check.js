const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9937;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  const r = await page.evaluate(() => {
    return {
      case1: splitAddrDetail('서울 서초구 신반포로 20 트리니원 112-1804'),
      case2: splitAddrDetail('서울 강남구 역삼동 823-3'),
      case3: splitAddrDetail('서울 광진구 광나루로 458 104동 303호'),
      case4: splitAddrDetail('서울 서초구 신반포로 20'),
      case5: splitAddrDetail('')
    };
  });

  ok('1. [실사례] "신반포로 20 트리니원 112-1804" → 상세주소 "트리니원 112-1804"로 정확히 분리', r.case1.base === '서울 서초구 신반포로 20' && r.case1.detail === '트리니원 112-1804', JSON.stringify(r.case1));
  ok('2. [회귀방지] 도로명 없는 순수 지번주소("역삼동 823-3")는 잘못 쪼개지지 않음', r.case2.base === '서울 강남구 역삼동 823-3' && r.case2.detail === '', JSON.stringify(r.case2));
  ok('3. [회귀방지] 기존 "OOO동 OOO호" 패턴 정상 작동', r.case3.base === '서울 광진구 광나루로 458' && r.case3.detail === '104동 303호', JSON.stringify(r.case3));
  ok('4. 상세주소 없이 도로명만 있는 주소는 안 쪼개짐', r.case4.base === '서울 서초구 신반포로 20' && r.case4.detail === '', JSON.stringify(r.case4));
  ok('5. 빈 주소는 에러 없이 안전하게 처리됨', r.case5.base === '' && r.case5.detail === '', JSON.stringify(r.case5));

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
