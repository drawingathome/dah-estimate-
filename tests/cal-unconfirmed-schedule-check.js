const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9934;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 1200 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  const todayY = new Date().getFullYear();
  const todayM = String(new Date().getMonth() + 1).padStart(2, '0');
  const measureDateThisMonth = `${todayY}-${todayM}-22`;

  // 최선미 사례 재현: 상담 단계, 입금 0원, 그런데도 실측예정일이 이미 입력됨
  const r1 = await page.evaluate((mDate) => {
    saveCustomers([{
      id: 9950, clientName: '최선미재현', phone: '01099990010', stage: '상담', staffName: '오지은 실장',
      price: 4118000, measureDate: mDate, installDate: '', addr: '서울 서초구',
      depositAmount: 0, balanceAmount: 0
    }]);
    localStorage.setItem('dah_saved', JSON.stringify([]));
    goTab('cal');
    renderCal();
    var body = document.getElementById('cal-list');
    return { text: body ? body.textContent : 'cal-list 없음' };
  }, measureDateThisMonth);
  ok('1. 결제 안 한 실측예정 고객에게 "미확정(결제 전)" 표시가 뜸', r1.text.indexOf('미확정') !== -1, r1.text.slice(0, 300));

  // 대조군: 선금이라도 입금되면 "미확정" 표시 대신 정상적으로 "선금✓" 뜸(회귀 없음)
  const r2 = await page.evaluate((mDate) => {
    saveCustomers([{
      id: 9951, clientName: '결제완료고객', phone: '01099990011', stage: '실측준비중', staffName: '오지은 실장',
      price: 3000000, measureDate: mDate, installDate: '', addr: '서울 서초구',
      depositAmount: 1500000, balanceAmount: 0
    }]);
    localStorage.setItem('dah_saved', JSON.stringify([]));
    renderCal();
    var body = document.getElementById('cal-list');
    return { text: body ? body.textContent : 'cal-list 없음' };
  }, measureDateThisMonth);
  ok('2. 선금 입금된 고객은 "미확정" 대신 "선금" 체크 표시가 정상적으로 뜸(회귀 없음)', r2.text.indexOf('선금') !== -1 && r2.text.indexOf('미확정') === -1, r2.text.slice(0, 300));

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
