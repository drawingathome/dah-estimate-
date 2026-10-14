// tests/refund-ui-check.js
// 2026-10-14: 결제 탭의 "환불" 영역 - 마스터만 환불 등록/취소, 실장은 읽기 전용+안내, 오류 문구 전달, 중복 방지 키 확인.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 27146;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  try {
    for (const role of ['master', 'staff']) {
      const page = await browser.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      await blockRealNetwork(page);
      await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 600));
      await loginAs(page, role);
      const r = await page.evaluate(async () => {
        var calls = [], alerts = [], reopened = 0, nextErr = null;
        window.alert = function (m) { alerts.push(m); };
        window.confirm = function () { return true; };
        window.prompt = function () { return '사유 입력'; };
        window.sbXHR = function (m, p, d, cb) { calls.push({ m: m, p: p, d: d }); if (nextErr) { var e = nextErr; nextErr = null; return cb(e, null); } cb(null, 'new-id'); };
        window.loadCustomersAsync = function (cb) { cb && cb(); };
        window.closeDetail = function () {}; window.openDetail = function () { reopened++; };
        var est = { id: 'est-9', depositAmount: 700000, depositDate: '2026-09-20', balanceAmount: 0, balanceDate: '',
          refundRows: [
            { id: 'r1', entry_type: 'refund', slot: 'deposit', amount: 500000, paid_date: '2026-09-20', refund_date: '2026-10-03', reason: '카드 부분취소' },
            { id: 'r2', entry_type: 'refund', slot: 'deposit', amount: 100000, paid_date: '2026-09-20', refund_date: '2026-10-04', reason: '잘못 등록' },
            { id: 'r2x', entry_type: 'reversal', reverses_id: 'r2', slot: 'deposit', amount: 100000, paid_date: '2026-09-20', refund_date: '2026-10-05', reason: '취소' }
          ] };
        var sec = document.createElement('div'); document.body.appendChild(sec);
        appendRefundSection(sec, est, { clientName: '테스트', id: 7 });
        var out = {};
        out.text = sec.textContent;
        out.openBtn = !!Array.from(sec.querySelectorAll('button')).find(b => b.textContent === '환불 등록');
        out.cancelBtns = Array.from(sec.querySelectorAll('button')).filter(b => b.textContent === '환불 취소').length;
        out.strike = Array.from(sec.querySelectorAll('.refund-line')).filter(l => /line-through/.test(l.style.cssText)).length;
        if (out.openBtn) {
          // 환불 등록: 기본값은 해당 칸 전액, 사유 비우면 막힘
          var form = sec.querySelector('select').parentElement;
          var go = Array.from(sec.querySelectorAll('button')).find(b => b.textContent === '환불 처리');
          out.defaultAmt = form.querySelector('input[placeholder="환불 금액"]').value;
          go.click(); out.noReasonAlert = alerts.slice(); out.callsAfterNoReason = calls.length;
          form.querySelector('input[type="text"][placeholder^="환불 사유"]').value = '재결제 위해 취소';
          form.querySelector('input[placeholder="환불 금액"]').value = '900,000'; go.click(); out.overAlert = alerts.slice(); out.callsAfterOver = calls.length;
          form.querySelector('input[placeholder="환불 금액"]').value = '200,000';
          nextErr = { status: 400, text: JSON.stringify({ message: '환불 사유를 입력해 주세요.' }) };
          go.click(); out.errAlert = alerts.slice(-1)[0]; out.btnAfterErr = go.textContent;
          go.click();
          var c = calls.filter(x => /rpc\/register_refund/.test(x.p));
          out.reg = c.map(x => x.d); out.reopened = reopened;
          var cb = Array.from(sec.querySelectorAll('button')).find(b => b.textContent === '환불 취소'); cb.click();
          var rv = calls.filter(x => /rpc\/reverse_refund/.test(x.p)); out.rev = rv.map(x => x.d);
        }
        return out;
      });
      console.log('--- ' + role);
      if (role === 'master') {
        ok(r.openBtn, '마스터: 환불 등록 버튼이 보임');
        ok(r.cancelBtns === 1 && r.strike === 1, '마스터: 유효한 환불 1건에만 "환불 취소", 이미 취소된 1건은 취소선: ' + r.cancelBtns + '/' + r.strike);
        ok(/-500,000원/.test(r.text) && /원래 입금일 2026-09-20/.test(r.text) && /카드 부분취소/.test(r.text), '환불 내역(금액·원래 입금일·사유) 표시');
        ok(r.defaultAmt === '700,000', '환불 금액 기본값 = 해당 칸 전액');
        ok(/사유/.test(r.noReasonAlert[0] || '') && r.callsAfterNoReason === 0, '사유가 비면 서버로 보내지 않음');
        ok(/클 수 없어요/.test(r.overAlert[1] || '') && r.callsAfterOver === 0, '입금액보다 큰 환불은 서버로 보내지 않음');
        ok(/사유를 입력/.test(r.errAlert || '') && r.btnAfterErr === '환불 처리', '서버 오류 문구를 그대로 보여주고 버튼이 다시 활성화됨');
        ok(r.reg.length === 2 && r.reg[0].p_request_id === r.reg[1].p_request_id, '재시도해도 같은 요청 번호를 써서 중복 기록 방지');
        ok(r.reg[1].p_amount === 200000 && r.reg[1].p_slot === 'deposit' && r.reg[1].p_estimate_id === 'est-9' && r.reg[1].p_reason === '재결제 위해 취소', '전송 값(칸·금액·견적서·사유)');
        ok(r.reopened === 1, '성공하면 서버 최신값으로 고객 상세를 다시 엶');
        ok(r.rev.length === 1 && r.rev[0].p_refund_id === 'r1' && r.rev[0].p_reason === '사유 입력', '환불 취소는 취소 사유와 함께 reverse_refund 호출');
      } else {
        ok(!r.openBtn && r.cancelBtns === 0, '실장: 환불 등록·취소 버튼 없음');
        ok(/-500,000원/.test(r.text), '실장: 환불 내역은 읽기 전용으로 보임');
      }
      ok(errs.length === 0, role + ': 자바스크립트 오류 없음' + (errs.length ? ': ' + errs[0] : ''));
      await page.close();
    }
    // 실장 + 환불 없음 + 입금 있음 → 안내 문구
    const page2 = await browser.newPage();
    await blockRealNetwork(page2);
    await page2.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 600));
    await loginAs(page2, 'staff');
    const h = await page2.evaluate(() => { var s = document.createElement('div'); appendRefundSection(s, { id: 'e', depositAmount: 100000, refundRows: [] }, { id: 1 }); var s2 = document.createElement('div'); appendRefundSection(s2, { id: 'e', depositAmount: 0, balanceAmount: 0 }, { id: 1 }); return [s.textContent, s2.textContent]; });
    ok(/마스터에게 요청/.test(h[0]), '실장: 환불 없고 입금이 있으면 "마스터에게 요청" 안내');
    ok(h[1] === '', '실장: 입금이 없으면 아무것도 안 보임');
  } finally { await browser.close(); server.kill(); }
  console.log(fail ? '\n❌ 실패 ' + fail + '건' : '\n✅ 전체 통과(환불 화면 검증)');
  process.exit(fail ? 1 : 0);
})();
