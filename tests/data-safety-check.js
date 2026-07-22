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

    await page.evaluate((suffix) => {
      saveCustomers([{ clientName: '회귀삭제복구고객' + suffix, phone: '01099998888', stage: '상담', staffName: '마스터', price: 100000, date: (typeof todayStr === 'function' ? todayStr() : ''), createdAt: new Date().toISOString() }]);
    }, label);
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((suffix) => { openDetail('회귀삭제복구고객' + suffix); }, label);
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => { deleteCustomer(); });
    await new Promise(r => setTimeout(r, 500));

    const homeHidden = await page.evaluate((suffix) => !document.getElementById('home').textContent.includes('회귀삭제복구고객' + suffix), label);
    check(`[${label}] 삭제 직후 홈화면에서 즉시 사라짐`, homeHidden, '실제값=' + homeHidden);

    await page.evaluate(() => { goTab('pipe'); });
    await new Promise(r => setTimeout(r, 400));
    const pipeHidden = await page.evaluate((suffix) => !document.getElementById('pipe').textContent.includes('회귀삭제복구고객' + suffix), label);
    check(`[${label}] 삭제 직후 칸반화면에서 즉시 사라짐`, pipeHidden, '실제값=' + pipeHidden);

    await page.evaluate(() => { goTab('search'); var cb = document.getElementById('show-archived'); if (cb) cb.checked = true; renderSearch(); });
    await new Promise(r => setTimeout(r, 400));
    const visibleWhenArchivedShown = await page.evaluate((suffix) => document.getElementById('search-list').textContent.includes('회귀삭제복구고객' + suffix), label);
    check(`[${label}] 보관 포함 체크시 검색화면에 다시 나타남`, visibleWhenArchivedShown, '실제값=' + visibleWhenArchivedShown);

    await page.evaluate((suffix) => { openDetail('회귀삭제복구고객' + suffix); }, label);
    await new Promise(r => setTimeout(r, 300));
    const restoreBtnVisible = await page.evaluate(() => Array.from(document.querySelectorAll('#detail-body button')).some(b => b.textContent.includes('복구')));
    check(`[${label}] 삭제된 고객 상세화면에 복구버튼이 정확히 뜸`, restoreBtnVisible, '실제값=' + restoreBtnVisible);

    await page.evaluate((suffix) => { restoreCustomer('회귀삭제복구고객' + suffix); }, label);
    await new Promise(r => setTimeout(r, 500));
    const restoredFlag = await page.evaluate((suffix) => {
      const c = JSON.parse(localStorage.getItem('dah_customers') || '[]').find(x => x.clientName === '회귀삭제복구고객' + suffix);
      return c ? c.is_archived : 'not-found';
    }, label);
    check(`[${label}] 복구 버튼 클릭 후 is_archived가 false로 되돌아감`, restoredFlag === false, '실제값=' + restoredFlag);

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
