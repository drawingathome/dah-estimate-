// N-148: 홈 '처리필요' — 시공일이 지났는데 아직 시공준비중이면 "시공일 지남" 알림이 뜬다. 시공일이 오늘·미래·미정이거나 다른 단계면 안 뜬다.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
async function run() {
  const server = await startServer(path.resolve(__dirname, '..'), 27187); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page); await page.setViewport({ width: 390, height: 900 });
  await page.goto('http://localhost:27187/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
  let fail = false; const ok = (l, c, d) => { console.log((c ? '✅' : '❌') + ' ' + l + (d !== undefined ? ' — ' + d : '')); if (!c) fail = true; };
  const res = await page.evaluate(async () => {
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const base = { staffName: '마스터', is_archived: false, date: todayStr(), price: 1000000, depositAmount: 500000, balanceAmount: 500000, orderStatus: { fabric: true, production: true, blind: true, material: true, install: true } };
    saveCustomers([
      Object.assign({ id: 901, clientName: '지남A', stage: '시공준비중', installDate: day(-3) }, base),
      Object.assign({ id: 902, clientName: '오늘B', stage: '시공준비중', installDate: day(0) }, base),
      Object.assign({ id: 903, clientName: '미래C', stage: '시공준비중', installDate: day(5) }, base),
      Object.assign({ id: 904, clientName: '미정D', stage: '시공준비중', installDate: day(-3), installDateTbd: true }, base),
      Object.assign({ id: 905, clientName: '완료E', stage: '시공완료', installDate: day(-3) }, base),
      Object.assign({ id: 906, clientName: '날짜없음F', stage: '시공준비중', installDate: '' }, base),
    ]);
    goTab('home'); renderHome(true); await new Promise(r => setTimeout(r, 600));
    return Array.from(document.querySelectorAll('[data-cname]')).map(e => ({ n: e.getAttribute('data-cname'), t: e.textContent }));
  });
  const has = n => res.some(r => r.n === n && r.t.includes('시공일') && r.t.includes('지남'));
  ok('시공일이 3일 지난 시공준비중: 뜸', has('지남A'));
  ok('시공일이 오늘: 안 뜸', !has('오늘B'));
  ok('시공일이 미래: 안 뜸', !has('미래C'));
  ok('시공일 미정 표시: 안 뜸', !has('미정D'));
  ok('이미 시공완료: 안 뜸', !has('완료E'));
  ok('시공일 없음: 안 뜸', !has('날짜없음F'));
  ok('JS 에러 없음', errs.length === 0, errs.join('|'));
  await browser.close(); server.close && server.close(); process.exit(fail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
