const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9897;
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

  // 1) 오래된 견적(어제 저장됨) - 경고 배너가 미리보기에 떠야 함
  await page.evaluate(() => {
    var yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    window.sbXHR = function(method, path, data, cb) {
      if (method === 'GET' && path.indexOf('estimates?client_id=eq.') === 0) {
        cb(null, [{ id: 'OLD-EST-ID', updated_at: yesterday }]);
        return;
      }
      cb(null, []);
    };
    saveCustomers([{ id: 6001, clientName: '오래된견적테스트', phone: '01088880000', stage: '가견적', staffName: '마스터' }]);
    openDetail('오래된견적테스트', 6001, 'alim');
  });
  await new Promise(res => setTimeout(res, 400));
  await page.evaluate(() => { sendAlimtalk('t03_estimate'); });
  await new Promise(res => setTimeout(res, 300));
  let r = await page.evaluate(() => {
    var overlay = document.getElementById('alimtalk-preview-overlay');
    return overlay ? overlay.textContent : '';
  });
  ok('1. 어제 저장된 견적이면 경고 배너가 뜸', r.indexOf('저장 안 됐다면') !== -1 || r.indexOf('저장된 거예요') !== -1, r.slice(0, 200));

  // 2) 오늘 저장된 견적 - 경고 없어야 함
  await page.evaluate(() => {
    var todayIso = new Date().toISOString();
    window.sbXHR = function(method, path, data, cb) {
      if (method === 'GET' && path.indexOf('estimates?client_id=eq.') === 0) {
        cb(null, [{ id: 'FRESH-EST-ID', updated_at: todayIso }]);
        return;
      }
      cb(null, []);
    };
    saveCustomers([{ id: 6002, clientName: '오늘견적테스트', phone: '01088880001', stage: '가견적', staffName: '마스터' }]);
    openDetail('오늘견적테스트', 6002, 'alim');
  });
  await new Promise(res => setTimeout(res, 400));
  await page.evaluate(() => { sendAlimtalk('t03_estimate'); });
  await new Promise(res => setTimeout(res, 300));
  r = await page.evaluate(() => {
    var overlay = document.getElementById('alimtalk-preview-overlay');
    return overlay ? overlay.textContent : '';
  });
  ok('2. 오늘 저장된 견적이면 경고 안 뜸', r.indexOf('저장된 거예요') === -1, r.slice(0, 200));

  // 3) 견적이 아예 없는 경우 - 경고 대신 기존 안내 토스트만
  await page.evaluate(() => {
    window.sbXHR = function(method, path, data, cb) {
      if (method === 'GET' && path.indexOf('estimates?client_id=eq.') === 0) { cb(null, []); return; }
      cb(null, []);
    };
    window.__toastMsgs = [];
    window.showToast = function(m) { window.__toastMsgs.push(m); };
    saveCustomers([{ id: 6003, clientName: '견적없음테스트2', phone: '01088880002', stage: '상담', staffName: '마스터' }]);
    openDetail('견적없음테스트2', 6003, 'alim');
  });
  await new Promise(res => setTimeout(res, 400));
  r = await page.evaluate(() => {
    sendAlimtalk('t03_estimate');
    return new Promise(function(resolve) { setTimeout(function() { resolve(window.__toastMsgs); }, 300); });
  });
  ok('3. 견적 자체가 없으면 여전히 기존 안내(없어요)만 뜸', r.some(m => m.indexOf('저장된 견적서가 없어요') !== -1), JSON.stringify(r));

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
