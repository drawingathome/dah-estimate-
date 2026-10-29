// 2026-10-18: 대시보드를 열어 둔 채 새 버전이 배포되면(코드가 옛 버전인 화면) 위쪽에 "새 버전" 안내가 뜨는지 검증
// 배경: 옛 코드 화면에서는 이미 고친 문제(입금·확정 저장 누락 등)가 그 화면에서만 계속 재현됨(시험러 입금 사례 조사 중 발견: 견적서 앱에만 안내가 있었음).
const path = require('path');
const fs = require('fs');
const { launchBrowser, startServer } = require('./_helpers');
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const dir = path.resolve(__dirname, '..');
  const server = await startServer(dir, 27163);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.setRequestInterception(true);
    let mode = 'same';
    let navigated = false;
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('supabase.co')) {
        const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' };
        if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: h }); return; }
        req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' }); return;
      }
      if (navigated && req.resourceType() === 'fetch' && /dah-dashboard(\.html)?$/.test(new URL(url).pathname)) {
        if (mode === 'fail') { req.respond({ status: 500, body: 'x' }); return; }
        let html = fs.readFileSync(path.join(dir, 'dah-dashboard.html'), 'utf8');
        if (mode === 'newer') html = html.replace(/(dash-auth\.js\?v=)[a-z0-9]+/, '$1ffffffffffff');
        if (mode === 'extra') html = html.replace('</body>', '<script src="/brand-new-file.js?v=aaaaaaaaaaaa"></script></body>');
        req.respond({ status: 200, contentType: 'text/html', body: html }); return;
      }
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
    });
    await page.goto('http://localhost:27163/dah-dashboard.html', { waitUntil: 'load', timeout: 20000 });
    navigated = true;
    await new Promise(r => setTimeout(r, 800));
    const wake = async () => { await page.evaluate(() => { _dashCodeStaleLastCheck = 0; document.dispatchEvent(new Event('visibilitychange')); }); await new Promise(r => setTimeout(r, 700)); };
    const bannerCount = () => page.evaluate(() => document.querySelectorAll('#dash-code-stale-banner').length);

    mode = 'same'; await wake();
    ok(await page.evaluate(() => Object.keys(_dashRunningScriptVersions || {}).length > 20), '실행 중인 스크립트 버전 목록을 읽음(페이지가 다 열린 뒤)');
    ok(await bannerCount() === 0, '서버 버전이 같으면 안내 없음');
    mode = 'fail'; await wake();
    ok(await bannerCount() === 0, '서버 조회가 실패해도 조용히 넘어감');
    mode = 'extra'; await wake();
    ok(await bannerCount() === 0, '새로 생긴 파일만 있고 기존 파일 버전이 같으면 안내 없음(오탐 방지)');
    mode = 'newer'; await wake();
    ok(await bannerCount() === 1, '서버의 스크립트 버전이 다르면 "새 버전" 안내가 뜸');
    ok(!!(await page.$('#dash-code-stale-reload')), '"새로고침" 버튼이 있음');
    ok((await page.evaluate(() => window._dashCodeStaleDiff)).includes('/dash-auth.js'), '어느 파일이 바뀌었는지 기록함');
    await wake();
    ok(await bannerCount() === 1, '이미 안내가 있으면 중복으로 만들지 않음');
    await page.evaluate(() => document.getElementById('dash-code-stale-close').click());
    ok(await bannerCount() === 0, '닫기를 누르면 사라짐');
    ok(await page.evaluate(() => JSON.stringify(dashFindStaleScripts({ '/a.js': '1', '/b.js': '2' }, { '/a.js': '1', '/b.js': '3', '/c.js': '9' })) === '["/b.js"]'), '비교 함수: 달라진 파일만 골라냄');
    ok(errs.length === 0, 'JS 오류 없음 ' + errs.join('|'));
  } catch (e) { console.log('❌ 예외', e.message); fail++; }
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})();
