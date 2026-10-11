// 홈 "데이터 점검" 카드: 이상 있을 때만 뜨고, 확인함으로 숨겨지고, 조회 실패/이상 없음이면 조용한지 검증
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 50000);
(async () => {
  const server = await startServer(path.resolve(__dirname, '..'), 27150);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await blockRealNetwork(page);
    await page.goto('http://localhost:27150/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');
    const r = await page.evaluate(async () => {
      const out = {};
      const rows = [
        { code: 'OVERPAID', severity: 'warn', customer_id: 1, client_name: '<b>홍길동</b>', detail: '입금합계 1200000원이 금액 1027000원보다 큼' },
        { code: 'PRICE_DIFF', severity: 'info', customer_id: 2, client_name: '김철수', detail: '금액 다름' }
      ];
      window.sbXHR = function (m, p, d, cb) { out.path = p; cb(null, rows); };
      localStorage.removeItem('dah_integrity_dismissed');
      renderIntegrityBanner(true);
      out.shown = !!document.getElementById('integrity-banner');
      out.text = document.getElementById('integrity-banner').innerText;
      out.comma = document.getElementById('integrity-banner').textContent.indexOf('1,200,000원') >= 0;
      out.escaped = document.getElementById('integrity-banner').innerHTML.indexOf('<b>홍길동</b>') < 0;
      document.querySelectorAll('.integrity-ok')[0].click();
      out.afterOne = document.querySelectorAll('.integrity-ok').length;
      document.querySelectorAll('.integrity-ok')[0].click();
      out.afterAll = !!document.getElementById('integrity-banner');
      // 이상 없음
      localStorage.removeItem('dah_integrity_dismissed');
      window.sbXHR = function (m, p, d, cb) { cb(null, []); };
      renderIntegrityBanner(true); out.emptyNone = !document.getElementById('integrity-banner');
      // 조회 실패
      window.sbXHR = function (m, p, d, cb) { cb({ status: 500 }, null); };
      renderIntegrityBanner(true); out.errNone = !document.getElementById('integrity-banner');
      return out;
    });
    ok(/data_integrity_issues/.test(r.path), '점검 뷰를 조회함: ' + r.path);
    ok(r.shown && /2건/.test(r.text) && /중요 1/.test(r.text), '이상이 있으면 건수와 중요 건수가 표시됨: ' + r.text.slice(0, 40));
    ok(r.comma, '금액이 천 단위 쉼표로 표시됨');
    ok(r.escaped, '고객 이름의 HTML이 그대로 실행되지 않음(이스케이프)');
    ok(r.afterOne === 1, '"확인함"을 누르면 그 항목만 숨겨짐');
    ok(r.afterAll === false, '전부 확인하면 카드가 사라짐');
    ok(r.emptyNone, '이상이 없으면 카드가 안 뜸');
    ok(r.errNone, '조회에 실패하면 조용히 넘어감(홈 화면 영향 없음)');
    ok(errs.length === 0, 'JS 오류 없음 ' + errs.join('|'));
  } catch (e) { console.log('❌ 예외', e.message); fail++; }
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})();
