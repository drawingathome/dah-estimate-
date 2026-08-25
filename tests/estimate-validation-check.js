#!/usr/bin/env node
// tests/estimate-validation-check.js
// 2026-07-19 발견: 커튼/블라인드 여러 행 중 "일부만" 단가를 빼먹어도 검증을
// 통과해서(hasProduct가 "1개라도 있으면 OK"였음) 그 항목만 0원으로 조용히
// 저장되던 버그. 처음엔 품목 1개짜리로만 테스트해서 못 잡았고, 실제 사용
// 패턴(여러 항목)으로 재현하고 나서야 발견함.
//
// 이 테스트는 "여러 행 중 일부만 값이 빠진 경우"를 항상 재현해서, 다시는
// 이런 종류의 버그가 조용히 통과되지 않도록 고정한다.
//
// 사용법: node tests/estimate-validation-check.js dah-estimate.html

const path = require('path');
const { launchBrowser, blockRealNetwork, startServer, setupValidSession } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node estimate-validation-check.js <dah-estimate.html경로>');
    process.exit(1);
  }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9901 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let failCount = 0;
  function check(label, condition, detail) {
    if (condition) { console.log(`  ✅ ${label}`); }
    else { console.log(`  ❌ ${label} — ${detail}`); failCount++; }
  }

  async function testOnDevice(vw, label) {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await blockRealNetwork(page);
    await page.setViewport({ width: vw, height: 1200, isMobile: vw < 500, hasTouch: vw < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate(() => { localStorage.removeItem('dah_saved'); });
    await new Promise(r => setTimeout(r, 1000));

    console.log('\n[견적서 다중행 검증 회귀 검사] ' + file + ' @ ' + label);

    // ── 케이스 1: 커튼 3행 중 마지막 1행만 단가 누락 → 저장이 막혀야 함 ──
    await page.evaluate(() => { document.getElementById('c-name').value = '회귀검증고객'; });
    await page.evaluate(() => { addCurtainRow(); addCurtainRow(); });
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#curtain-body tr');
      for (let i = 0; i < rows.length - 1; i++) {
        rows[i].querySelector('.mw').value = '200'; rows[i].querySelector('.mw').dispatchEvent(new Event('input'));
        rows[i].querySelector('.mh').value = '230'; rows[i].querySelector('.mh').dispatchEvent(new Event('input'));
        rows[i].querySelector('.cprice').value = '50000'; rows[i].querySelector('.cprice').dispatchEvent(new Event('input'));
      }
      const last = rows[rows.length - 1];
      last.querySelector('.mw').value = '150'; last.querySelector('.mw').dispatchEvent(new Event('input'));
      last.querySelector('.mh').value = '200'; last.querySelector('.mh').dispatchEvent(new Event('input'));
      // 마지막 행 단가는 의도적으로 비워둠
    });
    await page.evaluate(() => { document.querySelector('.btn-save').click(); });
    await new Promise(r => setTimeout(r, 400));

    const blockedResult = await page.evaluate(() => {
      const toast = document.getElementById('toast')?.textContent || '';
      let savedCount = 0;
      try { savedCount = JSON.parse(localStorage.getItem('dah_saved') || '[]').length; } catch (e) {}
      return { toast, savedCount };
    });
    check(
      '[' + label + '] 일부 행 단가 누락시 저장이 차단됨(조용히 0원 저장 금지)',
      blockedResult.savedCount === 0,
      `저장개수=${blockedResult.savedCount} (0이어야 함) / 토스트="${blockedResult.toast}"`
    );
    check(
      '[' + label + '] 어느 행이 문제인지 메시지에 명시됨',
      blockedResult.toast.includes('3번째'),
      `실제 토스트="${blockedResult.toast}" — "N번째" 형식으로 특정 안 됨`
    );

    // ── 케이스 2: 마지막 행 단가까지 채우면 정상 저장되어야 함 ──
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#curtain-body tr');
      const last = rows[rows.length - 1];
      last.querySelector('.cprice').value = '30000';
      last.querySelector('.cprice').dispatchEvent(new Event('input'));
    });
    await setupValidSession(page);
    await page.evaluate(() => { document.querySelector('.btn-save').click(); });
    await new Promise(r => setTimeout(r, 400));
    const okResult = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('dah_saved') || '[]').length; } catch (e) { return -1; }
    });
    check('모든 행에 단가를 채우면 정상 저장됨(과잉차단 아님)', okResult === 1, `실제 저장개수=${okResult} (1이어야 함)`);

    await page.close();
  }

  try {
    await testOnDevice(1280, 'PC');
    await testOnDevice(390, '모바일');
    process.exitCode = failCount === 0 ? 0 : 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
