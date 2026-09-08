const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9870;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if ((url.includes('supabase.co') || url.includes('script.google.com'))) {
      if (req.method() === 'OPTIONS') {
        req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } });
        return;
      }
      if (url.includes('/customers') && req.method() === 'POST') {
        req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 'new-cust-1' }]) });
        return;
      }
      if (url.includes('/estimates') && req.method() === 'POST') {
        req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });

  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  const r1 = await page.evaluate(() => {
    document.getElementById('c-name').value = '견적통합테스트';
    document.getElementById('c-phone').value = '01099998888';
    const tr = document.querySelector('.row-curtain');
    tr.querySelector('.space-inp').value = '거실';
    tr.querySelector('.mw').value = 300; calcCurtainRow(tr.querySelector('.mw'));
    tr.querySelector('.mh').value = 250; calcCurtainRow(tr.querySelector('.mh'));
    tr.querySelector('.cprice').value = 50000; calcCurtainRow(tr.querySelector('.cprice'));
    tr.querySelector('.c-vendor').value = '테스트원단업체';
    const grandText = document.getElementById('sum-total') ? document.getElementById('sum-total').textContent : null;
    return { grandText };
  });
  ok('1. 견적 작성 - 총액 계산됨', r1.grandText && r1.grandText !== '0원', r1.grandText);

  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 1200));

  const r2 = await page.evaluate(() => {
    var saved = JSON.parse(localStorage.getItem('dah_saved') || '[]');
    var entry = saved.find(e => e.clientName === '견적통합테스트');
    var custs = JSON.parse(localStorage.getItem('dah_customers') || '[]');
    var cust = custs.find(c => c.clientName === '견적통합테스트');
    return {
      hasEntry: !!entry,
      lineItemsCount: entry ? (entry.lineItems || []).length : 0,
      curtainCount: entry ? entry.curtainCount : null,
      hasCustomer: !!cust,
      custPrice: cust ? cust.price : null
    };
  });
  ok('2. 로컬(dah_saved)에 견적 저장됨', r2.hasEntry === true, JSON.stringify(r2));
  ok('3. line_items에 실제 품목 저장됨(재입력 버그 재발 안함)', r2.lineItemsCount > 0, r2.lineItemsCount);
  ok('4. curtainCount 정확히 반영', r2.curtainCount === 1, r2.curtainCount);
  ok('5. 고객 레코드도 함께 생성됨(dah_customers)', r2.hasCustomer === true);

  console.log('=== 견적서 앱 통합 흐름 검증 ===');
  log.forEach(l => console.log(l));
  console.log('\n=== JS 에러 ===');
  console.log(jsErrors.length ? jsErrors.join('\n') : '없음 ✅');

  await browser.close();
  process.exit(0);
}
run().catch(e => { console.error('스크립트 에러:', e); process.exit(1); });
setTimeout(() => process.exit(1), 25000);
