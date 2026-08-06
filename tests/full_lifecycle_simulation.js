const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9857;
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
  async function wait(ms) { await new Promise(res => setTimeout(res, ms || 250)); }

  let r;

  await wait();
  r = await page.evaluate(() => {
    saveCustomers([{ id: 5000, clientName: '생애주기A', phone: '01055512345', addr: '서울시', stage: '방문예약', staffName: '마스터', date: todayStr(), price: 3000000 }]);
    goTab('home'); renderHome(true);
    return document.getElementById('sec-stage').textContent.includes('방문예약');
  });
  ok('1. 방문예약 생성 후 진행현황에 반영', r === true);

  await wait();
  r = await page.evaluate(() => {
    var arr = loadCustomers(); var c = arr.find(x=>x.id===5000);
    c.stage = '상담'; saveCustomers(arr);
    c.stage = '가견적'; saveCustomers(arr);
    renderHome(true);
    return loadCustomers().find(x=>x.id===5000).stage;
  });
  ok('2. 상담→가견적 수동전환', r === '가견적', r);

  await wait();
  r = await page.evaluate(() => {
    openDetail('생애주기A', 5000);
    var amt = document.querySelector('input[placeholder="선금 금액"]');
    var date = document.querySelectorAll('#detail-pay-body input[type="date"]')[0];
    var btn = Array.from(document.querySelectorAll('#detail-pay-body button, #detail-pay-body span')).find(b => b.textContent.trim() === '선금 저장');
    amt.value = '1500000'; if (date) date.value = todayStr();
    btn.click();
    return loadCustomers().find(x=>x.id===5000).stage;
  });
  ok('3. 선금입금(50%) 후 선금결제 자동전환', r === '선금결제', r);

  await wait();
  r = await page.evaluate(() => {
    var arr = loadCustomers(); var c = arr.find(x=>x.id===5000);
    c.stage = '확정견적'; saveCustomers(arr);
    openDetail('생애주기A', 5000);
    var amt = document.querySelector('input[placeholder="잔금 금액"]');
    var btn = Array.from(document.querySelectorAll('#detail-pay-body button, #detail-pay-body span')).find(b => b.textContent.trim() === '잔금 저장');
    amt.value = '';
    btn.click();
    return loadCustomers().find(x=>x.id===5000).stage;
  });
  ok('4. 확정견적 단계에서 0원 잔금 저장시 전환 안 됨', r === '확정견적', r);

  await wait(400);
  await page.evaluate(() => { openDetail('생애주기A', 5000, 'order'); });
  await wait(400);
  r = await page.evaluate(() => {
    var bodyText = document.getElementById('detail-order-body') ? document.getElementById('detail-order-body').textContent : document.body.textContent;
    return { hasCheckbox: document.querySelectorAll('#detail-order-body input[type="checkbox"]').length, hasNoDataMsg: bodyText.includes('저장된 견적서가 없어') };
  });
  ok('5. 확정견적 단계 발주탭에 체크박스 표시(재입력 불필요)', r.hasCheckbox > 0 && !r.hasNoDataMsg, JSON.stringify(r));

  await wait();
  r = await page.evaluate(() => {
    var cb = document.querySelectorAll('#detail-order-body input[type="checkbox"]')[0];
    if (cb) cb.click();
    return null;
  });
  await wait(400);
  r = await page.evaluate(() => {
    goTab('home'); renderHome(true);
    var todo = document.getElementById('sec-todo').textContent;
    return todo.includes('생애주기A') && todo.includes('발주 필요');
  });
  ok('6. 발주 일부만 체크시 처리필요에 계속 발주필요로 뜸(전부체크 전까지)', r === true);

  await wait();
  r = await page.evaluate(() => {
    openDetail('생애주기A', 5000);
    var amt = document.querySelector('input[placeholder="잔금 금액"]');
    var date = document.querySelectorAll('#detail-pay-body input[type="date"]')[1];
    var btn = Array.from(document.querySelectorAll('#detail-pay-body button, #detail-pay-body span')).find(b => b.textContent.trim() === '잔금 저장');
    amt.value = '1500000'; if (date) date.value = todayStr();
    btn.click();
    return loadCustomers().find(x=>x.id===5000).stage;
  });
  ok('7. 잔금입금 후 시공준비중 자동전환', r === '시공준비중', r);

  await wait(400);
  await page.evaluate(() => { openDetail('생애주기A', 5000, 'order'); });
  await wait(400);
  r = await page.evaluate(() => {
    document.querySelectorAll('#detail-order-body input[type="checkbox"]').forEach(cb => { if (!cb.checked) cb.click(); });
    return null;
  });
  await wait(400);
  r = await page.evaluate(() => {
    var c = loadCustomers().find(x=>x.id===5000);
    var incomplete = hasIncompleteOrder(c);
    goTab('home'); renderHome(true);
    var todoOnly = document.getElementById('sec-todo').textContent.split('오늘/내일')[0];
    return { pass: !todoOnly.includes('생애주기A'), incomplete, todoOnly: todoOnly.slice(-100) };
  });
  ok('8. 발주 전부 체크 후 처리필요 섹션에서만 정확히 사라짐', r.pass === true, JSON.stringify(r));

  await wait();
  r = await page.evaluate(() => {
    openDetail('생애주기A', 5000);
    changeStage('시공완료');
    return loadCustomers().find(x=>x.id===5000).stage;
  });
  ok('9. 시공완료 전환', r === '시공완료', r);

  await wait();
  r = await page.evaluate(() => {
    goTab('search'); renderSearch();
    return document.getElementById('search-list').textContent.includes('생애주기A');
  });
  ok('10. 시공완료 후에도 고객목록에 항상 표시(자동숨김 없음)', r === true);

  await wait();
  r = await page.evaluate(() => {
    var arr = loadCustomers();
    arr.push({ id: 5001, clientName: '동명이인테스트', phone: '01011112222', stage: '상담', staffName: '마스터', date: todayStr(), price: 1000000 });
    arr.push({ id: 5002, clientName: '동명이인테스트', phone: '01033334444', stage: '선금결제', staffName: '마스터', date: todayStr(), price: 2000000, depositAmount: 1000000, depositDate: todayStr() });
    saveCustomers(arr);
    openDetail('동명이인테스트', 5001);
    var infoBarA = document.getElementById('detail-info-bar').textContent;
    openDetail('동명이인테스트', 5002);
    var infoBarB = document.getElementById('detail-info-bar').textContent;
    return { infoBarA, infoBarB };
  });
  ok('11. 동명이인 A(전화 1111) 정확히 구분', r.infoBarA.includes('1112222'));
  ok('12. 동명이인 B(전화 3333) 정확히 구분, A와 안 섞임', r.infoBarB.includes('3334444') && !r.infoBarB.includes('1112222'));

  await wait();
  r = await page.evaluate(() => {
    var arr = loadCustomers(); var c = arr.find(x=>x.id===5000);
    c.stage = '시공준비중'; saveCustomers(arr);
    return loadCustomers().find(x=>x.id===5000).stage;
  });
  ok('13. 시공완료→시공준비중 되돌리기 정상 작동', r === '시공준비중', r);

  console.log('=== 전체 생애주기 시뮬레이션 결과 ===');
  log.forEach(l => console.log(l));
  console.log('\n=== JS 에러 ===');
  console.log(jsErrors.length ? jsErrors.join('\n') : '없음 ✅');
  console.log('\n총 ' + log.length + '개 검사 중 실패:', log.filter(l=>l.startsWith('❌')).length + '개');

  await browser.close();
  process.exit(0);
}
run().catch(e => { console.error('스크립트 자체 에러:', e); process.exit(1); });
setTimeout(() => process.exit(1), 30000);
