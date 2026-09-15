const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9927;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 1) 레지스트리에 등록된 9개 변수 전부를 "이전 고객 것"처럼 오염시킨 뒤
  // resetEstEditingState() 한 번으로 전부 정리되는지 확인
  const r1 = await page.evaluate(() => {
    Object.keys(EST_SESSION_RESET_VALUES).forEach(function(k) { window[k] = '오염된값'; });
    resetEstEditingState();
    var stillDirty = Object.keys(EST_SESSION_RESET_VALUES).filter(function(k) {
      return window[k] !== EST_SESSION_RESET_VALUES[k];
    });
    return { totalKeys: Object.keys(EST_SESSION_RESET_VALUES).length, stillDirty: stillDirty };
  });
  ok('1. 등록된 9개 변수 전부(_skipTodayDuplicateCheck 포함) 정확히 초기값으로 리셋됨', r1.stillDirty.length === 0, JSON.stringify(r1));

  // 2) 이번에 새로 찾은 것: _skipTodayDuplicateCheck가 예전엔 이 목록에
  // 아예 없었음(복사모드 플래그가 새 견적서 시작해도 안 지워지던 문제) -
  // 명시적으로 다시 확인
  const r2 = await page.evaluate(() => '_skipTodayDuplicateCheck' in EST_SESSION_RESET_VALUES);
  ok('2. _skipTodayDuplicateCheck가 레지스트리에 등록돼 있음(예전엔 누락)', r2 === true);

  // 3) "새 변수를 등록만 하면 자동으로 리셋된다"는 구조 자체가 실제로
  // 작동하는지 - 지금 없는 새 변수를 하나 등록해보고 검증
  const r3 = await page.evaluate(() => {
    EST_SESSION_RESET_VALUES._testNewFutureVar = 'RESET_VALUE';
    window._testNewFutureVar = '오염된값';
    resetEstEditingState();
    var result = window._testNewFutureVar === 'RESET_VALUE';
    delete EST_SESSION_RESET_VALUES._testNewFutureVar; // 테스트 정리
    return result;
  });
  ok('3. 앞으로 새 변수를 레지스트리에 "이름만" 추가해도 자동으로 리셋 대상에 포함됨(구조 검증)', r3 === true);

  // 4) 실제 newEstimate() 흐름에서도 정상 작동하는지(회귀 없음)
  const r4 = await page.evaluate(() => {
    window._editingEstDbId = 'old-est-id';
    window._estimateConfirmedAt = new Date().toISOString();
    document.getElementById('c-name').value = '이전고객';
    newEstimate();
    return { editingId: window._editingEstDbId, confirmedAt: window._estimateConfirmedAt, nameValue: document.getElementById('c-name').value };
  });
  ok('4. newEstimate() 실행시 실제로 편집ID/확정상태 리셋 + 이름칸도 비워짐(회귀 없음)', r4.editingId === null && r4.confirmedAt === null && r4.nameValue === '', JSON.stringify(r4));

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
