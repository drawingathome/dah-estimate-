// tests/customer-price-sum-check.js
// 2026-09-19(선혜님 - "노지경님 견적서가 1개였는데 내가 한개를 더
// 넣었어 근데 결제 체크를 하려고 보니 총 2건에 대한 결제가 되야 하는데
// 이 부분은 기존꺼랑 그대로인거 같네"): 견적서를 저장할 때마다
// customers.price/performance_revenue를 "이번 견적서 하나"의 금액으로
// 통째로 덮어써서, 한 고객에게 견적서가 2개 이상이면 나중에 저장한
// 것의 금액만 남고 이전 견적서 금액은 사라지던 버그. 기존 고객(수정
// 모드)이면 저장 직전에 그 고객의 다른 견적서들(현재 편집 중인 이 건
// 제외)을 조회해 합산 → 신규 고객이면 조회 자체를 건너뛰고 기존과
// 동일하게 동작(회귀방지)하는지 검증.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27000;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

  let capturedCustPatchBody = null;
  const sumGetRequests = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/estimates') && url.includes('select=id,price') && method === 'GET') { sumGetRequests.push(url); }
      // 이 고객(client_id=900)의 기존 견적서 1건(100만원) - "다른 견적서 합계 조회" 응답
      if (url.includes('/estimates') && url.includes('client_id=eq.900') && url.includes('select=id,price') && method === 'GET') {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([
          { id: 'existing-est-A', price: 1000000, performance_revenue: 900000 }
        ]) });
        return;
      }
      if (url.includes('/estimates') && method === 'GET') { req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }); return; }
      if (url.includes('/estimates') && (method === 'POST' || method === 'PATCH')) {
        req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 'new-est-B', updated_at: new Date().toISOString() }]) });
        return;
      }
      if (url.includes('/customers') && (method === 'POST' || method === 'PATCH')) {
        capturedCustPatchBody = req.postData();
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 900, updated_at: new Date().toISOString() }]) });
        return;
      }
      if (url.includes('/customers') && url.includes('select=addr')) { req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ addr: '서울시 강남구', measure_date: null, install_date: null, deposit_amount: 0 }]) }); return; }
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

  // "노지경" 고객 - 기존 견적서(estSaveCustomerId=900)가 이미 있는 상태로, 새 견적서(80만원)를 저장
  await page.evaluate(() => {
    window._estEditState.estSaveCustomerId = 900;
    window._estEditState.editingEstDbId = null; // 새 견적서(복사/신규)를 저장하는 상황 - 기존 A는 조회 대상에 포함, 제외 안 함
    document.getElementById('c-name').value = '노지경';
    document.getElementById('c-phone').value = '010-1234-5678';
    document.getElementById('c-addr').value = '서울시 강남구';
    document.getElementById('c-region').value = '서울';
    document.getElementById('c-measure-tbd').checked = true;
    document.getElementById('c-install-tbd').checked = true;
    const tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.mw').value = '300'; tr.querySelector('.mh').value = '250';
    tr.querySelector('.cprice').value = '800000';
    calcCurtainRow(tr.querySelector('.cprice'));
  });
  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 1500));

  ok('1. 고객 저장 요청(POST/PATCH)이 실제로 발생함', !!capturedCustPatchBody, capturedCustPatchBody ? '있음' : '없음');

  let parsedPrice = null, parsedPerf = null;
  if (capturedCustPatchBody) {
    try {
      const parsed = JSON.parse(capturedCustPatchBody);
      parsedPrice = parsed.price;
      parsedPerf = parsed.performance_revenue;
    } catch (e) {}
  }
  ok('2. customers.price에 기존 견적서(100만원) 금액이 합산됨(80만원짜리가 아니라 100만원보다 큼)', parsedPrice > 1000000, 'price=' + parsedPrice);
  ok('3. customers.performance_revenue에도 기존 견적서(90만원) 금액이 합산됨', parsedPerf > 900000, 'performance_revenue=' + parsedPerf);

  // ── 회귀방지: 신규 고객(다른 견적서 없음)은 여전히 이번 견적서 금액 그대로 반영되는지 ──
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(() => { localStorage.clear(); });
  await setupValidSession(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));
  capturedCustPatchBody = null;
  await page.evaluate(() => {
    window._estEditState.estSaveCustomerId = null;
    document.getElementById('c-name').value = '신규고객테스트';
    document.getElementById('c-phone').value = '010-9999-8888';
    document.getElementById('c-addr').value = '서울시 강남구';
    document.getElementById('c-region').value = '서울';
    document.getElementById('c-measure-tbd').checked = true;
    document.getElementById('c-install-tbd').checked = true;
    const tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.mw').value = '200'; tr.querySelector('.mh').value = '200';
    tr.querySelector('.cprice').value = '500000';
    calcCurtainRow(tr.querySelector('.cprice'));
  });
  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 1500));
  let regressionPrice = null;
  if (capturedCustPatchBody) {
    try { regressionPrice = JSON.parse(capturedCustPatchBody).price; } catch (e) {}
  }
  ok('4. [회귀방지] 신규 고객도 저장 요청이 정상적으로 나감', regressionPrice > 0, 'price=' + regressionPrice);
  ok('5. [회귀방지] 신규 고객(다른 견적서 없음)이면 "다른 견적서 조회" GET 자체가 신규고객 단계에서 안 나감', sumGetRequests.length === 1, JSON.stringify(sumGetRequests));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
