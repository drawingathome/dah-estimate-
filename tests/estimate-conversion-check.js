// tests/estimate-conversion-check.js
// 2026-09-18(선혜님 - "이 견적서 다시 살려줘" / "1번 똑같은데?? 왜
// 갑자기 이렇게 바뀐거지??" - 실제 예전 커튼 견적서를 침구로 완전히
// 바꾸는 실제 시나리오로 진짜 재현해서 발견): 겉보기엔 하나의 증상
// (인쇄에 예전 커튼/블라인드 데이터가 나옴)이었지만, 실제로는 3가지
// 별개의 버그가 겹쳐있었음 - (1) "저장 당시 금액 고정" 플래그가 안
// 풀림, (2) 커튼/블라인드를 지워도 지역기반 실측비/시공비는 전혀
// 안 지워짐(레일 자재비만 연동 삭제되고 있었음), (3) 계약금 "수동
// 편집 보호" 플래그도 안 풀려서 자동 재계산 자체가 막힘. loadEstDbId로
// 실제 예전 견적서를 불러오고, 실제 삭제 버튼(delRow)으로 커튼/
// 블라인드를 지운 뒤, 실제 침구 5개를 입력하고, 실제 인쇄 버튼까지
// 눌러서 종단간으로 검증.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 26200;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

  const oldEstimate = {
    id: 'old-curtain-est', client_id: 700, customer_name: '전환테스트고객',
    phone: '010-1111-2222', addr: '서울시 마포구', region: '서울',
    line_items: [
      { type: 'curtain', space: '자녀방', displayName: '자녀방커튼', mw: 200, mh: 220, price: 150000, qty: 1, railVendor: '' },
      { type: 'curtain', space: '거실', displayName: '거실커튼', mw: 300, mh: 250, price: 200000, qty: 1, railVendor: '' },
      { type: 'blind', space: '안방', displayName: '안방블라인드', mw: 150, mh: 180, price: 50000, qty: 1 },
    ],
    updated_at: '2026-09-10T01:00:00.000Z', created_at: '2026-09-01T01:00:00.000Z',
    price_breakdown: { productSubtotal: 2121500, installSubtotal: 285800, finalTotal: 2240000, deposit: 1120000, balance: 1120000, discount: 0, performanceRevenue: 2121500 },
    confirmed_at: null
  };

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/estimates') && url.includes('old-curtain-est') && method === 'GET') {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([oldEstimate]) });
        return;
      }
      if (url.includes('/estimates') && method === 'GET') {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
        return;
      }
      if (url.includes('/customers') && url.includes('select=addr')) {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ addr: oldEstimate.addr, measure_date: null, install_date: null, deposit_amount: 0 }]) });
        return;
      }
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
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=old-curtain-est&mode=edit`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  const loadedState = await page.evaluate(() => ({
    curtainRows: document.querySelectorAll('#curtain-body tr').length,
    svcRows: document.querySelectorAll('#svc-body tr').length,
  }));
  ok('0. 예전 견적서가 정상적으로 로드됨(커튼/블라인드/레일시공비 있음)', loadedState.curtainRows >= 2 && loadedState.svcRows > 0, JSON.stringify(loadedState));

  await page.evaluate(() => {
    document.querySelectorAll('#curtain-body .del-btn').forEach(function(btn) { delRow(btn); });
    document.querySelectorAll('#blind-body .del-btn').forEach(function(btn) { delRow(btn); });
  });
  await new Promise(r => setTimeout(r, 300));

  const afterDeleteState = await page.evaluate(() => ({
    svcRows: document.querySelectorAll('#svc-body tr').length,
    svcSummaryText: document.getElementById('svc-summary-card')?.textContent,
    frozen: window._estEditState?.viewingFrozenEstimate
  }));
  ok('1. 커튼/블라인드를 다 지우면 얼림 상태도 풀림', afterDeleteState.frozen === false);
  ok('2. 커튼/블라인드를 다 지우면 실측비/시공비도 이제 자동으로 같이 정리됨', afterDeleteState.svcRows === 0, `svc-body에 남은 행: ${afterDeleteState.svcRows}건 — ${afterDeleteState.svcSummaryText}`);

  await page.evaluate(() => {
    const items = [
      ['80수 아이보리 이불 사계절누빔형', '200*230', '215000', '1'],
      ['80수 아이보리 베개커버', '50*70', '32000', '2'],
      ['80수 베이지 베개커버', '50*70', '32000', '2'],
      ['80수 그레이지 매트리스커버', '150*200*34', '145000', '1'],
      ['80수 그레이지 매트리스패드', '110*200', '165000', '1'],
    ];
    items.forEach(([name, size, price, qty]) => {
      addOtherItemRow();
      const rows = document.querySelectorAll('#other-body tr');
      const tr = rows[rows.length - 1];
      tr.querySelector('.other-name').value = name;
      tr.querySelector('.other-size').value = size;
      tr.querySelector('.other-qty').value = qty;
      tr.querySelector('.other-price').value = price;
      calcOtherItemRow(tr.querySelector('.other-price'));
    });
  });
  await new Promise(r => setTimeout(r, 300));

  const printText = await page.evaluate(() => {
    printForCustomer();
    return document.getElementById('pv-overlay')?.textContent || '';
  });
  ok('3. 인쇄 결과에 예전 커튼/블라인드 품목명이 하나도 안 보임', !printText.includes('자녀방커튼') && !printText.includes('거실커튼') && !printText.includes('안방블라인드'));
  ok('4. 인쇄 결과에 예전 총액(2,121,500/2,240,000)이 안 보임', !printText.includes('2,121,500') && !printText.includes('2,240,000'));
  ok('5. 인쇄 결과에 예전 실측비/시공비(90,000)가 안 보임', !printText.includes('90,000'));
  ok('6. 인쇄 결과에 방금 입력한 침구 품목이 정확히 보임', printText.includes('80수 아이보리 이불'));
  ok('7. 인쇄 결과의 총액이 정확히 침구 5개 합계(653,000원)와 일치함(실측비 안 섞임)', printText.includes('653,000원'), printText.match(/[\d,]+원/g)?.slice(-6));

  // 계약금도 침구 전용(100%)으로 정확히 계산되는지
  const depositCheck = await page.evaluate(() => document.getElementById('deposit-input')?.dataset.raw);
  ok('8. 계약금이 침구 100%(=653,000원, 예전 실측비 안 섞임)로 정확히 자동계산됨', depositCheck === '653000', 'depositCheck=' + depositCheck);

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
