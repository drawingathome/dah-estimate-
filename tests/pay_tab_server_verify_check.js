const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9932;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      // 김은/황남주 사례 재현: 로컬 캐시(dah_saved)엔 이 고객의 견적서가
      // 하나도 없지만, 서버(estimates 테이블)엔 실제로 완납된 견적서가 있음
      if (url.includes('/estimates?client_id=eq.9940')) {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify([{ id: 'server-only-est-1', client_id: 9940, client_name: '캐시불일치테스트', price: 3100000, deposit_amount: 1500000, deposit_date: '2026-09-01', balance_amount: 1600000, balance_date: '2026-09-10', contract_status: 'contracted', updated_at: '2026-09-21T00:00:00Z' }]) });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.setViewport({ width: 390, height: 1200 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  await page.evaluate(() => {
    saveCustomers([{ id: 9940, clientName: '캐시불일치테스트', phone:'01099990001', stage:'시공완료', staffName:'마스터', price: 3100000 }]);
    localStorage.setItem('dah_saved', JSON.stringify([])); // 로컬 캐시엔 이 고객 견적서가 전혀 없는 상태
    openDetail('캐시불일치테스트', 9940, 'pay');
  });

  // 서버 재확인이 끝난 뒤: 실제로는 견적서가 있고 완납이라는 게 반영돼야 함
  await new Promise(r => setTimeout(r, 800));
  const after = await page.evaluate(() => document.getElementById('detail-pay-body').textContent);
  ok('1. 서버 재확인 후 실제로 존재하는 견적서(완납)로 화면이 다시 그려짐(김은/황남주 근본 수정)', after.indexOf('1,500,000원') !== -1 && after.indexOf('1,600,000원') !== -1, after.slice(0, 300));

  const cacheFixed = await page.evaluate(() => {
    var arr = JSON.parse(localStorage.getItem('dah_saved')||'[]');
    return arr.some(function(e){ return e.id === 'server-only-est-1'; });
  });
  ok('2. 로컬 캐시도 서버 기준으로 바로잡혀서 다음번엔 곧바로 정확하게 보임', cacheFixed === true);

  // 대조군: 서버도 진짜로 견적서가 없는 정상적인 신규고객은 그대로 폴백 화면 유지(회귀 없음)
  await page.evaluate(() => {
    saveCustomers([{ id: 9941, clientName: '진짜신규고객', phone:'01099990002', stage:'상담', staffName:'마스터' }]);
    openDetail('진짜신규고객', 9941, 'pay');
  });
  await new Promise(r => setTimeout(r, 500));
  const newCustText = await page.evaluate(() => document.getElementById('detail-pay-body').textContent);
  ok('3. 서버도 진짜 견적서가 없는 신규고객은 계속 정상적인 폴백 화면(회귀 없음)', newCustText.indexOf('선금') !== -1 || newCustText.indexOf('결제') !== -1, newCustText.slice(0, 100));

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 30000);
