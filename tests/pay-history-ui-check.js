// tests/pay-history-ui-check.js
// 2026-10-11: "입금 내역 보기" 버튼이 실제 화면(대시보드)에서 접힘/펼침·조회 실패 처리까지 되는지 확인.
const path = require('path');
const { launchBrowser, startServer, blockRealNetwork } = require('./_helpers');
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 27145;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await blockRealNetwork(page);
    await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 600));
    const r = await page.evaluate(async () => {
      var calls = [];
      var mode = 'ok';
      window.sbXHR = function (m, p, d, cb) {
        calls.push(m + ' ' + p);
        if (mode === 'fail') return cb({ status: 500 }, null);
        cb(null, [
          { changed_at: '2026-10-03T03:49:58Z', snapshot: { deposit_amount: 0, balance_amount: 0 } },
          { changed_at: '2026-10-06T07:52:02Z', snapshot: { deposit_amount: 100000, deposit_date: '2026-09-22', balance_amount: 0 } }
        ]);
      };
      var sec = document.createElement('div'); document.body.appendChild(sec);
      appendPayHistory(sec, { id: 'est-1', depositAmount: 100000, depositDate: '2026-09-22', balanceAmount: 4868000, balanceDate: '2026-10-06' });
      var btn = sec.querySelector('.pay-history button'), box = sec.querySelector('.pay-history-box');
      var out = { initialHidden: box.style.display === 'none', callsBefore: calls.length };
      btn.click();
      out.openText = box.textContent; out.calls = calls.slice(); out.btnText = btn.textContent;
      btn.click(); out.closedHidden = box.style.display === 'none';
      btn.click(); out.callsAfterReopen = calls.length;
      // 실패 케이스
      mode = 'fail';
      var sec2 = document.createElement('div'); document.body.appendChild(sec2);
      appendPayHistory(sec2, { id: 'est-2' });
      sec2.querySelector('.pay-history button').click();
      out.failText = sec2.querySelector('.pay-history-box').textContent;
      // est 없으면 아무것도 안 붙음
      var sec3 = document.createElement('div'); appendPayHistory(sec3, null);
      out.noEst = sec3.children.length;
      return out;
    });
    ok(r.initialHidden && r.callsBefore === 0, '처음엔 접혀 있고 서버 조회도 안 함');
    ok(r.calls.length === 1 && /estimate_history\?estimate_id=eq\.est-1/.test(r.calls[0]) && /^GET/.test(r.calls[0]), '누르면 GET으로 읽기만 함(쓰기 없음): ' + r.calls[0]);
    ok(/선금 \+100,000원/.test(r.openText) && /잔금 \+4,868,000원/.test(r.openText), '내역 표시: ' + r.openText.slice(0, 80));
    ok(r.btnText === '입금 내역 닫기' && r.closedHidden, '다시 누르면 접힘');
    ok(r.callsAfterReopen === 1, '다시 열어도 서버를 또 부르지 않음');
    ok(/불러오지 못했어요/.test(r.failText), '조회 실패 시 안내 문구');
    ok(r.noEst === 0, '견적서가 없으면 버튼 없음');
    ok(errs.length === 0, '자바스크립트 오류 없음' + (errs.length ? ': ' + errs[0] : ''));
  } finally { await browser.close(); server.kill(); }
  console.log(fail ? '\n❌ 실패 ' + fail + '건' : '\n✅ 전체 통과(입금 내역 보기 화면 검증)');
  process.exit(fail ? 1 : 0);
})();
