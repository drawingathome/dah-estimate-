// N-134①: 매출 탭 요약의 '계약 건수'·'전환율'이 홈과 같은 기준(첫 선금 입금월)인지, 상담 건수는 방문 예정일 기준인지
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9937;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  const r = await page.evaluate(() => {
    var d = new Date(), f = function(x){ return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
    var thisDay = f(new Date(d.getFullYear(), d.getMonth(), 2));
    var prevDay = f(new Date(d.getFullYear(), d.getMonth() - 1, 15));
    var base = { staffName: '마스터', phone: '', addr: '', measureDate: '', installDate: '', balanceAmount: 0, depositAmount: 0 };
    function mk(o) { return Object.assign({}, base, o); }
    saveCustomers([
      mk({ id: 9981, clientName: '요약상담A', stage: '상담', date: thisDay, price: 1000000 }),
      mk({ id: 9982, clientName: '요약상담B', stage: '가견적', date: thisDay, price: 1000000 }),
      // 지난달 등록, 이번달 선금: 이번달 계약 1건(등록일 기준이면 0건이 되는 경우)
      mk({ id: 9983, clientName: '요약지난달등록이번달계약', stage: '실측준비중', date: prevDay, price: 3000000, depositAmount: 1500000, depositDate: thisDay }),
      // 이번달 등록, 계약 후 단계지만 선금이 지난달(등록일 기준이면 이번달 계약으로 잘못 셈)
      mk({ id: 9984, clientName: '요약이번달등록지난달선금', stage: '시공준비중', date: thisDay, price: 1000000, depositAmount: 500000, depositDate: prevDay }),
      mk({ id: 9985, clientName: '요약이번달등록지난달선금2', stage: '잔금결제', date: thisDay, price: 1000000, depositAmount: 500000, depositDate: prevDay })
    ]);
    localStorage.setItem('dah_saved', JSON.stringify([]));
    goTab('chart'); renderChart('monthly');
    var rows = {};
    Array.from(document.getElementById('chart-summary').children).forEach(function(row) { rows[row.children[0].textContent] = row.children[1].textContent; });
    return rows;
  });
  ok('1. 상담 건수 = 이번달 방문 예정일 4명(A·B·이번달등록 지난달선금 2명)', r['상담 건수'] === '4건', r['상담 건수']);
  ok('2. 계약 건수 = 이번달 첫 선금 1명(지난달 등록분)', r['계약 건수'] === '1건', r['계약 건수']);
  ok('3. 전환율 = 계약÷상담 = 25%', r['전환율'] === '25%', r['전환율']);

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');
  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 30000);
