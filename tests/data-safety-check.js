#!/usr/bin/env node
// tests/data-safety-check.js
// 데이터 안전성(삭제/복구, 토큰 자동갱신) 회귀 테스트
//
// 2026-07-15 세션 후반부에 발견/수정한 버그들:
//   1) 로그인 토큰 자동갱신: refreshAuthSessionIfNeeded가 정의만 되고 실제로
//      호출되지 않아서, 로그인 1시간 후부터 저장이 조용히 로컬에만 되던 위험
//   2) 고객 삭제(소프트삭제) 후 복구할 화면상 방법이 전혀 없던 문제
//   3) isArchived(완료+14일경과)와 is_archived(삭제) 이름 충돌로 복구버튼이
//      항상 안 뜨던 문제
//   4) 삭제 직후에도 홈/칸반/캘린더/매출탭에 계속 나타나던 문제
//
// 사용법: node tests/data-safety-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, blockRealNetwork, startServer, loginAs } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node data-safety-check.js <dah-dashboard.html경로>');
    process.exit(1);
  }
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

  try {
    const page = await browser.newPage();
    await blockRealNetwork(page);
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    console.log('\n[데이터 안전성 검사] ' + file);

    // ── 1) 토큰 자동갱신: 만료 임박 세션이 자동으로 갱신되는지 ──
    await page.evaluate(() => {
      localStorage.setItem('dah_auth_session', JSON.stringify({
        access_token: 'old-token', refresh_token: 'old-refresh',
        expires_at: Date.now() + 3 * 60 * 1000, user_id: 'u1'
      }));
    });
    await page.evaluate(() => new Promise((resolve) => { refreshAuthSessionIfNeeded(resolve); }));
    await new Promise(r => setTimeout(r, 300));
    const refreshedToken = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_auth_session')).access_token);
    check('만료 3분전 세션이 refreshAuthSessionIfNeeded 호출시 갱신됨', refreshedToken !== 'old-token', '실제값=' + refreshedToken + ' (여전히 old-token이면 미갱신)');

    const timerRegistered = await page.evaluate(() => typeof _authAutoRefreshTimer !== 'undefined' && _authAutoRefreshTimer !== null);
    check('로그인 상태에서 자동갱신 타이머가 등록되어 있음', timerRegistered, '실제값=' + timerRegistered);

    // ── 2~4) 삭제 → 복구 전체 흐름 + 각 화면 즉시반영 ──
    await page.evaluate(() => {
      saveCustomers([{ clientName: '회귀삭제복구고객', phone: '01099998888', stage: '상담', staffName: '마스터', price: 100000, date: (typeof todayStr === 'function' ? todayStr() : ''), createdAt: new Date().toISOString() }]);
    });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => { openDetail('회귀삭제복구고객'); });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => { deleteCustomer(); });
    await new Promise(r => setTimeout(r, 500));

    const homeHidden = await page.evaluate(() => !document.getElementById('home').textContent.includes('회귀삭제복구고객'));
    check('삭제 직후 홈화면에서 즉시 사라짐', homeHidden, '실제값=' + homeHidden);

    await page.evaluate(() => { goTab('pipe'); });
    await new Promise(r => setTimeout(r, 400));
    const pipeHidden = await page.evaluate(() => !document.getElementById('pipe').textContent.includes('회귀삭제복구고객'));
    check('삭제 직후 칸반화면에서 즉시 사라짐', pipeHidden, '실제값=' + pipeHidden);

    // 검색화면에서 "보관 포함" 체크하면 다시 보이고, 상세화면엔 복구버튼이 뜨는지
    await page.evaluate(() => { goTab('search'); var cb = document.getElementById('show-archived'); if (cb) cb.checked = true; renderSearch(); });
    await new Promise(r => setTimeout(r, 400));
    const visibleWhenArchivedShown = await page.evaluate(() => document.getElementById('search-list').textContent.includes('회귀삭제복구고객'));
    check('보관 포함 체크시 검색화면에 다시 나타남', visibleWhenArchivedShown, '실제값=' + visibleWhenArchivedShown);

    await page.evaluate(() => { openDetail('회귀삭제복구고객'); });
    await new Promise(r => setTimeout(r, 300));
    const restoreBtnVisible = await page.evaluate(() => Array.from(document.querySelectorAll('#detail-body button')).some(b => b.textContent.includes('복구')));
    check('삭제된 고객 상세화면에 복구버튼이 정확히 뜸(이름충돌 없음)', restoreBtnVisible, '실제값=' + restoreBtnVisible);

    await page.evaluate(() => { restoreCustomer('회귀삭제복구고객'); });
    await new Promise(r => setTimeout(r, 500));
    const restoredFlag = await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem('dah_customers') || '[]').find(x => x.clientName === '회귀삭제복구고객');
      return c ? c.is_archived : 'not-found';
    });
    check('복구 버튼 클릭 후 is_archived가 false로 되돌아감', restoredFlag === false, '실제값=' + restoredFlag);

    process.exitCode = failCount === 0 ? 0 : 1;
    await page.close();
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
