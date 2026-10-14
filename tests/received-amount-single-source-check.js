// tests/received-amount-single-source-check.js
// 2026-10-14: "받은 돈"이 getReceivedAmount와 매출 계산(getAllEstPays) 두 방식으로 달라지지 않는지 확인.
// 특히 환불로 견적서 금액을 줄였는데 고객칸에 낡은 큰 값이 남은 경우, 큰 값이 아니라 견적서 기준을 따라야 함.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9962;
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
  const ok = (l, c, d) => log.push((c ? '✅' : '❌') + ' ' + l + (!c && d !== undefined ? ' — ' + d : ''));

  const r = await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([
      { clientId: 9981, clientName: 'A', price: 1000000, depositAmount: 300000, balanceAmount: 200000, savedAt: '2026-09-01' },
      { clientId: 9981, clientName: 'A', price: 500000, depositAmount: 100000, balanceAmount: 0, savedAt: '2026-10-01' },
      { clientId: 9982, clientName: 'B', price: 1000000, depositAmount: 0, balanceAmount: 0, savedAt: '2026-09-01' }
    ]));
    const sum = c => getAllEstPays(c).reduce((s, p) => s + p.depositAmount + p.balanceAmount, 0);
    const cases = {
      multi: { id: 9981, clientName: 'A', depositAmount: 900000, balanceAmount: 0 },       // 고객칸이 낡게 큼(환불 후)
      fallback: { id: 9982, clientName: 'B', depositAmount: 400000, balanceAmount: 0 },   // 견적서 기록 없음 → 고객칸
      noEst: { id: 9983, clientName: 'C', depositAmount: 250000, balanceAmount: 100000 },
      empty: { id: 9984, clientName: 'D', depositAmount: 0, balanceAmount: 0 }
    };
    const out = {};
    for (const k in cases) out[k] = [getReceivedAmount(cases[k]), sum(cases[k])];
    return out;
  });
  ok('1. 견적서 여러 건: 고객칸 낡은 큰 값(90만)이 아니라 견적서 합계(60만)', r.multi[0] === 600000, r.multi);
  ok('2. 견적서에 기록이 없으면 고객칸(40만)', r.fallback[0] === 400000, r.fallback);
  ok('3. 견적서 없는 고객은 고객칸 합계(35만)', r.noEst[0] === 350000, r.noEst);
  ok('4. 입금 없으면 0', r.empty[0] === 0, r.empty);
  ok('5. 모든 경우 매출 계산 방식과 같은 답', Object.values(r).every(v => v[0] === v[1]), r);
  ok('6. 자바스크립트 오류 없음', jsErrors.length === 0, jsErrors.join('|'));

  console.log(log.join('\n'));
  await browser.close(); server.close();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
