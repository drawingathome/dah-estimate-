// 매출 기준금액 수동 확정의 동시편집 보호: 서버 금액이 그 사이 바뀌었으면 덮어쓰지 않고 0건(충돌)으로 끝나야 함
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
async function run() {
  const dir = path.resolve(__dirname, '..'); const port = 9932;
  const server = await startServer(dir, port); const browser = await launchBrowser(); const page = await browser.newPage();
  const jsErrors = []; page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
  const out = await page.evaluate(() => {
    function sc(serverPrice, seen, v) {
      return new Promise(function(res) {
        var db = { price: serverPrice };
        window.sbXHR = function(method, p, data, cb) {
          var m = p.match(/&price=eq\.([0-9.]+)/); var match = m ? Number(m[1]) === Number(db.price) : (!db.price);
          if (!match) { cb({ status: 200, text: '0건', zeroRows: true }, null); return; }
          db.price = data.price; cb(null, [{ id: 1, price: db.price, updated_at: 'T' }]);
        };
        savePriceOverrideToDb(1, seen, v, function(err) { res({ zero: !!(err && err.zeroRows), serverPrice: db.price }); });
      });
    }
    return Promise.all([sc(500000, 500000, 700000), sc(900000, 500000, 700000), sc(0, 0, 300000)]);
  });
  const log = [];
  const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + ' — ' + d);
  ok('1. 서버 금액이 내가 본 값이면 반영', out[0].serverPrice === 700000 && !out[0].zero, JSON.stringify(out[0]));
  ok('2. 그 사이 서버 금액이 바뀌었으면 덮어쓰지 않음(충돌 안내)', out[1].serverPrice === 900000 && out[1].zero, JSON.stringify(out[1]));
  ok('3. 0원(비어있던) 상태에서도 정상 반영', out[2].serverPrice === 300000 && !out[2].zero, JSON.stringify(out[2]));
  ok('4. JS 에러 없음', jsErrors.length === 0, jsErrors.join(';'));
  log.forEach(l => console.log(l)); await browser.close(); server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); }); setTimeout(() => process.exit(1), 60000);
