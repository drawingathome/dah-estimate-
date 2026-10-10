const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9943;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  let sheetSyncStage = null;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('script.google.com')) {
      try {
        var body = JSON.parse(req.postData() || '{}');
        if (body && body.stage) sheetSyncStage = body.stage;
      } catch (e) {}
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
      return;
    }
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/customers') && method === 'POST') { req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 'new-cust-1' }]) }); return; }
      if (url.includes('/estimates') && (method === 'POST' || method === 'PATCH')) { req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[{"id":"new-est-1","updated_at":"2026-09-22T00:00:00Z"}]' }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.setViewport({ width: 1280, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  await page.evaluate(() => {
    document.getElementById('c-name').value = '탭확정테스트2';
    document.getElementById('c-phone').value = '01099990003';
    document.getElementById('c-addr').value = '서울시 어딘가';
    document.getElementById('c-measure-tbd').checked = true;
    document.getElementById('c-install-tbd').checked = true;
    var addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '+ 커튼 추가');
    addBtn.click();
    var tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.mw').value = 300; calcCurtainRow(tr.querySelector('.mw'));
    tr.querySelector('.cprice').value = 100000; calcCurtainRow(tr.querySelector('.cprice'));
    if (typeof setStatus === 'function') setStatus('final'); // 확정 버튼은 안 누르고 탭만 전환
  });
  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 1500));

  const localCache = await page.evaluate(() => {
    var saved = JSON.parse(localStorage.getItem('dah_saved') || '[]');
    var mine = saved.find(function(e) { return e.clientName === '탭확정테스트2'; });
    return mine ? { status: mine.status } : null;
  });

  ok('1. [핵심] 확정 버튼 안 눌렀으면, "최종견적서" 탭만 봐도 구글시트엔 "가견적"으로 동기화됨(탭과 무관)', sheetSyncStage === '가견적', 'sheetSyncStage=' + sheetSyncStage);
  ok('2. [핵심] 확정 버튼 안 눌렀으면, 로컬 캐시에도 "가견적"(ga)으로 저장됨(탭과 무관)', localCache && localCache.status === 'ga', JSON.stringify(localCache));

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
