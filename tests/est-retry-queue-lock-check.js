// tests/est-retry-queue-lock-check.js
// 2026-10-15 동시편집 잠금: 재시도 큐가 "내가 만들 때 본 수정시각"을 같이 들고 있다가,
// 재시도 때 그 사이 다른 사람이 먼저 고쳤으면(0건 반영) 덮어쓰지 않고 영구 백업으로 남기는지 확인.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };

async function main() {
  const dir = path.resolve(__dirname, '..');
  const port = 30890;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.dismiss(); } catch (e) {} });
  const jsErrors = []; page.on('pageerror', e => jsErrors.push(e.message));
  const patchUrls = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/rest/v1/estimates') && req.method() === 'PATCH') {
        patchUrls.push(url);
        // 다른 사람이 먼저 저장해 updated_at이 달라진 상황: 조건 불일치 → 0건
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return;
    }
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 600));
  await setupValidSession(page);
  const res = await page.evaluate(() => {
    localStorage.removeItem('dah_pending_estimate_sync'); localStorage.removeItem('dah_failed_saves');
    addToEstPendingQueue({ client_id: 999, price: 1 }, true, 'est-lock-1', '2026-10-15T01:00:00+00:00');
    var stored = JSON.parse(localStorage.getItem('dah_pending_estimate_sync') || '[]')[0] || {};
    return new Promise((resolve) => {
      retryEstPendingSync();
      setTimeout(() => resolve({
        storedLock: stored.lockUpdatedAt,
        queueLen: JSON.parse(localStorage.getItem('dah_pending_estimate_sync') || '[]').length,
        backups: JSON.parse(localStorage.getItem('dah_failed_saves') || '[]').length
      }), 900);
    });
  });
  const log = [];
  const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (d !== undefined ? ' — ' + d : ''));
  ok('1. 큐 항목이 내가 본 수정시각을 같이 저장함', res.storedLock === '2026-10-15T01:00:00+00:00', res.storedLock);
  ok('2. 재시도 PATCH에 updated_at 조건이 붙음', patchUrls.length === 1 && patchUrls[0].includes('updated_at=eq.'), patchUrls[0]);
  ok('3. 그 사이 다른 사람이 수정했으면(0건) 큐에서 조용히 사라지지 않고 영구 백업으로 남음', res.backups === 1 && res.queueLen === 0, JSON.stringify(res));
  ok('4. JS 에러 없음', jsErrors.length === 0, jsErrors.join(';'));
  log.forEach(l => console.log(l));
  await browser.close(); server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
