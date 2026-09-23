const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9952;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/estimates?id=eq.test-est-staffname')) {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify([{ id: 'test-est-staffname', customer_name: '담당자재현고객', phone: '01099990007', addr: '서울시', staff_name: '오지은 실장', price: 500000, line_items: [], client_id: 995 }]) });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.setViewport({ width: 1280, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=test-est-staffname&mode=view`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 1500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  const result = await page.evaluate(() => document.getElementById('c-staff')?.value);
  // 2026-09-01(bb58be6) 실제사고 재현: 대시보드 "다시보기"가 항상 쓰는
  // loadEstDbId 경로로 다른 담당자(오지은 실장)의 견적서를 열었을 때,
  // 담당자 필드가 정확히 그 사람 이름으로 채워지는지 - 예전엔 빈 채로
  // 남아서 문서 생성시 항상 기본값(장선혜)으로 잘못 찍혀나갔음
  ok('[핵심] loadEstDbId로 열어도 c-staff에 실제 담당자(오지은 실장)가 정확히 복원됨(기본값 장선혜로 안 빠짐)', result === '오지은 실장', 'c-staff=' + result);

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
