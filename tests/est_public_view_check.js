const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9892;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));

  // 이 테스트는 로그인 없이 접근하는 화면을 검증하는 것이라, 공용
  // blockRealNetwork 대신 estimates 조회 요청 하나만 직접 목업하고
  // 그 외 supabase 요청(app_settings 등 초기화 조회)은 조용히 막음.
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (req.method() === 'OPTIONS' && url.includes('supabase.co')) {
      req.respond({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      });
      return;
    }
    if (url.includes('/rest/v1/estimates') && url.includes('id=eq.test-est-001')) {
      req.respond({
        status: 200, contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify([{
          id: 'test-est-001',
          customer_name: '홍길동',
          phone: '01012345678',
          staff_name: '마스터',
          contract_status: null,
          estimate_status: null,
          install_date: '',
          line_items: [
            { type: 'curtain', space: '거실', displayName: '린넨룩 아이보리 속커튼', mw: '300', mh: '250', pnum: '4', price: 100000, amt: '400,000원', pleatType: '나비주름형', openType: '양개형', hemType: '5cm', vendor: '', fabric: '', color: '' }
          ]
        }])
      });
      return;
    }
    if (url.includes('/rest/v1/estimates') && url.includes('id=eq.test-est-002')) {
      req.respond({
        status: 200, contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify([{
          id: 'test-est-002',
          customer_name: '김철수',
          phone: '01099998888',
          staff_name: '마스터',
          contract_status: 'contracted',
          estimate_status: 'final',
          install_date: '2026-09-20',
          line_items: [
            { type: 'curtain', space: '안방', displayName: '굿나잇 암막 커튼', mw: '240', mh: '253', pnum: '3', price: 99000, amt: '297,000원', pleatType: '민자형', openType: '양개형', hemType: '8cm', vendor: '', fabric: '', color: '' }
          ]
        }])
      });
      return;
    }
    if (url.includes('supabase.co') || url.includes('script.google.com')) { req.abort(); return; }
    req.continue();
  });

  await page.goto(`http://localhost:${port}/dah-estimate.html?view=test-est-001`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  const r = await page.evaluate(() => {
    var gate = document.getElementById('est-auth-gate');
    var container = document.getElementById('public-view-container');
    return {
      gateVisible: gate && getComputedStyle(gate).display !== 'none',
      bodyHasClass: document.body.classList.contains('public-view-mode'),
      containerText: container ? container.textContent : '',
      containerVisible: container && getComputedStyle(container).display !== 'none'
    };
  });

  ok('1. 로그인 게이트가 뜨지 않음', !r.gateVisible);
  ok('2. body에 public-view-mode 클래스 적용됨', r.bodyHasClass);
  ok('3. 공개보기 컨테이너가 화면에 보임', r.containerVisible);
  ok('4. 고객명(홍길동)이 문서에 표시됨', r.containerText.indexOf('홍길동') !== -1, r.containerText.slice(0, 100));
  ok('5. 가견적서 라벨 표시됨(확정 아님)', r.containerText.indexOf('가견적서') !== -1);
  ok('6. 제품명(린넨룩 아이보리 속커튼)이 표시됨', r.containerText.indexOf('린넨룩') !== -1);

  // 2026-09-14(선혜님 지적으로 발견한 버그 재발 방지): 확정견적(estimate_status='final')
  // 이면 "가견적서"가 아니라 "최종 견적서"로 정확히 표시되는지 - 별도 탭으로 열어서 확인
  const page2 = await browser.newPage();
  await page2.setRequestInterception(true);
  page2.on('request', (req) => {
    const url = req.url();
    if (req.method() === 'OPTIONS' && url.includes('supabase.co')) {
      req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } });
      return;
    }
    if (url.includes('/rest/v1/estimates') && url.includes('id=eq.test-est-002')) {
      req.respond({
        status: 200, contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify([{
          id: 'test-est-002', customer_name: '김철수', phone: '01099998888', staff_name: '마스터',
          contract_status: 'contracted', estimate_status: 'final', install_date: '2026-09-20',
          line_items: [{ type: 'curtain', space: '안방', displayName: '굿나잇 암막 커튼', mw: '240', mh: '253', pnum: '3', price: 99000, amt: '297,000원', pleatType: '민자형', openType: '양개형', hemType: '8cm', vendor: '', fabric: '', color: '' }]
        }])
      });
      return;
    }
    if (url.includes('supabase.co') || url.includes('script.google.com')) { req.abort(); return; }
    req.continue();
  });
  await page2.goto(`http://localhost:${port}/dah-estimate.html?view=test-est-002`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r2 => setTimeout(r2, 1500));
  const r2 = await page2.evaluate(() => document.getElementById('public-view-container').textContent);
  ok('7. 확정견적(estimate_status=final)이면 "최종 견적서"로 표시됨', r2.indexOf('최종 견적서') !== -1, r2.slice(0, 100));
  ok('8. 확정견적일 때 "가견적서" 텍스트는 안 뜸', r2.indexOf('가견적서') === -1, r2.slice(0, 100));

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
