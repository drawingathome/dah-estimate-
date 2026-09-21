// tests/pay-multi-estimate-check.js
// 2026-09-21(선혜님 - "견적서가 두갠데 결제 화면이 무슨 견적서에
// 대한 결제건인지 확인이 안되게 되어있고" - 노지경 고객 사례): 결제
// (선금/잔금)는 이 고객의 모든 견적서 합계 기준인데, 화면에 "이게
// 몇 건 합계에 대한 결제인지"가 전혀 안 보였음 - 견적서 2건 이상이면
// 그 사실과 합계 금액을 명시하는 안내가 뜨는지, 1건뿐이면 불필요한
// 정보라 안 뜨는지(회귀방지) 검증.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27900;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 노지경(9401) - 견적서 2건, 합계 6,479,000원
  await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([
      { id: 'est-A', clientId: 9401, clientName: '노지경', price: 1000000 },
      { id: 'est-B', clientId: 9401, clientName: '노지경', price: 5479000 }
    ]));
    saveCustomers([{ id: 9401, clientName: '노지경', phone: '01011112222', stage: '선금결제', staffName: '마스터', price: 6479000 }]);
    openDetail('노지경', 9401);
  });
  await new Promise(r => setTimeout(r, 500));
  const multiState = await page.evaluate(() => document.body.textContent);
  ok('1. 견적서 2건인 고객은 "이 견적서 2건 합계"라는 안내가 결제화면에 표시됨', multiState.includes('견적서 2건 합계'), multiState.includes('견적서') ? '있음' : '없음');
  ok('2. 안내에 정확한 합계 금액(6,479,000원)이 포함됨', multiState.includes('6,479,000'));

  // 회귀방지: 견적서 1건뿐인 고객은 이 안내가 안 뜸(불필요한 정보 방지)
  await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([
      { id: 'est-C', clientId: 9402, clientName: '단건고객', price: 800000 }
    ]));
    saveCustomers([{ id: 9402, clientName: '단건고객', phone: '01022223333', stage: '가견적', staffName: '마스터', price: 800000 }]);
    openDetail('단건고객', 9402);
  });
  await new Promise(r => setTimeout(r, 500));
  const singleState = await page.evaluate(() => document.body.textContent);
  ok('3. [회귀방지] 견적서 1건뿐인 고객은 이 안내가 안 뜸', !singleState.includes('견적서 1건 합계') && !singleState.includes('합계') );

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
