// tests/print-hide-check.js
// 2026-09-18(선혜님 - "안되잖아" - 스크린샷으로 인쇄하면 편집화면의
// "제품소계/계약금" 요약 카드가 그 아래 실제 견적서 문서와 이어져서
// 같이 보이던 문제): 그 카드(#lockable-rail-svc)가 유일하게
// .container 밖에 body 바로 아래 있어서, 인쇄시 편집화면을 숨기는
// 규칙(.container{display:none})의 대상이 안 됐음(다른 lockable-*
// 섹션들은 전부 .container 안에 있어서 정상 숨겨짐 - 이 카드만
// 예외였음). 실제 브라우저 print 미디어로 전환해서 확실히 숨겨지는지,
// 그리고 실제 견적서 문서는 정상적으로 보이는지 검증.
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 26600;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co') || url.includes('script.google.com')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.setViewport({ width: 800, height: 1000 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  await page.evaluate(() => {
    document.getElementById('c-name').value = '인쇄테스트고객';
    document.getElementById('c-phone').value = '010-1234-5678';
    document.getElementById('c-addr').value = '서울시 강남구';
    const tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.mw').value = '300'; tr.querySelector('.mh').value = '250';
    tr.querySelector('.cprice').value = '100000';
    calcCurtainRow(tr.querySelector('.cprice'));
  });

  await page.evaluate(() => { printForCustomer(); });
  await new Promise(r => setTimeout(r, 300));

  const beforePrintMedia = await page.evaluate(() => {
    const el = document.getElementById('lockable-rail-svc');
    return { visible: el ? getComputedStyle(el).display !== 'none' : null, bodyClass: document.body.className };
  });
  ok('0. 인쇄 전(화면 모드)에는 계약금 카드가 정상적으로 보임(회귀방지)', beforePrintMedia.visible === true, JSON.stringify(beforePrintMedia));

  // 실제 인쇄 미디어로 전환(브라우저의 "인쇄" 미리보기와 동일한 CSS 적용)
  await page.emulateMediaType('print');
  const afterPrintMedia = await page.evaluate(() => {
    const el = document.getElementById('lockable-rail-svc');
    const cs = el ? getComputedStyle(el) : null;
    return { display: cs ? cs.display : null };
  });
  ok('1. 인쇄 모드로 전환하면 계약금 요약 카드(lockable-rail-svc)가 확실히 숨겨짐', afterPrintMedia.display === 'none', JSON.stringify(afterPrintMedia));

  const pvOverlayVisible = await page.evaluate(() => {
    const ov = document.getElementById('pv-overlay');
    return ov ? getComputedStyle(ov).display : null;
  });
  ok('2. 인쇄 모드에서도 실제 견적서 문서(pv-overlay)는 정상적으로 보임', pvOverlayVisible !== 'none', pvOverlayVisible);

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
