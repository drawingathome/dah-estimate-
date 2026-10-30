// tests/public-view-error-msg-check.js (N-57)
// 공개 링크: 서버 오류(500)를 "견적서를 찾을 수 없어요"로 잘못 안내하면 안 되고, 다시 시도 버튼이 있어야 하며,
// 불러오는 동안 안내 문구가 보이고, 없는 번호(빈 응답 200)는 기존대로 "찾을 수 없어요".
const path = require('path'), fs = require('fs');
const { launchBrowser, startServer } = require('./_helpers');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
const ROOT = path.resolve(__dirname, '..');
const ID = '307864ed-3ded-4c9f-bdb5-ed8e1cd5431c';
const items = [{ type: 'curtain', space: '거실', displayName: '시험 원단', mw: '300', mh: '264', pnum: '4', price: 45000, amt: '180,000원', pleatType: '나비주름형', openType: '양개형', hemType: '8cm' }];
async function run(browser, mode) {
  const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844, isMobile: true });
  let calls = 0;
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (req.method() === 'OPTIONS' && u.includes('supabase.co')) return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('/rpc/get_public_estimate')) { calls++;
      if (mode === 'err500') return req.respond({ status: 500, contentType: 'application/json', headers: h, body: '{"message":"boom"}' });
      if (mode === 'empty') return req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' });
      if (mode === 'retry') { if (calls === 1) return req.respond({ status: 503, contentType: 'application/json', headers: h, body: '{}' });
        return req.respond({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify([{ customer_name: '시험가', phone: '01090000001', staff_name: '장선혜', estimate_status: 'ga', install_date: '', line_items: items }]) }); }
      if (mode === 'slow') return; }
    if (u.includes('logo.png')) return req.respond({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(ROOT, 'logo.png')) });
    if (u.includes('supabase.co') || u.includes('script.google.com')) return req.abort(); req.continue(); });
  await page.goto('http://localhost:9973/dah-estimate.html?view=' + ID, { waitUntil: 'domcontentloaded', timeout: 20000 });
  const txt = () => page.evaluate(() => { const c = document.getElementById('public-view-container'); return { t: (c.textContent || '').replace(/\s+/g, ' '), btn: !!document.getElementById('pv-retry'), table: !!c.querySelector('.pv-prod-table') }; });
  return { page, txt, calls: () => calls };
}
(async () => {
  const server = await startServer(ROOT, 9973); const browser = await launchBrowser();
  let r = await run(browser, 'slow'); await new Promise(x => setTimeout(x, 800));
  let o = await r.txt(); ok('불러오는 동안 안내 문구가 보임', /내용을 불러오고 있어요/.test(o.t) && /몇 초/.test(o.t), o.t); await r.page.close();
  r = await run(browser, 'err500'); await r.page.waitForFunction(() => document.getElementById('pv-retry'), { timeout: 8000 }).catch(() => {});
  o = await r.txt(); ok('서버 오류(500) → "찾을 수 없어요"가 아니라 일시적 오류 안내', /다시 시도해 주세요/.test(o.t) && !/찾을 수 없/.test(o.t), o.t); ok('서버 오류 → 다시 시도 버튼 있음', o.btn); await r.page.close();
  r = await run(browser, 'empty'); await r.page.waitForFunction(() => /찾을 수 없/.test(document.getElementById('public-view-container').textContent), { timeout: 8000 }).catch(() => {});
  o = await r.txt(); ok('없는 번호(빈 응답) → 기존대로 찾을 수 없어요', /찾을 수 없/.test(o.t), o.t); ok('없는 번호 → 다시 시도 버튼 없음', !o.btn); await r.page.close();
  r = await run(browser, 'retry'); await r.page.waitForFunction(() => document.getElementById('pv-retry'), { timeout: 8000 }).catch(() => {});
  await r.page.click('#pv-retry'); await r.page.waitForFunction(() => document.querySelector('#public-view-container .pv-prod-table'), { timeout: 10000 }).catch(() => {});
  o = await r.txt(); ok('다시 시도 누르면 견적서가 열림', o.table, o.t); ok('다시 시도 시 서버 2번 호출', r.calls() === 2, String(r.calls())); await r.page.close();
  await browser.close(); server.kill && server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 전부 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
