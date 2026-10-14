// tests/kanban-expected-amount-check.js
// 2026-10-14: 받은 돈이 없는 고객(계약 전)의 칸반 금액에는 "예상"이 붙고, 입금이 있는 고객에는 안 붙는지 확인.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 27147;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await blockRealNetwork(page);
    await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 600));
    await loginAs(page, 'master');
    const r = await page.evaluate(() => {
      localStorage.setItem('dah_saved', JSON.stringify([]));
      var list = [
        { id: 901, clientName: '예상고객', staffName: '마스터', stage: '가견적', price: 1000000, depositAmount: 0, balanceAmount: 0, is_archived: false },
        { id: 902, clientName: '계약고객', staffName: '마스터', stage: '선금결제', price: 2000000, depositAmount: 1000000, depositDate: '2026-10-01', balanceAmount: 0, is_archived: false },
        { id: 903, clientName: '완납고객', staffName: '마스터', stage: '잔금결제', price: 3000000, depositAmount: 1000000, depositDate: '2026-10-01', balanceAmount: 2000000, balanceDate: '2026-10-02', is_archived: false }
      ];
      var wrap = document.createElement('div'); document.body.appendChild(wrap);
      renderKanbanCols(list, wrap);
      var prices = {};
      wrap.querySelectorAll('.kanban-item').forEach(function (it) { var n = it.querySelector('.kanban-item-name span:last-child'); var p = it.querySelector('.kanban-item-price'); if (n && p) prices[n.textContent.trim()] = p.textContent.trim(); });
      return prices;
    });
    ok(/예상/.test(r['예상고객'] || '') && /1,000,000원/.test(r['예상고객'] || ''), '받은 돈이 없으면 "예상 1,000,000원": ' + r['예상고객']);
    ok(!/예상/.test(r['계약고객'] || '') && /2,000,000원/.test(r['계약고객'] || ''), '일부 입금한 계약 고객에는 "예상" 없음: ' + r['계약고객']);
    ok(!/예상/.test(r['완납고객'] || ''), '완납 고객에는 "예상" 없음: ' + r['완납고객']);
    ok(errs.length === 0, '자바스크립트 오류 없음' + (errs.length ? ': ' + errs[0] : ''));
  } finally { await browser.close(); server.kill(); }
  console.log(fail ? '\n❌ 실패 ' + fail + '건' : '\n✅ 전체 통과');
  process.exit(fail ? 1 : 0);
})();
