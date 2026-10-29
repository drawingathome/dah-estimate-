// tests/est-retry-queue-already-saved-check.js
// 2026-10-23(시험어 견적서): 재시도 대기 항목이 중복으로 쌓이거나, 이미 저장된 내용을 "실패"로 표시하던 문제 방지 확인.
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
  let serverRow = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/rest/v1/estimates') && req.method() === 'PATCH') { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return; }
      if (url.includes('/rest/v1/estimates') && req.method() === 'GET') { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(serverRow) }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return;
    }
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 600));
  await setupValidSession(page);
  const payload = { client_id: 1, price: 1234000, date: '2026-10-27', line_items: [{ type: 'curtain', price: 110000, space: '거실' }, { price: 5, type: 'blind' }] };
  const run = (rowForServer, n) => page.evaluate((payload, row, n) => {
    localStorage.removeItem('dah_pending_estimate_sync'); localStorage.removeItem('dah_failed_saves');
    for (let i = 0; i < n; i++) addToEstPendingQueue(payload, true, 'est-1', '2026-10-15T01:00:00+00:00');
    const queued = JSON.parse(localStorage.getItem('dah_pending_estimate_sync') || '[]').length;
    return new Promise((resolve) => {
      retryEstPendingSync();
      setTimeout(() => resolve({ queued, queueLen: JSON.parse(localStorage.getItem('dah_pending_estimate_sync') || '[]').length, backups: JSON.parse(localStorage.getItem('dah_failed_saves') || '[]').length }), 1200);
    });
  }, payload, rowForServer, n);

  // A) 같은 견적서 저장 요청을 3번 넣어도 대기목록엔 1개만
  serverRow = [{ price: 1, date: '2026-01-01', line_items: [] }];
  const a = await run(null, 3);
  // B) 서버 행이 이미 같은 내용(키 순서만 다름) → 실패 아님: 대기목록 비고 백업 없음
  serverRow = [{ price: 1234000, date: '2026-10-27', line_items: [{ space: '거실', price: 110000, type: 'curtain' }, { type: 'blind', price: 5 }] }];
  const b = await run(null, 1);
  // C) 서버 행이 다른 내용(누가 먼저 바꿈) → 예전처럼 영구 백업(실패 처리)
  serverRow = [{ price: 999, date: '2026-10-27', line_items: [] }];
  const c = await run(null, 1);
  // D) 정상 저장 후 같은 견적서의 대기 항목 제거
  const d = await page.evaluate((payload) => {
    localStorage.removeItem('dah_pending_estimate_sync');
    addToEstPendingQueue(payload, true, 'est-1', null); addToEstPendingQueue(payload, true, 'est-2', null);
    estDropPendingForDb('est-1');
    return JSON.parse(localStorage.getItem('dah_pending_estimate_sync') || '[]').map(i => i.dbId);
  }, payload);

  const log = [];
  const ok = (l, cnd, dd) => log.push((cnd ? '✅ ' : '❌ ') + l + (dd !== undefined ? ' — ' + dd : ''));
  ok('1. 같은 견적서의 저장 요청 3번 → 대기목록 1개만', a.queued === 1, JSON.stringify(a));
  ok('2. 서버에 이미 같은 내용이 있으면 실패가 아님(대기 비움·백업 없음)', b.queueLen === 0 && b.backups === 0, JSON.stringify(b));
  ok('3. 서버 내용이 다르면(누가 먼저 수정) 예전처럼 영구 백업으로 남김', c.queueLen === 0 && c.backups === 1, JSON.stringify(c));
  ok('4. 정상 저장되면 그 견적서의 대기 항목만 제거(다른 견적서는 유지)', d.length === 1 && d[0] === 'est-2', JSON.stringify(d));
  ok('5. JS 에러 없음', jsErrors.length === 0, jsErrors.join(';'));
  log.forEach(l => console.log(l));
  await browser.close(); server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
