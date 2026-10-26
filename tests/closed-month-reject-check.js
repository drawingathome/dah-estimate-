// tests/closed-month-reject-check.js
// 2026-10-26(H-17): 마감된 달의 입금 기록을 DB가 거부했을 때(예정 기능, 아직 운영 미적용) 견적서 앱이
//  (1) 영구 거절로 알아보고 재시도 큐에서 빼며 (2) "로그인 세션 문제"로 오인해 재로그인 팝업을 띄우지 않고 (3) 이유를 알려주는지,
//  그리고 (4) 다른 403(진짜 권한·로그인 문제)은 예전처럼 큐에 남고 재로그인 안내가 뜨는지(기존 동작 보존) 확인한다.
// 한계: 가짜 서버 시험. 견적서 '첫 저장' 경로(est-save-stages.js)와 추가결제 화면은 화면 전체를 구동해야 해서 여기선 직접 시험하지 않는다(판별 함수만 확인).
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 9981;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const dialogs = []; const errs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); try { await d.accept(); } catch (e) {} });
  page.on('pageerror', e => errs.push(e.message));
  let reply = { status: 403, body: '{}' };
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url(), method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/rest/v1/estimates') && method === 'PATCH') { req.respond({ status: reply.status, contentType: 'application/json', headers: CORS, body: reply.body }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return;
    }
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await setupValidSession(page);

  // 판별 함수
  const u = await page.evaluate(() => ({
    exists: typeof closedMonthRejectMessage === 'function',
    a: closedMonthRejectMessage(403, '{"code":"42501","message":"마감된 달(2026-09)의 입금 기록은 수정할 수 없습니다. 마스터에게 요청하세요."}'),
    b: closedMonthRejectMessage(403, 'permission denied for table estimates'),
    c: closedMonthRejectMessage(500, '마감된 달(2026-09) ...'),
    d: closedMonthRejectMessage(403, null),
    e: closedMonthRejectMessage(403, '마감된 달(2026-09) 평문 응답')
  }));
  ok('판별 함수가 공용 파일에 있음', u.exists);
  ok('마감월 거절 문구(JSON)를 알아보고 서버 안내 문구를 돌려줌', u.a.includes('마감된 달(2026-09)') && u.a.includes('마스터에게'), u.a);
  ok('다른 403(권한)은 마감월 거절로 오인하지 않음', u.b === '', u.b);
  ok('403/400이 아닌 상태코드는 무시', u.c === '', u.c);
  ok('응답이 비어도 오류 없이 빈 값', u.d === '');
  ok('JSON이 아닌 평문 응답도 알아봄', u.e.includes('마감된 달('), u.e);

  const run = async (label, rep) => {
    reply = rep; dialogs.length = 0;
    return page.evaluate(() => {
      localStorage.removeItem('dah_pending_estimate_sync'); localStorage.removeItem('dah_failed_saves');
      window._reloginPromptShown = false; window._reloginRetryCount = 0; window.__reloginCalled = 0;
      window.showReloginPrompt = function () { window.__reloginCalled++; };
      addToEstPendingQueue({ client_id: 999, price: 1 }, true, 'est-cm-1', null);
      return new Promise(resolve => {
        retryEstPendingSync();
        setTimeout(() => resolve({ queueLen: JSON.parse(localStorage.getItem('dah_pending_estimate_sync') || '[]').length, relogin: window.__reloginCalled }), 1000);
      });
    });
  };
  let r = await run('closed', { status: 403, body: JSON.stringify({ code: '42501', message: '마감된 달(2026-09)의 입금 기록은 수정할 수 없습니다. 마스터에게 요청하세요.' }) });
  ok('마감월 거절: 재시도 큐에서 빠짐(무한 재시도 없음)', r.queueLen === 0, JSON.stringify(r));
  ok('마감월 거절: 재로그인 팝업을 띄우지 않음', r.relogin === 0, JSON.stringify(r));
  ok('마감월 거절: 사용자에게 이유를 알림', dialogs.some(m => m.includes('마감된 달(2026-09)')), dialogs.join(' | '));
  r = await run('other403', { status: 403, body: JSON.stringify({ code: '42501', message: 'permission denied for table estimates' }) });
  ok('일반 403: 예전처럼 큐에 남음(기존 동작 보존)', r.queueLen === 1, JSON.stringify(r));
  ok('일반 403: 예전처럼 재로그인 안내가 뜸(기존 동작 보존)', r.relogin === 1, JSON.stringify(r));
  ok('JS 에러 없음', errs.length === 0, errs.join(' | '));
  await browser.close(); server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 모두 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 90000);
