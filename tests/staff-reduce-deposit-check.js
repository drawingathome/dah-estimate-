// tests/staff-reduce-deposit-check.js (H-34 ②, 2026-10-28)
// 이미 기록된 선금을 줄이려 할 때 서버(DB 보호)가 '마스터에게 요청' 문구로 거절하면: 그 문구가 그대로 안내되고, 이 기기에 먼저 적은 줄인 값이 서버 값으로 돌아오는지.
// 한계: 서버 응답만 흉내 낸 화면 시험(역할은 마스터로 로그인, 이 분기는 역할과 무관하게 서버 문구로 판단). 운영 DB 보호 문구는 migration 108·112행 원문과 같게 둠.
// (아래는 H-28②를 바탕으로 한 파생 시험)
// 원본 설명 ↓
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
  const port = 28747;
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
          depositAmount: 500000, depositDate: '2026-10-10', depositMethod: '', depositReceipt: false,
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
        if (method === 'PATCH' && p.indexOf('estimates?id=eq.') === 0) { setTimeout(function () { rep === 'ok' ? cb(null, [{ id: 'est-A', updated_at: new Date().toISOString() }]) : cb({ status: 403, text: JSON.stringify({ code: '42501', message: '이미 기록된 입금액은 줄이거나 지울 수 없습니다. 환불·정정은 마스터에게 요청해 주세요.' }) }); }, 0); return; }
        if (method === 'GET' && p.indexOf('estimates') === 0) { setTimeout(function () { cb(null, [{ id: 'est-A', client_id: 9501, client_name: '마감시험', price: 1000000, date: '2026-09-10', deposit_amount: 500000, balance_amount: 0 }]); }, 0); return; }
        window.sbXHR_orig(method, p, data, cb);
      };
      window._estimateCacheTime = Date.now(); // 방금 목록을 불러온 것처럼(8초 이내 재조회 생략 상황)
      // 이미 입금이 기록돼 있으면 '수정' 버튼을 눌러야 입력칸이 열림
            const eb = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '수정');
      const mine = eb.find(b => b.parentElement && b.parentElement.textContent.indexOf('선금 (계약금)') >= 0) || eb[0];
      if (mine) mine.click();
      const inp = Array.from(document.querySelectorAll('input[placeholder="선금 금액"]')).pop();
      inp.value = '300000';
      const dt = inp.closest('div').parentElement.querySelectorAll('input[type="date"]');
      if (dt.length) dt[dt.length - 1].value = '2026-10-10';
      Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('선금 저장')).pop().click();
    }, patchReply);
    await new Promise(r => setTimeout(r, 900));
    return page.evaluate(() => {
      const arr = JSON.parse(localStorage.getItem('dah_saved') || '[]');
      const e = arr.find(x => x.id === 'est-A') || {};
      const payKeys = Object.keys(localStorage).filter(k => k.indexOf('dah_pay_') === 0 && k.indexOf('draft') < 0);
      const payVals = payKeys.map(k => { try { return JSON.parse(localStorage.getItem(k)); } catch (x) { return null; } });
      const body = document.getElementById('detail-pay-body') || document.getElementById('pay-body') || document.body;
      return { localDeposit: Number(e.depositAmount) || 0, localDepositDate: e.depositDate || '', shows300k: (body.textContent || '').indexOf('300,000') >= 0 };
    });
  };

  const rej = await run('입금액 줄이기 거절', 'reject');
  ok('거절 뒤: 이 기기 견적서 복사본(dah_saved)의 선금이 서버 값(500,000)으로 돌아감', rej.localDeposit === 500000, rej);
  ok('거절 뒤: 다시 열린 화면에 줄인 값(300,000)이 받은 돈처럼 보이지 않음', rej.shows300k === false, rej);
  ok('거절 뒤: DB의 안내 문구가 그대로 뜸', dialogs.some(m => m.indexOf('환불·정정은 마스터에게 요청해 주세요') >= 0), dialogs);
  ok('JS 에러 없음', errs.length === 0, errs);

  await browser.close(); server.close();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 모두 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 90000);
