// tests/dash-badge-nav-check.js
// 2026-10-29(H-37 3차, 대시보드 폰 화면 직접 확인): 화면 오른쪽 아래 버전 표시(v2026…)가 폰 하단 탭(매출)을 덮어 글자가 겹쳐 보였음.
// 폰(390px)에서는 버전 표시가 하단 탭 막대와 겹치지 않아야 하고(탭 위로 올림), PC에서는 그대로 오른쪽 아래에 있어야 한다.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
(async () => {
  const ROOT = path.resolve(__dirname, '..');
  const server = await startServer(ROOT, 9969); const browser = await launchBrowser();
  for (const [vn, vp] of [['폰 390px', { width: 390, height: 844, isMobile: true, hasTouch: true }], ['PC 1280px', { width: 1280, height: 900 }]]) {
    const page = await browser.newPage(); await page.setViewport(vp); await blockRealNetwork(page);
    await page.goto('http://localhost:9969/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 800)); await loginAs(page, 'master');
    await page.evaluate(() => { saveCustomers([{ clientName: '시험가', phone: '01090000001', addr: '서울', stage: '계약금', staffName: '장선혜', date: '2026-10-01' }]); renderHome(true); });
    await new Promise(r => setTimeout(r, 800));
    const m = await page.evaluate(() => {
      const b = document.getElementById('dah-build-badge'), n = document.getElementById('mob-bottom-nav');
      const br = b.getBoundingClientRect(); const navShown = n && getComputedStyle(n).display !== 'none'; const nr = n.getBoundingClientRect();
      const hit = navShown && !(br.right <= nr.left || br.left >= nr.right || br.bottom <= nr.top || br.top >= nr.bottom);
      return { navShown, hit, badgeBottomGap: Math.round(innerHeight - br.bottom) };
    });
    if (vn.startsWith('폰')) { ok(vn + ' — 하단 탭 막대가 보임', m.navShown); ok(vn + ' — 버전 표시가 하단 탭 막대와 겹치지 않음', !m.hit, JSON.stringify(m)); }
    else ok(vn + ' — PC에서는 버전 표시가 오른쪽 아래 구석에 그대로 있음', m.badgeBottomGap <= 10, JSON.stringify(m));
    await page.close();
  }
  await browser.close(); server.kill && server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 전부 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
