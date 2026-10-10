// tests/estimate-picker-check.js
// 2026-09-21(선혜님 - "견적서 확인을 누르면 2개의 견적서를 선택하는게
// 아니라 그 중 제일 마지막 견적만 확인이 되고 있어" - 노지경 고객
// 사례): openEstimate()가 limit=1로 최신 견적서 하나만 가져와서
// 바로 이동해버려서, 견적서가 여러 건인 고객은 예전 것을 볼 방법
// 자체가 없었음 - 2건 이상이면 선택 모달을 보여주고, 1건 이하는
// 예전처럼 바로 이동하는지 검증.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

// blockRealNetwork와 겹치는 핸들러를 하나로 합쳐서(중복 등록시 puppeteer가
// "Request is already handled" 에러를 던지므로), 로그인에 필요한 최소한의
// mock(OPTIONS, staff_emails, auth/v1/token)에 estimates 조회 mock을
// 더한 단일 핸들러로 직접 구성.
function setupNetwork(page, customerId, estimatesResponse) {
  return page.setRequestInterception(true).then(() => {
    page.on('request', (req) => {
      const url = req.url();
      const method = req.method();
      if (url.includes('supabase.co')) {
        if (method === 'OPTIONS') {
          req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } });
          return;
        }
        if (url.includes('/rest/v1/app_settings') && url.includes('staff_emails')) {
          req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ value: (global.__DAH_TEST_STAFF_EMAILS__ || {}) }]) });
          return;
        }
        if (url.includes('/auth/v1/token') && req.postData()) {
          let body; try { body = JSON.parse(req.postData()); } catch (e) { body = {}; }
          if (body.password === 'TEST_OK_PW') {
            req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ access_token: 'test-fake-token', refresh_token: 'test-fake-refresh', expires_in: 3600, user: { id: 'test-fake-uuid', email: body.email } }) });
          } else {
            req.respond({ status: 400, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error_description: 'Invalid login credentials' }) });
          }
          return;
        }
        if (url.includes('client_id=eq.' + customerId)) {
          req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(estimatesResponse) });
          return;
        }
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
        return;
      }
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
    });
  });
}

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27800;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }
  const jsErrors = [];

  // 1) 노지경 고객(9401) - 견적서 2건 -> 선택 모달이 떠야 함
  const page = await browser.newPage();
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setViewport({ width: 390, height: 900 });
  await setupNetwork(page, 9401, [
    { id: 'est-B', created_at: '2026-09-19T10:00:00Z', price: 5479000, estimate_status: 'ga' },
    { id: 'est-A', created_at: '2026-09-10T10:00:00Z', price: 1000000, estimate_status: 'ga' }
  ]);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  await page.evaluate(() => {
    saveCustomers([{ id: 9401, clientName: '노지경', phone: '01011112222', stage: '선금결제', staffName: '마스터' }]);
  });
  await page.evaluate(() => { openEstimate('노지경', 9401); });
  await new Promise(r => setTimeout(r, 700));

  const modalState = await page.evaluate(() => {
    const overlay = document.getElementById('est-picker-overlay');
    return {
      exists: !!overlay,
      itemCount: overlay ? overlay.querySelectorAll('#est-picker-list button').length : 0,
      text: overlay ? overlay.textContent : ''
    };
  });
  ok('1. 견적서 2건이면 선택 모달이 뜸(최신 것으로 바로 안 넘어감)', modalState.exists, JSON.stringify(modalState));
  ok('2. 모달에 견적서 2건이 각각 다 나옴', modalState.itemCount === 2, 'itemCount=' + modalState.itemCount);
  ok('3. 각 견적서의 금액이 정확히 표시됨', modalState.text.includes('5,479,000') && modalState.text.includes('1,000,000'), modalState.text);

  const navBeforeClick = page.url();
  ok('4. 아직 아무것도 안 눌렀으면 페이지 이동 안 함', navBeforeClick.includes('dah-dashboard'), 'url=' + navBeforeClick);

  await page.evaluate(() => { document.querySelectorAll('#est-picker-list button')[0].click(); });
  await new Promise(r => setTimeout(r, 400));
  const navAfterClick = page.url();
  ok('5. 항목 클릭시 그 견적서 ID로 정확히 이동함', navAfterClick.includes('loadEstDbId=est-B'), 'url=' + navAfterClick);
  await page.close();

  // 2) 회귀방지: 견적서 1건뿐인 고객은 모달 없이 예전처럼 바로 이동
  const page2 = await browser.newPage();
  page2.on('pageerror', e => jsErrors.push(e.message));
  page2.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page2.setViewport({ width: 390, height: 900 });
  await setupNetwork(page2, 9402, [
    { id: 'est-single', created_at: '2026-09-19T10:00:00Z', price: 800000, estimate_status: 'ga' }
  ]);
  await page2.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page2, 'master');
  await page2.evaluate(() => {
    saveCustomers([{ id: 9402, clientName: '단건고객', phone: '01022223333', stage: '가견적', staffName: '마스터' }]);
  });
  await page2.evaluate(() => { openEstimate('단건고객', 9402); });
  await new Promise(r => setTimeout(r, 700));
  const singleModalExists = await page2.evaluate(() => !!document.getElementById('est-picker-overlay')).catch(() => false);
  const singleNav = page2.url();
  ok('6. [회귀방지] 견적서 1건뿐인 고객은 모달 없이 바로 그 견적서로 이동함', !singleModalExists && singleNav.includes('loadEstDbId=est-single'), 'url=' + singleNav);
  await page2.close();

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
