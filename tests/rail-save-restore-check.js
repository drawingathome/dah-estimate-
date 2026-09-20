// tests/rail-save-restore-check.js
// 2026-09-18(선혜님 - "코드정리하고 버그 없는지 확인해"로 직접 발견):
// "레일만 시공" 기능(svc-body에 위치 칸 신설)을 만들면서, 저장 로직
// (collectFormData)이 그 존재를 몰라서 위치가 아예 저장 안 되고 있었음
// - 저장했다가 다시 열면 위치가 통째로 사라지는 회귀가 될 뻔했음.
// 저장 데이터 자체(collectFormData) → 실제 서버 요청(POST body) →
// 다시 불러오기(loadEstDbId) 셋 다에서 위치가 정확히 보존되는지 검증.
// 검증 과정에서 두번째로 발견한 진짜 버그: hasProduct 검사도 svc-body를
// 몰라서, 레일만 시공하는 견적서는 저장 자체가 막혔음(오늘 오전 침구
// 때와 정확히 같은 패턴 재발) - 같이 수정.
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

  function mockRoutes(req, capturedBodyRef) {
    const url = req.url();
    const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return true; }
      if (url.includes('/estimates') && url.includes('saved-rail-est') && method === 'GET') {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{
          id: 'saved-rail-est', client_id: 800, customer_name: '레일저장테스트', phone: '010-1111-2222',
          addr: '서울시 강남구', region: '서울', line_items: [{ type: 'svc', kind: '레일', space: '안방', content: '12자 조절레일(타공형)', price: 30000, qty: '1' }],
          updated_at: new Date().toISOString(), created_at: new Date().toISOString(), confirmed_at: null
        }]) });
        return true;
      }
      if (url.includes('/estimates') && method === 'GET') { req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }); return true; }
      if (url.includes('/estimates') && (method === 'POST' || method === 'PATCH')) {
        if (capturedBodyRef) capturedBodyRef.value = req.postData();
        req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 'saved-rail-est', updated_at: new Date().toISOString() }]) });
        return true;
      }
      if (url.includes('/customers') && url.includes('select=addr')) { req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ addr: '서울시 강남구', measure_date: null, install_date: null, deposit_amount: 0 }]) }); return true; }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return true;
    }
    return false;
  }

  const capturedBodyRef = { value: null };
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (mockRoutes(req, capturedBodyRef)) return;
    const url = req.url();
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  await page.setViewport({ width: 390, height: 1200 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await setupValidSession(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));

  // 1) "레일만 시공" 항목 추가 후 저장 데이터(collectFormData) 확인
  await page.evaluate(() => {
    document.getElementById('c-name').value = '레일저장테스트';
    document.getElementById('c-phone').value = '010-1111-2222';
    document.getElementById('c-addr').value = '서울시 강남구';
    document.getElementById('c-region').value = '서울';
    document.getElementById('c-measure-tbd').checked = true;
    document.getElementById('c-install-tbd').checked = true;
    document.querySelectorAll('#curtain-body tr').forEach(tr => tr.remove());
    addSvcRow();
    const rows = document.querySelectorAll('#svc-body tr');
    const tr = rows[rows.length - 1];
    tr.querySelector('.svc-kind').value = '레일';
    tr.querySelector('.svc-space').value = '안방';
    tr.querySelector('.svc-content').value = '12자 조절레일(타공형)';
    tr.querySelector('.sprice').value = '30000';
    calcSvcRow(tr.querySelector('.sprice'));
  });
  const collected = await page.evaluate(() => {
    const data = collectFormData();
    return data.lineItems.filter(it => it.type === 'svc');
  });
  ok('1. collectFormData()가 svc 항목에 위치(space)를 정확히 포함함', collected.length === 1 && collected[0].space === '안방', JSON.stringify(collected));

  // 2) 실제로 저장(POST) → hasProduct 검사를 통과해서 요청이 나가는지, body에 위치가 담기는지
  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 1500));
  const toastText = await page.evaluate(() => document.getElementById('toast')?.textContent);
  ok('2. 레일만 시공해도 "제품 금액을 1개 이상" 오류 없이 저장됨(hasProduct 검사에 svc-body 반영)', !toastText || !toastText.includes('제품 금액을 1개 이상'), toastText);
  ok('3. 실제 서버 저장 요청(POST body)에 위치(안방)가 정확히 담김', capturedBodyRef.value && capturedBodyRef.value.includes('"space":"안방"'), capturedBodyRef.value ? capturedBodyRef.value.slice(0, 300) : 'body 없음');

  // 3) 다시 불러왔을 때(loadEstDbId) 위치가 정확히 복원되는지
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=saved-rail-est&mode=edit`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  const restored = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#svc-body tr'));
    const railRow = rows.find(tr => (tr.querySelector('.svc-content')?.value || '').includes('12자'));
    return { space: railRow?.querySelector('.svc-space')?.value, content: railRow?.querySelector('.svc-content')?.value };
  });
  ok('4. 다시 불러오면 위치(안방)가 정확히 복원됨', restored.space === '안방', JSON.stringify(restored));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
