// tests/frozen-total-sanity-check.js
// 2026-09-19(선혜님 - "그게 중요하니??? 금액이 차이가 나는게 말이
// 안되는데" - "언제/왜 이렇게 됐는지"보다 "화면 항목과 총액이 안 맞는
// 상태 자체가 절대 있으면 안 된다"는 더 근본적인 요구): 지금까지의
// 수정(unfreezeEstimateIfEditing 등)은 전부 "앞으로 편집/저장하면
// 문제없다"는 예방책이었지, 이미 예전 버그로 저장된 데이터를 열었을
// 때 화면이 앞뒤 안 맞게 보이는 것 자체는 못 막았음. applyFrozenBreakdown()
// 에 근본적인 안전장치 추가 - 저장된 총액(finalTotal)을 그대로 적용
// 하기 전에 항상 지금 화면 기준으로 실제 재계산해서 비교하고, 서로
// 다르면(신뢰할 수 없는 스냅샷) 얼림 자체를 적용 안 하고 재계산된
// 정확한 값을 그대로 둠 - 예전 버그 데이터를 다시 입력/저장하지 않고
// 그냥 열기만 해도, 최소한 "화면 항목=총액"이라는 앞뒤가 맞는 상태는
// 항상 보장됨. 신안라님 실제 상황(커튼 500만원 하나 + 저장된 finalTotal
// 28,134,000원, 서로 안 맞음)을 그대로 재현해서 검증.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27600;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

  const oldBuggyEstimate = {
    id: 'old-buggy-est', client_id: 1300, customer_name: '신안라재현테스트', phone: '010-1111-2222',
    addr: '서울시 강남구', region: '서울',
    line_items: [
      { type: 'curtain', space: '거실', displayName: '거실커튼', mw: 300, mh: 250, price: 5000000, qty: 1 }
    ],
    price_breakdown: { productSubtotal: 28455000, discount: -4126000, installSubtotal: 3805000, finalTotal: 28134000, deposit: 1000000, balance: 27134000, performanceRevenue: 28455000, discountDetail: [] },
    updated_at: new Date().toISOString(), created_at: new Date().toISOString(), confirmed_at: null
  };

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/estimates') && url.includes('old-buggy-est') && method === 'GET') {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([oldBuggyEstimate]) });
        return;
      }
      if (url.includes('/estimates') && method === 'GET') { req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }); return; }
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
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=old-buggy-est&mode=edit`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  const state = await page.evaluate(() => ({
    screenTotalText: document.getElementById('sum-total')?.textContent,
    frozen: window._estEditState?.viewingFrozenEstimate,
    depositInputValue: document.getElementById('deposit-input')?.value,
    depositSourceFlag: document.getElementById('deposit-input')?.dataset.depositSource
  }));
  ok('1. 예전에 저장된 앞뒤 안 맞는 총액(28,134,000원)이 더는 그대로 노출되지 않음', !state.screenTotalText.includes('28,134,000'), JSON.stringify(state));
  ok('2. 얼림 상태가 자동으로 풀려서, 이후 편집시 정상적으로 재계산됨', state.frozen === false, JSON.stringify(state));
  // 2026-09-21(선혜님 - "100만원 선금이 정리가 되어있는데 왜 계약금
  // 3,359,000원으로 정리가 되냐고" - 민소아 견적서로 실제 재현된
  // 부작용): 총액 불일치로 얼림을 안 적용하는 상황에서도, 이미 실제로
  // 받은 계약금(50%가 아닌 임의 금액, 예: 100만원)이 자동 50% 추정치로
  // 조용히 덮어써지면 안 됨 - 저장된 계약금 그대로 유지되는지 검증.
  ok('3. [핵심] 총액이 안 맞는 상황에서도, 실제 받은 계약금(100만원)이 50% 자동추정치로 안 바뀌고 그대로 유지됨', state.depositInputValue === '1,000,000', JSON.stringify(state));
  ok('4. 계약금 보호 상태(depositSource)도 함께 켜져서, 이후 다른 편집에도 이 계약금이 다시 덮어써지지 않음', state.depositSourceFlag === 'real' || state.depositSourceFlag === 'frozen', JSON.stringify(state));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
