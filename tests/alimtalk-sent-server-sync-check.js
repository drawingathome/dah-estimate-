const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9959;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/analytics_events') && url.includes('customerId')) {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify([{ event_detail: { type: 't1_visit_confirm', customerId: 9970 }, created_at: '2026-09-24T01:00:00Z' }]) });
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
    localStorage.setItem('dah_kakao_log', JSON.stringify([])); // 이 기기 로컬엔 발송기록이 전혀 없는 상태(다른 기기에서 보냄)
    saveCustomers([{ id: 9970, clientName: '알림톡재현고객', phone: '01099990008', stage: '방문예약', staffName: '마스터' }]);
    openDetail('알림톡재현고객', 9970, 'info');
  });
  await new Promise(r => setTimeout(r, 1000));

  const localCacheAfter = await page.evaluate(() => {
    var logs = JSON.parse(localStorage.getItem('dah_kakao_log') || '[]');
    return logs.some(function(l) { return l.custId === 9970 && l.type === 't1_visit_confirm'; });
  });
  ok('1. [핵심] 다른 기기(서버)에 이미 있는 발송기록이 이 기기 로컬에도 정확히 반영됨(중복발송 방지)', localCacheAfter === true, JSON.stringify(localCacheAfter));

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
