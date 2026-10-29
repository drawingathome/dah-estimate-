// 견적서 단위 결제 저장 직후, 고객의 최신 수정 시각(낙관적 잠금값)을 서버에서 다시 받아 로컬에 반영하는지 검증
// 2026-10-11(선혜님 - "저장 충돌이 계속 난다", 시험사/시험다/시험마): 결제를 estimates에 저장하면 DB 트리거가
// 고객 행을 즉시 갱신해 고객 updated_at이 바뀜 -> 이 화면의 낡은 잠금값으로 이어지는 고객 저장이 스스로와 충돌했음.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27147;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([
      { id: 'est-L', clientId: 9501, clientName: '락갱신', price: 1000000, date: '2026-10-11',
        depositAmount: 0, depositDate: '', depositMethod: '', depositReceipt: false,
        balanceAmount: 0, balanceDate: '', balanceMethod: '', balanceReceipt: false }
    ]));
    saveCustomers([{ id: 9501, clientName: '락갱신', phone: '01055556666', stage: '가견적', staffName: '마스터', price: 1000000, updatedAt: '2026-10-11T01:00:00.000Z' }]);
    openDetail('락갱신', 9501);
  });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    window.__order = [];
    window.sbXHR_orig = window.sbXHR;
    window.sbXHR = function (method, p, data, cb) {
      if (method === 'PATCH' && p.indexOf('estimates?id=eq.est-L') === 0) { window.__order.push('patch-est'); cb(null, [{ id: 'est-L' }]); return; }
      window.sbXHR_orig(method, p, data, cb);
    };
    // 고객 최신 잠금값 조회(fetchLatestUpdatedAt)를 가로채 "DB 트리거가 바꾼 새 시각"을 돌려줌
    window.fetchLatestUpdatedAt = function (table, id, cb) { window.__order.push('fetch-' + table); setTimeout(function () { cb('2026-10-11T02:00:00.000Z'); }, 30); };
  });

  await page.evaluate(() => {
    const inp = document.querySelector('input[placeholder="선금 금액"]');
    inp.value = '500000'; inp.dispatchEvent(new Event('input'));
    const di = inp.closest('div').parentElement.querySelectorAll('input[type="date"]');
    if (di.length) { di[di.length - 1].value = '2026-10-11'; di[di.length - 1].dispatchEvent(new Event('change')); }
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('선금 저장'));
    b.click();
  });
  await new Promise(r => setTimeout(r, 800));

  const res = await page.evaluate(() => {
    const c = loadCustomers().find(x => x.id === 9501);
    return { order: window.__order, lock: c && c.updatedAt };
  });
  ok('1. 결제(estimates) 저장 뒤 고객의 최신 수정 시각을 서버에서 다시 조회함', res.order.indexOf('fetch-customers') > res.order.indexOf('patch-est') && res.order.indexOf('patch-est') >= 0, JSON.stringify(res.order));
  ok('2. 로컬 고객의 잠금값이 새 시각으로 갱신됨(다음 고객 저장이 낡은 값을 쓰지 않음)', res.lock === '2026-10-11T02:00:00.000Z', res.lock);

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');
  await browser.close();
  server.kill();
  process.exit(!allPass || jsErrors.length > 0 ? 1 : 0); // 통과해도 명시적으로 종료(안 하면 서버 프로세스 때문에 대기하다 자체 시간초과로 실패 처리됨)
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 40000);
