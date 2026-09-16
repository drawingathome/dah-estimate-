const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');

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
      // 2026-09-15(코드정리 중 발견 - "모두 고쳐"로 끝까지 파서 찾음):
      // 저장 직전에 로그인 토큰이 곧 만료되는지 확인하고 필요하면 갱신을
      // 시도하는 절차(refreshAuthSessionIfNeeded, dash-supabase-auth.js)가
      // 있는데, 이 테스트의 기존 목업은 이 요청도 그냥 "[]"(빈 배열)로
      // 응답해버려서 "갱신 실패"로 처리돼 저장 자체가 조용히 멈추고
      // 있었음(알림창이 아니라 화면에 그려지는 커스텀 재로그인 UI라
      // 눈에 띄지도 않았음). 이 요청에는 진짜 토큰 갱신 응답과 같은
      // 모양으로 답해줘야 함.
      if (url.includes('/auth/v1/token')) {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ access_token: 'fake-refreshed-token', refresh_token: 'fake-refresh-token', expires_in: 3600, token_type: 'bearer' }) });
        return;
      }
      if (url.includes('/customers') && req.method() === 'POST') {
        req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 'new-cust-1' }]) });
        return;
      }
      if (url.includes('/estimates') && req.method() === 'POST') {
        req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[{"id":"new-est-1","updated_at":"2026-09-16T00:00:00Z"}]' });
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
  // 2026-09-15(코드정리 중 발견 - "모두 고쳐"로 끝까지 파서 찾음): 이
  // 테스트가 로그인 절차 없이 곧바로 saveEstimate()를 호출하고 있어서,
  // 저장 직전 로그인세션 유효성 확인(refreshAuthSessionIfNeeded)에서
  // 막혀 저장 자체가 조용히 멈추고 있었음 - 바로 이 문제를 위해 이미
  // 만들어져 있던 헬퍼(setupValidSession)를 다른 est 테스트들처럼 사용.
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 500));

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

  const failed = log.filter(l => l.startsWith('❌'));
  await browser.close();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error('스크립트 에러:', e); process.exit(1); });
setTimeout(() => process.exit(1), 25000);
