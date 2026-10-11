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
    const r = await page.evaluate(async () => {
      saveCustomers([{ id: 9601, clientName: '캐시이어받기', staffName: '마스터', stage: '가견적', price: 1000000, performanceRevenue: 900000, memo: '', updatedAt: '2026-10-11T01:00:00.000Z' }]);
      // 대시보드 화면이 들고 있던 낡은 객체(고객 목록 캐시와 별개의 참조)
      var stale = { id: 9601, clientName: '캐시이어받기', staffName: '마스터', stage: '가견적', price: 1000000, performanceRevenue: 900000, memo: '새 메모', updatedAt: '2026-10-11T01:00:00.000Z' };
      // 그 사이 같은 브라우저의 견적서 앱이 고객을 갱신: 캐시의 잠금값/견적금액이 최신
      var arr = loadCustomers(); arr[0].updatedAt = '2026-10-11T02:00:00.000Z'; arr[0].price = 1500000; arr[0].performanceRevenue = 1200000; saveCustomers(arr);
      var captured = null;
      window.sbXHR = function (method, p, data, cb) { captured = { method: method, path: p, data: data }; cb(null, [{ id: 9601, updated_at: '2026-10-11T02:00:05.000Z' }]); };
      await new Promise(function (res) { saveCustomerToDb(stale, function () { res(); }); });
      return captured;
    });
    ok(r && r.path.indexOf('updated_at=eq.' + encodeURIComponent('2026-10-11T02:00:00.000Z')) >= 0, '저장이 캐시의 최신 잠금값으로 나감: ' + (r && r.path));
    ok(r && Number(r.data.price) === 1500000, '견적서 앱이 갱신한 견적 금액을 낡은 값으로 되돌려 덮어쓰지 않음: ' + (r && r.data.price));
    ok(r && r.data.memo === '새 메모', '내가 방금 고친 내용(메모)은 그대로 저장됨');
    ok(errs.length === 0, 'JS 오류 없음 ' + errs.join('|'));
  } catch (e) { console.log('❌ 예외', e.message); fail++; }
  // 견적서 앱 쪽: 고객 저장 성공 응답의 새 updated_at을 공용 캐시에 반영하는 코드가 있는지(소스 확인)
  const src = fs.readFileSync(path.join(__dirname, '..', 'est-save-stages.js'), 'utf8');
  ok(/arrLockSync\[lockIdx\]\.updatedAt\s*=\s*resData\[0\]\.updated_at/.test(src), '견적서 앱: 고객 저장 응답의 새 수정 시각을 dah_customers 캐시에 반영');
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})();
