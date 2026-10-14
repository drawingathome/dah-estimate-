// tests/scenario-customers-money-check.js
// 2026-10-14(3-2 표준 고객 시나리오): 실제로 자주 생기는 고객 유형을 한 번에 돌려서 "받은 돈 / 월별 매출 / 성과매출 / 취소"가 손으로 계산한 값과 같은지 확인.
// 규칙은 docs/BUSINESS_RULES.md. 이 테스트가 깨지면 계산 규칙이 바뀐 것이므로, 의도한 변경인지 확인하고 문서와 함께 고칠 것.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9966;
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
    const rf = (id, estId, slot, amount, paid, refund) => ({ id, entry_type: 'refund', estimate_id: estId, slot, amount, paid_date: paid, refund_date: refund });
    // 모든 견적서: 총액 100만, 제품비용(성과매출 기준) 90만 — 따로 적은 것만 다름
    const E = (id, cid, o) => Object.assign({ id, clientId: cid, clientName: 'C' + cid, price: 1000000, performanceRevenue: 900000, depositAmount: 0, depositDate: '', balanceAmount: 0, balanceDate: '' }, o);
    const ests = [
      E('a1', 1, {}),                                                                                   // 1 가견적만(입금 없음)
      E('a2', 2, { depositAmount: 500000, depositDate: '2026-09-01' }),                                  // 2 선금만
      E('a3', 3, { depositAmount: 500000, depositDate: '2026-10-01', balanceAmount: 500000, balanceDate: '2026-10-02' }), // 3 선금+잔금 같은 달
      E('a4', 4, { depositAmount: 1200000, depositDate: '2026-10-01' }),                                 // 4 초과 입금
      E('a5a', 5, { depositAmount: 500000, depositDate: '2026-09-01' }),                                 // 5 견적서 2건 모두 계약(다른 달)
      E('a5b', 5, { price: 600000, performanceRevenue: 540000, depositAmount: 300000, depositDate: '2026-10-01' }),
      E('a6a', 6, { price: 5000000, performanceRevenue: 4500000 }),                                      // 6 큰 가견적 + 작은 계약 견적서(가견적 합산 안 함)
      E('a6b', 6, { price: 800000, performanceRevenue: 720000, depositAmount: 400000, depositDate: '2026-10-03' }),
      E('a7', 7, { price: 0, performanceRevenue: 0 }),                                                   // 7 무료 협찬 0원
      E('a8', 8, { depositAmount: 980000, depositDate: '2026-09-10', refundRows: [rf('r8', 'a8', 'deposit', 1000000, '2026-08-31', '2026-09-05')] }), // 8 전액 환불 후 재결제(다른 달)
      E('a9', 9, { depositAmount: 0, refundRows: [rf('r9', 'a9', 'deposit', 1000000, '2026-09-01', '2026-09-20')] }), // 9 같은 달 입금→전액환불(취소)
      E('a10', 10, { balanceAmount: 1000000, balanceDate: '2026-10-05' }),                              // 10 잔금만 기록
      E('a11', 11, { depositAmount: 300000, depositDate: '2026-09-15', refundRows: [rf('r11', 'a11', 'deposit', 100000, '2026-09-15', '2026-10-10')] }), // 11 부분 환불(다른 달) 후 30만 남음... 칸=순입금 300000
      E('a12', 12, { depositAmount: 500000, depositDate: '2026-09-30', balanceAmount: 500000, balanceDate: '2026-10-01' }), // 12 월말·월초 경계
    ];
    localStorage.setItem('dah_saved', JSON.stringify(ests));
    const cust = id => ({ id, clientName: 'C' + id, date: '2026-09-01', price: 0, depositAmount: 0, balanceAmount: 0 });
    const sumBy = (c, m) => { const o = { rev: 0, perf: 0, cancel: 0 }; splitCustomerPayments(c).forEach(p => { if ((p.date || '').slice(0, 7) === m) { o.rev += p.revenue; o.perf += p.perf; if (p.cancel) o.cancel++; } }); o.perf = Math.round(o.perf); return o; };
    const out = {};
    for (let i = 1; i <= 12; i++) out['c' + i] = { aug: sumBy(cust(i), '2026-08'), sep: sumBy(cust(i), '2026-09'), oct: sumBy(cust(i), '2026-10'), recv: getReceivedAmount(cust(i)) };
    return out;
  });

  const eq = (a, rev, perf, cancel) => a.rev === rev && a.perf === perf && (a.cancel || 0) === (cancel || 0);
  ok('1 가견적만: 받은 돈 0, 어느 달에도 매출·성과 없음', r.c1.recv === 0 && eq(r.c1.sep, 0, 0) && eq(r.c1.oct, 0, 0), r.c1);
  ok('2 선금만: 9월 50만 / 성과 45만', r.c2.recv === 500000 && eq(r.c2.sep, 500000, 450000) && eq(r.c2.oct, 0, 0), r.c2);
  ok('3 선금+잔금 같은 달: 10월 100만 / 성과 90만', r.c3.recv === 1000000 && eq(r.c3.oct, 1000000, 900000) && eq(r.c3.sep, 0, 0), r.c3);
  ok('4 초과 입금: 매출(받은 돈) 120만이지만 성과매출은 제품비용 90만이 상한', r.c4.recv === 1200000 && eq(r.c4.oct, 1200000, 900000), r.c4);
  ok('5 견적서 2건 계약: 9월 50만/45만, 10월 30만/27만(각자 자기 제품비용 기준)', r.c5.recv === 800000 && eq(r.c5.sep, 500000, 450000) && eq(r.c5.oct, 300000, 270000), r.c5);
  ok('6 큰 가견적(500만)은 합산 안 함: 10월은 계약 견적서 40만 / 성과 36만뿐', r.c6.recv === 400000 && eq(r.c6.oct, 400000, 360000) && eq(r.c6.sep, 0, 0), r.c6);
  ok('7 무료 협찬 0원: 매출 없음', r.c7.recv === 0 && eq(r.c7.sep, 0, 0) && eq(r.c7.oct, 0, 0), r.c7);
  ok('8 전액 환불 후 재결제: 8월 100만/90만, 9월 -2만/-1.8만, 취소 아님', r.c8.recv === 980000 && eq(r.c8.aug, 1000000, 900000) && eq(r.c8.sep, -20000, -18000, 0), r.c8);
  ok('9 같은 달 입금→전액환불: 9월 0원·성과 0, 취소 1건', r.c9.recv === 0 && eq(r.c9.sep, 0, 0, 1), r.c9);
  ok('10 잔금만 기록: 10월 100만/90만', r.c10.recv === 1000000 && eq(r.c10.oct, 1000000, 900000), r.c10);
  ok('11 부분 환불(다른 달): 9월 40만(=30만+환불 전 10만 포함 입금 40만)/성과 36만, 10월 -10만/-9만', r.c11.recv === 300000 && eq(r.c11.sep, 400000, 360000) && eq(r.c11.oct, -100000, -90000), r.c11);
  ok('12 월말/월초 경계: 9월 50만/45만, 10월 50만/45만(날짜 기준으로 달이 나뉨)', r.c12.recv === 1000000 && eq(r.c12.sep, 500000, 450000) && eq(r.c12.oct, 500000, 450000), r.c12);
  ok('자바스크립트 오류 없음', jsErrors.length === 0, jsErrors);

  console.log(log.join('\n'));
  await browser.close(); server.close();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
