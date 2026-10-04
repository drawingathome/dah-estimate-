const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9936;
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

  // 시나리오: 수동으로 추가한 "기타" 구분 행의 드롭다운을 나중에 "시공비"로
  // 바꾼 경우(data-svc-type 속성은 없음, 드롭다운 실시간 값만 "시공비") -
  // 예전엔 renderSvcSummary는 정확히 잡고 est-doc-customer.js는 놓쳤을 케이스
  const r1 = await page.evaluate(() => {
    document.getElementById('svc-body').innerHTML = '';
    addSvcRow();
    var tr = document.getElementById('svc-body').lastElementChild;
    tr.querySelector('.svc-kind').value = '기타'; // 처음엔 기타로 시작(data-svc-type 없음)
    tr.querySelector('.svc-content').value = '수동추가 시공비';
    var pinp = tr.querySelector('.sprice');
    pinp.value = '30,000'; pinp.setAttribute('data-raw', '30000');
    calcSvcRow(pinp);
    // 나중에 드롭다운만 "시공비"로 변경(data-svc-type 속성은 여전히 없음)
    tr.querySelector('.svc-kind').value = '시공비';
    renderSvcSummary();

    var internalGroup = (typeof categorizeSvcRow === 'function') ? categorizeSvcRow(tr) : null;
    var summaryText = document.getElementById('svc-summary-card').textContent;
    return { internalGroup, summaryText };
  });
  ok('1. 드롭다운을 나중에 "시공비"로 바꾼 수동행이 실측+시공비 그룹으로 정확히 잡힘', r1.internalGroup === 'measureInstall', JSON.stringify(r1));
  ok('2. 내부 요약카드에 "실측 + 시공비 30,000원"으로 정확히 반영됨', r1.summaryText.indexOf('실측 + 시공비') !== -1 && r1.summaryText.indexOf('30,000원') !== -1, r1.summaryText);

  // 부자재/블라인드시공 행도 내부 요약에서 "옵션 추가금"(motor) 그룹으로 잡히는지 확인
  // (예전 renderSvcSummary는 이 두 케이스를 아예 몰라서 전부 "기타"로 잘못 묶였음)
  const r2 = await page.evaluate(() => {
    document.getElementById('svc-body').innerHTML = '';
    addSvcRow();
    var tr = document.getElementById('svc-body').lastElementChild;
    tr.querySelector('.svc-kind').value = '부자재';
    tr.querySelector('.svc-content').value = '고리 추가';
    var pinp = tr.querySelector('.sprice');
    pinp.value = '15,000'; pinp.setAttribute('data-raw', '15000');
    calcSvcRow(pinp);
    return { group: categorizeSvcRow(tr) };
  });
  ok('3. "부자재" 구분 행이 내부 요약에서도 옵션추가금(motor) 그룹으로 정확히 잡힘(예전엔 기타로 잘못 묶였음)', r2.group === 'motor', JSON.stringify(r2));

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
