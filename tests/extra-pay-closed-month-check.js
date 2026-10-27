// tests/extra-pay-closed-month-check.js (H-28 ①-추가결제, 2026-10-28)
// 추가결제 화면(dash-extra-pay.js)에서 서버가 마감월 거절(403)을 보낼 때의 실제 버튼 동작을 확인한다.
//  - 저장: 🔒 마감월 안내가 뜨고, "서버에 저장되지 않았어요(다시 눌러 주세요)"로 오인시키지 않으며, 화면을 다시 열지 않고, 저장 버튼이 다시 눌리게 풀린다.
//  - 삭제: 🔒 마감월 안내가 뜬다.
//  - 다른 오류(권한·통신)는 예전 안내 그대로 (기존 동작 보존). 성공은 ✅ 후 화면을 다시 연다.
// 한계: 서버 통신(sbXHR)만 가짜로 바꾼 화면 시험이다. 실제 DB 가드(N-24)는 운영 미적용이라 여기서는 서버 응답만 흉내 낸다.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let failed = 0;
const ok = (l, c, d) => { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d === undefined ? '' : JSON.stringify(d)))); if (!c) failed++; };
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 28743;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const r = await page.evaluate(() => {
    const CLOSED = { status: 403, text: JSON.stringify({ code: '42501', message: '마감된 달(2026-09)의 입금 기록은 수정할 수 없습니다. 마스터에게 요청하세요.' }) };
    const OTHER = { status: 403, text: JSON.stringify({ code: '42501', message: 'permission denied for table estimate_extra_payments' }) };
    const out = {};
    const run = (kind, reply) => {
      window.isMasterUser = () => true;
      const toasts = []; let reopened = 0;
      window.showToast = (m) => toasts.push(String(m));
      window.reopenAfterExtraPay = () => { reopened++; };
      window.confirm = () => true;
      window.sbXHR = (method, p, body, cb) => { setTimeout(() => cb(reply), 0); };
      const est = { id: 'cm1', price: 1225000, depositAmount: 499000, balanceAmount: 681000,
        extraPayRows: kind === 'delete' ? [{ id: 'x9', estimate_id: 'cm1', amount: 30000, paid_date: '2026-09-20', method: '카드', receipt: false, memo: '', created_at: '2026-09-20T01:00:00Z' }] : [] };
      const box = document.createElement('div');
      appendExtraPaySection(box, est, { id: 11, clientName: 'CM1' });
      const btns = Array.from(box.querySelectorAll('button'));
      let saveBtn = btns.find(b => b.textContent === '추가 결제 저장');
      if (kind === 'save') {
        Array.from(box.querySelectorAll('input')).find(i => i.placeholder === '추가 결제 금액').value = '45000';
        saveBtn.click();
      } else {
        btns.find(b => b.textContent === '삭제').click();
      }
      return new Promise(res => setTimeout(() => res({ toasts, reopened, saveEnabled: saveBtn ? !saveBtn.disabled : null, saveLabel: saveBtn ? saveBtn.textContent : null }), 60));
    };
    return (async () => {
      out.saveClosed = await run('save', CLOSED);
      out.saveOther = await run('save', OTHER);
      out.saveOk = await run('save', null);
      out.delClosed = await run('delete', CLOSED);
      out.delOther = await run('delete', OTHER);
      return out;
    })();
  });
  const has = (a, s) => a.some(m => m.includes(s));
  ok('저장·마감월 거절: 🔒 마감된 달 안내가 뜸', has(r.saveClosed.toasts, '🔒') && has(r.saveClosed.toasts, '마감된 달(2026-09)'), r.saveClosed);
  ok('저장·마감월 거절: "서버에 저장되지 않았어요(다시 눌러 주세요)"로 오인시키지 않음', !has(r.saveClosed.toasts, '다시 눌러 주세요'), r.saveClosed);
  ok('저장·마감월 거절: 화면을 다시 열지 않음(입력값 유지)', r.saveClosed.reopened === 0, r.saveClosed);
  ok('저장·마감월 거절: 저장 버튼이 다시 눌리게 풀림', r.saveClosed.saveEnabled === true && r.saveClosed.saveLabel === '추가 결제 저장', r.saveClosed);
  ok('저장·일반 오류: 예전 안내 그대로(🔒 없음)', has(r.saveOther.toasts, '서버에 저장되지 않았어요') && !has(r.saveOther.toasts, '🔒'), r.saveOther);
  ok('저장·성공: ✅ 후 화면을 다시 엶', has(r.saveOk.toasts, '✅') && r.saveOk.reopened === 1, r.saveOk);
  ok('삭제·마감월 거절: 🔒 마감된 달 안내가 뜸', has(r.delClosed.toasts, '🔒') && has(r.delClosed.toasts, '마감된 달(2026-09)') && r.delClosed.reopened === 0, r.delClosed);
  ok('삭제·일반 오류: 예전 안내 그대로(🔒 없음)', has(r.delOther.toasts, '삭제되지 않았어요') && !has(r.delOther.toasts, '🔒'), r.delOther);
  ok('JS 에러 없음', errs.length === 0, errs);
  await browser.close(); server.close();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 모두 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 90000);
