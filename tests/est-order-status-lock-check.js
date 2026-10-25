// tests/est-order-status-lock-check.js
// 2026-10-25 전수표 T-01: 견적서 앱의 발주 현황 갱신(updateOrderStatus)이 수정 시각 조건으로 저장하고,
// 그 사이 다른 기기가 먼저 저장했으면(0건) 다시 읽어 합쳐 1회 재시도하는지 확인.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };

async function main() {
  const dir = path.resolve(__dirname, '..');
  const port = 30891;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.dismiss(); } catch (e) {} });
  const jsErrors = []; page.on('pageerror', e => jsErrors.push(e.message));
  let db = { order_status: { curtain: { done: true } }, updated_at: 'T0' };
  let gets = 0; const patches = []; let raceOnce = false;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/rest/v1/customers') && req.method() === 'GET' && url.includes('select=order_status')) {
        gets++;
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ order_status: db.order_status, updated_at: db.updated_at }]) }); return;
      }
      if (url.includes('/rest/v1/customers') && req.method() === 'PATCH') {
        patches.push(url);
        if (raceOnce && patches.length === 1) { db.order_status = Object.assign({}, db.order_status, { rail: { done: true } }); db.updated_at = 'T-race'; }
        const m = url.match(/updated_at=eq\.([^&]*)/); const cond = m ? decodeURIComponent(m[1]) : null;
        if (cond !== null && cond !== db.updated_at) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return; }
        const body = JSON.parse(req.postData() || '{}');
        db.order_status = body.order_status; db.updated_at = 'T' + patches.length;
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 5, order_status: db.order_status, updated_at: db.updated_at }]) }); return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return;
    }
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 600));
  await setupValidSession(page);
  const run = async () => { await page.evaluate(() => { window._estEditState = window._estEditState || {}; window._estEditState.estSaveCustomerId = 5; updateOrderStatus({ blind: { done: true, vendor: 'x' } }); }); await new Promise(r => setTimeout(r, 900)); };

  await run();
  const r1 = { patches: patches.slice(), server: JSON.parse(JSON.stringify(db.order_status)) };
  patches.length = 0; gets = 0; raceOnce = true; db = { order_status: { curtain: { done: true } }, updated_at: 'T0' };
  await run();
  const r2 = { patches: patches.slice(), gets, server: JSON.parse(JSON.stringify(db.order_status)) };

  const log = []; const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (d !== undefined ? ' — ' + d : ''));
  ok('1. 수정 시각 조건(updated_at=eq.)으로 저장하고 기존 체크 유지', r1.patches.length === 1 && /updated_at=eq\.T0/.test(r1.patches[0]) && r1.server.curtain && r1.server.blind, JSON.stringify(r1));
  ok('2. 중간에 다른 기기가 저장하면 다시 읽어 합쳐 재시도, 셋 다 남음', r2.patches.length === 2 && r2.gets === 2 && r2.server.rail && r2.server.curtain && r2.server.blind, JSON.stringify(r2));
  ok('3. JS 에러 없음', jsErrors.length === 0, jsErrors.join(';'));
  log.forEach(l => console.log(l));
  await browser.close(); server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
