// tests/pay-closed-month-local-rollback-check.js (H-28 ②, 2026-10-28)
// 고객 상세의 결제 칸(dash-customer-pay.js)은 서버에 보내기 전에 이 기기(dah_saved, dah_pay_*)에 먼저 값을 적는다.
// 서버가 마감된 달의 입금 변경을 거절(403)하면, 이 기기에 먼저 적은 값이 서버와 다른 채로 남으면 안 된다.
//  - 마감월 거절 뒤: 이 기기의 견적서 복사본(dah_saved)과 다시 열린 화면이 거절 전(서버) 값이어야 한다. 방금(8초 이내) 목록을 불러온 직후라 재조회가 생략되는 상황(실사용에서 가장 위험한 경우)으로 시험한다.
// (dah_pay_est_* 임시값은 견적서가 있으면 화면이 읽지 않으므로(dash-customer-pay.js:34) 검사 대상이 아니다.)
//  - 성공이면: 새 값이 그대로 남아 있어야 한다(기존 동작 보존).
// 한계: 서버 통신(sbXHR)만 가짜로 바꾼 화면 시험. 실제 DB 가드(N-24)는 운영 미적용이라 서버 응답만 흉내 낸다.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let failed = 0;
const ok = (l, c, d) => { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d === undefined ? '' : JSON.stringify(d)))); if (!c) failed++; };
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 28744;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errs = [], dialogs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', async d => { dialogs.push(d.message()); try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const run = async (label, patchReply) => {
    dialogs.length = 0;
    await page.evaluate(() => {
      localStorage.setItem('dah_saved', JSON.stringify([
        { id: 'est-A', clientId: 9501, clientName: '마감시험', price: 1000000, date: '2026-09-10',
          depositAmount: 0, depositDate: '', depositMethod: '', depositReceipt: false,
          balanceAmount: 0, balanceDate: '', balanceMethod: '', balanceReceipt: false }
      ]));
      Object.keys(localStorage).filter(k => k.indexOf('dah_pay_') === 0).forEach(k => localStorage.removeItem(k));
      saveCustomers([{ id: 9501, clientName: '마감시험', phone: '01099990000', stage: '가견적', staffName: '마스터', price: 1000000 }]);
      openDetail('마감시험', 9501);
    });
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate((rep) => {
      if (!window.sbXHR_orig) window.sbXHR_orig = window.sbXHR;
      window.sbXHR = function (method, p, data, cb) {
        if (method === 'PATCH' && p.indexOf('estimates?id=eq.') === 0) { setTimeout(function () { rep === 'ok' ? cb(null, [{ id: 'est-A', updated_at: new Date().toISOString() }]) : cb({ status: 403, text: JSON.stringify({ code: '42501', message: '마감된 달(2026-09)의 입금 기록은 수정할 수 없습니다. 마스터에게 요청하세요.' }) }); }, 0); return; }
        if (method === 'GET' && p.indexOf('estimates') === 0) { setTimeout(function () { cb(null, [{ id: 'est-A', client_id: 9501, client_name: '마감시험', price: 1000000, date: '2026-09-10', deposit_amount: rep === 'ok' ? 500000 : 0, balance_amount: 0 }]); }, 0); return; }
        window.sbXHR_orig(method, p, data, cb);
      };
      window._estimateCacheTime = Date.now(); // 방금 목록을 불러온 것처럼(8초 이내 재조회 생략 상황)
      const inp = Array.from(document.querySelectorAll('input[placeholder="선금 금액"]')).pop();
      inp.value = '500000';
      const dt = inp.closest('div').parentElement.querySelectorAll('input[type="date"]');
      if (dt.length) dt[dt.length - 1].value = '2026-09-10';
      Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('선금 저장')).pop().click();
    }, patchReply);
    await new Promise(r => setTimeout(r, 900));
    return page.evaluate(() => {
      const arr = JSON.parse(localStorage.getItem('dah_saved') || '[]');
      const e = arr.find(x => x.id === 'est-A') || {};
      const payKeys = Object.keys(localStorage).filter(k => k.indexOf('dah_pay_') === 0 && k.indexOf('draft') < 0);
      const payVals = payKeys.map(k => { try { return JSON.parse(localStorage.getItem(k)); } catch (x) { return null; } });
      const body = document.getElementById('detail-pay-body') || document.getElementById('pay-body') || document.body;
      return { localDeposit: Number(e.depositAmount) || 0, localDepositDate: e.depositDate || '', shows500k: (body.textContent || '').indexOf('500,000') >= 0 };
    });
  };

  const closed = await run('마감월 거절', 'closed');
  ok('마감월 거절 뒤: 이 기기 견적서 복사본(dah_saved)의 선금이 거절 전 값(0)으로 돌아감', closed.localDeposit === 0, closed);
  ok('마감월 거절 뒤: 다시 열린 화면에 거절된 선금(500,000)이 받은 돈처럼 보이지 않음', closed.shows500k === false, closed);
  ok('마감월 거절 뒤: 이유를 알리는 안내가 뜸', dialogs.some(m => m.indexOf('마감된 달(2026-09)') >= 0), dialogs);

  const good = await run('성공', 'ok');
  ok('성공이면: 새 선금(500,000)이 이 기기에도 그대로 남음(기존 동작 보존)', good.localDeposit === 500000, good);
  ok('JS 에러 없음', errs.length === 0, errs);

  await browser.close(); server.close();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 모두 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 90000);
