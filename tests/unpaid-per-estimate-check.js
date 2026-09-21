// tests/unpaid-per-estimate-check.js
// 2026-09-21(견적서별 결제 관리 전환에 따른 회귀방지): 결제가 견적서
// 단위로 저장되면서, 미수금 현황판(dash-render-search.js)·칸반 카드
// 받은금액 표시(dash-kanban.js)·알림톡 결제금액(dash-customer-alim.js)
// ·홈화면 처리필요 자동감지(dash-customer-detail.js) 5곳이 전부 여전히
// "고객 레벨" c.depositAmount/c.balanceAmount만 보고 있어서, 그대로
// 두면 전부 조용히 0으로 보이는 광범위한 회귀가 될 뻔했음(직접 계산이
// 중복 작성돼 있던 걸 전수 확인) - getReceivedAmount()/getUnpaidAmount()
// 를 견적서 합산 기준으로 고치고 5곳 전부 이 공용함수를 쓰도록 통일.
// 검증: 견적서 2건의 결제 합계가 정확히 계산되는지, 신규 고객(견적서
// 0건)은 회귀 없이 고객 레벨 필드로 정상 계산되는지.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 28100;
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

  // 노지경(9401) - 견적서 2건, 각각 결제 있음(합계 3,200,000원 받음), 총액 7,099,000원
  await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([
      { id: 'est-A', clientId: 9401, clientName: '노지경', price: 6479000, date: '2026-09-15',
        depositAmount: 3200000, depositDate: '2026-09-15', depositMethod: '현금', depositReceipt: true, balanceAmount: 0 },
      { id: 'est-B', clientId: 9401, clientName: '노지경', price: 620000, date: '2026-09-21',
        depositAmount: 0, balanceAmount: 0 }
    ]));
    saveCustomers([{ id: 9401, clientName: '노지경', phone: '01011112222', stage: '선금결제', staffName: '마스터', price: 7099000 }]);
  });

  const results = await page.evaluate(() => {
    var c = loadCustomers().find(function(x){ return x.id === 9401; });
    return {
      received: getReceivedAmount(c),
      unpaid: getUnpaidAmount(c)
    };
  });
  ok('1. [핵심] getReceivedAmount가 견적서 2건의 결제를 정확히 합산함(3,200,000원)', results.received === 3200000, 'received=' + results.received);
  ok('2. [핵심] getUnpaidAmount가 견적서 합산 기준으로 정확한 미수금을 계산함(7,099,000-3,200,000=3,899,000)', results.unpaid === 3899000, 'unpaid=' + results.unpaid);

  // 회귀방지: 견적서 0건인 고객(신규)은 예전처럼 고객 레벨 필드로 계산
  await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([]));
    saveCustomers([{ id: 9402, clientName: '단건고객', phone: '01022223333', stage: '선금결제', staffName: '마스터', price: 1000000, depositAmount: 500000, balanceAmount: 0 }]);
  });
  const singleResult = await page.evaluate(() => {
    var c = loadCustomers().find(function(x){ return x.id === 9402; });
    return { received: getReceivedAmount(c), unpaid: getUnpaidAmount(c) };
  });
  ok('3. [회귀방지] 견적서 0건인 고객은 고객 레벨 필드로 정상 계산됨(받은 500,000/미수 500,000)', singleResult.received === 500000 && singleResult.unpaid === 500000, JSON.stringify(singleResult));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
