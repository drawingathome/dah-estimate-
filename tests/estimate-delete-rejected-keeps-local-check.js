// N-144 ⓐ: 서버가 견적서 삭제를 거절하면(권한·마감월 등) 로컬 목록에서 지우지 않고, 성공하면 지운다
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 50000);
(async () => {
  const server = await startServer(path.resolve(__dirname, '..'), 27183);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await blockRealNetwork(page);
    await page.goto('http://localhost:27183/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');
    const r = await page.evaluate(async () => {
      const out = {};
      const id = '0a80fb6e-c4cb-4948-a71a-914a60ad751f';
      const reset = () => localStorage.setItem('dah_saved', JSON.stringify([{ id, no: 'X1', clientName: '삭제거절' }, { id: null, no: 'L1' }]));
      const left = () => JSON.parse(localStorage.getItem('dah_saved') || '[]').map(x => x.no).join(',');
      let mode = 'reject';
      window.sbXHR = function (m, p, d, cb) {
        if (m === 'DELETE') return mode === 'reject' ? cb({ status: 403, text: 'denied' }, null) : cb(null, []);
        cb(null, []);
      };
      reset(); out.err = 'unset';
      await new Promise(res => archiveEstimate({ id, no: 'X1' }, e => { out.err = e; res(); }));
      out.afterReject = left();
      mode = 'ok'; reset();
      await new Promise(res => archiveEstimate({ id, no: 'X1' }, e => { out.err2 = e; res(); }));
      out.afterOk = left();
      reset();
      await new Promise(res => archiveEstimate({ id: null, no: 'L1' }, e => res()));
      out.afterLocal = left();
      return out;
    });
    ok(r.err && r.err.status === 403, '서버 거절이면 콜백에 오류가 전달됨');
    ok(r.afterReject === 'X1,L1', '거절되면 로컬 목록에 그대로 남음: ' + r.afterReject);
    ok(r.err2 === null && r.afterOk === 'L1', '서버 삭제 성공 시에만 로컬에서 지워짐: ' + r.afterOk);
    ok(r.afterLocal === 'X1', '서버에 없는 로컬 전용 견적은 바로 지워짐: ' + r.afterLocal);
    ok(errs.length === 0, 'JS 오류 없음 ' + errs.join('|'));
  } catch (e) { console.log('❌ 예외', e.message); fail++; }
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})();
