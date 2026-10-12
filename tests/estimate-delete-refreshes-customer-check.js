// 견적서를 삭제하면 DB가 고객 금액을 빼고 수정 시각을 바꾸므로, 화면의 고객 캐시도 서버 값으로 맞춰지는지 검증 (김성은 사례: 지운 견적서 금액이 고객 금액에 유령처럼 남음)
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 50000);
(async () => {
  const server = await startServer(path.resolve(__dirname, '..'), 27152);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await blockRealNetwork(page);
    await page.goto('http://localhost:27152/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');
    const r = await page.evaluate(async () => {
      const out = { calls: [] };
      saveCustomers([{ id: 9701, clientName: '삭제시험', staffName: '마스터', stage: '가견적', price: 14171000, performanceRevenue: 7786400, updatedAt: 'old-lock' }]);
      let failGet = false;
      window.sbXHR = function (m, p, d, cb) {
        out.calls.push(m + ' ' + p.split('?')[0]);
        if (m === 'DELETE') return cb(null, []);
        if (m === 'GET' && p.indexOf('customers?') === 0) return failGet ? cb({ status: 500 }, null) : cb(null, [{ id: 9701, price: 6203000, performance_revenue: 4469400, updated_at: 'new-lock' }]);
        cb(null, []);
      };
      const estId = '0a80fb6e-c4cb-4948-a71a-914a60ad751f';
      out.cbErr = 'unset';
      await new Promise(res => archiveEstimate({ id: estId, clientId: 9701, no: 'X' }, e => { out.cbErr = e; res(); }));
      const c = loadCustomers().find(x => x.id === 9701);
      out.price = c.price; out.perf = c.performanceRevenue; out.lock = c.updatedAt;
      // 서버 조회가 실패해도 삭제는 성공으로 끝나고 기존 캐시는 그대로
      saveCustomers([{ id: 9701, clientName: '삭제시험', price: 111, performanceRevenue: 22, updatedAt: 'old-lock' }]);
      failGet = true; out.cbErr2 = 'unset';
      await new Promise(res => archiveEstimate({ id: estId, clientId: 9701, no: 'X' }, e => { out.cbErr2 = e; res(); }));
      out.price2 = loadCustomers().find(x => x.id === 9701).price;
      // 고객 id를 모르는 견적서는 조회 없이 끝남
      out.calls = []; out.cbErr3 = 'unset';
      await new Promise(res => archiveEstimate({ id: estId, no: 'X' }, e => { out.cbErr3 = e; res(); }));
      out.calls3 = out.calls.slice();
      return out;
    });
    ok(r.cbErr === null, '삭제 성공 시 콜백이 오류 없이 호출됨');
    ok(r.price === 6203000 && r.perf === 4469400, '삭제 후 고객 금액이 서버 값(남은 견적서 몫)으로 갱신됨: ' + r.price + '/' + r.perf);
    ok(r.lock === 'new-lock', '고객 수정 시각(잠금값)도 서버 값으로 갱신됨(다음 저장이 가짜 충돌 안 남)');
    ok(r.cbErr2 === null && r.price2 === 111, '고객 조회가 실패해도 삭제는 성공으로 끝나고 캐시는 그대로');
    ok(r.calls3.length === 1 && r.calls3[0] === 'DELETE estimates', '고객 id를 모르면 불필요한 조회를 하지 않음: ' + r.calls3.join(','));
    ok(errs.length === 0, 'JS 오류 없음 ' + errs.join('|'));
  } catch (e) { console.log('❌ 예외', e.message); fail++; }
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})();
