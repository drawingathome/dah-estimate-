// tests/est-save-resave-doublecount-check.js
// 2026-09-22(선혜님 - 최금희 견적서 사고: "잔금이 왜 없니 토탈이랑 금액이
// 왜 다르지??????" "견적서 또 날라갔다!!!!" → "버그를 고쳐도 왜 같은
// 버그가 생기지???? 쌍둥이함수까지 찾아~" 지시로 끝까지 추적해 발견한
// 진짜 근본원인): est-save.js의 신규 견적서 저장(POST) 요청이
// isEditMode(수정)와 정확히 반대로 Prefer 헤더를 쓰고 있었음
// (isEditMode ? 'return=representation' : 'return=minimal' - 신규
// 저장인데 minimal이라 서버 응답이 항상 비어있음). 그래서 신규 저장
// 성공 직후 응답에서 새로 생성된 견적서 id(newDbId)를 못 받아
// editingEstDbId가 계속 비어있는 채로 남음 - 그 상태에서 같은 화면을
// 재저장하면(확인창이 뜨는 사이 다시 누르는 것처럼), "이 고객의 다른
// 견적서 합계를 구해 매출기준금액에 반영"하는 로직이 방금 만든 그
// 견적서를 자기 자신인 줄 모르고 "다른 견적서"로 세어버려 매출기준
// 금액이 정확히 2배로 부풀려짐. Prefer 헤더를 신규/수정 모두
// return=representation으로 통일해서 수정. 검증: 서버 응답 헤더에
// 따라 실제 Supabase처럼 빈/채워진 바디를 주는 mock으로 1차 저장→
// 2차 재저장을 재현해 매출기준금액이 정확히 유지되는지 확인.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');

function setupNetwork(page, captured) {
  return page.setRequestInterception(true).then(() => {
    let estCounter = 0;
    const estimates = []; // 서버에 "저장된" 견적서들을 흉내
    page.on('request', (req) => {
      const url = req.url();
      const method = req.method();
      if (!url.includes('supabase.co')) {
        if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
        return;
      }
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/rest/v1/app_settings')) { req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ value: {} }]) }); return; }
      if (url.includes('/auth/v1/token')) {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ access_token: 'fake-refreshed-token', refresh_token: 'fake-refresh-token', expires_in: 3600, token_type: 'bearer' }) });
        return;
      }
      // "이 고객, 오늘 이미 저장된 견적 있는지" 확인 (est-save.js saveToEstimates 상단)
      if (method === 'GET' && url.includes('/rest/v1/estimates') && url.includes('updated_at=gte')) {
        const found = estimates.length ? [estimates[estimates.length - 1]] : [];
        captured.push({ type: 'GET-today-check', url, result: found });
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(found) });
        return;
      }
      // "다른 견적서 합계" 확인 (est-save.js saveToCustomers)
      if (method === 'GET' && url.includes('/rest/v1/estimates') && url.includes('select=id,price,performance_revenue')) {
        captured.push({ type: 'GET-sum', url, result: estimates.slice() });
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(estimates) });
        return;
      }
      if (method === 'PATCH' && url.includes('/rest/v1/customers')) {
        let body; try { body = JSON.parse(req.postData()); } catch (e) { body = {}; }
        captured.push({ type: 'PATCH-customer', body });
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 9800, updated_at: new Date().toISOString() }]) });
        return;
      }
      if (method === 'POST' && url.includes('/rest/v1/customers')) {
        let body; try { body = JSON.parse(req.postData()); } catch (e) { body = {}; }
        captured.push({ type: 'POST-customer', body });
        req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 9800, updated_at: new Date().toISOString() }]) });
        return;
      }
      if (method === 'POST' && url.includes('/rest/v1/estimates')) {
        let body; try { body = JSON.parse(req.postData()); } catch (e) { body = {}; }
        estCounter++;
        const newId = 'srv-est-' + estCounter;
        estimates.push({ id: newId, price: body.price, performance_revenue: body.performance_revenue });
        captured.push({ type: 'POST-estimate', body, newId, prefer: req.headers()['prefer'] });
        // 2026-09-22(최금희 사례 정밀 재현 - 진짜 원인 발견): 실제
        // Supabase는 Prefer: return=minimal이면 201 응답에 빈 바디를
        // 준다 - est-save.js가 신규 저장(POST)일 때 정확히 이 헤더를
        // 보내고 있었음. 실제 서버 동작을 정확히 흉내내기 위해 헤더에
        // 따라 응답 바디를 다르게 줌(return=representation일 때만
        // 생성된 레코드를 포함).
        const prefer = req.headers()['prefer'] || '';
        if (prefer.includes('return=minimal')) {
          req.respond({ status: 201, headers: { 'Access-Control-Allow-Origin': '*' } }); // 빈 바디
        } else {
          req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: newId, updated_at: new Date().toISOString() }]) });
        }
        return;
      }
      if (method === 'PATCH' && url.includes('/rest/v1/estimates')) {
        let body; try { body = JSON.parse(req.postData()); } catch (e) { body = {}; }
        captured.push({ type: 'PATCH-estimate', url, body });
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 1, updated_at: new Date().toISOString() }]) });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
    });
  });
}

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 28600;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  const captured = [];
  await setupNetwork(page, captured);
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 2026-09-22(최금희 사례 재현 - 정확한 조건 맞추기): 최금희 사례는
  // "완전 신규 고객"이 아니라 "이미 customers 레코드가 있는 고객에게
  // 새 견적서를 추가"하는 상황이었음(고객은 초기 입력 단계에서 이미
  // 만들어져 있었고, 13분 후에 견적서를 저장함) - estSaveCustomerId를
  // 미리 설정해서 이 조건을 정확히 맞춤.
  await page.evaluate(() => {
    window._estEditState = window._estEditState || {};
    window._estEditState.estSaveCustomerId = 221;
    // 2026-09-22(최금희 사례 정밀 재현): 실제 사례는 1차 저장부터 이미
    // "기존 고객 업데이트"(isUpdate:true)였음 - est-save.js의 로컬
    // dah_customers 매칭 로직(이름+전화번호)이 실제로 이 고객을 찾아야
    // 정확히 같은 조건이 됨.
    localStorage.setItem('dah_customers', JSON.stringify([
      { id: 221, clientName: '이중계산재현', phone: '01000001234', stage: '상담', price: 0 }
    ]));
  });
  // 최금희 재현: 커튼 품목 하나 입력, 고객정보, 시공예정일은 비워둠(확인창 뜸)
  await page.evaluate(() => {
    document.getElementById('c-name').value = '이중계산재현';
    document.getElementById('c-phone').value = '01000001234';
    document.getElementById('c-addr').value = '서울';
    document.getElementById('c-measure').value = '2026-09-22';
    var tr = document.querySelector('.row-curtain');
    tr.querySelector('.space-inp').value = '거실';
    tr.querySelector('.mw').value = 100; calcCurtainRow(tr.querySelector('.mw'));
    tr.querySelector('.mh').value = 100; calcCurtainRow(tr.querySelector('.mh'));
    tr.querySelector('.cprice').value = 10000; calcCurtainRow(tr.querySelector('.cprice'));
  });

  // 1차 저장
  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 1000));

  // 2차 저장(동일 내용, 재저장) - 최금희 사례처럼 짧은 시간 뒤 다시 클릭
  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 1000));

  const postEstCalls = captured.filter(c => c.type === 'POST-estimate');
  console.log('POST-estimate body:', JSON.stringify(postEstCalls.map(c => ({ price: c.body.price, performance_revenue: c.body.performance_revenue }))));
  const patchCustomerCalls = captured.filter(c => c.type === 'PATCH-customer');
  const sumGetCalls = captured.filter(c => c.type === 'GET-sum');
  const patchEstCalls = captured.filter(c => c.type === 'PATCH-estimate');

  console.log('PATCH-estimate body:', JSON.stringify(patchEstCalls.map(c => ({ price: c.body.price, performance_revenue: c.body.performance_revenue }))));
  console.log('캡처된 이벤트 순서:', JSON.stringify(captured.map(c => c.type)));
  console.log('customers PATCH 바디들:', JSON.stringify(patchCustomerCalls.map(c => ({ price: c.body.price, performance_revenue: c.body.performance_revenue }))));
  console.log('견적서 합계 GET 결과들:', JSON.stringify(sumGetCalls.map(c => c.result)));

  ok('1. 견적서는 딱 1건만 생성됨(중복 POST 없음)', postEstCalls.length === 1, postEstCalls.length);
  ok('2. 2차 저장은 PATCH(수정)로 처리됨(새로 POST 안 함)', patchEstCalls.length === 1, patchEstCalls.length);
  const lastPatch = patchCustomerCalls[patchCustomerCalls.length - 1];
  const actualEstPrice = postEstCalls.length ? Number(postEstCalls[0].body.price) : null;
  ok('3. [핵심] 재저장 후에도 customers.price가 실제 견적금액과 정확히 일치함(이중계산 안 됨)', lastPatch && actualEstPrice && Number(lastPatch.body.price) === actualEstPrice, JSON.stringify({ custPrice: lastPatch && lastPatch.body.price, estPrice: actualEstPrice }));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
