const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9939;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/estimates?id=eq.test-est-1')) {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify([{ id: 'test-est-1', customer_name: '최금희재현', phone: '01099981234', addr: '서울 서초구', price: 3582000, deposit_amount: 750000, balance_amount: 0, line_items: [], estimate_status: 'final', confirmed_at: '2026-09-22T00:00:00Z', client_id: 999 }]) });
        return;
      }
      if (url.includes('/estimates?id=eq.test-est-2')) {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify([{ id: 'test-est-2', customer_name: '계약금없음재현', phone: '01099981235', addr: '서울 서초구', price: 1000000, deposit_amount: 0, balance_amount: 0, line_items: [], client_id: 998 }]) });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.setViewport({ width: 1280, height: 1400 });

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 1) 최금희 실사례: loadEstDbId로 불러오면 저장된 계약금(750,000)이 채워지고 보호돼야 함
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=test-est-1&mode=edit`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 1500));
  const r1 = await page.evaluate(() => {
    var depInp = document.getElementById('deposit-input');
    return { depositValue: depInp ? depInp.value : '없음', depositSource: depInp ? depInp.dataset.depositSource : null };
  });
  ok('1. [핵심] loadEstDbId로 불러오면 저장된 실제 계약금(750,000원)이 화면에 채워짐', r1.depositValue.indexOf('750,000') !== -1, JSON.stringify(r1));
  ok('2. 불러온 계약금도 depositSource=real 보호가 켜져서 이후 품목수정에도 안 풀림', r1.depositSource === 'real', JSON.stringify(r1));

  // 2) 대조군: 계약금이 아예 없는 견적서는 빈 채로 시작(정상 50% 자동추정, 회귀 없음)
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=test-est-2&mode=edit`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 1500));
  const r2 = await page.evaluate(() => {
    var depInp = document.getElementById('deposit-input');
    return { depositValue: depInp ? depInp.value : '' };
  });
  ok('3. 계약금이 아예 없는 견적서는 빈 채로 시작(회귀 없음, 억지로 값 안 채움)', !r2.depositValue || r2.depositValue === '', JSON.stringify(r2));

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
