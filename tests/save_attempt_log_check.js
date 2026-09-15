const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9905;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.dismiss(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 1) 검증 실패로 저장이 중간에 멈추는 경우(고객명/연락처/제품금액 없음)에도
  // "시도 기록"은 무조건 남는지 확인 - 손현영 사례 재현
  const r1 = await page.evaluate(() => {
    localStorage.removeItem('dah_save_attempts');
    document.getElementById('c-name').value = '테스트고객오월';
    document.getElementById('c-phone').value = ''; // 일부러 비워서 검증 실패 유도
    saveEstimate(); // validateEstimate()에서 막혀서 네트워크 요청까지 못 감
    var log = JSON.parse(localStorage.getItem('dah_save_attempts') || '[]');
    return log;
  });
  ok('1. 검증 실패로 저장이 중간에 멈춰도 "시도 기록"은 남음', r1.length === 1 && r1[0].customerName === '테스트고객오월', JSON.stringify(r1));

  // 2) 여러 번 시도하면 누적되는지, 30건 넘으면 오래된 것부터 잘리는지
  const r2 = await page.evaluate(() => {
    localStorage.setItem('dah_save_attempts', JSON.stringify(Array.from({length: 30}, (_, i) => ({ at: new Date().toISOString(), customerName: '이전고객' + i }))));
    document.getElementById('c-name').value = '새고객';
    saveEstimate();
    var log = JSON.parse(localStorage.getItem('dah_save_attempts') || '[]');
    return { length: log.length, lastName: log[log.length - 1].customerName, firstName: log[0].customerName };
  });
  ok('2. 30건 넘으면 오래된 것부터 잘리고(최근 30건 유지), 새 시도는 정확히 기록됨', r2.length === 30 && r2.lastName === '새고객' && r2.firstName === '이전고객1', JSON.stringify(r2));

  // 3) 자가진단 화면에 "최근 저장 시도 기록"이 뜨는지
  const r3 = await page.evaluate(() => {
    runSelfDiagnosis();
    return new Promise(resolve => setTimeout(() => {
      var modal = document.getElementById('self-diag-modal');
      resolve(modal ? modal.textContent : '');
    }, 300));
  });
  ok('3. 자가진단 화면에 "최근 저장 시도 기록" 항목이 표시됨', r3.indexOf('최근 저장 시도 기록') !== -1, r3.slice(0, 200));

  // 4) 2026-09-15(선혜님 지시 - "원인을 찾아야지 다음에 문제가 안되게 하지"):
  // 실측/시공일 미입력 확인창에서 "취소"를 누르면 이제 눈에 띄는 안내가 뜸
  // (파일 상단에 등록된 page.on('dialog', ...)가 자동으로 "취소"를 누름)
  await page.evaluate(() => {
    document.getElementById('c-name').value = '취소테스트고객';
    document.getElementById('c-phone').value = '01011112222';
    document.getElementById('c-addr').value = '서울시 어딘가';
    saveEstimate();
  });
  await new Promise(res => setTimeout(res, 400));
  const r4 = await page.evaluate(() => {
    var t = document.getElementById('toast');
    return t ? t.textContent : '';
  });
  ok('4. 확인창에서 "취소"를 누르면 "저장이 취소됐어요" 안내가 뜸(예전엔 아무 표시 없었음)', r4.indexOf('저장이 취소됐어요') !== -1, r4);

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
