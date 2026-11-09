// N-149: 담당자별 성과의 '건수' 합계가 홈 '계약건수'(계약금을 처음 받은 달 기준)와 같아야 한다.
// 사건(2026-11-09): 11월에 최주연(선금 10/26·잔금 11/2)·김지은(선금 10/29·잔금 11/5)처럼 잔금만 들어온 고객이 담당자별 건수에 더해져
// 홈 계약건수 2건 vs 담당자별 2건+2건으로 어긋났다. 금액은 달별 결제 그대로여야 한다.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; };
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const server = await startServer(path.resolve(__dirname, '..'), 27186); const browser = await launchBrowser();
  try {
    const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await blockRealNetwork(page);
    await page.goto('http://localhost:27186/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
    const r = await page.evaluate(() => {
      const mk = (id, name, staff, stage, dd, da, bd, ba, price) => ({ id, clientName: name, staffName: staff, stage, depositDate: dd, depositAmount: da, balanceDate: bd, balanceAmount: ba, price, performanceRevenue: 0 });
      const cs = [
        mk(279, '한은실', '마스터', '시공준비중', '2026-11-03', 5957000, '2026-11-03', 5957000, 11914000),
        mk(292, '최주연', '마스터', '시공준비중', '2026-10-26', 452000, '2026-11-02', 123000, 575000),
        mk(297, '김지은', '오지은 실장', '시공준비중', '2026-10-29', 632000, '2026-11-05', 979000, 1611000),
        mk(322, '변상은', '오지은 실장', '잔금결제', '2026-11-07', 1613000, '', 0, 1613000),
      ];
      const st = getMonthStaffPerformance(cs, '2026-11', true);
      const total = Object.keys(st).reduce((a, k) => a + st[k].count, 0);
      return { st, total, contracts: getMonthContractCount(cs, '2026-11'), revM: st['마스터'].rev, revO: st['오지은 실장'].rev };
    });
    ok(r.contracts === 2, '홈 계약건수 = 2 (첫 선금이 11월인 한은실·변상은): ' + r.contracts);
    ok(r.st['마스터'].count === 1 && r.st['오지은 실장'].count === 1, '담당자별 건수 마스터 1·오지은 1: ' + JSON.stringify(r.st));
    ok(r.total === r.contracts, '담당자별 건수 합계 == 홈 계약건수: ' + r.total + ' vs ' + r.contracts);
    ok(r.revM > 0 && r.revO > 0, '금액은 달별 결제 그대로 잡힘(잔금만 들어온 고객의 금액 포함): 마스터 ' + r.revM + ' / 오지은 ' + r.revO);
    ok(errs.length === 0, 'JS 오류 없음 ' + errs.join('|'));
  } catch (e) { console.log('❌ 예외', e.message); fail++; }
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})();
