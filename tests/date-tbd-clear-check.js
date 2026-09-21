// tests/date-tbd-clear-check.js
// 2026-09-21(선혜님 - 전보현/민소아 고객 실제 발생 확인, 데이터는
// Supabase에서 직접 고침): 대시보드 고객상세에서 실측/시공 예정일을
// 클릭해서 실제 날짜를 입력해도, 예전에 "미정"으로 체크해뒀던 경우
// 그 플래그(measure_date_tbd/install_date_tbd)가 그대로 남아있어서,
// 견적서 앱에서 열면(applyScheduleAndDepositToForm이 estimates 레코드의
// 이 필드를 직접 읽음) 날짜칸이 자동으로 비워지고 실측/시공 의뢰서에
// "미정"이 뜨는 버그. 실제 날짜를 입력하면 customers/estimates 양쪽
// PATCH 모두에 tbd=false가 함께 담기는지 검증.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

function setupNetwork(page, customerId, latestEstId, captured) {
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
          req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ value: {} }]) });
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
        if (url.includes('/rest/v1/estimates') && method === 'GET' && url.includes('client_id=eq.' + customerId)) {
          req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: latestEstId }]) });
          return;
        }
        if (method === 'PATCH') {
          let body; try { body = JSON.parse(req.postData()); } catch (e) { body = {}; }
          captured.push({ url, body });
          req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 1, updated_at: new Date().toISOString() }]) });
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
  const port = 28200;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  const captured = [];
  await setupNetwork(page, 9500, 'est-tbd-test', captured);
  await page.setViewport({ width: 390, height: 1200 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 전보현 재현: 실측 예정일이 예전엔 "미정"이었던 고객, 지금 실제 날짜를 입력
  await page.evaluate(() => {
    saveCustomers([{ id: 9500, clientName: '전보현재현', phone: '01055556666', stage: '실측준비중', staffName: '마스터', measureDate: '', measureDateTbd: true }]);
    openDetail('전보현재현', 9500);
  });
  await new Promise(r => setTimeout(r, 500));
  const clickResult = await page.evaluate(() => {
    // 실제 인라인 style 문자열이 브라우저에서 정규화되며 셀렉터([style*=...])
    // 매칭이 어긋날 수 있어 안전하게 텍스트 기준으로 직접 탐색.
    var allDivs = Array.from(document.querySelectorAll('div'));
    var measureBox = allDivs.find(function(d){
      return d.children.length === 2 && d.textContent.indexOf('실측 예정') !== -1;
    });
    if (!measureBox) return { found: false };
    measureBox.click();
    return { found: true };
  });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => {
    // openCustomDatePicker는 커스텀 캘린더 팝업(input[type=date] 아님) -
    // 오늘 날짜에 가까운 아무 날짜 버튼이나 클릭한 뒤 "확인"을 누름
    // (정확한 날짜 값 자체는 중요하지 않고, tbd 플래그 해제 여부만 확인).
    var popup = document.getElementById('custom-date-picker-popup');
    var dayBtn = Array.from(popup.querySelectorAll('button')).find(function(b){ return /^\d+$/.test(b.textContent.trim()); });
    dayBtn.click();
    var confirmBtn = Array.from(popup.querySelectorAll('button')).find(function(b){ return b.textContent.trim() === '확인'; });
    confirmBtn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  const custPatch = captured.find(c => c.url.includes('/customers?'));
  const estPatch = captured.find(c => c.url.includes('/estimates?'));
  ok('1. 고객(customers) PATCH에 measure_date_tbd:false가 함께 담김', custPatch && custPatch.body.measure_date_tbd === false, custPatch && JSON.stringify(custPatch.body));
  ok('2. 이 고객의 최신 견적서(estimates) PATCH에도 measure_date_tbd:false가 함께 담김(견적서 앱이 실제로 읽는 필드)', estPatch && estPatch.body.measure_date_tbd === false, estPatch && JSON.stringify(estPatch.body));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
