const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9920;
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

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // sbXHR 목업: estimate_history 조회와 estimates PATCH(복원) 둘 다 확인
  const r = await page.evaluate(() => {
    var patchCalls = [];
    window.sbXHR = function(method, path, data, cb) {
      if (method === 'GET' && path.indexOf('estimate_history?estimate_id=eq.est-123') === 0) {
        cb(null, [
          { estimate_id: 'est-123', changed_at: '2026-09-15T03:00:00Z', change_type: 'before_update',
            snapshot: { price: '5000000', line_items: [{ space: '거실', displayName: '원본원단' }], memo: '원본메모' } }
        ]);
        return;
      }
      if (method === 'PATCH' && path.indexOf('estimates?id=eq.est-123') === 0) {
        patchCalls.push(data);
        cb(null, [{ id: 'est-123' }]);
        return;
      }
      cb(null, []);
    };
    window.openDetail = function(){}; // 복원 후 새로고침 호출부 무해화
    window.currentDetailName = '테스트'; window.currentDetailId = 1;

    showEstimateHistoryModal('est-123', '테스트고객');
    return new Promise(function(resolve) {
      setTimeout(function() {
        var listText = document.getElementById('est-history-list').textContent;
        var restoreBtn = Array.from(document.querySelectorAll('#est-history-list button')).find(function(b){ return b.textContent.indexOf('복원') !== -1; });
        resolve({ listText: listText, hasRestoreBtn: !!restoreBtn });
      }, 300);
    });
  });
  ok('1. 이력 목록에 이전 버전(500만원)이 표시됨', r.listText.indexOf('5,000,000원') !== -1, r.listText);
  ok('2. "이 버전으로 복원" 버튼이 있음', r.hasRestoreBtn);

  // 실제 복원 버튼 클릭까지 진행
  const r2 = await page.evaluate(() => {
    return new Promise(function(resolve) {
      window.patchCalls = [];
      window.sbXHR = function(method, path, data, cb) {
        if (method === 'PATCH' && path.indexOf('estimates?id=eq.est-123') === 0) {
          window.patchCalls.push(data);
          cb(null, [{ id: 'est-123' }]);
          return;
        }
        cb(null, []);
      };
      var restoreBtn = Array.from(document.querySelectorAll('#est-history-list button')).find(function(b){ return b.textContent.indexOf('복원') !== -1; });
      restoreBtn.click();
      setTimeout(function() { resolve(window.patchCalls); }, 300);
    });
  });
  ok('3. 복원 버튼 클릭시 실제로 그 버전 값으로 PATCH 요청이 나감', r2.length === 1 && r2[0].price === '5000000', JSON.stringify(r2));

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 30000);
