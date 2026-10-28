// tests/refund-cases-check.js (H-13 환불 시험 보강, 2026-10-28)
// 결제 탭 "환불" 영역(dash-refund.js)의 경우의 수 보강: 전액 환불 / 잔금 환불 / 마감월 거절 안내 / 실장 읽기 전용 / 환불 취소(reverse).
// 한계: 서버(sbXHR)와 DB를 가짜(메모리 모형)로 바꾼 화면 시험이다. 가짜 DB의 규칙은 migration_2026_10_14_payment_refunds.sql 의
//       register_refund / reverse_refund 를 글로 옮긴 것이라 "운영 DB가 그렇게 동작한다"는 증거가 아니다(운영 증거는 부분 환불 1건뿐).
//       마감월 거절은 운영 DB 가드(N-24)가 아직 미적용이므로 서버 응답만 흉내 낸다.
//       추가결제(estimate_extra_payments)는 이 환불 화면의 대상이 아니다(register_refund 는 선금/잔금 칸만 받음) → 별도 보고 사항.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0;
function ok(c, m, d) { console.log((c ? '✅ ' : '❌ ') + m + (c || d === undefined ? '' : ' — ' + JSON.stringify(d))); if (!c) fail++; }

// 브라우저 안에서 쓰는 가짜 서버 + 화면 도우미 (문자열로 주입)
const SETUP = function () {
  window.__t = { calls: [], alerts: [], toasts: [], confirms: [], reopened: 0, promptAnswer: '취소 사유', closed: { '2026-09': true } };
  const T = window.__t;
  T.est = { id: 'est-1', depositAmount: 700000, depositDate: '2026-09-20', depositMethod: '카드', balanceAmount: 300000, balanceDate: '2026-10-01', balanceMethod: '계좌', refundRows: [] };
  window.alert = m => T.alerts.push(String(m));
  window.confirm = m => { T.confirms.push(String(m)); return true; };
  window.prompt = () => T.promptAnswer;
  window.showToast = m => T.toasts.push(String(m));
  window.loadCustomersAsync = cb => { cb && cb(); };
  window.closeDetail = () => {};
  window.openDetail = () => { T.reopened++; T.render(); };
  T.render = () => { T.box.innerHTML = ''; appendRefundSection(T.box, T.est, { id: 7, clientName: '시험' }); };
  const err = msg => ({ status: 400, text: JSON.stringify({ message: msg }) });
  // register_refund / reverse_refund 를 글로 옮긴 가짜 DB
  window.sbXHR = function (method, p, d, cb) {
    T.calls.push({ method, p, d });
    const e = T.est, rows = e.refundRows;
    if (/rpc\/register_refund/.test(p)) {
      const dup = rows.find(r => r.request_id === d.p_request_id); if (dup) return cb(null, dup.id);
      const month = String(d.p_refund_date).slice(0, 7);
      if (T.closed[month]) return cb({ status: 403, text: JSON.stringify({ code: '42501', message: '마감된 달(' + month + ')의 입금 기록은 수정할 수 없습니다. 마스터에게 요청하세요.' }) });
      const cur = d.p_slot === 'deposit' ? e.depositAmount : e.balanceAmount;
      const paid = d.p_slot === 'deposit' ? e.depositDate : e.balanceDate;
      if (d.p_amount > cur) return cb(err('환불 금액이 해당 입금액보다 큽니다.'));
      if (d.p_refund_date < paid) return cb(err('환불일이 입금일(' + paid + ')보다 빠를 수 없습니다.'));
      const id = 'r' + (rows.length + 1);
      rows.push({ id, entry_type: 'refund', slot: d.p_slot, amount: d.p_amount, paid_date: paid, refund_date: d.p_refund_date, reason: d.p_reason, request_id: d.p_request_id });
      if (d.p_slot === 'deposit') { e.depositAmount -= d.p_amount; if (!e.depositAmount) e.depositDate = ''; }
      else { e.balanceAmount -= d.p_amount; if (!e.balanceAmount) e.balanceDate = ''; }
      return cb(null, id);
    }
    if (/rpc\/reverse_refund/.test(p)) {
      const r = rows.find(x => x.id === d.p_refund_id && x.entry_type === 'refund');
      if (!r) return cb(err('되돌릴 환불 기록을 찾을 수 없습니다.'));
      if (rows.some(x => x.reverses_id === r.id)) return cb(err('이미 취소된 환불입니다.'));
      if (!String(d.p_reason || '').trim()) return cb(err('취소 사유를 입력해 주세요.'));
      if (T.rejectReverse) return cb(err(T.rejectReverse));
      rows.push({ id: 'x' + rows.length, entry_type: 'reversal', reverses_id: r.id, slot: r.slot, amount: r.amount, paid_date: r.paid_date, refund_date: '2026-10-28', reason: d.p_reason });
      if (r.slot === 'deposit') { e.depositAmount += r.amount; e.depositDate = e.depositDate || r.paid_date; }
      else { e.balanceAmount += r.amount; e.balanceDate = e.balanceDate || r.paid_date; }
      return cb(null, 'rev');
    }
    cb(null, []);
  };
  T.box = document.createElement('div'); document.body.appendChild(T.box); T.render();
  // 화면 도우미
  T.btn = label => Array.from(T.box.querySelectorAll('button')).find(b => b.textContent === label);
  T.btns = label => Array.from(T.box.querySelectorAll('button')).filter(b => b.textContent === label);
  T.sel = () => T.box.querySelector('select');
  T.amt = () => T.box.querySelector('input[placeholder="환불 금액"]');
  T.date = () => T.box.querySelector('input[type="date"]');
  T.reason = () => T.box.querySelector('input[placeholder^="환불 사유"]');
  T.fill = (slot, amount, date, reason) => {
    const s = T.sel(); s.value = slot; s.dispatchEvent(new Event('change'));
    if (amount !== null) { T.amt().value = amount; T.amt().dispatchEvent(new Event('input')); }
    if (date) T.date().value = date;
    T.reason().value = reason;
  };
  T.lines = () => Array.from(T.box.querySelectorAll('.refund-line')).map(l => l.textContent);
  T.regCalls = () => T.calls.filter(c => /register_refund/.test(c.p));
  T.revCalls = () => T.calls.filter(c => /reverse_refund/.test(c.p));
};

(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 27391;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const open = async role => {
    const page = await browser.newPage();
    page.__errs = [];
    page.on('pageerror', e => page.__errs.push(e.message));
    await blockRealNetwork(page);
    await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 600));
    await loginAs(page, role);
    await page.evaluate(SETUP);
    return page;
  };
  try {
    // ───── 1. 전액 환불 (선금 전액 → 칸이 0원, 그 칸은 선택지에서 사라지고, 잔금도 전액 환불하면 등록 버튼이 사라짐)
    let page = await open('master');
    let r = await page.evaluate(() => {
      const T = window.__t, o = {};
      o.defaultAmt = T.amt().value;                       // 선금 기본값
      T.fill('deposit', null, '2026-10-28', '고객 변심 전액 환불');
      o.amtAfterFill = T.amt().value;
      T.btn('환불 처리').click();
      o.confirmMsg = T.confirms[0];
      o.reg1 = T.regCalls().map(c => c.d);
      o.estAfter = { dep: T.est.depositAmount, depDate: T.est.depositDate };
      o.reopened = T.reopened; o.toast = T.toasts.slice();
      o.optionsAfter = Array.from(T.sel().options).map(x => x.value);   // 다시 그려진 뒤의 선택지
      o.lines1 = T.lines();
      o.cancelBtns1 = T.btns('환불 취소').length;
      // 잔금도 전액 환불
      T.fill('balance', null, '2026-10-28', '잔금도 전액');
      T.btn('환불 처리').click();
      o.estAfter2 = { bal: T.est.balanceAmount };
      o.openBtnGone = !T.btn('환불 등록');
      o.cancelBtns2 = T.btns('환불 취소').length;
      o.lines2 = T.lines();
      return o;
    });
    ok(r.defaultAmt === '700,000' && r.amtAfterFill === '700,000', '전액: 환불 금액 기본값이 선금 전액(700,000)', r);
    ok(/700,000원 중 700,000원/.test(r.confirmMsg) && /선금은 0원이 됩니다/.test(r.confirmMsg), '전액: 확인창에 "선금은 0원이 됩니다"가 보임', r.confirmMsg);
    ok(r.reg1.length === 1 && r.reg1[0].p_slot === 'deposit' && r.reg1[0].p_amount === 700000 && r.reg1[0].p_estimate_id === 'est-1' && r.reg1[0].p_refund_date === '2026-10-28' && r.reg1[0].p_reason === '고객 변심 전액 환불', '전액: 서버로 가는 값(칸·금액 700000·견적서·환불일·사유)', r.reg1);
    ok(r.estAfter.dep === 0 && r.estAfter.depDate === '' && r.reopened === 1 && r.toast[0] === '환불을 등록했어요', '전액: 가짜 DB 선금 0·입금일 비워짐, 등록 토스트, 상세 다시 열기');
    ok(JSON.stringify(r.optionsAfter) === '["balance"]', '전액: 선금이 0원이 되면 선택지에서 선금이 사라짐', r.optionsAfter);
    ok(r.lines1.length === 1 && /-700,000원/.test(r.lines1[0]) && /원래 입금일 2026-09-20/.test(r.lines1[0]) && r.cancelBtns1 === 1, '전액: 환불 내역 1줄(-700,000원·원래 입금일)과 "환불 취소" 1개', r.lines1);
    ok(r.estAfter2.bal === 0 && r.openBtnGone && r.cancelBtns2 === 2 && r.lines2.length === 2, '전액: 선금·잔금 모두 환불하면 "환불 등록" 버튼은 사라지고 취소 버튼 2개만 남음', r);
    ok(page.__errs.length === 0, '전액: 자바스크립트 오류 없음 ' + page.__errs[0]);
    await page.close();

    // ───── 2. 잔금 환불 (칸 전환 시 기본 금액이 바뀌고, 잔금 칸으로 전송, 선금은 그대로)
    page = await open('master');
    r = await page.evaluate(() => {
      const T = window.__t, o = {};
      o.opts = Array.from(T.sel().options).map(x => x.value + '|' + x.textContent);
      T.sel().value = 'balance'; T.sel().dispatchEvent(new Event('change'));
      o.balDefault = T.amt().value;
      T.fill('balance', '100,000', '2026-10-28', '잔금 일부 반환');
      T.btn('환불 처리').click();
      o.confirmMsg = T.confirms[0];
      o.reg = T.regCalls().map(c => c.d);
      o.est = { dep: T.est.depositAmount, bal: T.est.balanceAmount, balDate: T.est.balanceDate };
      o.lines = T.lines();
      // 환불일이 잔금 입금일(2026-10-01)보다 빠르면 서버가 거절 → 안내
      T.closed = {}; // 이 항목은 마감월과 무관한 "입금일보다 빠른 날짜" 거절만 보기 위해 마감 설정을 끔
      T.fill('balance', '50,000', '2026-09-30', '날짜 잘못');
      T.btn('환불 처리').click();
      o.earlyAlert = T.alerts.slice(-1)[0];
      o.estAfterEarly = T.est.balanceAmount;
      return o;
    });
    ok(r.opts.length === 2 && /^deposit\|선금 700,000원 \(입금일 2026-09-20\)/.test(r.opts[0]) && /^balance\|잔금 300,000원 \(입금일 2026-10-01\)/.test(r.opts[1]), '잔금: 선택지에 선금·잔금과 각각의 금액·입금일', r.opts);
    ok(r.balDefault === '300,000', '잔금: 칸을 잔금으로 바꾸면 기본 금액이 잔금 전액(300,000)으로 바뀜', r.balDefault);
    ok(/잔금 300,000원 중 100,000원/.test(r.confirmMsg) && /잔금은 200,000원이 됩니다/.test(r.confirmMsg), '잔금: 확인창이 "잔금 300,000원 중 100,000원 … 200,000원이 됩니다"', r.confirmMsg);
    ok(r.reg.length === 1 && r.reg[0].p_slot === 'balance' && r.reg[0].p_amount === 100000, '잔금: 서버로 p_slot=balance, 100000원', r.reg);
    ok(r.est.dep === 700000 && r.est.bal === 200000 && r.est.balDate === '2026-10-01', '잔금: 선금은 그대로, 잔금만 200,000원(입금일 유지 — 부분 환불)', r.est);
    ok(r.lines.length === 1 && /잔금 -100,000원 \(원래 입금일 2026-10-01\)/.test(r.lines[0]), '잔금: 내역에 "잔금 -100,000원 (원래 입금일 2026-10-01)"', r.lines);
    ok(/입금일\(2026-10-01\)보다 빠를 수 없/.test(r.earlyAlert || '') && r.estAfterEarly === 200000, '잔금: 입금일보다 빠른 환불일은 서버 문구 그대로 안내되고 금액은 안 바뀜', r.earlyAlert);
    ok(page.__errs.length === 0, '잔금: 자바스크립트 오류 없음 ' + page.__errs[0]);
    await page.close();

    // ───── 3. 마감월 날짜 환불 거절 → 화면 안내
    page = await open('master');
    r = await page.evaluate(() => {
      const T = window.__t, o = {};
      T.fill('deposit', '200,000', '2026-09-25', '9월 중 환불 시도');
      const go = T.btn('환불 처리');
      go.click();
      o.alert = T.alerts.slice();
      o.btnLabel = go.textContent; o.btnDisabled = go.disabled;
      o.reopened = T.reopened; o.toasts = T.toasts.slice();
      o.est = { dep: T.est.depositAmount, rows: T.est.refundRows.length };
      o.formStillOpen = T.reason().value === '9월 중 환불 시도' && T.amt().value === '200,000';
      // 같은 화면에서 열린 달(10월)로 날짜만 고쳐 다시 누르면 성공 (같은 요청 번호로 한 번만 기록)
      T.date().value = '2026-10-28'; go.click();
      o.regCalls = T.regCalls().map(c => c.d.p_request_id);
      o.rowsAfter = T.est.refundRows.length; o.depAfter = T.est.depositAmount; o.toasts2 = T.toasts.slice();
      // 문구가 비어 있는 거절(통신 오류 등)은 기본 안내
      T.est.refundRows = []; T.est.depositAmount = 700000; T.est.depositDate = '2026-09-20'; T.render();
      window.sbXHR = (m, p, d, cb) => cb({ status: 500, text: '' });
      T.fill('deposit', '1,000', '2026-10-28', '통신 오류'); T.btn('환불 처리').click();
      o.fallback = T.alerts.slice(-1)[0];
      return o;
    });
    ok(r.alert.length === 1 && /마감된 달\(2026-09\)/.test(r.alert[0]) && /마스터에게 요청/.test(r.alert[0]), '마감월: 서버 거절 문구("마감된 달(2026-09) … 마스터에게 요청하세요")를 알림창으로 그대로 보여줌', r.alert);
    ok(r.btnLabel === '환불 처리' && r.btnDisabled === false, '마감월: 거절 뒤 버튼이 "환불 처리"로 다시 눌릴 수 있게 풀림(처리 중에 멈추지 않음)', r);
    ok(r.reopened === 0 && r.toasts.length === 0 && r.est.dep === 700000 && r.est.rows === 0, '마감월: 성공 토스트·상세 다시 열기 없음, 가짜 DB 변화 없음', r);
    ok(r.formStillOpen, '마감월: 입력한 금액·사유가 지워지지 않아 날짜만 고쳐 다시 시도 가능');
    ok(r.regCalls.length === 2 && r.regCalls[0] === r.regCalls[1] && r.rowsAfter === 1 && r.depAfter === 500000 && r.toasts2[0] === '환불을 등록했어요', '마감월: 날짜를 열린 달로 고쳐 다시 누르면 성공(같은 요청 번호 재사용, 1건만 기록)', r);
    ok(/처리하지 못했어요/.test(r.fallback || ''), '문구 없는 서버 거절은 "처리하지 못했어요" 기본 안내', r.fallback);
    ok(page.__errs.length === 0, '마감월: 자바스크립트 오류 없음 ' + page.__errs[0]);
    await page.close();

    // ───── 4. 실장은 환불 등록 불가 (읽기 전용)
    page = await open('staff');
    r = await page.evaluate(() => {
      const T = window.__t, o = {};
      o.isMaster = isMasterUser();
      // (a) 환불 이력이 있는 견적서: 읽기만
      T.est.refundRows = [
        { id: 'r1', entry_type: 'refund', slot: 'deposit', amount: 100000, paid_date: '2026-09-20', refund_date: '2026-10-03', reason: '일부 환불' },
        { id: 'r2', entry_type: 'refund', slot: 'balance', amount: 50000, paid_date: '2026-10-01', refund_date: '2026-10-05', reason: '잔금 환불' },
        { id: 'r2x', entry_type: 'reversal', reverses_id: 'r2', slot: 'balance', amount: 50000, paid_date: '2026-10-01', refund_date: '2026-10-06', reason: '취소' }];
      T.render();
      o.a = { lines: T.lines().length, strike: Array.from(T.box.querySelectorAll('.refund-line')).filter(l => /line-through/.test(l.style.cssText)).length,
        buttons: T.box.querySelectorAll('button').length, inputs: T.box.querySelectorAll('input,select').length, hasSection: !!T.box.querySelector('.refund-section'), text: T.box.textContent };
      // (b) 환불 이력이 없고 입금만 있는 견적서: 요청 안내 문구만
      T.est.refundRows = []; T.render();
      o.b = { buttons: T.box.querySelectorAll('button').length, inputs: T.box.querySelectorAll('input,select').length, text: T.box.textContent };
      // (c) 입금도 없음: 아무것도 없음
      T.est.depositAmount = 0; T.est.balanceAmount = 0; T.render();
      o.c = T.box.textContent;
      o.calls = T.calls.length;
      return o;
    });
    ok(r.isMaster === false, '실장: 이 화면은 마스터가 아닌 권한으로 열림(isMasterUser=false)', r.isMaster);
    ok(r.a.hasSection && r.a.lines === 2 && r.a.strike === 1 && /-100,000원/.test(r.a.text) && /환불 취소됨/.test(r.a.text), '실장: 환불 이력(유효 1건·취소된 1건 취소선)은 읽을 수 있음', r.a);
    ok(r.a.buttons === 0 && r.a.inputs === 0, '실장: 환불 이력이 있어도 버튼·입력칸이 하나도 없음(등록·취소 불가)', r.a);
    ok(r.b.buttons === 0 && r.b.inputs === 0 && /마스터에게 요청/.test(r.b.text), '실장: 환불 이력이 없고 입금만 있으면 버튼 없이 "마스터에게 요청" 안내만', r.b);
    ok(r.c === '' && r.calls === 0, '실장: 입금이 없으면 아무것도 안 보이고, 화면은 서버에 아무것도 보내지 않음', r);
    ok(page.__errs.length === 0, '실장: 자바스크립트 오류 없음 ' + page.__errs[0]);
    await page.close();

    // ───── 5. 환불 취소(reverse)
    page = await open('master');
    r = await page.evaluate(() => {
      const T = window.__t, o = {};
      // 잔금 100,000 환불 + 선금 전액 환불을 먼저 만든다
      T.fill('balance', '100,000', '2026-10-28', '잔금 일부'); T.btn('환불 처리').click();
      T.fill('deposit', null, '2026-10-28', '선금 전액'); T.btn('환불 처리').click();
      o.afterReg = { dep: T.est.depositAmount, bal: T.est.balanceAmount, cancelBtns: T.btns('환불 취소').length };
      const before = T.calls.length;
      // (a) 취소 사유 입력창에서 "취소"(null) → 서버로 안 보냄
      T.promptAnswer = null; T.btns('환불 취소')[0].click();
      o.nullPrompt = { newCalls: T.calls.length - before, alerts: T.alerts.length };
      // (b) 공백 사유 → 안내 후 서버로 안 보냄
      T.promptAnswer = '   '; const alertsBefore = T.alerts.length; T.btns('환불 취소')[0].click();
      o.blankPrompt = { newCalls: T.calls.length - before, alert: T.alerts.slice(alertsBefore)[0] };
      // (c) 서버가 거절(예: 환불 이후 새 입금이 기록된 칸) → 문구 안내, 버튼 복구, 다시 열지 않음
      T.rejectReverse = '그 칸에 환불 이후 새 입금이 기록되어 있어 취소할 수 없습니다. 새 입금을 먼저 정리해 주세요.';
      T.promptAnswer = '착오'; const reopenBefore = T.reopened; const b0 = T.btns('환불 취소')[0]; b0.click();
      o.rejected = { alert: T.alerts.slice(-1)[0], label: b0.textContent, disabled: b0.disabled, reopened: T.reopened - reopenBefore, dep: T.est.depositAmount, bal: T.est.balanceAmount };
      // (d) 정상 취소: 선금 환불(두 번째 줄) 취소 → 선금 700,000 복구
      T.rejectReverse = null; T.promptAnswer = '고객이 다시 결제'; T.render();
      const lines0 = T.lines();
      const idxDep = lines0.findIndex(l => /선금 -700,000원/.test(l));
      const cancelBtns = T.btns('환불 취소');
      cancelBtns[idxDep].click();
      o.rev = T.revCalls().filter(c => c.d.p_reason === '고객이 다시 결제').map(c => c.d);
      o.restored = { dep: T.est.depositAmount, depDate: T.est.depositDate, bal: T.est.balanceAmount };
      o.toast = T.toasts.slice(-1)[0];
      const all = T.lines();
      o.struck = Array.from(T.box.querySelectorAll('.refund-line')).map(l => /line-through/.test(l.style.cssText));
      o.lastText = all;
      o.cancelBtnsAfter = T.btns('환불 취소').length;
      o.optionsAfter = Array.from(T.sel().options).map(x => x.value);
      // (e) 이미 취소된 환불을 다시 취소하려는 요청(다른 기기에서 먼저 취소한 경우)은 서버가 거절
      window.sbXHR('POST', 'rpc/reverse_refund', { p_refund_id: cancelBtns[idxDep] && T.est.refundRows.find(x => x.slot === 'deposit').id, p_reason: '중복', p_request_id: 'z' }, (e) => { o.dupErr = e && JSON.parse(e.text).message; });
      return o;
    });
    ok(r.afterReg.dep === 0 && r.afterReg.bal === 200000 && r.afterReg.cancelBtns === 2, '취소 준비: 환불 2건 등록(선금 전액·잔금 일부), 취소 버튼 2개', r.afterReg);
    ok(r.nullPrompt.newCalls === 0 && r.nullPrompt.alerts === 0, '취소: 사유 입력창에서 "취소"를 누르면 서버로 아무것도 안 보냄', r.nullPrompt);
    ok(r.blankPrompt.newCalls === 0 && /사유를 입력해야 취소/.test(r.blankPrompt.alert || ''), '취소: 공백 사유는 안내 후 서버로 안 보냄', r.blankPrompt);
    ok(/새 입금이 기록되어 있어 취소할 수 없/.test(r.rejected.alert || '') && r.rejected.label === '환불 취소' && r.rejected.disabled === false && r.rejected.reopened === 0 && r.rejected.dep === 0, '취소: 서버가 거절하면 문구 그대로 안내, 버튼 복구, 화면 다시 열기·금액 변화 없음', r.rejected);
    ok(r.rev.length === 1 && typeof r.rev[0].p_refund_id === 'string' && r.rev[0].p_reason === '고객이 다시 결제' && typeof r.rev[0].p_request_id === 'string' && r.rev[0].p_request_id.length >= 32, '취소: reverse_refund 에 환불 id·사유·요청 번호(uuid)를 보냄', r.rev);
    ok(r.restored.dep === 700000 && r.restored.depDate === '2026-09-20' && r.restored.bal === 200000, '취소: 가짜 DB 선금 700,000·원래 입금일 복구, 잔금은 그대로(환불 취소는 선택한 환불만 되돌림)', r.restored);
    ok(r.toast === '환불을 취소했어요', '취소: "환불을 취소했어요" 토스트 후 다시 그림');
    ok(r.struck.length === 2 && r.struck.filter(Boolean).length === 1 && /환불 취소됨/.test(r.lastText.join('|')) && r.cancelBtnsAfter === 1, '취소: 다시 그린 화면에서 취소된 줄은 취소선+"환불 취소됨", 취소 버튼은 남은 1건에만', r);
    ok(JSON.stringify(r.optionsAfter) === '["deposit","balance"]', '취소: 선금이 복구되어 환불 선택지에 선금이 다시 나타남', r.optionsAfter);
    ok(/이미 취소된 환불/.test(r.dupErr || ''), '취소: 이미 취소된 환불을 또 취소하려는 요청은 (가짜) 서버 규칙상 거절 — 화면엔 취소 버튼 자체가 없음', r.dupErr);
    ok(page.__errs.length === 0, '취소: 자바스크립트 오류 없음 ' + page.__errs[0]);
    await page.close();
  } finally { await browser.close(); server.kill(); }
  console.log(fail ? '\n❌ 실패 ' + fail + '건' : '\n✅ 전체 통과(환불 경우의 수 — 가짜 서버·가짜 DB 시험)');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
