// tests/integrity-auto-note-check.js
// 2026-10-14: 매일 자동 점검 기록(integrity_daily_log)을 점검 카드에 보여주고, 36시간 넘게 기록이 없으면 "멈췄을 수 있어요"를 경고하는지 검증.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 50000);
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 27149;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await blockRealNetwork(page);
    await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 600));
    await loginAs(page, 'master');
    const r = await page.evaluate(async () => {
      const out = { calls: [] };
      let logRows = [];
      let logFail = false;
      window.sbXHR = function (m, p, d, cb) {
        out.calls.push(m + ' ' + p.split('?')[0]);
        if (m === 'GET' && p.indexOf('data_integrity_issues') === 0) return cb(null, []);
        if (m === 'GET' && p.indexOf('integrity_acks') === 0) return cb(null, []);
        if (m === 'GET' && p.indexOf('integrity_daily_log') === 0) return logFail ? cb({ status: 500 }, null) : cb(null, logRows);
        cb(null, []);
      };
      const note = () => { const n = document.querySelector('#integrity-banner .integrity-auto'); return n ? n.textContent : ''; };
      // 1) 최근 기록
      logRows = [{ run_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), total_count: 2 }];
      renderIntegrityBanner(true); out.fresh = note();
      // 2) 이틀 전 기록 → 경고
      logRows = [{ run_at: new Date(Date.now() - 50 * 3600 * 1000).toISOString(), total_count: 2 }];
      renderIntegrityBanner(true); out.stale = note();
      // 3) 기록 없음 → 경고
      logRows = [];
      renderIntegrityBanner(true); out.none = note();
      // 4) 기록 조회 실패 → 점검 카드는 그대로, 자동 점검 줄만 없음
      logFail = true;
      renderIntegrityBanner(true); out.failNote = note(); out.bannerStill = !!document.getElementById('integrity-banner');
      // 5) 실장은 기록을 조회하지 않음
      logFail = false; out.calls.length = 0;
      const saved = currentUser; currentUser = { role: 'staff', name: '실장' };
      renderIntegrityBanner(true); out.staffNote = note(); out.staffQueried = out.calls.some(c => /integrity_daily_log/.test(c));
      currentUser = saved;
      return out;
    });
    ok(/자동 점검 \d\d:\d\d · 2건/.test(r.fresh) && !/멈췄/.test(r.fresh), '최근 기록이면 "자동 점검 시각 · 건수"만 작게 표시: ' + r.fresh);
    ok(/멈췄을 수 있어요/.test(r.stale), '36시간 넘게 기록이 없으면 멈춤 경고: ' + r.stale);
    ok(/멈췄을 수 있어요/.test(r.none) && /기록 없음/.test(r.none), '기록이 하나도 없어도 경고: ' + r.none);
    ok(r.failNote === '' && r.bannerStill, '기록 조회 실패 시 점검 카드는 유지되고 자동 점검 줄만 생략');
    ok(r.staffNote === '' && !r.staffQueried, '실장 화면에는 자동 점검 기록을 조회하지도 표시하지도 않음');
    ok(errs.length === 0, 'JS 오류 없음 ' + errs.join('|'));
  } catch (e) { console.log('❌ 예외', e.message); fail++; }
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})();
