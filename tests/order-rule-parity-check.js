// N-146 (ⓖ): 화면의 발주 판정(hasIncompleteOrder)이 DB 규칙(dah_order_complete + 시공일 합치기)과 같은 답을 내는지.
// DB 쪽은 db/test/order_rule_parity.js 가 같은 시나리오로 기대값(db/test/order_rule_expected.json)과 비교한다. 이 시험은 화면 쪽 절반.
// 견적서·고객은 운영과 같은 변환 함수(estimateDbRowToLocal, dbRowToCustomer)를 거쳐 만든다.
const fs = require('fs'), path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; };
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 90000);
const scen = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/order-rule-scenarios.json'), 'utf8'));
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, '../db/test/order_rule_expected.json'), 'utf8'));
(async () => {
  const server = await startServer(path.resolve(__dirname, '..'), 27185); const browser = await launchBrowser();
  try {
    const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await blockRealNetwork(page);
    await page.goto('http://localhost:27185/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
    const got = await page.evaluate((scen) => {
      const out = {};
      scen.forEach((s, i) => {
        const id = i + 1;
        const ests = s.estimates.map((e, j) => estimateDbRowToLocal({ id: 'e' + id + '-' + j + '-aaaaaaaaaaaaaaaaaaaa', customer_name: s.name, client_id: id, line_items: e.li, is_archived: !!e.archived, price: 0 }));
        localStorage.setItem('dah_saved', JSON.stringify(ests));
        const c = dbRowToCustomer({ id, client_name: s.name, order_status: s.orderStatus, install_date: s.installDate, install_date_tbd: s.installDateTbd, stage: '잔금결제' });
        out[s.name] = hasIncompleteOrder(c);
      });
      return out;
    }, scen);
    const bad = scen.filter(s => got[s.name] !== expected[s.name]).map(s => s.name + ' → 화면 ' + got[s.name] + ' / DB기대 ' + expected[s.name]);
    ok(bad.length === 0, '화면 판정이 DB 규칙 기대값과 같음 (' + scen.length + '개 중 다른 것 ' + bad.length + '개)' + (bad.length ? '\n   ' + bad.slice(0, 12).join('\n   ') : ''));
    ok(errs.length === 0, 'JS 오류 없음 ' + errs.join('|'));
  } catch (e) { console.log('❌ 예외', e.message); fail++; }
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})();
