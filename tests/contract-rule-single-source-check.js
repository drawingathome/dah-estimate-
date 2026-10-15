// tests/contract-rule-single-source-check.js
// 2026-10-13: "선금(입금)이 있어야 계약" 판정이 한 곳(isContractedCustomer)에만 있고,
// 홈 일정/캘린더가 그것만 쓰는지 확인. 선금 전 고객은 일정에 "미확정", 계약 고객은 표시 안 함.
const fs = require('fs');
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9961;
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
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined && !cond ? ' — ' + detail : '')); }

  // 1) 판정 함수 자체
  const j = await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([
      { clientId: 9971, clientName: '옛견적입금', price: 1000000, depositAmount: 500000, balanceAmount: 0, savedAt: '2026-09-01' },
      { clientId: 9971, clientName: '옛견적입금', price: 2000000, depositAmount: 0, balanceAmount: 0, savedAt: '2026-10-01' }
    ]));
    return {
      none: isContractedCustomer({ id: 9970, clientName: '입금없음', stage: '가견적', depositAmount: 0, balanceAmount: 0 }),
      custDep: isContractedCustomer({ id: 9972, clientName: '고객칸입금', stage: '선금결제', depositAmount: 300000 }),
      oldEstPaid: isContractedCustomer({ id: 9971, clientName: '옛견적입금', stage: '선금결제' }),
      nullArg: isContractedCustomer(null)
    };
  });
  ok('1-1. 입금 없는 가견적 고객은 계약 전', j.none === false);
  ok('1-2. 고객 칸에 선금이 있으면 계약', j.custDep === true);
  ok('1-3. 입금한 견적서가 옛 것이고 최신 견적서가 입금 전이어도 계약(예전 캘린더는 이걸 놓쳤음)', j.oldEstPaid === true);
  ok('1-4. null이 와도 죽지 않고 계약 전', j.nullArg === false);

  // 2) 홈 "오늘/내일 일정": 계약 전만 "미확정" 표시
  const home = await page.evaluate(() => {
    const d = new Date();
    const f = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    const today = f(d);
    localStorage.setItem('dah_saved', JSON.stringify([]));
    saveCustomers([
      { id: 9980, clientName: '계약전일정고객', phone: '01099990080', stage: '가견적', staffName: '마스터', price: 2000000, measureDate: today, depositAmount: 0, balanceAmount: 0, addr: '서울' },
      { id: 9981, clientName: '계약일정고객', phone: '01099990081', stage: '실측준비중', staffName: '마스터', price: 2000000, measureDate: today, depositAmount: 1000000, balanceAmount: 0, addr: '서울' }
    ]);
    renderHome(true);
    const rows = Array.from(document.querySelectorAll('#home [data-cname]'));
    const find = n => rows.find(r => r.getAttribute('data-cname') === n);
    const a = find('계약전일정고객'), b = find('계약일정고객');
    return { aText: a ? a.textContent : null, bText: b ? b.textContent : null };
  });
  ok('2-1. 홈 일정: 선금 전 고객 일정에 "미확정(결제 전)"이 표시됨', !!home.aText && home.aText.indexOf('미확정') !== -1, home.aText);
  ok('2-2. 홈 일정: 선금 낸 고객 일정에는 "미확정"이 없음', !!home.bText && home.bText.indexOf('미확정') === -1, home.bText);

  // 3) 캘린더: 입금한 견적서가 옛 것이어도 계약 고객은 "미확정"이 아님
  const cal = await page.evaluate(() => {
    const d = new Date();
    const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    localStorage.setItem('dah_saved', JSON.stringify([
      { clientId: 9990, clientName: '캘린더옛견적입금', price: 1000000, depositAmount: 500000, balanceAmount: 0, savedAt: '2026-09-01' },
      { clientId: 9990, clientName: '캘린더옛견적입금', price: 2000000, depositAmount: 0, balanceAmount: 0, savedAt: '2026-10-01' }
    ]));
    saveCustomers([{ id: 9990, clientName: '캘린더옛견적입금', phone: '01099990090', stage: '선금결제', staffName: '마스터', price: 2000000, measureDate: ym + '-22', depositAmount: 500000, balanceAmount: 0, addr: '서울' }]);
    goTab('cal'); renderCal();
    const body = document.getElementById('cal-list');
    return body ? body.textContent : 'cal-list 없음';
  });
  ok('3-1. 캘린더: 옛 견적서에 선금이 있는 계약 고객은 "미확정"으로 안 뜸', cal.indexOf('캘린더옛견적입금') !== -1 && cal.indexOf('미확정') === -1, cal.slice(0, 200));

  // 4) 재발 방지: 화면 파일이 결제 여부를 따로 계산하지 않고 공용 함수를 쓰는지
  const render = fs.readFileSync(path.join(dir, 'dash-render.js'), 'utf8');
  const calendar = fs.readFileSync(path.join(dir, 'dash-calendar.js'), 'utf8');
  ok('4-1. 홈 일정(dash-render.js)이 isContractedCustomer를 사용', /isContractedCustomer\s*\(/.test(render));
  ok('4-2. 캘린더(dash-calendar.js)가 isContractedCustomer를 사용', /isContractedCustomer\s*\(/.test(calendar));
  const defs = ['dash-render.js', 'dash-calendar.js', 'dash-kanban.js', 'dash-customer-alim.js', 'dash-customer-detail.js', 'dash-customer-pay.js']
    .filter(f => /function\s+isContractedCustomer\s*\(/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  ok('4-3. 판정 함수가 화면 파일에 따로 또 정의돼 있지 않음(dash-utils.js 한 곳)', defs.length === 0, defs.join(','));

  // 4-4) 받은 돈이 0보다 큰지를 화면 파일이 직접 계산하지 않음(판정은 isContractedCustomer 한 곳)
  const offenders = fs.readdirSync(dir).filter(f => /^dash-.*\.js$/.test(f) && f !== 'dash-utils.js')
    .filter(f => /getReceivedAmount\s*\([^)]*\)\s*(>|<=)\s*0/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  ok('4-4. 화면 파일이 "받은 돈 > 0"으로 계약 여부를 따로 판정하지 않음', offenders.length === 0, offenders.join(','));

  // 4-5) 2-7: "마스터인가" 판정은 isMasterUser() 한 곳. 화면 파일이 role === 'master' 를 직접 비교하지 않음(dash-auth.js의 body 클래스 설정만 예외)
  const roleOffenders = fs.readdirSync(dir).filter(f => /^dash-.*\.js$/.test(f) && f !== 'dash-utils.js')
    .filter(f => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').some(line => /role\s*[!=]==\s*'master'/.test(line) && !(f === 'dash-auth.js' && /classList\.add/.test(line))));
  ok('4-5. 화면 파일이 role === "master" 를 직접 비교하지 않음(isMasterUser 한 곳)', roleOffenders.length === 0, roleOffenders.join(','));
  const mu = await page.evaluate(() => { const saved = currentUser; const r = {}; r.master = isMasterUser(); currentUser = null; r.none = isMasterUser(); currentUser = { name: 'x', role: 'staff' }; r.staff = isMasterUser(); currentUser = { name: 'x' }; r.norole = isMasterUser(); currentUser = saved; return r; });
  ok('4-6. isMasterUser: 마스터만 true, 로그인 없음·실장·역할 없음은 false(fail-closed)', mu.master === true && mu.none === false && mu.staff === false && mu.norole === false, JSON.stringify(mu));

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');
  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 40000);
