const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9885;
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

  // sbXHR mock: GET은 빈 배열(초기 이력없음), POST/PATCH는 성공
  await page.evaluate(() => {
    window.__asRecords = [];
    window.sbXHR = function(method, path, data, cb) {
      if (method === 'GET' && path.indexOf('as_records?customer_id=eq.') === 0) { cb(null, window.__asRecords); return; }
      if (method === 'POST' && path === 'as_records') {
        window.__asRecords.unshift(Object.assign({ id: 'rec1', receipt_date: todayStr() }, data));
        cb(null, [data]);
        return;
      }
      if (method === 'PATCH' && path.indexOf('as_records?id=eq.') === 0) {
        window.__asRecords[0].status = data.status;
        cb(null, [data]);
        return;
      }
      cb(null, []);
    };
    saveCustomers([{ id: 9201, clientName: 'AS테스트고객', phone: '01033330000', stage: '시공완료', staffName: '마스터', installDate: '2026-08-01' }]);
    openDetail('AS테스트고객', 9201, 'as');
  });
  await new Promise(r => setTimeout(r, 500));

  let r = await page.evaluate(() => {
    var body = document.getElementById('detail-as-body');
    return { visible: body ? body.style.display !== 'none' : false, hasForm: body ? body.textContent.indexOf('AS 접수') !== -1 : false, hasEmpty: body ? body.textContent.indexOf('등록된 AS 이력이 없어요') !== -1 : false };
  });
  ok('1. AS 탭 클릭 시 패널 노출', r.visible);
  ok('2. 접수 폼 렌더링됨', r.hasForm);
  ok('3. 이력 없을 때 안내문구 노출', r.hasEmpty);

  // 접수 등록
  r = await page.evaluate(() => {
    var body = document.getElementById('detail-as-body');
    var textarea = body.querySelector('textarea');
    textarea.value = '리모컨 작동 안 됨';
    var addBtn = Array.from(body.querySelectorAll('button')).find(function(b){ return b.textContent === '접수 등록'; });
    addBtn.click();
    return { found: !!addBtn };
  });
  await new Promise(res => setTimeout(res, 400));
  ok('4. 접수등록 버튼 존재', r.found);

  r = await page.evaluate(() => {
    var body = document.getElementById('detail-as-body');
    return { hasSymptom: body.textContent.indexOf('리모컨 작동 안 됨') !== -1, hasStatus: body.textContent.indexOf('접수') !== -1, hasNextBtn: Array.from(body.querySelectorAll('button')).some(function(b){ return b.textContent.indexOf('방문예정로 변경') !== -1; }) };
  });
  ok('5. 등록 후 목록에 증상 표시됨', r.hasSymptom);
  ok('6. 초기 상태(접수) 배지 표시', r.hasStatus);
  ok('7. 다음 단계(방문예정) 변경 버튼 노출', r.hasNextBtn);

  // 상태 변경 클릭
  r = await page.evaluate(() => {
    var body = document.getElementById('detail-as-body');
    var nextBtn = Array.from(body.querySelectorAll('button')).find(function(b){ return b.textContent.indexOf('방문예정로 변경') !== -1; });
    nextBtn.click();
    return { found: !!nextBtn };
  });
  await new Promise(res => setTimeout(res, 400));
  r = await page.evaluate(() => {
    var body = document.getElementById('detail-as-body');
    return { hasNewStatus: body.textContent.indexOf('방문예정') !== -1, hasFinalBtn: Array.from(body.querySelectorAll('button')).some(function(b){ return b.textContent.indexOf('완료로 변경') !== -1; }) };
  });
  ok('8. 상태가 방문예정으로 바뀜', r.hasNewStatus);
  ok('9. 완료로 변경 버튼이 다음 단계로 노출', r.hasFinalBtn);

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
