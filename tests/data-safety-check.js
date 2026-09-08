#!/usr/bin/env node
// tests/data-safety-check.js
// 데이터 안전성(삭제/복구, 토큰 자동갱신) 회귀 테스트
// 2026-07-21: 모바일 케이스 추가 (예전엔 PC만 검사)
// 사용법: node tests/data-safety-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, blockRealNetwork, startServer, loginAs } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node data-safety-check.js <dah-dashboard.html경로>'); process.exit(1); }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9701 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let failCount = 0;
  function check(label, condition, detail) {
    if (condition) { console.log(`  ✅ ${label}`); }
    else { console.log(`  ❌ ${label} — ${detail}`); failCount++; }
  }

  console.log('\n[데이터 안전성 검사] ' + file);

  async function testOnDevice(width, label) {
    const page = await browser.newPage();
    await blockRealNetwork(page);
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await page.setViewport({ width, height: 900, isMobile: width < 500, hasTouch: width < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    await page.evaluate(() => {
      localStorage.setItem('dah_auth_session', JSON.stringify({
        access_token: 'old-token', refresh_token: 'old-refresh',
        expires_at: Date.now() + 3 * 60 * 1000, user_id: 'u1'
      }));
    });
    await page.evaluate(() => new Promise((resolve) => { refreshAuthSessionIfNeeded(resolve); }));
    await new Promise(r => setTimeout(r, 300));
    const refreshedToken = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_auth_session')).access_token);
    check(`[${label}] 만료 3분전 세션이 자동갱신됨`, refreshedToken !== 'old-token', '실제값=' + refreshedToken);

    const timerRegistered = await page.evaluate(() => typeof _authAutoRefreshTimer !== 'undefined' && _authAutoRefreshTimer !== null);
    check(`[${label}] 자동갱신 타이머가 등록되어 있음`, timerRegistered, '실제값=' + timerRegistered);

    const custName = '회귀삭제복구고객' + label;
    // 2026-08-28(선혜님 지시 - "삭제하면 보관처리 하지마"): deleteCustomer가
    // permanentlyDeleteCustomer를 재사용하게 되면서 confirm 외에
    // prompt(고객명 정확히 입력)도 추가로 뜨게 됨 - 빈 값으로 accept하면
    // 이름이 안 맞아 삭제 자체가 취소되므로, prompt엔 정확한 이름을 넣어줌.
    page.removeAllListeners('dialog');
    page.on('dialog', async d => {
      try { await d.accept(d.type() === 'prompt' ? custName : ''); } catch (e) {}
    });

    await page.evaluate((name) => {
      saveCustomers([{ clientName: name, phone: '01099998888', stage: '상담', staffName: '마스터', price: 100000, date: (typeof todayStr === 'function' ? todayStr() : ''), createdAt: new Date().toISOString() }]);
    }, custName);
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((name) => { openDetail(name); }, custName);
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => { deleteCustomer(); });
    await new Promise(r => setTimeout(r, 1500));

    const homeHidden = await page.evaluate((name) => !document.getElementById('home').textContent.includes(name), custName);
    check(`[${label}] 삭제 직후 홈화면에서 즉시 사라짐`, homeHidden, '실제값=' + homeHidden);

    await page.evaluate(() => { goTab('pipe'); });
    await new Promise(r => setTimeout(r, 400));
    const pipeHidden = await page.evaluate((name) => !document.getElementById('pipe').textContent.includes(name), custName);
    check(`[${label}] 삭제 직후 칸반화면에서 즉시 사라짐`, pipeHidden, '실제값=' + pipeHidden);

    // 2026-08-28: 예전엔 "삭제=보관"이라 "보관 포함" 체크시 검색화면에 다시
    // 나타나고, 복구 버튼으로 되돌릴 수 있었음. 이제 삭제=완전삭제라서,
    // 완전히 지워졌으므로 "보관 포함"을 체크해도 더 이상 나타나면 안 됨
    // (나타난다면 오히려 진짜 삭제가 안 된 것이므로 버그).
    await page.evaluate(() => { goTab('search'); var cb = document.getElementById('show-archived'); if (cb) cb.checked = true; renderSearch(); });
    await new Promise(r => setTimeout(r, 400));
    const goneEvenWithArchivedShown = await page.evaluate((name) => !document.getElementById('search-list').textContent.includes(name), custName);
    check(`[${label}] 완전삭제 후엔 보관 포함 체크해도 나타나지 않음(진짜 삭제됨)`, goneEvenWithArchivedShown, '실제값=' + goneEvenWithArchivedShown);

    await page.close();
  }

  try {
    await testOnDevice(390, '모바일');
    await testOnDevice(1400, 'PC');
    process.exitCode = failCount === 0 ? 0 : 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
