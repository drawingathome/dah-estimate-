// tests/dash-dup-409-check.js
// N-128(2026-11-06): 대시보드에서 새 고객 저장(POST)이 중복 거절(409/23505)되면 재시도 대기열에 넣지 않고 안내만 하는지,
// 일반 서버 오류(500)는 예전처럼 대기열에 들어가는지(기존 동작 보존) 확인. 한계: 가짜 서버 시험.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; };
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const server = await startServer(path.resolve(__dirname, '..'), 27181); const browser = await launchBrowser();
  try {
    const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await blockRealNetwork(page);
    await page.goto('http://localhost:27181/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
    const r = await page.evaluate(async () => {
      const out = { queued: [], toasts: [] };
      let mode = 409;
      function FakeXHR() { this.headers = {}; }
      FakeXHR.prototype.open = function (m, u) { this.m = m; this.u = u; };
      FakeXHR.prototype.setRequestHeader = function (k, v) { this.headers[k] = v; };
      FakeXHR.prototype.send = function () { const self = this; setTimeout(function () { self.status = mode; self.responseText = mode === 409 ? '{"code":"23505","message":"duplicate key value violates unique constraint"}' : '{"message":"boom"}'; self.onload && self.onload(); }, 0); };
      window.XMLHttpRequest = FakeXHR;
      window.addToPendingSyncQueue = function (k, m, p) { out.queued.push(m + ' ' + p); };
      window.showToast = function (t) { out.toasts.push(t); };
      const call = () => new Promise(res => saveCustomerToDb({ clientName: '김태연', phone: '01075027924', staffName: '마스터', stage: '상담' }, (e, d) => res({ e: !!e, status: e && e.status })));
      mode = 409; out.r409 = await call(); out.q409 = out.queued.length; out.t409 = out.toasts.slice();
      out.queued = []; out.toasts = []; mode = 500; out.r500 = await call(); out.q500 = out.queued.length;
      return out;
    });
    ok(r.r409.e === true, '409: 호출한 쪽에는 실패로 알려줌');
    ok(r.q409 === 0, '409(중복 거절): 재시도 대기열에 넣지 않음 — ' + r.q409);
    ok(r.t409.some(t => /이미 있어요/.test(t)), '409: 중복 안내 문구가 뜸 — ' + JSON.stringify(r.t409));
    ok(r.q500 === 1, '500(일반 오류): 예전처럼 재시도 대기열에 들어감(기존 동작 보존) — ' + r.q500);
    ok(errs.length === 0, '화면 오류(JS) 없음 ' + errs.join(';'));
  } finally { await browser.close(); server.close && server.close(); }
  console.log(fail ? '❌ 실패 ' + fail + '건' : '✅ 모두 통과'); process.exit(fail ? 1 : 0);
})();
