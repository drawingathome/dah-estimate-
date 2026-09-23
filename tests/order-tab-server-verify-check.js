const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9945;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/estimates?client_id=eq.9960')) {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify([{ id: 'server-only-order-est', client_id: 9960, client_name: '발주재현테스트', price: 1000000,
            line_items: [{ type:'curtain', space:'거실', displayName:'테스트커튼', vendor: '' }],
            contract_status: 'contracted', updated_at: '2026-09-22T00:00:00Z' }]) });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.setViewport({ width: 390, height: 1200 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  await page.evaluate(() => {
    saveCustomers([{ id: 9960, clientName: '발주재현테스트', phone: '01099990005', stage: '확정견적', staffName: '마스터', price: 1000000 }]);
    localStorage.setItem('dah_saved', JSON.stringify([])); // 로컬 캐시엔 이 고객 견적서가 전혀 없는 상태
    openDetail('발주재현테스트', 9960, 'order');
  });
  await new Promise(r => setTimeout(r, 1000));

  const cacheState = await page.evaluate(() => {
    var arr = JSON.parse(localStorage.getItem('dah_saved')||'[]');
    var mine = arr.find(function(e){ return e.id === 'server-only-order-est'; });
    return mine ? { found: true, hasLineItems: Array.isArray(mine.lineItems) && mine.lineItems.length > 0, itemName: mine.lineItems && mine.lineItems[0] && mine.lineItems[0].displayName } : { found: false };
  });
  ok('1. [핵심] 로컬 캐시가 비어있어도, 서버 재확인 후 실제 품목(line_items)이 정확히 캐시에 채워짐', cacheState.found && cacheState.hasLineItems && cacheState.itemName === '테스트커튼', JSON.stringify(cacheState));

  const cacheFixed = await page.evaluate(() => {
    var arr = JSON.parse(localStorage.getItem('dah_saved')||'[]');
    return arr.some(function(e){ return e.id === 'server-only-order-est'; });
  });
  ok('2. 로컬 캐시도 서버 기준으로 바로잡혀서 다음번엔 곧바로 정확하게 보임', cacheFixed === true);

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
