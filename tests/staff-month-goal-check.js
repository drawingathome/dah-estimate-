// tests/staff-month-goal-check.js
// 2026-11-15(N-169, 선혜님 '오지은 실장의 목표가 매달 바뀔 거야, 11월은 2000만원'): 실장 달별 목표를 홈·월별 영업표가 읽고, 마스터 설정 화면에서 달마다 입력·해제.
// 한계: 가짜 서버 시험. 실제 운영 값(app_settings.staff_goals_monthly)과 화면 모양은 선혜님 눈 확인 필요.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
async function run() {
  const dir = path.resolve(__dirname, '..'), port = 9945;
  const server = await startServer(dir, port); const browser = await launchBrowser();
  const page = await browser.newPage(); const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page); await page.setViewport({ width: 390, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
  const log = []; function ok(l, c, d) { log.push((c ? '✅' : '❌') + ' ' + l + (c ? '' : ' — ' + d)); }
  const r = await page.evaluate(() => {
    var out = {};
    localStorage.setItem('dah_staff_list', JSON.stringify(['오지은 실장']));
    localStorage.setItem('dah_settings', JSON.stringify({ monthlyGoal: '5000' }));
    setStaffMonthGoal('오지은 실장', '2026-11', 20000000);
    out.g11 = getStaffMonthGoal('오지은 실장', '2026-11'); out.g12 = getStaffMonthGoal('오지은 실장', '2026-12');
    out.masterGoal = getMonthGoalAmount('2026-11');
    // 설정 화면: 달 선택·입력칸
    renderSettings();
    var mi = document.getElementById('set-staff-goal-month');
    out.hasMonthInput = !!mi;
    if (mi) { mi.value = '2026-12'; mi.dispatchEvent(new Event('change')); }
    var inp = document.querySelector('[data-staff-month-goal="오지은 실장"]');
    out.inputEmpty12 = inp ? inp.value === '' : null;
    if (inp) { inp.value = '30000000'; inp.dispatchEvent(new Event('change')); }
    out.g12after = getStaffMonthGoal('오지은 실장', '2026-12');
    if (inp) { inp.value = '0'; inp.dispatchEvent(new Event('change')); }
    out.g12cleared = getStaffMonthGoal('오지은 실장', '2026-12');
    // 실장으로 전환해서 표·홈 확인
    currentUser = { name: '오지은 실장', role: 'staff' };
    out.staff11 = getMonthGoalAmount('2026-11'); out.staff10 = getMonthGoalAmount('2026-10');
    var base = { staffName: '오지은 실장', phone: '', addr: '', measureDate: '', installDate: '', balanceAmount: 0, depositAmount: 0 };
    var cs = [Object.assign({}, base, { id: 9101, clientName: 'F', stage: '실측준비중', date: '2026-11-03', price: 4000000, performanceRevenue: 4000000, depositAmount: 2000000, depositDate: '2026-11-05' })];
    saveCustomers(cs); localStorage.setItem('dah_saved', JSON.stringify([]));
    goTab('chart'); renderChart('monthly');
    var wrap = document.getElementById('chart-monthly-sales');
    var tr = wrap ? Array.from(wrap.querySelectorAll('tbody tr')) : [];
    var row11 = tr.filter(function(t){ return t.textContent.indexOf('2026.11') >= 0; })[0];
    var row10 = tr.filter(function(t){ return t.textContent.indexOf('2026.10') >= 0; })[0];
    out.row11 = row11 ? Array.from(row11.querySelectorAll('td')).map(function(t){ return t.textContent; }) : null;
    out.row10 = row10 ? Array.from(row10.querySelectorAll('td')).map(function(t){ return t.textContent; }) : null;
    // 홈: 11월 목표 있음/없음(가짜 시계 대신 현재 달 키로 비교)
    var nowKey = (function(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })();
    out.nowKey = nowKey;
    var nowGoal = getStaffMonthGoal('오지은 실장', nowKey);
    if (nowGoal) setStaffMonthGoal('오지은 실장', nowKey, 0);
    currentUser = { name: '오지은 실장', role: 'staff' };
    goTab('home'); renderHome(true);
    out.homeText = document.body.textContent.indexOf('목표 미설정') >= 0;
    var _bt = document.body.textContent;
    out.homeNoZero = _bt.indexOf('목표까지 0만원') < 0 && _bt.indexOf('목표가 아직 설정되지 않았어요') >= 0;
    // 새 기기(로컬에 달별 목표 없음) + 서버에서 설정이 늦게 도착하는 경우: 설정을 불러온 뒤 홈이 다시 그려져 목표가 보여야 함
    localStorage.removeItem('dah_staff_goals_monthly');
    var _realSbXHR = sbXHR;
    var _nowK = out.nowKey; var _mm = {}; _mm[_nowK] = { '오지은 실장': 20000000 };
    sbXHR = function(method, url, body, cb) { if (/app_settings/.test(url)) { cb(null, [{ key: 'staff_goals_monthly', value: _mm }]); } else { _realSbXHR(method, url, body, cb); } };
    currentUser = { name: '오지은 실장', role: 'staff' };
    goTab('home'); renderHome(true);
    out.coldBefore = document.body.textContent.indexOf('목표가 아직 설정되지 않았어요') >= 0;
    loadAppSettingsAsync(function(){ renderHome(true); });
    out.coldAfter = document.body.textContent.indexOf('목표가 아직 설정되지 않았어요') < 0 && document.body.textContent.indexOf('목표까지') >= 0;
    sbXHR = _realSbXHR;
    out.wiredAuth = true;
    return out;
  });
  const fs = require('fs');
  const authSrc = fs.readFileSync(path.join(dir, 'dash-auth.js'), 'utf8'), htmlSrc = fs.readFileSync(path.join(dir, 'dah-dashboard.html'), 'utf8');
  r.wiredLogin = /loadAppSettingsAsync\(function\(\)\{\s*renderHome\(true\);\s*\}\)/.test(authSrc);
  r.wiredSaved = /loadAppSettingsAsync\(function\(\)\{\s*renderHome\(true\);\s*\}\)/.test(htmlSrc);
  ok('1. 11월 2000만원 저장, 12월은 목표 없음(null)', r.g11 === 20000000 && r.g12 === null, r.g11 + '/' + r.g12);
  ok('2. 마스터 목표는 기존 전체 월 목표(5000만원) 그대로', r.masterGoal === 50000000, r.masterGoal);
  ok('3. 설정 화면에 달 선택 칸과 실장 입력칸이 있고 12월은 비어 있음', r.hasMonthInput && r.inputEmpty12 === true, JSON.stringify([r.hasMonthInput, r.inputEmpty12]));
  ok('4. 설정에서 12월 3000만원 입력하면 저장, 0 입력하면 해제', r.g12after === 30000000 && r.g12cleared === null, r.g12after + '/' + r.g12cleared);
  ok('5. 실장 로그인: 11월 목표 2000만원, 10월은 미설정(null)', r.staff11 === 20000000 && r.staff10 === null, r.staff11 + '/' + r.staff10);
  ok('6. 실장 월별표 11월 달성률 = 성과매출 ÷ 2000만원 (200만÷2000만=10%)', r.row11 && r.row11[6] === '10%', JSON.stringify(r.row11));
  ok('7. 실장 월별표 10월(목표 없음) 달성률은 —', r.row10 && r.row10[6] === '—', JSON.stringify(r.row10));
  ok('8. 실장 홈: 이번 달 목표가 없으면 "목표 미설정" 표시', r.homeText === true, 'nowKey=' + r.nowKey);
  ok('9. 실장 홈: 목표 없을 때 큰 제목이 "목표까지 0만원 남았어요"가 아니라 "목표가 아직 설정되지 않았어요"', r.homeNoZero === true, 'homeNoZero=' + r.homeNoZero);
  ok('10. 새 기기(달별 목표 비어 있음): 처음엔 목표 미설정 → 서버 설정을 불러온 뒤 홈이 다시 그려져 목표가 보임', r.coldBefore === true && r.coldAfter === true, JSON.stringify([r.coldBefore, r.coldAfter]));
  ok('11. 새 로그인·저장된 로그인 두 경로 모두 설정을 불러온 뒤 홈을 다시 그리도록 연결(관찰형: 코드 연결 확인)', r.wiredLogin && r.wiredSaved, JSON.stringify([r.wiredLogin, r.wiredSaved]));
  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');
  await browser.close(); server.kill(); process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 40000);
