const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9938;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setViewport({ width: 1280, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 최금희 실사례 재현: 계약금 75만원 직접 입력 -> 이후 품목표(커튼)를
  // 수정 -> 계약금이 그대로 75만원으로 남아있어야 함(예전엔 50% 자동계산으로 덮어써짐)
  const r1 = await page.evaluate(() => {
    var addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '+ 커튼 추가');
    addBtn.click();
    var tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.mw').value = 300;
    calcCurtainRow(tr.querySelector('.mw'));
    tr.querySelector('.mh').value = 250;
    calcCurtainRow(tr.querySelector('.mh'));
    tr.querySelector('.cprice').value = 100000;
    calcCurtainRow(tr.querySelector('.cprice'));

    var depInp = document.getElementById('deposit-input');
    depInp.value = '750,000';
    depInp.dispatchEvent(new Event('input'));
    var afterTyping = depInp.value;

    // 이제 품목표를 추가로 수정(unfreezeEstimateIfEditing이 실제로
    // 트리거되는 실제 입력 이벤트로) - 다른 커튼 폭을 바꿔봄
    tr.querySelector('.mw').value = 320;
    calcCurtainRow(tr.querySelector('.mw'));

    var afterEdit = document.getElementById('deposit-input').value;
    return { afterTyping, afterEdit };
  });
  ok('1. 계약금 75만원 직접 입력 직후 정상 반영됨', r1.afterTyping.indexOf('750,000') !== -1, JSON.stringify(r1));
  ok('2. [핵심] 이후 품목표를 수정해도 계약금 75만원이 그대로 유지됨(50% 자동계산으로 안 덮어써짐)', r1.afterEdit.indexOf('750,000') !== -1, JSON.stringify(r1));

  // 대조군: applyRealDepositToForm(실제 결제된 값 불러오기)도 동일하게 보호돼야 함
  const r2 = await page.evaluate(() => {
    applyRealDepositToForm(1000000);
    var afterLoad = document.getElementById('deposit-input').value;
    var tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.mw').value = 280;
    calcCurtainRow(tr.querySelector('.mw'));
    var afterEdit = document.getElementById('deposit-input').value;
    return { afterLoad, afterEdit };
  });
  ok('3. applyRealDepositToForm으로 불러온 실제 입금액(100만원)도 품목 수정 후에 유지됨', r2.afterEdit.indexOf('1,000,000') !== -1, JSON.stringify(r2));

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
