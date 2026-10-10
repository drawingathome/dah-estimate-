// tests/svc-manual-override-check.js
// 2026-09-19(선혜님 - "신안라 님 견적서 확인해봐... 다시 열어보니
// 실측+레일비가 765,000원+604,800원인데 금액은 똑같이 28,134,000원이
// 나오는데 이게 말이 되니?????????"): 실측비/시공비/레일 등 자동계산
// svc 항목의 단가를 사용자가 직접 수정해도, "자동생성이라 재계산으로
// 다시 만들어짐"이라는 이유로 그 수정값 자체가 저장에서 제외되고
// 있었음 - 근데 저장 시점의 총액(grand)은 그 수정값 기준으로 계산된
// 채로 저장돼서, 다시 열면 항목은 기본값으로 돌아가는데 총액은 예전
// 값 그대로 얼려진 채 화면이 완전히 앞뒤가 안 맞았음(실제로는 수정한
// 값 자체가 통째로 유실되고 있었던 것). 사용자가 직접 타이핑하면(자동
// 계산 코드의 프로그래밍적 대입과 구분됨) "수동 지정"으로 표시해서
// 저장/복원 시 그 값이 실제로 보존되는지, 그리고 수정 안 한 다른
// 자동계산 항목(시공비)은 여전히 정상 자동계산되는지(회귀방지) 검증.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27300;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

  const savedLineItems = { current: null };
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/estimates') && url.includes('saved-override-est') && method === 'GET') {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{
          id: 'saved-override-est', client_id: 1000, customer_name: '신안라테스트', phone: '010-1111-2222',
          addr: '서울시 강남구', region: '서울', line_items: savedLineItems.current || [],
          updated_at: new Date().toISOString(), created_at: new Date().toISOString(), confirmed_at: null
        }]) });
        return;
      }
      if (url.includes('/estimates') && method === 'GET') { req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }); return; }
      if (url.includes('/estimates') && (method === 'POST' || method === 'PATCH')) {
        req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 'saved-override-est', updated_at: new Date().toISOString() }]) });
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

  await page.setViewport({ width: 390, height: 1200 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await setupValidSession(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));

  // 1) 커튼 입력 → 실측비/레일 자동생성 → 사용자가 직접 단가 수정
  await page.evaluate(() => {
    document.getElementById('c-name').value = '신안라테스트';
    document.getElementById('c-phone').value = '010-1111-2222';
    document.getElementById('c-addr').value = '서울시 강남구';
    document.getElementById('c-region').value = '서울';
    autoAddSvcFee();
    document.getElementById('c-measure-tbd').checked = true;
    document.getElementById('c-install-tbd').checked = true;
    const tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.space-inp').value = '거실';
    tr.querySelector('.mw').value = '300'; tr.querySelector('.mh').value = '250';
    tr.querySelector('.cprice').value = '1000000';
    calcCurtainRow(tr.querySelector('.cprice'));
  });
  await new Promise(r => setTimeout(r, 300));
  const beforeOverride = await page.evaluate(() => {
    const measureRow = document.querySelector('#svc-body [data-svc-type="실측비"]');
    const railRow = document.querySelector('#svc-body [data-rail-src]');
    return { measurePrice: measureRow?.querySelector('.sprice')?.value, railPrice: railRow?.querySelector('.sprice')?.value, svcRowCount: document.querySelectorAll('#svc-body tr').length, region: document.getElementById('c-region')?.value };
  });
  ok('0. 자동계산 실측비/레일이 정상 생성됨(재현 조건)', !!(beforeOverride.measurePrice && beforeOverride.railPrice), JSON.stringify(beforeOverride));
  if (!beforeOverride.measurePrice || !beforeOverride.railPrice) {
    console.log(log.join('\n'));
    await browser.close(); server.kill(); process.exit(1);
  }

  // 사용자가 직접 실측비를 1,915,000원, 레일을 1,890,000원으로 override
  await page.evaluate(() => {
    const measureRow = document.querySelector('#svc-body [data-svc-type="실측비"]');
    const railRow = document.querySelector('#svc-body [data-rail-src]');
    const mInput = measureRow.querySelector('.sprice');
    mInput.value = '1915000';
    mInput.dispatchEvent(new Event('input', { bubbles: true }));
    const rInput = railRow.querySelector('.sprice');
    rInput.value = '1890000';
    rInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 300));

  // 2) 저장 → 저장 요청에 override 값이 실제로 담기는지 확인
  let capturedBody = null;
  page.removeAllListeners('request');
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/estimates') && url.includes('saved-override-est') && method === 'GET') {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{
          id: 'saved-override-est', client_id: 1000, customer_name: '신안라테스트', phone: '010-1111-2222',
          addr: '서울시 강남구', region: '서울', line_items: savedLineItems.current || [],
          updated_at: new Date().toISOString(), created_at: new Date().toISOString(), confirmed_at: null
        }]) });
        return;
      }
      if (url.includes('/estimates') && (method === 'POST' || method === 'PATCH')) {
        capturedBody = req.postData();
        req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 'saved-override-est', updated_at: new Date().toISOString() }]) });
        return;
      }
      if (url.includes('/customers') && url.includes('select=addr')) { req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ addr: '서울시 강남구', measure_date: null, install_date: null, deposit_amount: 0 }]) }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 1500));

  let savedRailFound = false, savedMeasureFound = false;
  if (capturedBody) {
    try {
      const parsed = JSON.parse(capturedBody);
      savedLineItems.current = parsed.line_items;
      savedRailFound = parsed.line_items.some(it => it.autoType === 'rail' && it.price === 1890000);
      savedMeasureFound = parsed.line_items.some(it => it.autoType === 'measure' && it.price === 1915000);
    } catch (e) {}
  }
  ok('1. 저장 요청에 수정한 레일 단가(1,890,000원)가 autoType과 함께 실제로 담김', savedRailFound, capturedBody ? capturedBody.slice(0, 300) : '없음');
  ok('2. 저장 요청에 수정한 실측비 단가(1,915,000원)가 autoType과 함께 실제로 담김', savedMeasureFound);

  // 3) 다시 열었을 때 - 수정한 값 그대로 복원되는지
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=saved-override-est&mode=edit`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  const restored = await page.evaluate(() => {
    const allSvcRows = Array.from(document.querySelectorAll('#svc-body tr')).map(tr => ({
      content: tr.querySelector('.svc-content')?.value,
      price: tr.querySelector('.sprice')?.value,
      svcType: tr.getAttribute('data-svc-type'),
      railSrc: tr.getAttribute('data-rail-src'),
      manualOverride: tr.dataset.manualOverride
    }));
    const measureRow = document.querySelector('#svc-body [data-svc-type="실측비"]');
    const railRow = document.querySelector('#svc-body [data-rail-src]');
    return {
      allSvcRows,
      measurePrice: measureRow?.querySelector('.sprice')?.value,
      railPrice: railRow?.querySelector('.sprice')?.value
    };
  });
  ok('3. 다시 열면 실측비가 수정한 값(1,915,000원)으로 정확히 복원됨(기본값 765,000원으로 안 돌아감)', restored.measurePrice === '1,915,000' || restored.measurePrice === '1915000', JSON.stringify(restored));
  ok('4. 다시 열면 레일이 수정한 값(1,890,000원)으로 정확히 복원됨(기본값 604,800원으로 안 돌아감)', restored.railPrice === '1,890,000' || restored.railPrice === '1890000', JSON.stringify(restored));
  const installRow = restored.allSvcRows.find(r => r.svcType === '시공비');
  ok('5. [회귀방지] 수정 안 한 시공비는 여전히 지역 자동계산값(50,000원) 그대로 유지됨', installRow && installRow.price === '50,000', JSON.stringify(installRow));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
