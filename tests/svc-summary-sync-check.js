const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9935;
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

  // 1) 최금희 사례 재현: 기존 행의 단가를 직접 수정하면 요약카드가 즉시 갱신돼야 함
  const r1 = await page.evaluate(() => {
    document.getElementById('svc-body').innerHTML = '';
    addSvcRow();
    var tr = document.getElementById('svc-body').lastElementChild;
    tr.querySelector('.svc-kind').value = '시공비';
    tr.querySelector('.svc-content').value = '레일 시공비';
    tr.setAttribute('data-railcost-src', '0');
    var pinp = tr.querySelector('.sprice');
    pinp.value = '25,000'; pinp.setAttribute('data-raw', '25000');
    calcSvcRow(pinp);
    var before = document.getElementById('svc-summary-card').textContent;

    // 사용자가 직접 단가를 80,000으로 고침(입력 이벤트로 정확히 재현)
    pinp.focus();
    pinp.value = '80,000'; pinp.setAttribute('data-raw', '80000');
    pinp.dispatchEvent(new Event('input'));

    var after = document.getElementById('svc-summary-card').textContent;
    return { before, after };
  });
  ok('1. 기존 행 단가를 25,000→80,000으로 직접 고치면 요약카드도 즉시 80,000원으로 갱신됨', r1.after.indexOf('80,000원') !== -1 && r1.before.indexOf('25,000원') !== -1, JSON.stringify(r1));

  // 2) 복제 버튼으로 만든 행을 수정해도 요약카드가 갱신되고, 복제본이
  // 원본의 자동관리 태그를 그대로 물려받지 않는지 확인
  const r2 = await page.evaluate(() => {
    document.getElementById('svc-body').innerHTML = '';
    addSvcRow();
    var tr = document.getElementById('svc-body').lastElementChild;
    tr.querySelector('.svc-kind').value = '시공비';
    tr.querySelector('.svc-content').value = '레일 시공비';
    tr.setAttribute('data-railcost-src', '0');
    var pinp = tr.querySelector('.sprice');
    pinp.value = '25,000'; pinp.setAttribute('data-raw', '25000');
    calcSvcRow(pinp);

    var copyBtn = tr.querySelector('.copy-btn');
    copyBtn.click();
    var clone = tr.nextElementSibling;
    var cloneHasRailCostAttr = clone.hasAttribute('data-railcost-src');

    var clonePinp = clone.querySelector('.sprice');
    clonePinp.value = '80,000'; clonePinp.setAttribute('data-raw', '80000');
    clonePinp.dispatchEvent(new Event('input'));

    var summaryAfter = document.getElementById('svc-summary-card').textContent;
    return { cloneHasRailCostAttr, summaryAfter };
  });
  ok('2. 복제본은 자동관리 태그(data-railcost-src)를 물려받지 않음(원본과 헷갈리지 않음)', r2.cloneHasRailCostAttr === false, JSON.stringify(r2));
  ok('3. 복제본 단가를 수정해도 요약카드가 즉시 갱신됨(25,000+80,000=105,000원)', r2.summaryAfter.indexOf('105,000원') !== -1, r2.summaryAfter);

  // 3) 행 삭제시에도 요약카드가 즉시 갱신되는지
  const r3 = await page.evaluate(() => {
    document.getElementById('svc-body').innerHTML = '';
    addSvcRow(); addSvcRow();
    var rows = document.querySelectorAll('#svc-body tr');
    rows.forEach(function(tr) {
      tr.querySelector('.svc-kind').value = '기타';
      tr.querySelector('.svc-content').value = '테스트항목';
      var pinp = tr.querySelector('.sprice');
      pinp.value = '10,000'; pinp.setAttribute('data-raw', '10000');
      calcSvcRow(pinp);
    });
    var before = document.getElementById('svc-summary-card').textContent;
    document.querySelector('#svc-body tr .del-btn').click();
    var after = document.getElementById('svc-summary-card').textContent;
    return { before, after };
  });
  ok('4. 행 삭제 후에도 요약카드가 즉시 20,000원→10,000원으로 갱신됨', r3.after.indexOf('10,000원') !== -1 && r3.before.indexOf('20,000원') !== -1, JSON.stringify(r3));

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
