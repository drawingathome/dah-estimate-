const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 25700;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  const dialogMessages = [];
  page.on('dialog', async d => { dialogMessages.push(d.message()); try { await d.accept(); } catch (e) {} });

  const requests = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('supabase.co') || url.includes('script.google.com')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/estimates') && method === 'GET') { req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }); return; }
      if (url.includes('/estimates') && (method === 'POST' || method === 'PATCH')) {
        requests.push({ method, url });
        req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 'new-est-id', updated_at: new Date().toISOString() }]) });
        return;
      }
      if (url.includes('/customers')) {
        requests.push({ method, url });
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 600, updated_at: new Date().toISOString() }]) });
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
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await setupValidSession(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));

  // 침구(기타품목)만 5개 넣고, 커튼/블라인드는 전혀 안 넣음(스크린샷 재현),
  // 실측/시공 예정일 TBD 체크박스도 일부러 안 건드림(스크린샷처럼)
  await page.evaluate(() => {
    document.getElementById('c-name').value = '침구테스트고객';
    document.getElementById('c-phone').value = '010-5555-6666';
    document.getElementById('c-addr').value = '서울시 강남구';
    const items = [
      ['80수 아이보리 이불 사계절누빔형', '200*230', '215000'],
      ['80수 아이보리 베개커버', '50*70', '32000'],
    ];
    items.forEach(([name, size, price]) => {
      addOtherItemRow();
      const rows = document.querySelectorAll('#other-body tr');
      const tr = rows[rows.length - 1];
      tr.querySelector('.other-name').value = name;
      tr.querySelector('.other-size').value = size;
      tr.querySelector('.other-price').value = price;
      calcOtherItemRow(tr.querySelector('.other-price'));
    });
  });

  const preSaveState = await page.evaluate(() => ({
    curtainRows: document.querySelectorAll('#curtain-body tr').length,
    blindRows: document.querySelectorAll('#blind-body tr').length,
    otherRows: document.querySelectorAll('#other-body tr').length,
    measureTbd: document.getElementById('c-measure-tbd').checked,
    installTbd: document.getElementById('c-install-tbd').checked
  }));
  ok('0. 재현 조건 확인 - 기본 빈 커튼행 1개 존재(정상, addCurtainRow 초기호출), 블라인드 0개, 기타품목 2개, 실측/시공 TBD 둘 다 미체크', preSaveState.curtainRows === 1 && preSaveState.blindRows === 0 && preSaveState.otherRows === 2 && !preSaveState.measureTbd && !preSaveState.installTbd, JSON.stringify(preSaveState));

  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 2000));

  ok('1. "실측/시공 예정일이 비어있다"는 확인창이 뜨지 않음(커튼/블라인드가 없으니 불필요)', !dialogMessages.some(m => m.includes('실측 예정일') || m.includes('시공 예정일')), JSON.stringify(dialogMessages));

  const toastText = await page.evaluate(() => document.getElementById('toast')?.textContent);
  ok('2. "제품 금액을 1개 이상 입력해주세요" 오류가 안 뜸', !toastText || !toastText.includes('제품 금액을 1개 이상'), toastText);

  const estimateRequests = requests.filter(r => r.url.includes('/estimates'));
  ok('3. 침구만 있어도 견적서 저장 요청이 실제로 발생함(POST)', estimateRequests.some(r => r.method === 'POST'), JSON.stringify(estimateRequests.map(r => r.method)));
  ok('4. 저장 완료 토스트가 정상적으로 뜸', toastText && toastText.includes('저장 완료'), toastText);

  // ── 회귀 방지: 커튼이 있는 기존 흐름은 여전히 실측/시공 예정일을 요구하는지 ──
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));
  dialogMessages.length = 0;
  await page.evaluate(() => {
    document.getElementById('c-name').value = '커튼테스트고객';
    document.getElementById('c-phone').value = '010-7777-8888';
    document.getElementById('c-addr').value = '서울시 서초구';
    addCurtainRow();
    const tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.space-inp').value = '거실';
    tr.querySelector('.c-display-name').value = '거실커튼';
    tr.querySelector('.mw').value = '300'; tr.querySelector('.mh').value = '250';
    tr.querySelector('.cprice').value = '100000';
    calcCurtainRow(tr.querySelector('.cprice'));
  });
  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 1500));
  ok('5. [회귀방지] 커튼이 있으면 여전히 실측/시공 예정일 확인창이 뜸(기존 동작 유지)', dialogMessages.some(m => m.includes('실측 예정일') && m.includes('시공 예정일')), JSON.stringify(dialogMessages));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
