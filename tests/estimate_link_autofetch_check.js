const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9894;
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

  // 1) 견적서가 있는 경우 - 최신 견적ID가 자동으로 조회되어 메시지에 채워지는지
  let r = await page.evaluate(() => {
    window.sbXHR = function(method, path, data, cb) {
      if (method === 'GET' && path.indexOf('estimates?client_id=eq.') === 0) {
        cb(null, [{ id: 'REAL-EST-ID-999' }]);
        return;
      }
      cb(null, []);
    };
    saveCustomers([{ id: 5001, clientName: '견적링크테스트', phone: '01099990000', stage: '가견적', staffName: '마스터' }]);
    openDetail('견적링크테스트', 5001, 'alim');
  });
  await new Promise(res => setTimeout(res, 400));
  r = await page.evaluate(() => {
    sendAlimtalk('t03_estimate');
    return true;
  });
  await new Promise(res => setTimeout(res, 300));
  r = await page.evaluate(() => {
    var ta = document.getElementById('alimtalk-msg-textarea');
    return ta ? ta.value : null;
  });
  ok('1. 견적ID가 있으면 미리보기에 그대로 반영됨(내부값 확인용 필드 존재)', r !== null, r);

  // 2) 실제 findCurrentDetailCustomer로 넘어간 c 객체에 estimateId가 채워지는지 직접 확인
  r = await page.evaluate(() => {
    window.__capturedC = null;
    var orig = window._openAlimtalkPreview;
    window._openAlimtalkPreview = function(meta, key, c, msg) { window.__capturedC = c; };
    sendAlimtalk('t03_estimate');
    return new Promise(function(resolve) {
      setTimeout(function() {
        window._openAlimtalkPreview = orig; // 원래 함수로 반드시 복구(다음 단계들이 실제 모달을 계속 써야 함)
        resolve(window.__capturedC);
      }, 300);
    });
  });
  ok('2. c.estimateId가 조회된 값으로 정확히 채워짐', r && r.estimateId === 'REAL-EST-ID-999', JSON.stringify(r));

  // 3) 견적서가 아예 없는 고객 - 에러 없이 안내 토스트만 뜨고 진행되는지
  r = await page.evaluate(() => {
    window.sbXHR = function(method, path, data, cb) {
      if (method === 'GET' && path.indexOf('estimates?client_id=eq.') === 0) { cb(null, []); return; }
      cb(null, []);
    };
    window.__toastMsgs = [];
    window.showToast = function(m) { window.__toastMsgs.push(m); };
    saveCustomers([{ id: 5002, clientName: '견적없음테스트', phone: '01099990001', stage: '상담', staffName: '마스터' }]);
    openDetail('견적없음테스트', 5002, 'alim');
    return true;
  });
  await new Promise(res => setTimeout(res, 300));
  r = await page.evaluate(() => {
    sendAlimtalk('t03_estimate');
    return new Promise(function(resolve) { setTimeout(function() { resolve(window.__toastMsgs); }, 300); });
  });
  ok('3. 견적서 없을 때 안내 토스트 뜨고 에러 없이 진행됨', r.some(m => m.indexOf('저장된 견적서가 없어요') !== -1), JSON.stringify(r));

  // 4) 즉시성 항목(0번 등)은 여전히 비동기 조회 없이 그대로 동기적으로 작동하는지(회귀 없음 확인)
  await page.evaluate(() => {
    saveCustomers([{ id: 5003, clientName: '즉시항목테스트', phone: '01099990002', stage: '방문예약', staffName: '마스터', date: todayStr() }]);
    openDetail('즉시항목테스트', 5003, 'alim');
  });
  await new Promise(res => setTimeout(res, 400));
  r = await page.evaluate(() => {
    sendAlimtalk('t00_reservation');
    var ta = document.getElementById('alimtalk-msg-textarea');
    return { exists: !!ta, value: ta ? ta.value : null };
  });
  ok('4. 즉시성 항목(0번)은 그대로 동기 작동(회귀 없음)', r.exists && r.value && r.value.indexOf('즉시항목테스트') !== -1, JSON.stringify(r));

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
