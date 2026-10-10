// tests/deposit-summary-sync-check.js
// 2026-09-21(선혜님 - "그 전에 이거 먼저 해!! 계약금은 100만원
// 걸었는데 왜 이게 불일치 하지????이거 예전에도 같은 오류 있었잖아"):
// 화면 캡처로 정확히 재현 - 계약금 입력창은 실제 입금액(1,000,000원)
// 그대로인데, 총액 카드 안의 "계약금" 요약표시(검은 박스)는 자동계산된
// 50%(전혀 다른 값)가 그대로 남아 서로 다른 숫자를 보여주고 있었음.
// 원인: applyRealDepositToForm()이 계약금 입력창만 갱신하고 요약표시
// (sum-deposit-disp/sum-balance-disp)는 전혀 안 건드리는 오래된 결함 -
// 예전엔 그 뒤에 항상 실행되던 applyFrozenBreakdown()이 매번 요약표시를
// 강제로 다시 맞춰줘서 우연히 안 드러났는데, 오늘 추가한 "저장된 총액이
// 화면과 안 맞으면 얼림 자체를 적용 안 함" 안전장치 때문에 그 강제
// 재적용이 건너뛰어지는 경우가 생기면서 결함이 그대로 드러남 -
// applyRealDepositToForm() 자체에서 요약표시도 함께 갱신하도록 수정.
// 즉시 적용 시점과, 4초 뒤 재확정 적용 시점(기존에 있던 안전장치) 둘
// 다에서 입력창과 요약표시가 항상 일치하는지 검증.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27800;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

  // 민소아님 시나리오와 동일: 저장된 deposit=1,000,000인데, 저장된 finalTotal(6,837,000)이
  // 지금 화면 재계산(체크된 할인 조합에 따라 6,718,000 등 다른 값)과 안 맞는 상황
  const est = {
    id: 'dep-mismatch-est', client_id: 1400, customer_name: '계약금불일치테스트', phone: '010-1111-2222',
    addr: '서울시 강남구', region: '서울',
    line_items: [
      { type: 'curtain', space: '거실', displayName: '거실커튼', mw: 300, mh: 250, price: 5000000, qty: 1 }
    ],
    price_breakdown: { productSubtotal: 5000000, discount: 0, installSubtotal: 0, finalTotal: 5000000, deposit: 1000000, balance: 4000000, performanceRevenue: 5000000, discountDetail: [] },
    updated_at: new Date().toISOString(), created_at: new Date().toISOString(), confirmed_at: null
  };

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/estimates') && url.includes('dep-mismatch-est') && method === 'GET') {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([est]) });
        return;
      }
      if (url.includes('/estimates') && method === 'GET') { req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }); return; }
      if (url.includes('/customers') && url.includes('select=addr')) { req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ addr: '서울시 강남구', measure_date: null, install_date: null, deposit_amount: 1000000 }]) }); return; }
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
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=dep-mismatch-est&mode=edit`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  const state = await page.evaluate(() => {
    const depInp = document.getElementById('deposit-input');
    const depDisp = document.getElementById('sum-deposit-disp');
    return {
      depositInputValue: depInp?.value,
      depositSummaryText: depDisp?.textContent,
      depositSource: depInp?.dataset.depositSource,
      screenTotal: document.getElementById('sum-total')?.textContent
    };
  });
  ok('1. 계약금 입력창과 요약표시(검은 박스)가 서로 일치함', state.depositInputValue?.replace(/,/g,'') === (state.depositSummaryText||'').replace(/[^\d]/g,''), JSON.stringify(state));

  // 4초 뒤 재적용(applyScheduleAndDepositToForm의 setTimeout(applyDeposit, 4000))
  // 이후에도 여전히 일치하는지 - 이게 정확히 "저장된 실제 입금액이 최종적으로
  // 남도록" 만든 안전장치이므로, 그 시점에도 요약표시가 같이 정확해야 함
  await new Promise(r => setTimeout(r, 4300));
  const stateAfter4s = await page.evaluate(() => {
    const depInp = document.getElementById('deposit-input');
    const depDisp = document.getElementById('sum-deposit-disp');
    return { depositInputValue: depInp?.value, depositSummaryText: depDisp?.textContent };
  });
  ok('2. [회귀방지] 4초 뒤 재적용 시점에도 여전히 일치함', stateAfter4s.depositInputValue?.replace(/,/g,'') === (stateAfter4s.depositSummaryText||'').replace(/[^\d]/g,''), JSON.stringify(stateAfter4s));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
