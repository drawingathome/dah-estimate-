// tests/tax-export-check.js — 4-21 세무용 월별 입금·환불 CSV: 달 경계, 환불 마이너스, 합계, 예전 고객 폴백, 수식 방어
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
async function run() {
  const dir = path.resolve(__dirname, '..'); const port = 9967;
  const server = await startServer(dir, port); const browser = await launchBrowser(); const page = await browser.newPage();
  const jsErrors = []; page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
  const log = []; const ok = (l, c, d) => log.push((c ? '✅' : '❌') + ' ' + l + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : ''));
  const r = await page.evaluate(() => {
    const custs = [
      { id: 1, clientName: '정상고객', staffName: '마스터' },
      { id: 2, clientName: '=수식고객', staffName: '마스터' },
      { id: 3, clientName: '예전고객', staffName: '마스터', depositAmount: 300000, depositDate: '2026-09-10', depositMethod: '계좌이체', balanceAmount: 0 },
      { id: 4, clientName: '환불고객', staffName: '마스터' }
    ];
    const ests = [
      { clientId: 1, clientName: '정상고객', price: 1000000, depositAmount: 500000, depositDate: '2026-08-31', depositMethod: '카드', depositReceipt: false, balanceAmount: 500000, balanceDate: '2026-09-01', balanceMethod: '계좌이체', balanceReceipt: true },
      { clientId: 2, clientName: '=수식고객', price: 100000, depositAmount: 100000, depositDate: '2026-09-15', depositMethod: '현금' },
      { clientId: 4, clientName: '환불고객', price: 400000, depositAmount: 0, depositDate: '2026-09-05', depositMethod: '카드',
        refundRows: [{ id: 'r1', entry_type: 'refund', slot: 'deposit', amount: 400000, paid_date: '2026-09-05', refund_date: '2026-10-02' }] }
    ];
    const sep = taxBuildMonthRows(custs, ests, '2026-09');
    const oct = taxBuildMonthRows(custs, ests, '2026-10');
    const csv = taxRowsToCsv(sep, '2026-09');
    return { sep, oct, csv };
  });
  ok('1. 9월: 8/31 선금은 제외, 9/1 잔금·9/10 예전고객·9/15 수식고객 = 3건', r.sep.length === 3, r.sep);
  ok('2. 9월 정상고객 잔금에 결제방법·영수증 표시', r.sep.some(x => x.customer === '정상고객' && x.kind === '잔금' && x.method === '계좌이체' && x.receipt === '발행/요청'), r.sep);
  ok('3. 예전 고객(견적서 없음)은 고객 칸 입금을 사용', r.sep.some(x => x.customer === '예전고객' && x.amount === 300000 && x.method === '계좌이체'), r.sep);
  ok('4. 10월: 환불은 환불일 달에 마이너스로 1건', r.oct.length === 1 && r.oct[0].kind === '환불' && r.oct[0].amount === -400000, r.oct);
  ok('5. CSV 합계 = 500000+300000+100000 = 900,000', /합계\(입금-환불\),,,,900000/.test(r.csv), r.csv.slice(-200));
  ok('6. 수식으로 시작하는 고객명은 작은따옴표로 방어', r.csv.indexOf("'=수식고객") !== -1, r.csv);
  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');
  await browser.close(); server.kill(); process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 40000);
