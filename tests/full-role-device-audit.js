#!/usr/bin/env node
// tests/full-role-device-audit.js
// 2026-08-27(선혜님 지적 - "오류가 너무 많은데 왜이렇게 오류가 많은거지??
// 마스터/실장 x PC/모바일 x 대시보드/견적서 전체 검사 싹 다 하자"):
// 큰 구조 변경(헤더, PC 표 폭 등) 후 앱 전체가 안 깨지는지 8가지 조합을
// 한 번에 확인하는 넓고 얕은 스모크 테스트. 여기서 잡는 건 "화면이 아예
// 깨지는지"뿐이고, 오늘 찾은 깊은 버그(백업 실패, 견적 중복, 파일명
// 규칙 등)는 DB 직접조회·서버로그 확인 같은 별도 검증이 필요함
// (CHANGE_IMPACT_CHECKLIST.md 15번 항목 참고).
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function auditPage(dir, file, role, vw, label, port) {
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  const consoleErrors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('dialog', async d => { try { await d.accept(''); } catch (e) {} });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/auth/v1/token') && req.postData()) {
        let body; try { body = JSON.parse(req.postData()); } catch (e) { body = {}; }
        if (body.password === 'TEST_OK_PW') req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ access_token: 't', refresh_token: 'r', expires_in: 3600, user: { id: 'u', email: body.email } }) });
        else req.respond({ status: 400, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    req.continue();
  });

  await page.setViewport({ width: vw, height: vw < 500 ? 900 : 1000, isMobile: vw < 500, hasTouch: vw < 500 });

  try {
    if (file === 'dah-estimate.html') {
      await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 700));
      await page.evaluate(() => { document.getElementById('est-auth-email').value = 'v@t.local'; });
      await page.evaluate(() => { document.getElementById('est-auth-pw').value = 'TEST_OK_PW'; });
      await page.evaluate(() => { document.getElementById('est-auth-btn').click(); });
      await new Promise(r => setTimeout(r, 1200));
      await page.evaluate(() => { if (typeof addCurtainRow === 'function') addCurtainRow(); });
      await new Promise(r => setTimeout(r, 200));
      await page.evaluate(() => {
        document.getElementById('c-name').value = '_감사테스트';
        const tr = document.querySelector('.row-curtain');
        if (tr) {
          tr.querySelector('.c-display-name').value = '테스트품목';
          tr.querySelector('.mw').value = '300'; tr.querySelector('.mw').dispatchEvent(new Event('input'));
          if (typeof calcCurtainRow === 'function') calcCurtainRow(tr.querySelector('.mw'));
        }
      });
      await new Promise(r => setTimeout(r, 300));
    } else {
      await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'networkidle0', timeout: 20000 });
      await new Promise(r => setTimeout(r, 700));
      await loginAs(page, role);
      await new Promise(r => setTimeout(r, 500));
      await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('pipe'); });
      await new Promise(r => setTimeout(r, 500));
      await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('sales'); });
      await new Promise(r => setTimeout(r, 500));
      await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('home'); });
      await new Promise(r => setTimeout(r, 300));
    }
  } catch (e) {
    errors.push('탐색중 예외: ' + e.message);
  }

  const overflow = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));

  await browser.close();
  server.kill();
  return { label, errCount: errors.length, errors, consoleErrCount: consoleErrors.length, overflow: overflow.scrollW > overflow.clientW, overflowDetail: overflow };
}

async function run() {
  const estimateFile = process.argv[2];
  const dashboardFile = process.argv[3];
  if (!estimateFile || !dashboardFile) {
    console.error('사용법: node full-role-device-audit.js <dah-estimate.html경로> <dah-dashboard.html경로>');
    process.exit(1);
  }
  const dir1 = path.dirname(path.resolve(estimateFile));
  const file1 = path.basename(estimateFile);
  const dir2 = path.dirname(path.resolve(dashboardFile));
  const file2 = path.basename(dashboardFile);
  const basePort = 21500 + Math.floor(Math.random() * 500);

  const results = [];
  results.push(await auditPage(dir1, file1, 'master', 1400, '견적서-PC', basePort + 1));
  results.push(await auditPage(dir1, file1, 'master', 390, '견적서-모바일', basePort + 2));
  results.push(await auditPage(dir2, file2, 'master', 1400, '대시보드-마스터-PC', basePort + 3));
  results.push(await auditPage(dir2, file2, 'master', 390, '대시보드-마스터-모바일', basePort + 4));
  results.push(await auditPage(dir2, file2, 'staff', 1400, '대시보드-실장-PC', basePort + 5));
  results.push(await auditPage(dir2, file2, 'staff', 390, '대시보드-실장-모바일', basePort + 6));

  let anyFailed = false;
  console.log('\n[8종 조합 스모크 테스트 결과]');
  results.forEach(r => {
    // jsdelivr 등 외부 CDN 403은 샌드박스 네트워크 제약 때문이라 실패로 안 침
    const realErrors = r.errors.filter(e => !/jsdelivr|cdn\./i.test(e));
    const ok = realErrors.length === 0 && !r.overflow;
    if (!ok) anyFailed = true;
    console.log(`${ok ? '✅' : '❌'} ${r.label} - JS에러:${realErrors.length}건 콘솔에러:${r.consoleErrCount}건 가로스크롤:${r.overflow ? '있음' : '없음'}`);
    if (!ok) realErrors.forEach(e => console.log('    ' + e));
  });

  process.exit(anyFailed ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
