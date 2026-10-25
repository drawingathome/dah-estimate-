// tests/restore-customer-failure-check.js
// 2026-10-25 전수표 T-14: 고객 복구가 서버에 저장 안 됐는데 "복구됐습니다"로 알리거나, 대상을 못 찾았을 때 이름만으로 서버에 보내면 안 됨
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9935;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  const log = [];
  const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (d !== undefined ? ' — ' + d : ''));

  const out = await page.evaluate(async () => {
    window.confirm = function() { return true; };
    var toasts = []; window.showToast = function(m) { toasts.push(String(m)); };
    window.closeDetail = function() {};
    var sent = []; var fail = true;
    window.sbXHR = function(method, p, data, cb) {
      sent.push(method + ' ' + p);
      if (fail) { cb({ status: 500, text: 'x' }, null); return; }
      cb(null, [{ id: 7 }]);
    };
    var store = [{ id: 7, clientName: '복구시험', is_archived: true }];
    window.loadCustomers = function() { return store; };
    window.saveCustomers = function(a) { store = a; };
    restoreCustomer('복구시험', 7);
    var r1 = { archived: store[0].is_archived, toast: toasts.join('|') };
    toasts.length = 0; fail = false;
    restoreCustomer('복구시험', 7);
    var r2 = { archived: store[0].is_archived, toast: toasts.join('|') };
    toasts.length = 0; sent.length = 0;
    restoreCustomer('없는고객', 999);
    var r3 = { sent: sent.length, toast: toasts.join('|') };
    return { r1: r1, r2: r2, r3: r3 };
  });
  ok('1. 서버 실패 → 복구 표시 안 함·성공 안내 없음', out.r1.archived === true && !/복구됐습니다/.test(out.r1.toast), JSON.stringify(out.r1));
  ok('2. 서버 성공 → 복구 반영·안내', out.r2.archived === false && /복구됐습니다/.test(out.r2.toast), JSON.stringify(out.r2));
  ok('3. 대상 못 찾음 → 서버로 아무것도 보내지 않음', out.r3.sent === 0 && /중단/.test(out.r3.toast), JSON.stringify(out.r3));
  ok('4. JS 에러 없음', jsErrors.length === 0, jsErrors.join(';'));
  log.forEach(l => console.log(l));
  await browser.close(); server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
