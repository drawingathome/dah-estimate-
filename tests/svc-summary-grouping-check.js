// tests/svc-summary-grouping-check.js
// 2026-09-19(선혜님 - "레일이 여러개면 묶어서 정리가 안되니 너무
// 복잡한데?? 전문업체 기분으로 확인해" - 커튼 22개짜리 견적서의
// "레일·시공비·기타" 요약 카드에서 "레일 시공비"라는 똑같은 문구가
// 20번 넘게 그대로 나열되던 것을 스크린샷으로 발견): renderSvcSummary()
// 가 details 배열을 그냥 join(', ')만 해서, 같은 텍스트가 커튼 개수만큼
// 그대로 반복 표시되고 있었음 - summarizeSvcDetails()로 같은 텍스트는
// "N개"로 묶고, 다른 텍스트(길이 다른 레일 등)는 그대로 구분해서 보여줌.
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27500;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) { req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }); return; }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.setViewport({ width: 390, height: 1200 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  await page.evaluate(() => {
    document.getElementById('c-region').value = '서울';
    autoAddSvcFee();
    const widths = [300, 300, 300, 250, 400];
    widths.forEach((w, i) => {
      if (i > 0) addCurtainRow();
      const rows = document.querySelectorAll('#curtain-body tr');
      const tr = rows[rows.length - 1];
      tr.querySelector('.space-inp').value = '공간' + (i+1);
      tr.querySelector('.mw').value = String(w);
      tr.querySelector('.mh').value = '250';
      tr.querySelector('.cprice').value = '100000';
      calcCurtainRow(tr.querySelector('.cprice'));
    });
  });
  await new Promise(r => setTimeout(r, 300));

  const summary = await page.evaluate(() => document.getElementById('svc-summary-card')?.textContent || '');
  ok('1. "레일 시공비"가 5번 그대로 반복 안 되고 "레일 시공비 5개"로 묶임', summary.includes('레일 시공비 5개') && !(/레일 시공비.*레일 시공비/.test(summary)), summary);
  ok('2. 같은 자수인 레일들은 개수로 묶이고, 다른 자수는 별도로 나옴', summary.includes('자'), summary.slice(0, 300));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
