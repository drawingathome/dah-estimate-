// tests/home-stale-lead-alert-check.js
// 2026-11-03 N-85: 홈 "진행없음" 알림이 서버가 계산한 마지막 활동(견적서 수정) 기준으로 뜨는지, 대기 리드는 안 뜨는지, 서버값이 없으면 예전 방식으로 대신하는지.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 27163;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await blockRealNetwork(page);
    await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 600));
    await loginAs(page, 'master');
    const r = await page.evaluate(() => {
      var w = window;
      var d = new Date(); d.setDate(d.getDate() - 100); var old = d.toISOString().slice(0, 10);
      var t = new Date().toISOString().slice(0, 10);
      var list = [
        { id: 7001, clientName: '활동없는가견적', staffName: '마스터', stage: '가견적', date: t, price: 1000000, depositAmount: 0, balanceAmount: 0 },
        { id: 7002, clientName: '최근활동고객', staffName: '마스터', stage: '가견적', date: old, price: 1000000, depositAmount: 0, balanceAmount: 0 },
        { id: 7003, clientName: '대기리드고객', staffName: '마스터', stage: '상담', date: old, leadParked: true, price: 1000000, depositAmount: 0, balanceAmount: 0 }
      ];
      saveCustomers(list);
      function textOf() { var h = document.getElementById('home'); return h ? h.innerText : ''; }
      var res = {};
      w._staleLeadMap = { 7001: 20, 7003: 40 };
      try { renderHome(true); } catch (e) { res.err = String(e); }
      res.withMap = textOf();
      w._staleLeadMap = null;
      try { renderHome(true); } catch (e) { res.err = String(e); }
      res.noMap = textOf();
      return res;
    });
    ok(!r.err, '화면 그리기 오류 없음' + (r.err ? ': ' + r.err : ''));
    ok(/활동없는가견적/.test(r.withMap) && /20일째 진행없음/.test(r.withMap), '서버가 알려준 고객(마지막 활동 20일 전)은 "20일째 진행없음"으로 뜸');
    ok(!/최근활동고객/.test(r.withMap), '등록일이 오래됐어도 최근 활동이 있어 서버 목록에 없는 고객은 안 뜸(기준이 등록일이 아님)');
    ok(!/대기리드고객/.test(r.withMap), '대기 리드 고객은 서버 목록에 있어도 안 뜸');
    ok(/최근활동고객/.test(r.noMap) || /진행없음/.test(r.noMap), '서버값을 못 받으면 예전 방식(등록일)으로 대신 표시');
    ok(errs.length === 0, '자바스크립트 오류 없음' + (errs.length ? ': ' + errs[0] : ''));
  } finally { await browser.close(); server.kill(); }
  console.log(fail ? '\n❌ 실패 ' + fail + '건' : '\n✅ 전체 통과');
  process.exit(fail ? 1 : 0);
})();
