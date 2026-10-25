// R-09(2026-10-26): 삭제가 서버에서 0건이었는데 "성공"으로 보이는 일(권한 문제·이미 지워짐)을 막는지 확인.
// 가짜 XMLHttpRequest로 서버 응답을 흉내냄: id 지정 삭제는 지운 행을 돌려받고(Prefer: return=representation), 0건이면 오류(zeroRows)로 알림.
// 조건 여러 건 삭제(client_id=eq...)는 0건이 정상일 수 있어 오류로 보지 않음.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 50000);
(async () => {
  const server = await startServer(path.resolve(__dirname, '..'), 27153);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await blockRealNetwork(page);
    await page.goto('http://localhost:27153/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');
    const r = await page.evaluate(async () => {
      const out = { prefers: [] };
      let respBody = '[]';
      function FakeXHR() { this.headers = {}; }
      FakeXHR.prototype.open = function (m, u) { this.m = m; this.u = u; };
      FakeXHR.prototype.setRequestHeader = function (k, v) { this.headers[k] = v; };
      FakeXHR.prototype.send = function () { const self = this; out.prefers.push(self.m + ' ' + self.u.split('/rest/v1/')[1] + ' => ' + self.headers['Prefer']); setTimeout(function () { self.status = 200; self.responseText = respBody; self.onload(); }, 0); };
      window.XMLHttpRequest = FakeXHR;
      const call = (p) => new Promise(res => sbXHR('DELETE', p, null, (e, d) => res({ e, d })));
      respBody = '[]';
      out.zeroById = await call('estimates?id=eq.abc');
      respBody = '[{"id":"abc"}]';
      out.oneById = await call('estimates?id=eq.abc');
      respBody = '';
      out.zeroByFilter = await call('estimates?client_id=eq.5');
      respBody = '[]';
      out.patchZero = await new Promise(res => sbXHR('PATCH', 'customers?id=eq.1', { a: 1 }, (e, d) => res({ e, d })));
      return out;
    });
    ok(r.zeroById.e && r.zeroById.e.zeroRows === true, 'id 지정 삭제가 0건이면 오류(zeroRows)로 알림');
    ok(!r.oneById.e, 'id 지정 삭제가 1건이면 정상');
    ok(!r.zeroByFilter.e, '조건 삭제(client_id)는 0건이어도 오류 아님(원래 없을 수 있음)');
    ok(r.patchZero.e && r.patchZero.e.zeroRows === true, '기존 수정(PATCH) 0건 감지는 그대로');
    ok(r.prefers[0].endsWith('return=representation'), 'id 지정 삭제는 지운 행을 돌려받도록 요청: ' + r.prefers[0]);
    ok(r.prefers[2].endsWith('return=minimal'), '조건 삭제는 기존대로 minimal: ' + r.prefers[2]);
  } catch (e) { console.log('❌ 예외: ' + e.message); fail++; }
  await browser.close(); server.kill();
  if (fail) { console.log('\n실패 ' + fail + '건'); process.exit(1); } console.log('\n통과'); process.exit(0);
})();
