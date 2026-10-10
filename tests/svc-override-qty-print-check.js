// tests/svc-override-qty-print-check.js
// 2026-09-19(선혜님 - "안됐잖아!!!!!" - svc-manual-override-check.js
// 배포 직후 실사용에서 여전히 문제 재발 보고): 처음 만든 override
// 저장/복원 검증은 "다시 열면 입력칸 값이 맞는지"까지만 확인했지,
// 원래 문제 자체가 발견됐던 "인쇄된 문서"까지는 확인 안 했음 - 실제로
// 인쇄까지 재현해보니 새로운 진짜 버그를 하나 더 발견: 사용자가 단가
// 칸에 "이 항목 전체 금액"(예: 레일 1,890,000원)을 입력했는데,
// 수량(레일 자수 등 자동계산값, 예: 10자)이 그대로 남아있어서 최종
// 금액이 단가×수량(18,900,000원)으로 부풀려지고 있었음 - 단가를
// 직접 수정하면 수량도 함께 1로 맞춰서 입력한 값이 곧 최종 금액이
// 되도록 수정. "실측+시공비"는 실측비+시공비+레일시공비 셋을 합쳐서
// 보여주는 게 원래 설계(버그 아님)라는 것도 함께 확인.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27400;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

  const savedLineItems = { current: null };
  const savedBreakdown = { current: null };
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/estimates') && url.includes('saved-print-est') && method === 'GET') {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{
          id: 'saved-print-est', client_id: 1100, customer_name: '인쇄확인테스트', phone: '010-1111-2222',
          addr: '서울시 강남구', region: '서울', line_items: savedLineItems.current || [],
          price_breakdown: savedBreakdown.current,
          updated_at: new Date().toISOString(), created_at: new Date().toISOString(), confirmed_at: null
        }]) });
        return;
      }
      if (url.includes('/estimates') && method === 'GET') { req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }); return; }
      if (url.includes('/estimates') && (method === 'POST' || method === 'PATCH')) {
        try {
          const body = JSON.parse(req.postData());
          savedLineItems.current = body.line_items;
          savedBreakdown.current = body.price_breakdown || null;
        } catch (e) {}
        req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 'saved-print-est', updated_at: new Date().toISOString() }]) });
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

  await page.evaluate(() => {
    document.getElementById('c-name').value = '인쇄확인테스트';
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
  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 1500));
  ok('0. price_breakdown이 실제로 저장됨(회귀방지)', !!savedBreakdown.current, JSON.stringify(savedBreakdown.current));

  await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=saved-print-est&mode=edit`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  const domStateAfterReopen = await page.evaluate(() => ({
    measurePrice: document.querySelector('#svc-body [data-svc-type="실측비"]')?.querySelector('.sprice')?.value,
    railPrice: document.querySelector('#svc-body [data-rail-src]')?.querySelector('.sprice')?.value,
    screenTotal: document.getElementById('sum-total')?.textContent,
    frozen: window._estEditState?.viewingFrozenEstimate
  }));
  ok('1. 다시 열었을 때 화면 입력칸에 정확한 값이 보임', domStateAfterReopen.measurePrice && domStateAfterReopen.measurePrice.replace(/,/g,'') === '1915000', JSON.stringify(domStateAfterReopen));

  const printText = await page.evaluate(() => {
    printForCustomer();
    return document.getElementById('pv-overlay')?.textContent || '';
  });
  ok('2. [핵심] 아무 편집 없이 바로 인쇄해도 레일 수정값(1,890,000원)이 정확히 나옴(수량 안 곱해짐)', printText.includes('1,890,000') && !printText.includes('18,900,000'), printText.match(/[\d,]+원/g)?.slice(0, 15));
  ok('3. [핵심] "실측+시공비" 표시가 실측비(1,915,000)+시공비(50,000)+레일시공비(25,000)=1,990,000원으로 정확히 합산됨', printText.includes('1,990,000'), printText.match(/[\d,]+원/g)?.slice(0, 15));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
