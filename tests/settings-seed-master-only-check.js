// tests/settings-seed-master-only-check.js
// 2026-10-25 전수표 T-04: 서버 설정표에 없는 항목을 "이 기기 값으로 최초 올리기"는 마스터 화면에서만 시도(실장 화면은 건드리지 않음)
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function runAs(role) {
  const dir = path.resolve(__dirname, '..');
  const port = role === 'master' ? 9936 : 9937;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, role);
  const out = await page.evaluate(async () => {
    var posted = [];
    window.sbSyncSetting = function (k) { posted.push(k); };
    window.getAuthSession = function () { return { access_token: 'x' }; };
    window.sbXHR = function (m, p, d, cb) { if (m === 'GET' && p.indexOf('app_settings') === 0) { cb(null, [{ key: 'unrelated', value: 1 }]); return; } cb(null, []); };
    localStorage.setItem('dah_webhook_url', 'https://example.test/hook');
    localStorage.setItem('dah_staff_list', JSON.stringify(['시험실장']));
    await new Promise(r => loadAppSettingsAsync(r));
    return { posted: posted, master: isMasterUser() };
  });
  await browser.close(); server.kill();
  return { out, errs };
}
(async () => {
  const log = [];
  const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (d !== undefined ? ' — ' + d : ''));
  const m = await runAs('master');
  ok('1. 마스터 화면: 서버에 없는 설정을 최초 1회 올림', m.out.master && m.out.posted.indexOf('webhook_url') >= 0 && m.out.posted.indexOf('staff_list') >= 0, JSON.stringify(m.out));
  const s = await runAs('staff');
  ok('2. 실장 화면: 설정표에 아무것도 올리지 않음', !s.out.master && s.out.posted.length === 0, JSON.stringify(s.out));
  ok('3. JS 에러 없음', m.errs.length === 0 && s.errs.length === 0, m.errs.concat(s.errs).join(';'));
  log.forEach(l => console.log(l));
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 90000);
