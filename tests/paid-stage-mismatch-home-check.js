// 2026-10-24: 홈 "처리필요" 안전망 시험 — 전액 입금인데 단계가 아직 선금결제/실측준비중/확정견적이면 "완납 단계 확인"이 뜨고,
// 일부만 받았거나 이미 다음 단계면 뜨지 않는다. (규칙이 꺼져 있거나 못 움직여도 사람이 놓치지 않게 하는 용도)
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27142;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  let anyFail = false;
  function ok(label, cond, detail) { console.log((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); if (!cond) anyFail = true; }
  const res = await page.evaluate(async () => {
    var base = { staffName: '마스터', is_archived: false, date: todayStr() };
    saveCustomers([
      Object.assign({ id: 801, clientName: '완납확정A', stage: '확정견적', price: 1000000, depositAmount: 500000, balanceAmount: 500000 }, base),
      Object.assign({ id: 802, clientName: '일부입금B', stage: '확정견적', price: 1000000, depositAmount: 500000, balanceAmount: 0 }, base),
      Object.assign({ id: 803, clientName: '다음단계C', stage: '시공준비중', price: 1000000, depositAmount: 500000, balanceAmount: 500000 }, base),
      Object.assign({ id: 804, clientName: '초과입금D', stage: '실측준비중', price: 1000000, depositAmount: 600000, balanceAmount: 500000 }, base)
    ]);
    goTab('home'); renderHome(true);
    await new Promise(r => setTimeout(r, 600));
    var rows = Array.from(document.querySelectorAll('[data-cname]')).map(function(e){ return { n: e.getAttribute('data-cname'), t: e.textContent }; });
    return { rows: rows };
  });
  const has = (n) => res.rows.some(r => r.n === n && r.t.includes('완납 단계 확인'));
  ok('완납인데 확정견적: 뜸', has('완납확정A'));
  ok('초과입금인데 실측준비중: 뜸', has('초과입금D'));
  ok('일부만 입금: 안 뜸', !has('일부입금B'));
  ok('이미 시공준비중(완납): 안 뜸', !has('다음단계C'));
  ok('JS 에러 없음', jsErrors.length === 0, jsErrors.join('|'));
  await browser.close(); server.close && server.close();
  process.exit(anyFail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
