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

  // 최금희 실사례 완전 재현: 서울 선택 -> 시공비 칸에 실수로 실측비 금액 입력
  // -> 지역 토글 -> 여전히 잘못된 값이 남아있지만 이제는 눈에 띄어야 함
  const r1 = await page.evaluate(() => {
    var regionSel = document.getElementById('c-region');
    regionSel.value = '서울';
    regionSel.dispatchEvent(new Event('change'));

    var rows = Array.from(document.querySelectorAll('#svc-body tr'));
    var 시공비행 = rows.find(function(tr){ return tr.getAttribute('data-svc-type') === '시공비'; });
    var pinp = 시공비행.querySelector('.sprice');
    pinp.value = '40,000';
    pinp.setAttribute('data-raw', '40000');
    pinp.dispatchEvent(new Event('input'));

    return {
      content: 시공비행.querySelector('.svc-content').value,
      bgColor: pinp.style.background,
      borderColor: pinp.style.borderColor
    };
  });
  ok('1. 시공비 칸을 실수로 잘못 고치면 내용에 "✏️직접수정" 표시가 붙음', r1.content.indexOf('✏️직접수정') !== -1, JSON.stringify(r1));
  ok('2. 단가 입력창 배경/테두리 색이 눈에 띄게 바뀜(자동계산값과 구분됨)', r1.bgColor.indexOf('255, 243, 224') !== -1 || r1.bgColor === 'rgb(255, 243, 224)', JSON.stringify(r1));

  // 대조군: 부자재/기타처럼 원래 자유 입력인 항목은 이 표시가 안 붙어야 함(과잉 표시 방지)
  const r2 = await page.evaluate(() => {
    document.getElementById('svc-body').innerHTML = '';
    addSvcRow();
    var tr = document.getElementById('svc-body').lastElementChild;
    tr.querySelector('.svc-kind').value = '기타';
    tr.querySelector('.svc-content').value = '별도추가옵션';
    var pinp = tr.querySelector('.sprice');
    pinp.value = '10,000'; pinp.setAttribute('data-raw', '10000');
    pinp.dispatchEvent(new Event('input'));
    return { content: tr.querySelector('.svc-content').value };
  });
  ok('3. 원래 자유입력 항목(기타 등)은 표시가 안 붙음(과잉 표시 방지)', r2.content.indexOf('✏️직접수정') === -1, JSON.stringify(r2));

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
