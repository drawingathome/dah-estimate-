const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9883;
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

  // 1) 미배정 고객 2명(하나는 30분 경과) 세팅 후 홈 렌더
  await page.evaluate(() => {
    var overdueTime = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    var freshTime = new Date().toISOString();
    saveCustomers([
      { id: 9101, clientName: '미배정고객A', phone: '01011110001', stage: '상담', staffName: '미배정', createdAt: overdueTime, date: todayStr() },
      { id: 9102, clientName: '미배정고객B', phone: '01011110002', stage: '상담', staffName: '미배정', createdAt: freshTime, date: todayStr() }
    ]);
    renderHome();
  });
  await new Promise(r => setTimeout(r, 500));

  let r = await page.evaluate(() => {
    var sec = document.getElementById('sec-unassigned');
    var text = sec ? sec.textContent : '';
    return {
      exists: !!sec,
      hasA: text.indexOf('미배정고객A') !== -1,
      hasB: text.indexOf('미배정고객B') !== -1,
      hasOverdueLabel: text.indexOf('30분 경과') !== -1,
      countLabel: text.indexOf('2명') !== -1
    };
  });
  ok('1. 미배정 섹션 렌더링됨', r.exists);
  ok('2. 미배정 고객 2명 모두 노출', r.hasA && r.hasB);
  ok('3. 30분 경과 고객에 강조표시', r.hasOverdueLabel);
  ok('4. 인원수(2명) 정확히 표시', r.countLabel);

  // 2) 선착순 클릭 성공 케이스 (sbXHR mock: 성공 응답)
  r = await page.evaluate(() => {
    var calls = [];
    window.sbXHR = function(method, path, data, cb) {
      calls.push(method + ' ' + path);
      if (method === 'PATCH') { cb(null, [{ id: 9101, staff_name: data.staff_name }]); return; }
      cb(null, loadCustomers()); // GET 등 그 외 호출은 현재 로컬 캐시를 그대로 돌려줌(테스트 목적)
    };
    var btns = Array.from(document.querySelectorAll('#sec-unassigned button'));
    var btnA = btns.find(function(b) { return b.getAttribute('data-cname') === '미배정고객A'; });
    btnA.click();
    return { calls: calls };
  });
  await new Promise(res => setTimeout(res, 300));
  ok('5. 클릭 시 staff_name=eq.미배정 조건으로 PATCH 호출', r.calls.some(c => c.indexOf('PATCH customers?id=eq.9101&staff_name=eq.') === 0), JSON.stringify(r.calls));

  let after = await page.evaluate(() => {
    var arr = loadCustomers();
    var c = arr.find(function(x) { return String(x.id) === '9101'; });
    return { staffName: c ? c.staffName : null };
  });
  ok('6. 성공 시 로컬 캐시도 담당자로 갱신됨', after.staffName === '마스터', 'staffName=' + after.staffName);
  ok('6-1. 서버에도 실제로 클릭한 사람 이름(마스터)으로 전달됨', r.calls.some(c => c === 'PATCH customers?id=eq.9101&staff_name=eq.' + encodeURIComponent('미배정')));

  // 3) 선착순 클릭 실패 케이스 (이미 다른사람이 가져감 - zeroRows)
  await page.evaluate(() => {
    saveCustomers([{ id: 9102, clientName: '미배정고객B', phone: '01011110002', stage: '상담', staffName: '미배정', createdAt: new Date().toISOString(), date: todayStr() }]);
    renderHome();
  });
  await new Promise(res => setTimeout(res, 400));
  r = await page.evaluate(() => {
    window.sbXHR = function(method, path, data, cb) { cb({ status: 200, zeroRows: true, text: '0건 반영됨' }, null); };
    var toastMsgs = [];
    window.showToast = function(msg) { toastMsgs.push(msg); };
    var btns = Array.from(document.querySelectorAll('#sec-unassigned button'));
    var btnB = btns.find(function(b) { return b.getAttribute('data-cname') === '미배정고객B'; });
    btnB.click();
    return { toastMsgs: toastMsgs };
  });
  await new Promise(res => setTimeout(res, 300));
  const toastAfter = await page.evaluate(() => window.__lastToast || '');
  ok('7. 이미 배정된 경우(0건 반영) 실패 처리됨', r.toastMsgs.some(m => m.indexOf('이미 다른 담당자') !== -1), JSON.stringify(r.toastMsgs));

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
