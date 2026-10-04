const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9841;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const result = await page.evaluate(async () => {
    saveCustomers([{ id: 9900, clientName: '우사랑재현2', phone:'01083444649', stage:'시공준비중', staffName:'마스터', date: '2026-06-20', price: 2670000 }]);
    openDetail('우사랑재현2', 9900);
    // 2026-09-22(선혜님 - "코드정리 싹 해봐" 요청으로 전수 점검 중 발견):
    // openDetail()은 비동기(loadEstimatesAsync 경유)인데, 호출 직후
    // 곧바로 getBoundingClientRect()를 측정하고 있었음 - 렌더링이 끝나기
    // 전이라 폭이 전부 0으로 잡히고, 그 결과로 "0 > 0"이 항상 false라
    // 우연히 "✅ 안 넘침"으로만 보였을 뿐 실제로는 아무것도 검증을 못
    // 하고 있었음(오늘 이미 여러 번 발견한 것과 같은 유형). 렌더링
    // 완료를 확실히 기다린 뒤 측정하도록 수정.
    await new Promise(function(r){ setTimeout(r, 500); });
    var tabRow = document.getElementById('dtab-info').parentElement;
    var rowRect = tabRow.getBoundingClientRect();
    var modalBox = document.querySelector('#detail-overlay .modal-box');
    var modalRect = modalBox.getBoundingClientRect();
    var lastTab = document.getElementById('dtab-est');
    var lastTabRect = lastTab.getBoundingClientRect();
    return {
      tabRowWidth: rowRect.width,
      modalWidth: modalRect.width,
      tabRowOverflows: rowRect.width > modalRect.width + 2,
      lastTabRight: lastTabRect.right,
      modalRight: modalRect.right,
      lastTabCutOff: lastTabRect.right > modalRect.right + 2,
      priceRowText: document.getElementById('price-edit-trigger') ? document.getElementById('price-edit-trigger').textContent : null
    };
  });

  const checks = [
    result.tabRowWidth > 0 && result.modalWidth > 0, // 측정 자체가 유효했는지(0이면 여전히 렌더링 전이라는 신호)
    !result.tabRowOverflows,
    !result.lastTabCutOff,
    !!result.priceRowText
  ];
  console.log('탭 행 폭:', result.tabRowWidth, '/ 모달 폭:', result.modalWidth);
  console.log('측정값이 유효함(0이 아님):', checks[0] ? '✅' : '❌');
  console.log('탭 행이 모달보다 넘침:', result.tabRowOverflows ? '❌ 넘침' : '✅ 안 넘침');
  console.log('마지막 탭(이력) 오른쪽 끝 잘림:', result.lastTabCutOff ? '❌ 잘림' : '✅ 정상');
  console.log('매출계산기준금액 표시:', result.priceRowText);

  await browser.close();
  process.exit(checks.every(Boolean) ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 20000);
