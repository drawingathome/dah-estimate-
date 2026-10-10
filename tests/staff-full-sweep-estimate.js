#!/usr/bin/env node
// tests/staff-full-sweep-estimate.js
// 견적서 앱(dah-estimate.html)을 스태프 로그인 상태로 PC/모바일에서 훑어보며
// 콘솔에러/가로스크롤/PDF 모달 등 기본 흐름에 문제가 없는지 점검.
const { launchBrowser, blockRealNetwork, startServer, setupValidSession } = require('./_helpers');

async function sweep(width, label) {
  const port = width < 500 ? 8941 : 8942;
  const server = await startServer(__dirname + '/..', port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));
  await blockRealNetwork(page);
  await page.setViewport({ width, height: 900, isMobile: width < 500, hasTouch: width < 500 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 500));

  const findings = [];

  // 로그인 게이트 우회 - 유효 세션 주입 (실제 로그인 플로우 대신, 저장/문서 기능 접근 위해)
  await setupValidSession(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  const scroll1 = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  if (scroll1.w > scroll1.c + 2) findings.push(`[${label}] 초기화면 가로스크롤 (scrollWidth=${scroll1.w} > clientWidth=${scroll1.c})`);

  // 담당자 필드 입력 후 커튼 항목 추가 시도
  await page.evaluate(() => {
    const nameEl = document.getElementById('c-name');
    const staffEl = document.getElementById('c-staff');
    if (nameEl) nameEl.value = '_스윕테스트고객';
    if (staffEl && !staffEl.value) staffEl.value = '_실장A';
  });

  // PDF 모달 열기 시도
  const pdfModalCheck = await page.evaluate(() => {
    if (typeof openPdfModal === 'function') {
      try { openPdfModal(); } catch (e) { return { error: e.message }; }
    } else {
      return { missing: true };
    }
    const modal = document.getElementById('pdf-size-modal');
    return { opened: !!modal && modal.classList.contains('open') };
  });
  if (pdfModalCheck.missing) findings.push(`[${label}] openPdfModal 함수 자체가 없음`);
  if (pdfModalCheck.error) findings.push(`[${label}] openPdfModal 호출 중 에러: ${pdfModalCheck.error}`);
  if (pdfModalCheck.opened === false) findings.push(`[${label}] openPdfModal 호출했는데 모달이 open 상태가 안 됨`);

  await page.evaluate(() => { if (typeof closePdfModal === 'function') closePdfModal(); });

  const scroll2 = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  if (scroll2.w > scroll2.c + 2) findings.push(`[${label}] 입력 후 화면 가로스크롤 (scrollWidth=${scroll2.w} > clientWidth=${scroll2.c})`);

  await page.screenshot({ path: `/tmp/dah-repo/tests/_shot_est_${label}.png` }).catch(() => {});

  if (consoleErrors.length) {
    const realErrors = consoleErrors.filter(e =>
      !/Failed to load resource/.test(e) &&
      !/net::ERR_FAILED/.test(e) &&
      !/the server responded with a status of 4\d\d/.test(e)
    );
    if (realErrors.length) findings.push(`[${label}] 콘솔 에러 ${realErrors.length}건: ` + realErrors.slice(0, 8).join(' | '));
  }

  await browser.close();
  server.kill();
  return findings;
}

(async () => {
  const all = [];
  all.push(...await sweep(390, '모바일390'));
  all.push(...await sweep(1400, 'PC1400'));

  console.log('\n========================================');
  if (all.length === 0) {
    console.log('✅ 견적서 앱 실장 탐색 — 발견된 문제 없음 (PC 1400px + 모바일 390px)');
  } else {
    console.log('🔴 발견된 문제 ' + all.length + '건:');
    all.forEach(f => console.log('  - ' + f));
  }
  console.log('========================================');
  process.exit(all.length ? 1 : 0);
})();
