// tests/home-order-urgent-check.js
// 2026-11-15 N-165 P2(N-163 처방 ①·N-164 ④): 시공일이 7일 안인데 발주(시공 제외)가 안 끝난 고객은 홈 '처리 필요'에 "시공 D-N일 · 발주 미기록: …"이 뜬다.
// 한계: 가짜 데이터·제 환경 Chromium. 실제 고객 데이터의 홈 화면은 선혜님 눈 확인 필요.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const server = await startServer(path.resolve(__dirname, '..'), 9959); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await blockRealNetwork(page);
  await page.goto('http://localhost:9959/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 800)); await loginAs(page, 'master');
  const r = await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([{ clientId: 1, clientName: '급한고객', curtainCount: 2, blindCount: 1, isArchived: false, savedAt: '2026-11-10' }]));
    var T = '2026-11-15';
    function cust(over) { return Object.assign({ id: 1, clientName: '급한고객', stage: '잔금결제', installDate: '2026-11-18', installDateTbd: false, orderStatus: {} }, over || {}); }
    var out = {};
    out.d3 = getUrgentOrderInfo(cust(), T);
    out.today = getUrgentOrderInfo(cust({ installDate: '2026-11-15' }), T);
    out.d7 = getUrgentOrderInfo(cust({ installDate: '2026-11-22' }), T);
    out.d8 = getUrgentOrderInfo(cust({ installDate: '2026-11-23' }), T);
    out.past = getUrgentOrderInfo(cust({ installDate: '2026-11-14' }), T);
    out.tbd = getUrgentOrderInfo(cust({ installDateTbd: true }), T);
    out.stage = getUrgentOrderInfo(cust({ stage: '시공완료' }), T);
    out.partial = getUrgentOrderInfo(cust({ orderStatus: { fabric: { done: true }, production: { done: true } } }), T);
    out.allDone = getUrgentOrderInfo(cust({ orderStatus: { fabric: { done: true }, production: { done: true }, material: { done: true }, blind: { done: true } } }), T);
    out.badDate = getUrgentOrderInfo(cust({ installDate: '내일' }), T);
    // 홈 화면
    var now = new Date(); var y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
    var d = new Date(now.getTime() + 3 * 86400000); var ymd3 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    saveCustomers([{ id: 1, clientName: '급한고객', phone: '01090000001', addr: '서울', stage: '잔금결제', staffName: '장선혜', date: '2026-10-01', installDate: ymd3, orderStatus: {} }]);
    renderHome(true);
    out.home = document.body.innerText;
    return out;
  });
  ok('1. 시공 3일 전: 남은 일수 3 + 원단 발주 포함, 시공 발주는 제외', r.d3 && r.d3.days === 3 && r.d3.missing.some(m => m.indexOf('원단 발주') >= 0) && !r.d3.missing.some(m => m.indexOf('시공 발주') >= 0), JSON.stringify(r.d3));
  ok('2. 시공 당일은 남은 일수 0', r.today && r.today.days === 0, JSON.stringify(r.today));
  ok('3. 7일째는 포함, 8일째는 안 뜸', r.d7 && r.d7.days === 7 && r.d8 === null, JSON.stringify([r.d7, r.d8]));
  ok('4. 시공일이 지났으면 여기선 안 뜸(별도 "시공일 지남" 안내가 있음)', r.past === null, JSON.stringify(r.past));
  ok('5. 시공일 미정·이상한 날짜·시공완료 단계는 안 뜸', r.tbd === null && r.badDate === null && r.stage === null, JSON.stringify([r.tbd, r.badDate, r.stage]));
  ok('6. 일부만 발주됐으면 남은 것만(원단·제작 완료 → 자재·블라인드)', r.partial && !r.partial.missing.some(m => m.indexOf('원단 발주') >= 0 || m.indexOf('제작 발주') >= 0) && r.partial.missing.length >= 1, JSON.stringify(r.partial));
  ok('7. 발주가 모두 끝났으면 안 뜸', r.allDone === null, JSON.stringify(r.allDone));
  ok('8. 홈 처리 필요에 실제로 표시됨', r.home.indexOf('발주 미기록') >= 0 && r.home.indexOf('D-3일') >= 0, r.home.slice(0, 300));
  console.log(errs.length ? '❌ JS 에러: ' + errs.join('; ') : '✅ JS 에러 없음'); if (errs.length) fail++;
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
