// tests/order-status-concurrent-check.js
// 2026-10-25 전수표 T-01: 발주 체크 저장이 다른 기기의 발주 체크를 지우지 않는지 확인.
// 가짜 서버(수정 시각이 같을 때만 반영)로 5가지 상황을 시험한다.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9932;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  const log = [];
  const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (d !== undefined ? ' — ' + d : ''));

  const out = await page.evaluate(() => {
    function scenario(opts) {
      return new Promise(function(resolve) {
        var db = { order_status: opts.server, updated_at: 'T0' }, patches = [], gets = 0, toasts = 0, errs = 0;
        window.syncCustomerToSheet = function(){};
        window.showToast = function(){ toasts++; };
        window.reportClientError = function(){ errs++; };
        window.sbXHR = function(method, p, data, cb) {
          if (method === 'GET') {
            gets++;
            if (opts.getFails) { cb({ status: 0, text: 'offline' }, null); return; }
            cb(null, [{ order_status: JSON.parse(JSON.stringify(db.order_status)), updated_at: db.updated_at }]); return;
          }
          patches.push(p);
          // 읽은 뒤 저장 사이에 다른 기기가 먼저 저장한 상황
          if (opts.raceOnce && patches.length === 1) { db.order_status = Object.assign({}, db.order_status, { rail: { done: true } }); db.updated_at = 'T-race'; }
          var m = p.match(/updated_at=eq\.([^&]*)/); var cond = m ? decodeURIComponent(m[1]) : null;
          var match = opts.alwaysConflict ? false : (cond === null || cond === db.updated_at);
          if (!match) { cb({ status: 200, text: '0건', zeroRows: true }, null); return; }
          db.order_status = data.order_status; db.updated_at = 'T' + patches.length;
          cb(null, [{ id: 7, order_status: db.order_status, updated_at: db.updated_at }]);
        };
        var cust = { id: 7, clientName: '시험', orderStatus: opts.local };
        saveOrderItemGuarded(cust, 'blind', { done: true }, function(err) {
          resolve({ err: !!err, server: db.order_status, patchCount: patches.length, getCount: gets, toasts: toasts, errs: errs, firstPatch: patches[0] });
        });
      });
    }
    return Promise.all([
      scenario({ server: { curtain: { done: true } }, local: { curtain: { done: true } } }),              // 1 정상
      scenario({ server: { curtain: { done: true } }, local: {} }),                                       // 2 낡은 캐시(커튼 체크를 모름)
      scenario({ server: { curtain: { done: true } }, local: { curtain: { done: true } }, raceOnce: true }), // 3 읽은 뒤 다른 기기가 먼저 저장
      scenario({ server: {}, local: {}, alwaysConflict: true }),                                          // 4 계속 충돌
      scenario({ server: { curtain: { done: true } }, local: { blind: { done: true } }, getFails: true })  // 5 서버를 못 읽음(오프라인)
    ]);
  });
  const has = (o, k) => !!(o && o[k] && o[k].done);
  ok('1. 정상: 수정 시각 조건으로 한 번 저장, 기존 체크 유지', out[0].patchCount === 1 && /updated_at=eq\./.test(out[0].firstPatch) && has(out[0].server, 'curtain') && has(out[0].server, 'blind') && !out[0].err, JSON.stringify(out[0]));
  ok('2. 낡은 캐시여도 서버에 있던 다른 항목 체크를 지우지 않음', has(out[1].server, 'curtain') && has(out[1].server, 'blind') && !out[1].err, JSON.stringify(out[1]));
  ok('3. 중간에 다른 기기가 저장해도 다시 읽어 합쳐 모두 남김(재시도 1번)', out[2].patchCount === 2 && has(out[2].server, 'rail') && has(out[2].server, 'curtain') && has(out[2].server, 'blind') && !out[2].err, JSON.stringify(out[2]));
  ok('4. 계속 충돌하면 조용히 넘기지 않고 알림+오류 기록', out[3].err && out[3].toasts >= 1 && out[3].errs >= 1 && out[3].patchCount === 2, JSON.stringify(out[3]));
  ok('5. 서버를 못 읽으면 예전 방식(이 기기 값 전체)으로 저장 시도', out[4].patchCount === 1 && !/updated_at=eq\./.test(out[4].firstPatch || ''), JSON.stringify(out[4]));
  ok('6. JS 에러 없음', jsErrors.length === 0, jsErrors.join(';'));
  log.forEach(l => console.log(l));
  await browser.close(); server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
