// tests/journey-consistency-check.js  (N-71 ①)
// 고객 유형(견적서 1개·2개, 선금만, 완납, 초과, 환불, 추가결제 …)마다 "여러 화면이 쓰는 값"이 서로 모순되지 않는지 확인.
// 한 값을 여러 함수가 따로 계산하다 어긋나는 사고(N-44 계약금, 완납 판정)를 구조적으로 잡는 불변식 시험.
//  I1 미수금 = 칩의 "남은 금액"   I2 완납 칩이면 미수금 0   I3 월별 매출 합 = 받은 돈(환불 포함 순액)
//  (입금 0원인데 계약 이후 단계인 이상 상태는 제외: 칩 'none', 월 매출은 옛 고객 방식으로 총액 인식 — 운영 DB에는 현재 0명, 11-01 읽기 확인)
//  I4 계약 여부 = 받은 돈 > 0      I5 받은 돈 + 미수금 >= 총액(초과 입금이면 미수금 0)
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
async function run() {
  const dir = path.resolve(__dirname, '..'); const port = 9967;
  const server = await startServer(dir, port); const browser = await launchBrowser(); const page = await browser.newPage();
  const jsErrors = []; page.on('pageerror', e => jsErrors.push(e.message)); await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
  const log = []; const ok = (l, c, d) => log.push((c ? '✅' : '❌') + ' ' + l + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : ''));
  const res = await page.evaluate(() => {
    const rf = (id, estId, slot, amount, paid, refund) => ({ id, entry_type: 'refund', estimate_id: estId, slot, amount, paid_date: paid, refund_date: refund });
    const E = (id, cid, o) => Object.assign({ id, clientId: cid, clientName: 'C' + cid, price: 1000000, performanceRevenue: 900000, depositAmount: 0, depositDate: '', balanceAmount: 0, balanceDate: '' }, o);
    const ests = [
      E('a1', 1, {}),                                                                                         // 가견적만
      E('a2', 2, { depositAmount: 500000, depositDate: '2026-09-01' }),                                       // 선금만(잔금 남음)
      E('a3', 3, { depositAmount: 500000, depositDate: '2026-10-01', balanceAmount: 500000, balanceDate: '2026-10-02' }), // 완납
      E('a4', 4, { depositAmount: 1200000, depositDate: '2026-10-01' }),                                      // 초과 입금
      E('a5a', 5, { depositAmount: 500000, depositDate: '2026-09-01', balanceAmount: 500000, balanceDate: '2026-09-20' }), // 견적서 2건: 1건 완납
      E('a5b', 5, { price: 600000, performanceRevenue: 540000, depositAmount: 300000, depositDate: '2026-10-01' }),        //          1건 잔금 남음
      E('a6a', 6, { depositAmount: 500000, depositDate: '2026-09-01', balanceAmount: 500000, balanceDate: '2026-09-20' }), // 견적서 2건 모두 완납
      E('a6b', 6, { price: 800000, performanceRevenue: 720000, depositAmount: 400000, depositDate: '2026-10-03', balanceAmount: 400000, balanceDate: '2026-10-05' }),
      E('a7', 7, { price: 0, performanceRevenue: 0 }),                                                        // 0원 협찬
      E('a8', 8, { depositAmount: 980000, depositDate: '2026-09-10', refundRows: [rf('r8', 'a8', 'deposit', 1000000, '2026-08-31', '2026-09-05')] }), // 환불 후 재결제
      E('a9', 9, { depositAmount: 0, refundRows: [rf('r9', 'a9', 'deposit', 1000000, '2026-09-01', '2026-09-20')] }), // 입금→전액 환불
      E('a10', 10, { balanceAmount: 1000000, balanceDate: '2026-10-05' }),                                    // 잔금만
      E('a11', 11, { depositAmount: 300000, depositDate: '2026-09-15', refundRows: [rf('r11', 'a11', 'deposit', 100000, '2026-09-15', '2026-10-10')] }), // 부분 환불
    ];
    localStorage.setItem('dah_saved', JSON.stringify(ests));
    const total = {}; ests.forEach(e => { total[e.clientId] = (total[e.clientId] || 0) + e.price; });
    const cust = id => ({ id, clientName: 'C' + id, date: '2026-09-01', stage: '잔금결제', price: total[id] || 0, depositAmount: 0, balanceAmount: 0 });
    const check = (recvFn) => {
      const bad = [];
      for (let i = 1; i <= 11; i++) {
        const c = cust(i); const recv = recvFn(c); const un = getUnpaidAmount(c); const st = getPayStatus(c);
        let monthSum = 0; splitCustomerPayments(c).forEach(p => { monthSum += p.revenue; });
        const tag = 'c' + i;
        if (st.state !== 'none' && !(un === (st.state === 'partial' ? st.diff : 0))) bad.push([tag, 'I1 미수금≠칩 남은금액', un, st]);
        if (st.state === 'full' && un !== 0) bad.push([tag, 'I2 완납 칩인데 미수금', un]);
        if (recv > 0 && Math.round(monthSum) !== Math.round(recv)) bad.push([tag, 'I3 월 매출 합≠받은 돈', monthSum, recv]);
        if (isContractedCustomer(c) !== (recv > 0)) bad.push([tag, 'I4 계약 여부≠받은 돈>0']);
        if (c.price > 0 && !(recv + un >= c.price)) bad.push([tag, 'I5 받은 돈+미수금<총액', recv, un, c.price]);
      }
      return bad;
    };
    const normal = check(getReceivedAmount);
    // 역검증: 받은 돈 계산이 어긋나면(+1원) 불변식이 실제로 깨지는지
    const orig = window.getReceivedAmount; window.getReceivedAmount = function (c) { return orig(c) + (c.id === 3 ? 1 : 0); };
    let mutated = []; try { mutated = check(window.getReceivedAmount); } finally { window.getReceivedAmount = orig; }
    const snap = {}; for (let i = 1; i <= 11; i++) { const c = cust(i); snap['c' + i] = { recv: getReceivedAmount(c), un: getUnpaidAmount(c), chip: getPayStatus(c).state }; }
    return { normal, mutatedN: mutated.length, snap };
  });
  ok('불변식 5종 × 고객 유형 11가지 모두 성립', res.normal.length === 0, res.normal);
  ok('역검증: 받은 돈이 1원만 어긋나도 불변식이 깨져 시험이 잡아냄', res.mutatedN > 0, res.mutatedN);
  const s = res.snap;
  ok('유형별 대표 값: 선금만 → 미수금 50만·칩 partial', s.c2.recv === 500000 && s.c2.un === 500000 && s.c2.chip === 'partial', s.c2);
  ok('유형별 대표 값: 완납 → 미수금 0·칩 full', s.c3.un === 0 && s.c3.chip === 'full', s.c3);
  ok('유형별 대표 값: 초과 입금 → 미수금 0·칩 over', s.c4.un === 0 && s.c4.chip === 'over', s.c4);
  ok('유형별 대표 값: 견적서 2건 중 1건만 완납 → 전체 미수금 30만(완납 아님)', s.c5.un === 300000 && s.c5.chip === 'partial', s.c5);
  ok('유형별 대표 값: 견적서 2건 모두 완납 → 미수금 0', s.c6.un === 0 && s.c6.chip === 'full', s.c6);
  ok('자바스크립트 오류 없음', jsErrors.length === 0, jsErrors);
  console.log(log.join('\n')); await browser.close(); server.close();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
