// 같은 브라우저의 견적서 앱이 고객을 먼저 갱신해 캐시의 잠금값/견적금액이 더 최신이면, 대시보드 저장이 그 값을 이어받아 가짜 충돌 없이 저장되는지 검증
// 2026-10-11(선혜님 - "시간차가 나도 자꾸 충돌한다"): 원인 = 견적서 앱 고객 저장이 고객 updated_at을 바꾸는데 대시보드의 낡은 잠금값이 그대로였음.
const path = require('path');
const fs = require('fs');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 50000);
(async () => {
  const dir = path.resolve(__dirname, '..');
  const server = await startServer(dir, 27149);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await blockRealNetwork(page);
    await page.goto('http://localhost:27149/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');
    // 열려 있는 대시보드 화면의 메모리 캐시는 그대로 두고(견적서 앱은 다른 탭이라 이 메모리를 못 건드림), localStorage 장부에만 기록되는 실제 상황 재현
    const r = await page.evaluate(async () => {
      saveCustomers([{ id: 9601, clientName: '캐시이어받기', staffName: '마스터', stage: '가견적', price: 1000000, performanceRevenue: 900000, memo: '', updatedAt: '2026-10-11T01:00:00.000Z' }]);
      var stale = { id: 9601, clientName: '캐시이어받기', staffName: '마스터', stage: '가견적', price: 1000000, performanceRevenue: 900000, memo: '새 메모', updatedAt: '2026-10-11T01:00:00.000Z' };
      recordSelfLockAdvance(9601, '2026-10-11T01:00:00.000Z', '2026-10-11T02:00:00.000Z', { price: 1500000, performanceRevenue: 1200000 });
      var captured = null;
      window.sbXHR = function (method, p, data, cb) { captured = { method: method, path: p, data: data }; cb(null, [{ id: 9601, updated_at: '2026-10-11T02:00:05.000Z' }]); };
      await new Promise(function (res) { saveCustomerToDb(stale, function () { res(); }); });
      return captured;
    });
    ok(r && r.path.indexOf('updated_at=eq.' + encodeURIComponent('2026-10-11T02:00:00.000Z')) >= 0, '저장이 장부의 최신 잠금값으로 나감(메모리 캐시와 무관): ' + (r && r.path));
    ok(r && Number(r.data.price) === 1500000, '견적서 앱이 갱신한 견적 금액을 낡은 값으로 되돌려 덮어쓰지 않음: ' + (r && r.data.price));
    ok(r && r.data.memo === '새 메모', '내가 방금 고친 내용(메모)은 그대로 저장됨');
    // 음성 시험 1: 내 잠금값이 장부 시작 시각과 다르면(다른 기기가 끼어듦) 이어받지 않음
    const r2 = await page.evaluate(async () => {
      recordSelfLockAdvance(9602, '2026-10-11T01:30:00.000Z', '2026-10-11T02:00:00.000Z', null);
      var stale2 = { id: 9602, clientName: '장부불일치', staffName: '마스터', stage: '가견적', price: 1000000, memo: 'x', updatedAt: '2026-10-11T01:00:00.000Z' };
      var cap = null; window.sbXHR = function (m, p, d, cb) { cap = { path: p, data: d }; cb(null, [{ id: 9602, updated_at: 'z' }]); };
      await new Promise(function (res) { saveCustomerToDb(stale2, function () { res(); }); });
      return cap;
    });
    ok(r2 && r2.path.indexOf(encodeURIComponent('2026-10-11T01:00:00.000Z')) >= 0, '장부와 안 맞으면 이어받지 않음: ' + (r2 && r2.path));
    // 음성 시험 2: 장부가 아예 없으면 이어받지 않음
    const r3 = await page.evaluate(async () => {
      var s3 = { id: 9603, clientName: '장부없음', staffName: '마스터', stage: '가견적', price: 1, memo: 'x', updatedAt: '2026-10-11T01:00:00.000Z' };
      var cap = null; window.sbXHR = function (m, p, d, cb) { cap = { path: p }; cb(null, [{ id: 9603, updated_at: 'z' }]); };
      await new Promise(function (res) { saveCustomerToDb(s3, function () { res(); }); });
      return cap;
    });
    ok(r3 && r3.path.indexOf(encodeURIComponent('2026-10-11T01:00:00.000Z')) >= 0, '장부 없으면 이어받지 않음');
    // 연달아 갱신: 시작 시각이 유지되는지
    const r4 = await page.evaluate(() => {
      recordSelfLockAdvance(9604, 'A0', 'A1', null); recordSelfLockAdvance(9604, 'A1', 'A2', null);
      var l = JSON.parse(localStorage.getItem('dah_self_lock_ledger'))['9604']; return l;
    });
    ok(r4 && r4.from === 'A0' && r4.to === 'A2', '연달아 갱신해도 장부 시작 시각 유지: ' + JSON.stringify(r4));
    // 고객 PATCH 공통 처리: sbXHR 성공 응답의 새 수정 시각이 목록 캐시에 반영
    const r5 = await page.evaluate(() => {
      saveCustomers([{ id: 9605, clientName: 'x', updatedAt: 'old' }]);
      syncCustomerLocksFromRows([{ id: 9605, updated_at: 'new' }]);
      return loadCustomers()[0].updatedAt;
    });
    ok(r5 === 'new', '고객 PATCH 응답의 수정 시각이 목록 캐시에 반영됨');
    ok(errs.length === 0, 'JS 오류 없음 ' + errs.join('|'));
  } catch (e) { console.log('❌ 예외', e.message); fail++; }
  // 견적서 앱 쪽: 고객 저장 성공 응답의 새 updated_at을 공용 캐시에 반영하는 코드가 있는지(소스 확인)
  const src = fs.readFileSync(path.join(__dirname, '..', 'est-save-stages.js'), 'utf8');
  ok(/cacheRow\.updatedAt\s*=\s*resData\[0\]\.updated_at/.test(src) && /recordSelfLockAdvance\(/.test(src), '견적서 앱: 고객 저장 응답의 새 수정 시각을 캐시+공용 장부에 반영');
  // 누락 방지: 견적서/대시보드 쪽에서 고객 행을 직접 XHR로 PATCH하는 파일은 반드시 장부 기록(recordSelfLockAdvance) 또는 최신 시각 재조회를 포함해야 함
  const lockFiles = fs.readdirSync(path.join(__dirname, '..')).filter(f => f.endsWith('.js') && !f.startsWith('apps-script') && f !== 'shared-optimistic-lock.js');
  lockFiles.forEach(f => {
    const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const rawPatch = /open\(\s*'PATCH'\s*,[^;]*rest\/v1\/customers/.test(t);
    if (rawPatch) ok(/recordSelfLockAdvance\(|fetchLatestUpdatedAt\(/.test(t), '고객 직접 PATCH 파일은 잠금값 갱신 포함: ' + f);
  });
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})();
