// tests/pay-multi-estimate-check.js
// 2026-09-21(선혜님 - "견적서가 두갠데 결제 화면이 무슨 견적서에
// 대한 결제건인지 확인이 안되게 되어있고" - 노지경 고객 사례): 처음엔
// 결제 화면 상단에 "이 견적서 N건 합계에 대한 결제예요"라는 안내를
// 추가했었는데, 그 직후 "견적서 두건의 합계를 챙기면 변수가 생길꺼
// 같은데 따로 해야지"라는 지적으로 결제 자체를 견적서별로 완전히
// 분리하는 구조로 전환함(e2c5e63) - 그 결과 "N건 합계 안내" UI 자체가
// 없어지고, 대신 각 견적서가 "견적서 N/M · 상태 · 금액"이라는 라벨과
// 함께 독립된 결제 카드로 보이게 됨. 이 테스트는 옛 UI(합계 안내)를
// 검증하던 채로 안 고쳐져 있었고, 실제로 CI에서 이 불일치가 정확히
// 잡혔음(구조가 바뀌었는데 검증 대상이 안 바뀐 진짜 회귀) - 새 구조에
// 맞게 재작성.
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
  async function waitForText(needle, maxMs) {
    var deadline = Date.now() + (maxMs || 3000);
    var lastText = null;
    while (Date.now() < deadline) {
      var text = await page.evaluate(() => document.body.textContent);
      if (text.includes(needle)) {
        // 2026-09-21(순차 실행시에만 재현되는 실패 조사 중 발견): openDetail()이
        // 비동기라서, 이전 고객 모달 내용이 지워지기 "직전" 짧은 과도기 순간에도
        // 우연히 needle이 이미 포함돼 있을 수 있음(예: 이전 노지경님의 결제
        // 카드 2개가 아직 안 지워진 채로 "결제 관리" 텍스트 자체는 이미 있음) -
        // 텍스트가 처음 나타난 시점 그대로 믿지 않고, 100ms 후 한 번 더 읽어서
        // 내용이 그대로 안정됐을 때만 최종 결과로 확정.
        await new Promise(function(r){ setTimeout(r, 150); });
        var confirmText = await page.evaluate(() => document.body.textContent);
        if (confirmText === text) return confirmText;
        lastText = confirmText;
        continue;
      }
      lastText = text;
      await new Promise(function(r){ setTimeout(r, 100); });
    }
    return lastText || await page.evaluate(() => document.body.textContent);
  }

  // 노지경(9401) - 견적서 2건, 합계 6,479,000원
  await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([
      { id: 'est-A', clientId: 9401, clientName: '노지경', price: 1000000 },
      { id: 'est-B', clientId: 9401, clientName: '노지경', price: 5479000 }
    ]));
    saveCustomers([{ id: 9401, clientName: '노지경', phone: '01011112222', stage: '선금결제', staffName: '마스터', price: 6479000 }]);
    openDetail('노지경', 9401);
  });
  const multiState = await waitForText('결제 관리');
  ok('1. 견적서 2건인 고객은 결제 관리가 견적서별로 2개의 독립된 카드로 표시됨', (multiState.match(/결제 관리/g) || []).length === 2, (multiState.match(/결제 관리/g) || []).length);
  ok('2. 각 카드에 "견적서 N/2"라는 라벨이 붙어 어느 견적서 것인지 명확히 구분됨', multiState.includes('견적서 1/2') && multiState.includes('견적서 2/2'), multiState.includes('견적서 1/2') + '/' + multiState.includes('견적서 2/2'));
  ok('3. 각 카드에 그 견적서 고유 금액이 정확히 표시됨(합계가 아니라 개별 금액)', multiState.includes('1,000,000') && multiState.includes('5,479,000'));

  // 회귀방지: 견적서 1건뿐인 고객은 카드가 1개만, 라벨 없이 표시됨(불필요한 정보 방지)
  await page.evaluate(() => {
    closeDetail();
    localStorage.setItem('dah_saved', JSON.stringify([
      { id: 'est-C', clientId: 9402, clientName: '단건고객', price: 800000 }
    ]));
    saveCustomers([{ id: 9402, clientName: '단건고객', phone: '01022223333', stage: '가견적', staffName: '마스터', price: 800000 }]);
    openDetail('단건고객', 9402);
  });
  const singleState = await waitForText('결제 관리');
  ok('4. [회귀방지] 견적서 1건뿐인 고객은 결제 관리 카드가 1개만 뜸', (singleState.match(/결제 관리/g) || []).length === 1);
  ok('5. [회귀방지] 견적서 1건뿐이면 "견적서 N/M" 라벨은 불필요한 정보라 안 붙음', !singleState.includes('견적서 1/1'));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
