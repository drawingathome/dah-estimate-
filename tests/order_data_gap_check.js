const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9802;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const result = await page.evaluate(() => {
    // 2026-09-22(선혜님 - "코드정리 싹 해봐" 요청으로 전수 점검 중 발견):
    // orderStatus가 비어있으면(신규 고객 기본값) hasIncompleteOrder()가
    // 먼저 true로 걸려 "발주 필요"만 뜨고, hasOrderDataGap()의 else if
    // 분기는 절대 도달을 못 함(getRelevantOrderItems가 2026-08-06 정책
    // 변경으로 품목데이터 없으면 5개 항목을 전부 relevant=true로 다시
    // 보여주게 바뀌었기 때문) - 이 else if 분기가 실제로 의미를 갖는
    // 유일한 경우는 "이미 발주를 5개 다 체크해뒀는데, 나중에 견적서가
    // 다시 저장되면서 품목데이터가 비게 된" 케이스이므로, orderStatus를
    // 이미 완료된 상태로 맞춰서 정확히 그 시나리오를 재현.
    saveCustomers([{ id: 700, clientName: '데이터갭테스트', phone:'01099990000', stage:'시공준비중', staffName:'마스터', date: todayStr(), price: 2670000, orderStatus: {fabric:true,production:true,blind:true,material:true,install:true} }]);
    localStorage.setItem('dah_saved', JSON.stringify([
      { no:'E1', clientId: 700, clientName:'데이터갭테스트', price:2670000, curtainCount:0, blindCount:0, lineItems:[], staffName:'마스터', savedAt: todayStr() }
    ]));
    goTab('home'); renderHome(true);
    var todoText = document.getElementById('sec-todo').textContent;
    return { todoText };
  });

  const check1 = result.todoText.includes('데이터갭테스트');
  const check2 = result.todoText.includes('발주정보 확인 필요');
  console.log('처리필요에 표시됨:', check1 ? '✅' : '❌');
  console.log('사유가 "발주정보 확인 필요"로 뜸:', check2 ? '✅' : '❌');

  await browser.close();
  process.exit(check1 && check2 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 20000);
