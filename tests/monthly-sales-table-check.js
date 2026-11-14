// tests/monthly-sales-table-check.js
// 2026-11-14(N-166 ⑤·N-167): 월별 영업 실적표 — 상담(보류 제외)·계약(첫 선금 달)·계약률 두 가지·달성률·계약당 금액 계산과 화면 표시.
// 한계: 가짜 고객으로 계산·표 구조를 보는 시험. 실제 운영 숫자와의 대조와 화면 모양은 선혜님 눈 확인 필요.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
async function run() {
  const dir = path.resolve(__dirname, '..'), port = 9944;
  const server = await startServer(dir, port); const browser = await launchBrowser();
  const page = await browser.newPage(); const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page); await page.setViewport({ width: 390, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
  const log = []; function ok(l, c, d) { log.push((c ? '✅' : '❌') + ' ' + l + (c ? '' : ' — ' + d)); }
  const r = await page.evaluate(() => {
    var base = { staffName: '마스터', phone: '', addr: '', measureDate: '', installDate: '', balanceAmount: 0, depositAmount: 0 };
    function mk(o) { return Object.assign({}, base, o); }
    var cs = [
      mk({ id: 8801, clientName: 'A', stage: '상담', date: '2026-09-05', price: 0 }),
      mk({ id: 8802, clientName: 'B', stage: '실측준비중', date: '2026-09-10', price: 3000000, performanceRevenue: 3000000, depositAmount: 1000000, depositDate: '2026-09-12' }),
      mk({ id: 8803, clientName: 'C보류', stage: '가견적', date: '2026-09-20', price: 0, leadParked: true }),
      mk({ id: 8804, clientName: 'D', stage: '시공완료', date: '2026-09-25', price: 2000000, performanceRevenue: 1000000, depositAmount: 500000, depositDate: '2026-10-02' }),
      mk({ id: 8805, clientName: 'E', stage: '상담', date: '2026-10-03', price: 0 }),
      mk({ id: 8806, clientName: '옛자료', stage: '시공완료', date: '2026-05-10', price: 1000000, performanceRevenue: 1000000, depositAmount: 300000, depositDate: '2026-05-11' })
    ];
    var rows = getMonthlySalesTable(cs, '2026-08', '2026-10', 50000000);
    saveCustomers(cs); localStorage.setItem('dah_saved', JSON.stringify([]));
    goTab('chart'); renderChart('monthly');
    var wrap = document.getElementById('chart-monthly-sales');
    var heads = wrap ? Array.from(wrap.querySelectorAll('thead th')).map(function(t){ return t.textContent; }) : [];
    var bodyRows = wrap ? wrap.querySelectorAll('tbody tr').length : 0;
    return { rows: rows, heads: heads, bodyRows: bodyRows, note: wrap ? wrap.textContent : '', firstRowText: wrap && wrap.querySelector('tbody tr') ? wrap.querySelector('tbody tr').textContent : '' };
  });
  const by = {}; r.rows.forEach(x => by[x.key] = x);
  ok('1. 시작은 2026-08, 끝까지 달마다 한 줄', r.rows[0].key === '2026-08' && r.rows.length === 3, JSON.stringify(r.rows.map(x => x.key)));
  ok('2. 9월 상담 = 3건(방문 예정일이 9월, 보류 C 제외)', by['2026-09'].consults === 3, by['2026-09'].consults);
  ok('3. 9월 계약 = 1건(B만, D는 10월에 입금)', by['2026-09'].contracts === 1, by['2026-09'].contracts);
  ok('4. 9월 계약률(입금월) 33%, 상담월 기준 67%(B·D)', by['2026-09'].rate === 33 && by['2026-09'].cohortRate === 67, by['2026-09'].rate + '/' + by['2026-09'].cohortRate);
  ok('5. 10월 상담 1건, 계약 1건(D가 10월 입금), 계약률 100%, 상담월 기준 0%', by['2026-10'].consults === 1 && by['2026-10'].contracts === 1 && by['2026-10'].rate === 100 && by['2026-10'].cohortRate === 0, JSON.stringify(by['2026-10']));
  ok('6. 8월은 상담 0건이면 계약률 표시 없음(null), 5월 옛 자료는 표에 안 들어감', by['2026-08'].rate === null && by['2026-05'] === undefined);
  ok('7. 달성률 = 성과매출 ÷ 목표(5천만원), 9월 성과매출 있음', by['2026-09'].perf > 0 && by['2026-09'].achieve === Math.round(by['2026-09'].perf / 50000000 * 100), JSON.stringify(by['2026-09']));
  ok('8. 계약당 금액 = 그 달 계약 고객 성과매출 평균(9월 B 3,000,000)', by['2026-09'].avgPerf === 3000000 && by['2026-08'].avgPerf === null, by['2026-09'].avgPerf);
  ok('9. 화면에 표가 그려짐(8칸 머리글, 달마다 한 줄)', r.heads.length === 8 && r.heads.indexOf('상담월 기준') >= 0 && r.bodyRows >= 4, JSON.stringify(r.heads) + ' rows=' + r.bodyRows);
  ok('10. 설명에 "보류 제외"와 8월 시작 안내가 있음', r.note.indexOf('보류 제외') >= 0 && r.note.indexOf('8월부터') >= 0);
  ok('11. 가장 위 줄이 이번 달(진행 중 표시)', r.firstRowText.indexOf('진행 중') >= 0, r.firstRowText);
  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');
  await browser.close(); server.kill(); process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 40000);
