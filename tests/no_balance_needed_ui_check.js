const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9929;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 1100 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 노지경 두 번째 견적서 사례 재현: 총액 620,000원, 계약금 620,000원(총액과 동일)
  const r1 = await page.evaluate(() => {
    saveCustomers([{ id: 9930, clientName: '잔금없음테스트', phone:'01099990000', stage:'실측준비중', staffName:'마스터' }]);
    var est = { id: 'est-9930', clientId: 9930, clientName: '잔금없음테스트', price: 620000, depositAmount: 620000, depositDate: '2026-09-16', depositMethod: '현금', depositReceipt: true, balanceAmount: 0, balanceDate: '' };
    var payBody = document.createElement('div');
    document.body.appendChild(payBody);
    renderPaySection({ id: 9930, clientName: '잔금없음테스트' }, payBody, est);
    var text = payBody.textContent;
    var hasEmptyForm = !!payBody.querySelector('input[placeholder*="잔금"]') || text.indexOf('잔금 저장') !== -1;
    return { text: text, hasEmptyForm: hasEmptyForm, hasNoBalanceMsg: text.indexOf('잔금 없음') !== -1 };
  });
  ok('1. 계약금이 총액과 같으면 "잔금 없음(계약금으로 완납)" 메시지가 뜸', r1.hasNoBalanceMsg === true, r1.text.slice(0, 200));
  ok('2. 빈 잔금 입력폼/저장버튼이 안 뜸(더 이상 입력을 유도 안 함)', r1.hasEmptyForm === false, r1.text.slice(0, 200));

  // 대조군: 계약금이 총액보다 적으면(정상 케이스) 여전히 잔금 입력폼이 떠야 함
  const r2 = await page.evaluate(() => {
    var est2 = { id: 'est-9931', clientId: 9931, clientName: '잔금있음테스트', price: 1000000, depositAmount: 500000, depositDate: '2026-09-16', balanceAmount: 0, balanceDate: '' };
    var payBody2 = document.createElement('div');
    document.body.appendChild(payBody2);
    renderPaySection({ id: 9931, clientName: '잔금있음테스트' }, payBody2, est2);
    var text2 = payBody2.textContent;
    return { hasForm: text2.indexOf('잔금 저장') !== -1, hasNoBalanceMsg: text2.indexOf('잔금 없음') !== -1 };
  });
  ok('3. 계약금이 총액보다 적으면(정상 케이스) 잔금 입력폼이 그대로 뜸(회귀 없음)', r2.hasForm === true && r2.hasNoBalanceMsg === false, JSON.stringify(r2));

  // 대조군: 잔금까지 실제로 입력 완료된 경우엔 기존처럼 "완료" 표시가 우선함
  const r3 = await page.evaluate(() => {
    var est3 = { id: 'est-9932', clientId: 9932, clientName: '잔금실입력테스트', price: 1000000, depositAmount: 500000, depositDate: '2026-09-16', balanceAmount: 500000, balanceDate: '2026-09-20', balanceMethod: '카드' };
    var payBody3 = document.createElement('div');
    document.body.appendChild(payBody3);
    renderPaySection({ id: 9932, clientName: '잔금실입력테스트' }, payBody3, est3);
    var text3 = payBody3.textContent;
    return { hasRealBalance: text3.indexOf('500,000원') !== -1, hasNoBalanceMsg: text3.indexOf('잔금 없음') !== -1 };
  });
  ok('4. 잔금이 실제로 입력된 경우엔 그 금액이 그대로 표시됨(계약금 기준 판단에 안 밀림)', r3.hasRealBalance === true && r3.hasNoBalanceMsg === false, JSON.stringify(r3));

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
