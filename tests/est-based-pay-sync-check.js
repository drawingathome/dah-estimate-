// tests/est-based-pay-sync-check.js
// 2026-09-21(선혜님 - "위 내용 코드 정리해줘 버그가 많을꺼 같은데" 요청
// 으로 전수 점검 중 발견): 결제를 견적서 단위로 전환(e2c5e63)하면서,
// 매출(목표달성률) 계산의 핵심 함수 splitCustomerPayments(dash-chart.js)
// 와 홈화면 "처리 필요" 배지 판단(dash-render.js)이 전부 여전히
// customers 레벨 c.depositAmount/balanceAmount만 보고 있었음 - 견적서
// 쪽에만 결제가 저장된 고객은 매출 집계가 0으로 빠지고, 이미 입금됐는데도
// "결제처리 필요" 배지가 계속 뜨는 심각한 회귀가 될 뻔했음(사용자가
// 초반에 겪었던 것과 정확히 같은 유형의 버그가 오늘 구조 전환으로
// 재발할 뻔함). 검증: 견적서 단위로만 결제가 저장된 고객의 매출이
// 정확히 월별로 잡히는지, 처리필요 배지가 안 뜨는지.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 28300;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 1200 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 견적서 단위로만 결제가 저장된 고객(customers 레벨엔 결제 필드 없음)
  await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([
      { id: 'est-sync-1', clientId: 8800, clientName: '동기화테스트', price: 5000000,
        depositAmount: 2000000, depositDate: '2026-09-05',
        balanceAmount: 3000000, balanceDate: '2026-09-15' }
    ]));
    saveCustomers([{ id: 8800, clientName: '동기화테스트', phone: '01099998888', stage: '잔금결제', staffName: '마스터', price: 5000000, date: '2026-09-01' }]);
  });

  const results = await page.evaluate(() => {
    var c = loadCustomers().find(function(x){ return x.id === 8800; });
    var parts = splitCustomerPayments(c);
    var sepRevenue = parts.filter(function(p){ return (p.date||'').slice(0,7) === '2026-09'; }).reduce(function(s,p){ return s+p.revenue; }, 0);
    return { parts: parts, sepRevenue: sepRevenue };
  });
  ok('1. [핵심] 견적서 단위 결제가 매출(splitCustomerPayments)에 정확히 반영됨(선금+잔금=5,000,000원)', results.sepRevenue === 5000000, JSON.stringify(results.parts));
  ok('2. 선금(2,000,000원)이 정확한 날짜(2026-09-05)로 개별 반영됨', results.parts.some(function(p){ return p.date === '2026-09-05' && p.revenue === 2000000; }));
  ok('3. 잔금(3,000,000원)이 정확한 날짜(2026-09-15)로 개별 반영됨', results.parts.some(function(p){ return p.date === '2026-09-15' && p.revenue === 3000000; }));

  // 홈화면 "처리 필요" 배지 - 잔금결제 단계인데 견적서 쪽엔 이미 완납 -> 배지 안 떠야 함
  const homeState = await page.evaluate(() => {
    renderHome(true);
    return document.getElementById('sec-todo').textContent;
  });
  ok('4. [핵심] 견적서 단위로 완납된 고객은 "잔금결제 처리" 배지가 안 뜸(이미 다 받았음)', !homeState.includes('잔금결제 처리'), homeState.includes('동기화테스트') ? '고객명은 있음(다른 사유일 수 있음)' : '고객명 없음');

  // 회귀방지: 견적서 0건(신규 고객)이고 실제 미입금이면 여전히 미수금으로 판단되는지
  // (dash-render.js가 참조하는 getReceivedAmount를 직접 확인 - orderStatus
  // 등 다른 배지 사유와 섞이지 않도록 함수 자체로 검증)
  const recvCheck = await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([]));
    var c = { id: 8801, clientName: '미입금동기화', stage: '잔금결제', depositAmount: 500000, balanceAmount: 0 };
    return getReceivedAmount(c);
  });
  ok('5. [회귀방지] 견적서 0건 고객은 예전처럼 customers 레벨 필드로 정상 계산(선금 500,000원만 받음, 0 아님)', recvCheck === 500000, 'getReceivedAmount=' + recvCheck);

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
