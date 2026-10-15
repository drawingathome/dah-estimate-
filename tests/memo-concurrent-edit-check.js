// tests/memo-concurrent-edit-check.js
// 2026-10-15 동시편집: 두 사람이 같은 고객 메모를 거의 동시에 고쳐도 앞사람 메모가 조용히 사라지지 않는지 확인.
// 서버를 흉내 낸 가짜 sbXHR(메모 값이 조건과 같을 때만 반영)로 3가지 상황을 시험한다.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9931;
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
    function scenario(serverMemo, oldMemo, newMemo) {
      return new Promise(function(resolve) {
        var db = { memo: serverMemo }, patches = [];
        window.syncCustomerToSheet = function(){};
        window.sbXHR = function(method, p, data, cb) {
          if (method === 'GET') { cb(null, [{ memo: db.memo }]); return; }
          patches.push(p);
          var m = p.match(/&memo=eq\.([^&]*)/); var cond = m ? decodeURIComponent(m[1]) : null;
          var match = cond === null ? (!db.memo) : db.memo === cond;
          if (!match) { cb({ status: 200, text: '0건', zeroRows: true }, null); return; }
          db.memo = data.memo; cb(null, [{ id: 7, memo: db.memo, updated_at: 'T' + patches.length }]);
        };
        var cust = { id: 7, clientName: '시험', memo: oldMemo };
        memoSaveWithConflictGuard(cust, oldMemo, newMemo, function(err, finalMemo) {
          resolve({ err: !!err, finalMemo: finalMemo, serverMemo: db.memo, patchCount: patches.length });
        });
      });
    }
    return Promise.all([
      scenario('기존메모', '기존메모', '기존메모 수정'),     // 1 정상
      scenario('상대가 쓴 메모', '', '내가 쓴 메모'),          // 2 진짜 충돌(내가 볼 땐 비어있었음)
      scenario('기존메모 ', '기존메모', '내용 추가')           // 3 표기(공백)만 다른 가짜 충돌
    ]);
  });
  ok('1. 정상: 한 번에 저장되고 서버 메모가 내 메모가 됨', out[0].serverMemo === '기존메모 수정' && out[0].patchCount === 1 && !out[0].err, JSON.stringify(out[0]));
  ok('2. 충돌: 앞사람 메모를 지우지 않고 내 메모를 이어 붙여 둘 다 남김', out[1].serverMemo === '상대가 쓴 메모 / 내가 쓴 메모' && !out[1].err, JSON.stringify(out[1]));
  ok('3. 공백 차이뿐인 가짜 충돌은 내 메모로 정상 저장', out[2].serverMemo === '내용 추가' && !out[2].err, JSON.stringify(out[2]));
  ok('4. JS 에러 없음', jsErrors.length === 0, jsErrors.join(';'));
  log.forEach(l => console.log(l));
  await browser.close(); server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
