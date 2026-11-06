// N-133: 홈 카드 "N월 상담건수 / N월 계약건수 / 지금 진행 중(누적)"이 월 이름을 달고 올바른 기준으로 나오는지
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9936;
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
    var older = f(new Date(d.getFullYear(), d.getMonth() - 1, 3));
    var m = d.getMonth() + 1;
    var base = { staffName: '마스터', phone: '', addr: '', measureDate: '', installDate: '', balanceAmount: 0, depositAmount: 0 };
    function mk(o) { return Object.assign({}, base, o); }
    saveCustomers([
      // 이번달 등록 상담 2명(선금 없음)
      mk({ id: 9971, clientName: '이번달상담A', stage: '상담', date: thisDay, price: 1000000 }),
      mk({ id: 9972, clientName: '이번달상담B', stage: '가견적', date: thisDay, price: 2000000 }),
      // 지난달 등록, 이번달 선금 입금 → 상담건수에는 안 들어가고 계약건수에는 들어감
      mk({ id: 9973, clientName: '지난달등록이번달계약', stage: '실측준비중', date: prevDay, price: 3000000, depositAmount: 1500000, depositDate: thisDay }),
      // 이번달 등록, 이번달 선금 → 둘 다
      mk({ id: 9974, clientName: '이번달등록이번달계약', stage: '선금결제', date: thisDay, price: 1000000, depositAmount: 500000, depositDate: thisDay }),
      // 지난달 계약, 지금 진행 중 → 둘 다 아님, 진행 중 누적에만
      mk({ id: 9975, clientName: '지난달계약진행중', stage: '시공준비중', date: older, price: 1000000, depositAmount: 500000, depositDate: older, balanceAmount: 500000, balanceDate: older }),
      // 단계만 선금결제, 입금 0원 → 진행 중에 넣지 않음(N-134)
      mk({ id: 9977, clientName: '입금없는선금결제', stage: '선금결제', date: older, price: 1000000 }),
      // 시공완료 → 진행 중 누적에서 빠짐
      mk({ id: 9976, clientName: '완료고객', stage: '시공완료', date: older, price: 1000000, depositAmount: 500000, depositDate: older, balanceAmount: 500000, balanceDate: older })
    ]);
    localStorage.setItem('dah_saved', JSON.stringify([]));
    goTab('home'); renderHome(true);
    function cardNum(id) {
      var el = document.getElementById(id); if (!el) return null;
      var box = el.parentElement;
      return { label: el.textContent, num: parseInt(box.children[1].textContent, 10) };
    }
    var scopeTxt = document.getElementById('kpi-consult').parentElement.textContent;
    return { m: m, scopeTxt: scopeTxt, consult: cardNum('kpi-consult'), contract: cardNum('kpi-newcontract'), progGone: !document.getElementById('kpi-inprogress') && document.body.textContent.indexOf('지금 진행 중') === -1 };
  });
  ok('1. 상담건수 카드 라벨에 월이 들어감', r.consult && r.consult.label === r.m + '월 상담건수', r.consult && r.consult.label);
  ok('2. 상담건수 = 이번달 등록 3명(상담A·B·이번달등록이번달계약)', r.consult && r.consult.num === 3, r.consult && r.consult.num);
  ok('3. 계약건수 카드 라벨에 월이 들어감', r.contract && r.contract.label === r.m + '월 계약건수', r.contract && r.contract.label);
  ok('4. 계약건수 = 이번달 첫 선금 2명(지난달 등록분 포함)', r.contract && r.contract.num === 2, r.contract && r.contract.num);
  ok('5. "지금 진행 중" 카드는 홈에 없음(선혜님 요청)', r.progGone === true);

  ok('6. 마스터 화면은 카드에 "전체" 범위 표시(N-134⑤)', r.scopeTxt.indexOf('전체') !== -1, r.scopeTxt);
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
