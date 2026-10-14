// tests/refund-revenue-check.js
// 2026-10-14: 환불이 매출·성과매출에 "입금한 달 +, 환불한 달 -"로 올바르게 반영되는지, 계약 취소가 -1로 표시되는지,
// 환불이 없는 고객의 계산은 예전과 똑같은지 확인.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9963;
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
  const ok = (l, c, d) => log.push((c ? '✅' : '❌') + ' ' + l + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : ''));

  const r = await page.evaluate(() => {
    const rf = (id, estId, slot, amount, paid, refund, extra) => Object.assign({ id, entry_type: 'refund', estimate_id: estId, slot, amount, paid_date: paid, refund_date: refund }, extra || {});
    localStorage.setItem('dah_saved', JSON.stringify([
      // S1 이영욱형: 10/5 카드 120만 → 10/10 전액 취소 → 10/12 98.2만 재결제(칸에는 재결제분만 남음)
      { id: 'e1', clientId: 1, clientName: 'S1', price: 1027000, performanceRevenue: 907000, depositAmount: 982000, depositDate: '2026-10-12', balanceAmount: 0, balanceDate: '',
        refundRows: [rf('r1', 'e1', 'deposit', 1200000, '2026-10-05', '2026-10-10')] },
      // S2 달을 넘긴 전액 환불: 9/20 100만 입금 → 10/3 전액 환불(칸 0)
      { id: 'e2', clientId: 2, clientName: 'S2', price: 1000000, performanceRevenue: 900000, depositAmount: 0, depositDate: '', balanceAmount: 0, balanceDate: '',
        refundRows: [rf('r2', 'e2', 'deposit', 1000000, '2026-09-20', '2026-10-03')] },
      // S3 초과분 부분환불: 총액 100만인데 120만 입금(9/20) → 10/3 20만 환불(칸 100만)
      { id: 'e3', clientId: 3, clientName: 'S3', price: 1000000, performanceRevenue: 900000, depositAmount: 1000000, depositDate: '2026-09-20', balanceAmount: 0, balanceDate: '',
        refundRows: [rf('r3', 'e3', 'deposit', 200000, '2026-09-20', '2026-10-03')] },
      // S4 환불 취소(reversal)가 붙은 환불은 없는 것으로 취급
      { id: 'e4', clientId: 4, clientName: 'S4', price: 1000000, performanceRevenue: 900000, depositAmount: 1000000, depositDate: '2026-09-20', balanceAmount: 0, balanceDate: '',
        refundRows: [rf('r4', 'e4', 'deposit', 1000000, '2026-09-20', '2026-10-03'), { id: 'r4x', entry_type: 'reversal', reverses_id: 'r4', estimate_id: 'e4', slot: 'deposit', amount: 1000000, paid_date: '2026-09-20', refund_date: '2026-10-04' }] },
      // S5 환불 없는 보통 고객(예전 계산 그대로): 선금 50만(9/1) 잔금 50만(10/2)
      { id: 'e5', clientId: 5, clientName: 'S5', price: 1000000, performanceRevenue: 900000, depositAmount: 500000, depositDate: '2026-09-01', balanceAmount: 500000, balanceDate: '2026-10-02' }
    ]));
    const sumBy = (c, m) => { const o = { rev: 0, perf: 0, cancel: 0 }; splitCustomerPayments(c).forEach(p => { if ((p.date || '').slice(0, 7) === m) { o.rev += p.revenue; o.perf += p.perf; if (p.cancel) o.cancel++; } }); o.perf = Math.round(o.perf); return o; };
    const cust = id => ({ id, clientName: 'S' + id, date: '2026-09-01', price: 0, depositAmount: 0, balanceAmount: 0 });
    const out = {};
    for (let i = 1; i <= 5; i++) out['s' + i] = { sep: sumBy(cust(i), '2026-09'), oct: sumBy(cust(i), '2026-10') };
    return out;
  });
  ok('S1 이영욱형: 10월 입금 순액 98.2만 (120만 -120만 +98.2만)', r.s1.oct.rev === 982000, r.s1.oct);
  ok('S1 10월 성과매출 = 총액 대비 98.2만분(867,258)', r.s1.oct.perf === 867258, r.s1.oct);
  ok('S1 취소 아님(받은 돈이 남아 있음)', r.s1.oct.cancel === 0, r.s1.oct);
  ok('S2 9월 입금 100만·성과 90만이 9월에 그대로 남음', r.s2.sep.rev === 1000000 && r.s2.sep.perf === 900000, r.s2.sep);
  ok('S2 10월 환불 -100만·성과 -90만, 취소 1건', r.s2.oct.rev === -1000000 && r.s2.oct.perf === -900000 && r.s2.oct.cancel === 1, r.s2.oct);
  ok('S3 초과분 환불: 9월 성과 90만 전액, 10월 입금 -20만·성과 0', r.s3.sep.perf === 900000 && r.s3.sep.rev === 1200000 && r.s3.oct.rev === -200000 && r.s3.oct.perf === 0, r);
  ok('S3 10월 취소 아님', r.s3.oct.cancel === 0, r.s3.oct);
  ok('S4 환불을 취소한 건은 없는 것과 같음(9월 100만, 10월 0)', r.s4.sep.rev === 1000000 && r.s4.oct.rev === 0 && r.s4.oct.cancel === 0, r.s4);
  ok('S5 환불 없는 고객은 예전 계산 그대로(9월 50만/45만, 10월 50만/45만)', r.s5.sep.rev === 500000 && r.s5.sep.perf === 450000 && r.s5.oct.rev === 500000 && r.s5.oct.perf === 450000, r.s5);
  ok('자바스크립트 오류 없음', jsErrors.length === 0, jsErrors);

  console.log(log.join('\n'));
  await browser.close(); server.close();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
