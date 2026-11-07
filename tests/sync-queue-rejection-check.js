// N-145 (M1·M3, 전문업체 3차 검토): 재시도 대기열(retryPendingSync)이
//  - 확정 거절(409/403/23xxx)은 대기열에서 빼고 백업에 남기되, 백업의 customerId가 '진짜 고객 id'여야 복구 화면이 PATCH를 맞게 보냄
//  - 일시 오류(400 PGRST204 스키마 캐시, 404, 500)는 대기열에 그대로 둠
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; };
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const server = await startServer(path.resolve(__dirname, '..'), 27184); const browser = await launchBrowser();
  try {
    const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await blockRealNetwork(page);
    await page.goto('http://localhost:27184/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
    const r = await page.evaluate(async () => {
      const out = {};
      const resp = {
        'a1': { status: 409, text: '{"code":"23505","message":"duplicate key"}' },
        'a2': { status: 403, text: '{"code":"42501","message":"마감된 달"}' },
        'a3': { status: 400, text: '{"code":"PGRST204","message":"Could not find the column in the schema cache"}' },
        'a4': { status: 404, text: '{"code":"PGRST205"}' },
        'a5': { status: 500, text: 'boom' }
      };
      window.showToast = function () {};
      window.sbXHR = function (m, p, d, cb) { const k = p.match(/eq\.(\w+)/)[1]; cb(resp[k], null); };
      localStorage.removeItem('dah_failed_customer_saves');
      
      Object.keys(resp).forEach(k => addToPendingSyncQueue(k + ':fields:memo', 'PATCH', 'customers?id=eq.' + k, { memo: 'x' }));
      out.before = getPendingSyncQueue().length;
      retryPendingSync();
      await new Promise(r => setTimeout(r, 100));
      out.left = getPendingSyncQueue().map(i => i.path.split('eq.')[1]).sort().join(',');
      const fails = JSON.parse(localStorage.getItem('dah_failed_customer_saves') || '[]');
      out.backupIds = fails.map(f => f.customerId).sort().join(',');
      return out;
    });
    ok(r.before === 5, '대기열 5건 준비: ' + r.before);
    ok(r.left === 'a3,a4,a5', '일시 오류(400 PGRST204·404·500)는 대기열에 남고 확정 거절(409·403)만 빠짐: ' + r.left);
    ok(r.backupIds === 'a1,a2', '백업의 customerId가 진짜 고객 id(복구 화면이 customers?id=eq.<id>로 보낼 값): ' + r.backupIds);
    ok(errs.length === 0, 'JS 오류 없음 ' + errs.join('|'));
  } catch (e) { console.log('❌ 예외', e.message); fail++; }
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})();
