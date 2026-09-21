const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9808;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 1200 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const result = await page.evaluate(async () => {
    saveCustomers([
      { id: 1001, clientName: '구정화재현', phone:'01049290527', stage:'선금결제', staffName:'마스터', date: '2026-07-11', depositAmount: 2500000, depositDate: '2026-07-11', measureDate: '2026-08-07' },
      { id: 1002, clientName: '미입금테스트', phone:'01000000000', stage:'선금결제', staffName:'마스터', date: '2026-08-01', depositAmount: 0 },
      { id: 1003, clientName: '확정견적테스트', phone:'01000000001', stage:'확정견적', staffName:'마스터', date: '2026-08-01', orderStatus: {} }
    ]);
    localStorage.setItem('dah_saved', JSON.stringify([
      { no:'E1', clientId: 1003, clientName:'확정견적테스트', price:1000000, curtainCount:1, blindCount:0, lineItems:[{type:'curtain'}], staffName:'마스터', savedAt: todayStr() }
    ]));
    renderHome(true);
    var todoText = document.getElementById('sec-todo').textContent;

    openDetail('구정화재현', 1001, 'order');
    // 2026-09-21(견적서별 결제 관리 전환 후 CI에서 처음 드러남): openDetail()은
    // loadEstimatesAsync()를 거치는 비동기 함수인데, 이 테스트는 호출 직후
    // 바로 document.body.textContent를 읽고 있었음 - 원래도 타이밍에 취약한
    // 구조였지만, 렌더링 쪽 처리가 조금이라도 늘어나면(오늘 견적서별 결제
    // 카드를 반복 렌더링하는 로직 추가) 곧바로 실패로 드러날 만큼 아슬아슬
    //했음. 실제 앱은 정상 작동하고(사용자가 느낄 수 없는 수백ms 차이),
    // 순수하게 테스트가 렌더링 완료를 안 기다린 문제라 여기서 대기 추가.
    await new Promise(function(r){ setTimeout(r, 500); });
    var orderTabText = document.body.textContent;

    return { todoText, orderTabText };
  });

  const checks = [
    !result.todoText.match(/구정화재현[\s\S]{0,50}선금결제 처리/),
    result.todoText.includes('미입금테스트') && result.todoText.includes('선금결제 처리'),
    result.todoText.includes('확정견적테스트') && result.todoText.includes('발주 필요'),
    result.orderTabText.includes('확정견적 단계부터')
  ];
  console.log('이미 입금된 구정화재현이 "결제처리"로 안 뜸:', checks[0] ? '✅' : '❌');
  console.log('미입금인 미입금테스트는 "결제처리" 뜸:', checks[1] ? '✅' : '❌');
  console.log('확정견적테스트는 "발주 필요" 뜸:', checks[2] ? '✅' : '❌');
  console.log('선금결제 단계 발주탭에 안내문구 확인:', checks[3] ? '✅' : '❌');

  await browser.close();
  process.exit(checks.every(Boolean) ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 20000);
