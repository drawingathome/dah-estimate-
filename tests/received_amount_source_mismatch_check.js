const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9928;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 김은/황남주 사례 재현: 고객 레벨엔 완납 기록이 있지만(dash-customer-pay.js가
  // 실제로 쓰는 곳), 이 고객 이름으로 저장된 견적서(dah_saved)엔 결제 정보가
  // 하나도 없는 상태(견적서 자체는 있지만 depositAmount/balanceAmount가 없음)
  const r1 = await page.evaluate(() => {
    var c = {
      id: 999, clientName: '김은재현', stage: '시공완료', price: 3100000,
      depositAmount: 1500000, balanceAmount: 1600000 // 고객 레벨엔 완납 기록 있음
    };
    localStorage.setItem('dah_saved', JSON.stringify([
      { clientId: 999, clientName: '김은재현', no: 'E1' } // 견적서는 있지만 결제정보 없음(0원)
    ]));
    return {
      received: getReceivedAmount(c),
      unpaid: getUnpaidAmount(c)
    };
  });
  ok('1. 견적서는 있지만 결제정보가 없어도, 고객 레벨의 실제 입금액(310만원)을 받은 금액으로 인정함', r1.received === 3100000, JSON.stringify(r1));
  ok('2. 미수금이 0원으로 정확히 계산됨(예전엔 310만원 전액 미수금으로 잘못 표시됐음)', r1.unpaid === 0, JSON.stringify(r1));

  // 대조군: 견적서 자체가 없는 경우(예전 폴백 경로)도 여전히 정상 작동하는지(회귀 없음)
  const r2 = await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([]));
    var c = { id: 1000, clientName: '신규고객', stage: '선금결제', price: 1000000, depositAmount: 500000, balanceAmount: 0 };
    return getReceivedAmount(c);
  });
  ok('3. 견적서가 아예 없는 신규고객도 고객 레벨 금액으로 정상 계산됨(회귀 없음)', r2 === 500000, 'received=' + r2);

  // 대조군: 견적서 쪽에 결제정보가 있고 고객레벨이 비어있는 경우(미래의 견적서
  // 단위 저장 방식)도 정상 작동해야 함
  const r3 = await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([
      { clientId: 1001, clientName: '견적서기반고객', depositAmount: 700000, balanceAmount: 300000 }
    ]));
    var c = { id: 1001, clientName: '견적서기반고객', stage: '시공완료', price: 1000000 };
    return getReceivedAmount(c);
  });
  ok('4. 견적서 쪽에만 결제정보가 있는 경우도 정상 인식됨(미래 구조 대비)', r3 === 1000000, 'received=' + r3);

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
