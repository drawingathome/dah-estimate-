// tests/copy-estimate-check.js
// 2026-09-17(선혜님 - "견적서 복사하기가 안되는거 같은데 확인해봐 /
// 관련해서 1명의 고객에 2개의 견적서가 생길 수 있는지 확인해봐"):
// "복사해서 새로 만들기"(mode=copy) 흐름 전체를 종단간으로 검증.
// 결론: 코드 자체는 정상 작동함(고객은 PATCH로 중복 없이, 견적서는
// POST로 원본과 분리된 새 레코드 생성) - 확인 과정에서 발견한 진짜
// 함정은 "로그인 세션이 없으면 saveEstimate()가 토스트나 필드오류 없이
// 조용히 재로그인 프롬프트로 빠진다"는 점(showFieldError는 인라인
// 표시라 토스트만 확인하면 놓침) - 그래서 이 테스트는 반드시
// setupValidSession()으로 세션을 먼저 갖춘 뒤 검증한다.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 19871 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

  const requests = [];
  const originalEstimate = {
    id: 'original-est-777', client_id: 500, customer_name: '복사테스트고객',
    phone: '010-9999-8888', addr: '서울시 강남구', region: '서울',
    line_items: [{ type: 'curtain', space: '거실', displayName: '거실커튼', price: 100000, qty: 1 }],
    updated_at: '2026-09-17T01:00:00.000Z', created_at: '2026-09-10T01:00:00.000Z',
    confirmed_at: null
  };

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/estimates') && url.includes('original-est-777') && method === 'GET') {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([originalEstimate]) });
        return;
      }
      if (url.includes('/estimates') && method === 'GET') {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
        return;
      }
      if (url.includes('/estimates') && (method === 'POST' || method === 'PATCH')) {
        requests.push({ method, url });
        req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: method === 'POST' ? 'new-copy-id' : 'original-est-777', updated_at: new Date().toISOString() }]) });
        return;
      }
      if (url.includes('/customers') && url.includes('select=addr')) {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ addr: originalEstimate.addr, measure_date: null, install_date: null, deposit_amount: 0 }]) });
        return;
      }
      if (url.includes('/customers')) {
        requests.push({ method, url });
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 500, updated_at: new Date().toISOString() }]) });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  await page.setViewport({ width: 390, height: 1000 });
  // 세션을 먼저 갖춰야 함(위 설명 참고) - 안 그러면 조용히 재로그인
  // 프롬프트로 빠져서 "복사하기가 안 된다"처럼 보일 수 있음.
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await setupValidSession(page);
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=original-est-777&mode=copy`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));

  const loadedCheck = await page.evaluate(() => ({
    name: document.getElementById('c-name')?.value,
    phone: document.getElementById('c-phone')?.value,
    skipFlag: window._estEditState?.skipTodayDuplicateCheck,
    editingEstDbId: window._estEditState?.editingEstDbId
  }));
  ok('1. 복사모드 진입시 원본 데이터가 화면에 채워짐', loadedCheck.name === '복사테스트고객' && loadedCheck.phone === '010-9999-8888', JSON.stringify(loadedCheck));
  ok('2. 복사모드에서 skipTodayDuplicateCheck 플래그가 켜짐(중복방지 안전장치가 원본을 찾아 덮어쓰지 않도록)', loadedCheck.skipFlag === true);
  ok('3. 복사모드에서 editingEstDbId는 비어있음(새 견적서로 저장돼야 함)', !loadedCheck.editingEstDbId);

  await page.evaluate(() => {
    const priceInput = document.querySelector('.cprice');
    if (priceInput) { priceInput.value = '150000'; calcCurtainRow(priceInput); }
    document.getElementById('c-measure-tbd').checked = true;
    document.getElementById('c-install-tbd').checked = true;
  });
  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 2500));

  const estimateRequests = requests.filter(r => r.url.includes('/estimates'));
  const customerRequests = requests.filter(r => r.url.includes('/customers'));
  ok('4. 견적서 저장 요청이 실제로 발생함', estimateRequests.length > 0, JSON.stringify(estimateRequests.map(r => r.method)));
  ok('5. 견적서는 PATCH(원본 덮어쓰기)가 아니라 POST(새로 생성)로 저장됨 - 한 고객에 2개 견적서 생성 확인', estimateRequests.some(r => r.method === 'POST') && !estimateRequests.some(r => r.method === 'PATCH'), JSON.stringify(estimateRequests.map(r => r.method)));
  ok('6. 고객 레코드는 PATCH(중복 고객 생성 안 됨)', customerRequests.some(r => r.method === 'PATCH') && !customerRequests.some(r => r.method === 'POST'), JSON.stringify(customerRequests.map(r => r.method)));

  const toastText = await page.evaluate(() => document.getElementById('toast')?.textContent);
  ok('7. 저장 완료 토스트가 정상적으로 뜸', toastText && toastText.includes('저장 완료'), toastText);

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
