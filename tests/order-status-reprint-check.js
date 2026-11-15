// tests/order-status-reprint-check.js
// 2026-11-15 N-159 ⑨: 이미 발주 완료로 기록된 항목을 다시 처리해도 처음 발주일이 유지되고(거래처는 갱신), 고객 번호가 없으면 말없이 건너뛰지 않고 안내.
// 한계: 가짜 서버 시험. 실제 운영 기록·화면의 알림 모양은 눈 확인 필요.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };
async function main() {
  const dir = path.resolve(__dirname, '..'); const port = 30893;
  const server = await startServer(dir, port); const browser = await launchBrowser();
  const page = await browser.newPage(); const jsErrors = []; page.on('pageerror', e => jsErrors.push(e.message));
  let db = {}; const patches = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/rest/v1/customers') && req.method() === 'GET' && url.includes('select=order_status')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ order_status: db.order_status, updated_at: 'T0' }]) }); return; }
      if (url.includes('/rest/v1/customers') && req.method() === 'PATCH') { const b = JSON.parse(req.postData() || '{}'); patches.push(b.order_status); req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 5, order_status: b.order_status, updated_at: 'T1' }]) }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return;
    }
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 600)); await setupValidSession(page);
  async function run(serverStatus, updates, withId) {
    db = { order_status: serverStatus }; patches.length = 0;
    return await page.evaluate(async (u, id) => {
      window._toasts = []; window.showToast = function(m) { window._toasts.push(String(m)); };
      window._estEditState = window._estEditState || {}; window._estEditState.estSaveCustomerId = id ? 5 : null;
      updateOrderStatus(u);
      await new Promise(r => setTimeout(r, 700));
      return window._toasts;
    }, updates, withId);
  }
  const log = []; const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + d));
  // 1. 이미 완료(11-05) 원단을 다시 처리(11-15, 거래처 변경) → 발주일 유지, 거래처 갱신, 안내
  let t1 = await run({ fabric: { done: true, orderDate: '2026-11-05', vendor: '가나다' } }, { fabric: { done: true, vendors: ['라마바'], vendor: '라마바', orderDate: '2026-11-15' } }, true);
  const p1 = patches[0] && patches[0].fabric;
  ok('1. 이미 완료된 원단 재처리: 발주일 11-05 유지, 거래처는 라마바로 갱신', p1 && p1.orderDate === '2026-11-05' && p1.vendor === '라마바', JSON.stringify(p1));
  ok('2. 재처리 안내 문구(이미 발주 기록, 발주일 유지)', t1.some(m => m.indexOf('이미 발주 기록') >= 0 && m.indexOf('2026-11-05') >= 0), JSON.stringify(t1));
  // 3. 처음 발주 → 오늘 날짜 그대로 + 기존 안내
  let t3 = await run({}, { fabric: { done: true, vendors: ['가나다'], vendor: '가나다', orderDate: '2026-11-15' } }, true);
  ok('3. 처음 발주는 발주일 그대로 기록, 일반 안내', patches[0] && patches[0].fabric.orderDate === '2026-11-15' && t3.some(m => m.indexOf('자동으로 기록') >= 0), JSON.stringify([patches[0], t3]));
  // 4. 완료가 아니었던(done:false) 기존 기록은 새 날짜로
  await run({ fabric: { done: false, orderDate: '2026-11-01' } }, { fabric: { done: true, vendors: ['가나다'], vendor: '가나다', orderDate: '2026-11-15' } }, true);
  ok('4. 기존이 미완료면 새 발주일로 기록', patches[0] && patches[0].fabric.orderDate === '2026-11-15', JSON.stringify(patches[0]));
  // 5. 실측/시공 의뢰는 기존대로(날짜 갱신)
  await run({ measure: { done: true, orderDate: '2026-11-01', vendor: 'A' } }, { measure: { done: true, vendor: 'B', orderDate: '2026-11-15' } }, true);
  ok('5. 실측 의뢰는 기존 동작 유지(날짜 갱신)', patches[0] && patches[0].measure.orderDate === '2026-11-15', JSON.stringify(patches[0]));
  // 6. 고객 번호 없음 → 안내(조용히 건너뛰지 않음), 서버 요청 없음
  let t6 = await run({}, { fabric: { done: true, vendors: ['가나다'], vendor: '가나다', orderDate: '2026-11-15' } }, false);
  ok('6. 고객 번호가 없으면 "고객이 아직 저장되지 않아…" 안내, 서버 저장 없음', t6.some(m => m.indexOf('고객이 아직 저장되지 않아') >= 0) && patches.length === 0, JSON.stringify([t6, patches.length]));
  ok('7. JS 에러 없음', jsErrors.length === 0, jsErrors.join(';'));
  log.forEach(l => console.log(l));
  await browser.close(); server.kill(); process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
