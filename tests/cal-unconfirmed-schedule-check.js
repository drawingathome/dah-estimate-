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
  // 브라우저 시계 기준으로 이번 달 22일을 계산(시험 프로그램 시계와 브라우저 시계가 달라도 흔들리지 않게)
  const measureDateThisMonth = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-22'; });

  // 시험처 사례 재현: 상담 단계, 입금 0원, 그런데도 실측예정일이 이미 입력됨
  const r1 = await page.evaluate((mDate) => {
    saveCustomers([{
      id: 9950, clientName: '시험처재현', phone: '01099990010', stage: '상담', staffName: '오지은 실장',
      price: 4118000, measureDate: mDate, installDate: '', addr: '서울 서초구',
      depositAmount: 0, balanceAmount: 0
    }]);
    localStorage.setItem('dah_saved', JSON.stringify([]));
    goTab('cal');
    renderCal();
    var body = document.getElementById('cal-list');
    return { text: body ? body.textContent : 'cal-list 없음' };
  }, measureDateThisMonth);
  ok('1. 결제 안 한 고객은 실측 일정에 올라가지 않음(시험처재현 없음)', r1.text.indexOf('시험처재현') === -1, r1.text.slice(0, 300));

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
  ok('2. 선금 입금된 고객은 "미확정" 대신 "선금" 체크 표시가 정상적으로 뜸(회귀 없음)', r2.text.indexOf('결제완료고객') !== -1 && r2.text.indexOf('선금') !== -1 && r2.text.indexOf('미확정') === -1, r2.text.slice(0, 300));

  // 홈 "오늘/내일 일정": 결제 전 고객의 실측은 안 뜨고, 결제한 고객은 뜸
  const r3 = await page.evaluate(() => {
    var d = new Date(), f = function(x){ return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
    var t = f(d);
    saveCustomers([
      { id: 9960, clientName: '미결제실측고객', phone: '01099990020', stage: '상담', staffName: '오지은 실장', price: 2548000, measureDate: t, installDate: '', addr: '경기 성남시', depositAmount: 0, balanceAmount: 0 },
      { id: 9961, clientName: '결제실측고객', phone: '01099990021', stage: '실측준비중', staffName: '오지은 실장', price: 3000000, measureDate: t, installDate: '', addr: '서울 서초구', depositAmount: 1500000, balanceAmount: 0 },
      { id: 9962, clientName: '미결제상담방문', phone: '01099990022', stage: '상담', staffName: '오지은 실장', price: 0, date: t, measureDate: '', installDate: '', addr: '서울', depositAmount: 0, balanceAmount: 0 },
      { id: 9963, clientName: '방문예약고객', phone: '01099990023', stage: '방문예약', staffName: '오지은 실장', price: 0, date: t, measureDate: '', installDate: '', addr: '서울', depositAmount: 0, balanceAmount: 0 }
    ]);
    localStorage.setItem('dah_saved', JSON.stringify([]));
    goTab('home'); renderHome(true);
    var h = document.getElementById('sec-hero'); var w = h ? h.parentElement : document.body;
    return w.textContent;
  });
  ok('3. 홈 일정: 결제 전 고객의 실측은 안 뜸', r3.indexOf('미결제실측고객') === -1);
  ok('4. 홈 일정: 결제한 고객의 실측은 정상 표시', r3.indexOf('결제실측고객') !== -1);
  ok('5. 홈 일정(N-132): 결제 전 상담 단계 고객은 오늘 등록돼도 안 뜸', r3.indexOf('미결제상담방문') === -1);
  ok('6. 홈 일정(N-132): 방문예약 단계 고객은 방문 일정으로 표시', r3.indexOf('방문예약고객') !== -1);

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
