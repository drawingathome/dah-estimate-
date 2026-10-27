// tests/est-first-save-closed-month-check.js (H-28 ①, 2026-10-27)
// 견적서 '첫 저장'(POST) 경로에서 서버가 마감월 거절(403)을 보내면: 🔒 안내가 뜨고 재시도 큐에 쌓이지 않는지,
// 그리고 다른 403(권한 문제)은 예전처럼 재시도 큐에 쌓이고 🔒 안내가 안 뜨는지(기존 동작 보존) 실제 저장 흐름으로 확인한다.
// 한계: 가짜 서버 시험(실제 DB 트리거 N-24는 운영 미적용). 수정(PATCH) 경로는 closed-month-reject-check.js, 추가결제 화면은 별도.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const H = { 'Access-Control-Allow-Origin': '*' };
let failed = 0;
const ok = (l, c, d) => { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d === undefined ? '' : d))); if (!c) failed++; };
(async () => {
  const dir = path.resolve(__dirname, '..');
  const server = await startServer(dir, 28742);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const dialogs = []; const errs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); try { await d.accept(); } catch (e) {} });
  page.on('pageerror', e => errs.push(e.message));
  let postReply = null; let posts = 0;
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url(), method = req.method();
    if (!url.includes('supabase.co')) { if (url.startsWith('http://localhost')) req.continue(); else req.abort(); return; }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
    if (url.includes('/rest/v1/app_settings')) { req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[{"value":{}}]' }); return; }
    if (method === 'GET' && url.includes('/rest/v1/customers') && url.includes('id=eq.221')) { req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([{ id: 221, client_name: '첫저장시험', phone: '01000008888', staff_name: '마스터' }]) }); return; }
    if (method === 'PATCH' && url.includes('/rest/v1/customers')) { req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[{"id":221}]' }); return; }
    if (method === 'POST' && url.includes('/rest/v1/estimates') && postReply) { posts++; req.respond({ status: postReply.status, contentType: 'application/json', headers: H, body: postReply.body }); return; }
    req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' });
  });
  await page.goto('http://localhost:28742/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 500));
  const attempt = async (reply) => {
    postReply = reply; posts = 0; dialogs.length = 0;
    await page.evaluate(() => {
      localStorage.removeItem('dah_pending_estimate_sync'); localStorage.removeItem('dah_failed_saves');
      window.showReloginPrompt = function () { window.__relogin = (window.__relogin || 0) + 1; };
      window._estEditState = window._estEditState || {}; window._estEditState.estSaveCustomerId = 221;
      localStorage.setItem('dah_customers', JSON.stringify([{ id: 221, clientName: '첫저장시험', phone: '01000008888', stage: '선금결제', price: 0 }]));
      document.getElementById('c-name').value = '첫저장시험';
      document.getElementById('c-phone').value = '01000008888';
      document.getElementById('c-addr').value = '서울 서초구 반포대로 1';
      var tr = document.querySelector('.row-curtain');
      tr.querySelector('.space-inp').value = '거실';
      tr.querySelector('.mw').value = 100; calcCurtainRow(tr.querySelector('.mw'));
      tr.querySelector('.mh').value = 100; calcCurtainRow(tr.querySelector('.mh'));
      tr.querySelector('.cprice').value = 10000; calcCurtainRow(tr.querySelector('.cprice'));
      saveEstimate();
    });
    await new Promise(r => setTimeout(r, 2500));
    return page.evaluate(() => ({ queue: JSON.parse(localStorage.getItem('dah_pending_estimate_sync') || '[]').length, relogin: window.__relogin || 0 }));
  };
  const closed = await attempt({ status: 403, body: JSON.stringify({ code: '42501', message: '마감된 달(2026-09)의 입금 기록은 수정할 수 없습니다. 마스터에게 요청하세요.' }) });
  ok('첫 저장이 실제로 서버(POST)까지 나갔음', posts >= 1, posts);
  ok('마감월 거절: 🔒 안내 알림이 뜸', dialogs.some(m => m.includes('🔒') && m.includes('마감된 달(2026-09)')), JSON.stringify(dialogs));
  ok('마감월 거절: 재시도 큐에 쌓이지 않음(영원히 재시도하지 않음)', closed.queue === 0, closed.queue);
  ok('마감월 거절: 로그인 세션 문제로 오인해 재로그인 안내를 띄우지 않음', closed.relogin === 0, closed.relogin);
  const perm = await attempt({ status: 403, body: JSON.stringify({ message: 'permission denied for table estimates' }) });
  ok('일반 403: 🔒 마감월 안내가 뜨지 않음', !dialogs.some(m => m.includes('마감된 달(')), JSON.stringify(dialogs));
  ok('일반 403: 예전처럼 재시도 큐에 쌓임(기존 동작 보존)', perm.queue >= 1, perm.queue);
  ok('JS 에러 없음', errs.length === 0, errs.join('|'));
  await browser.close(); server.close && server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
