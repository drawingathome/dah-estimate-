// tests/extra-pay-check.js
// 2026-10-19: "추가 결제"(완납 뒤 증액 등으로 받는 돈, estimate_extra_payments)가 받은 돈·미수금·월 매출에 올바르게 반영되는지,
// 추가 결제가 없는 고객의 계산은 예전과 같은지, 추가 결제 화면이 그려지고 마스터에게만 삭제 버튼이 보이는지 확인.
// (DB 쪽 independent_month_check 와 같은 규칙: 선금·잔금으로 채운 만큼을 뺀 한도 안에서만 성과매출 인정)
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9971;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  const log = [];
  // 견적서 2개 고객의 결제 탭 맨 위 합계 안내(노지경형 중복 입금 방지용)
  const multi = await page.evaluate(async () => {
    const cust = { id: 21, clientName: 'M1', date: '2026-09-15', stage: '시공준비중', price: 7001000, depositAmount: 3200000, balanceAmount: 0, staffName: '마스터' };
    localStorage.setItem('dah_customers', JSON.stringify([cust]));
    if (typeof _customerCache !== 'undefined') { _customerCache.length = 0; _customerCache.push(cust); }
    localStorage.setItem('dah_saved', JSON.stringify([
      { id: 'm1', clientId: 21, clientName: 'M1', price: 6381000, depositAmount: 2580000, depositDate: '2026-09-15', balanceAmount: 0, savedAt: '2026-09-15T01:00:00Z' },
      { id: 'm2', clientId: 21, clientName: 'M1', price: 620000, depositAmount: 620000, depositDate: '2026-09-16', balanceAmount: 0, savedAt: '2026-09-21T01:00:00Z' }
    ]));
    openDetail('M1', 21);
    await new Promise(r => setTimeout(r, 800));
    const el = document.querySelector('.multi-est-pay-summary');
    return { has: !!el, text: el ? el.textContent : '' };
  });
  const ok = (l, c, d) => log.push((c ? '✅' : '❌') + ' ' + l + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : ''));

  // 알림톡 잔금 안내 금액: 받은 돈(선금+잔금+추가 결제)을 뺀 남은 금액이어야 함
  const alim = await page.evaluate(() => {
    const cust = { id: 31, clientName: 'A1', date: '2026-09-15', stage: '잔금결제', price: 1500000, depositAmount: 500000, balanceAmount: 500000, staffName: '마스터' };
    localStorage.setItem('dah_customers', JSON.stringify([cust]));
    if (typeof _customerCache !== 'undefined') { _customerCache.length = 0; _customerCache.push(cust); }
    const mk = (extra) => JSON.stringify([{ id: 'a1', clientId: 31, clientName: 'A1', price: 1500000, depositAmount: 500000, balanceAmount: 500000, savedAt: '2026-09-15T01:00:00Z', extraPayRows: extra }]);
    localStorage.setItem('dah_saved', mk([{ id: 'q1', estimate_id: 'a1', amount: 300000, paid_date: '2026-10-05', method: '카드', receipt: false, memo: '', created_at: '2026-10-05T01:00:00Z' }]));
    const withExtra = guessContextVars(cust).amount;
    localStorage.setItem('dah_saved', mk([]));
    const noExtra = guessContextVars(cust).amount;
    return { withExtra, noExtra };
  });
  ok('알림톡 잔금 안내: 추가 결제 30만을 뺀 20만 / 추가 없으면 50만', alim.withExtra === 200000 && alim.noExtra === 500000, alim);
  // 실제 운영 데이터 모양 그대로: 노지경형(견적서 2개, 고객 총액=합계, 완납) / 박소진형(가견적 옛 견적서+실제 견적서)
  const alim2 = await page.evaluate(() => {
    const out = {};
    const run = (cust, ests) => {
      localStorage.setItem('dah_customers', JSON.stringify([cust]));
      if (typeof _customerCache !== 'undefined') { _customerCache.length = 0; _customerCache.push(cust); }
      localStorage.setItem('dah_saved', JSON.stringify(ests));
      return guessContextVars(cust).amount;
    };
    out.njk = run({ id: 41, clientName: 'N1', date: '2026-09-15', stage: '시공준비중', price: 7001000, depositAmount: 3820000, balanceAmount: 3181000, staffName: '마스터' },
      [{ id: 'n1', clientId: 41, clientName: 'N1', price: 6381000, depositAmount: 3200000, balanceAmount: 3181000, savedAt: '2026-09-15T01:00:00Z' },
       { id: 'n2', clientId: 41, clientName: 'N1', price: 620000, depositAmount: 620000, balanceAmount: 0, savedAt: '2026-09-21T01:00:00Z' }]);
    out.psj = run({ id: 42, clientName: 'P1', date: '2026-09-15', stage: '잔금결제', price: 1468000, depositAmount: 0, balanceAmount: 1468000, staffName: '마스터' },
      [{ id: 'p1', clientId: 42, clientName: 'P1', price: 522000, depositAmount: 0, balanceAmount: 0, savedAt: '2026-09-10T01:00:00Z' },
       { id: 'p2', clientId: 42, clientName: 'P1', price: 1468000, depositAmount: 0, balanceAmount: 1468000, savedAt: '2026-09-15T01:00:00Z' }]);
    out.half = run({ id: 43, clientName: 'H1', date: '2026-09-15', stage: '확정견적', price: 1000000, depositAmount: 400000, balanceAmount: 0, staffName: '마스터' },
      [{ id: 'h1', clientId: 43, clientName: 'H1', price: 1000000, depositAmount: 400000, balanceAmount: 0, savedAt: '2026-09-15T01:00:00Z' }]);
    return out;
  });
  ok('알림톡 잔금: 노지경형(견적서 2개·완납)은 0원', alim2.njk === 0, alim2);
  ok('알림톡 잔금: 박소진형(옛 가견적+실제 견적서, 잔금 완납)은 0원', alim2.psj === 0, alim2);
  ok('알림톡 잔금: 선금 40만만 받은 100만 건은 60만원', alim2.half === 600000, alim2);
  // 고객 엑셀: 실제로 만들어지는 파일 내용을 가로채서 추가결제액 열과 열 개수를 확인
  const csv = await page.evaluate(async () => {
    const cust = { id: 51, clientName: 'E1', date: '2026-09-15', stage: '잔금결제', price: 1500000, depositAmount: 500000, balanceAmount: 500000, staffName: '마스터' };
    localStorage.setItem('dah_customers', JSON.stringify([cust]));
    if (typeof _customerCache !== 'undefined') { _customerCache.length = 0; _customerCache.push(cust); }
    localStorage.setItem('dah_saved', JSON.stringify([{ id: 'e1', clientId: 51, clientName: 'E1', price: 1500000, depositAmount: 500000, balanceAmount: 500000, savedAt: '2026-09-15T01:00:00Z',
      extraPayRows: [{ id: 'z1', estimate_id: 'e1', amount: 300000, paid_date: '2026-10-05', method: '카드', receipt: false, memo: '', created_at: '2026-10-05T01:00:00Z' }] }]));
    let captured = null;
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = (b) => { captured = b; return 'blob:test'; };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    try { _exportExcelInner(); } finally { URL.createObjectURL = origCreate; HTMLAnchorElement.prototype.click = origClick; }
    return captured ? await captured.text() : null;
  });
  const lines = csv ? csv.replace(/^\uFEFF/, '').split('\r\n') : [];
  const hdr = (lines[0] || '').split(','), row = (lines[1] || '').split(',');
  const ix = hdr.indexOf('추가결제액');
  ok('엑셀: 추가결제액 열이 있고 값이 300000, 제목·내용 열 개수가 같음', ix >= 0 && row[ix] === '300000' && hdr.length === row.length, { ix, v: row[ix], h: hdr.length, r: row.length });
  const r = await page.evaluate(() => {
    const xr = (id, estId, amount, date, extra) => Object.assign({ id, estimate_id: estId, amount, paid_date: date, method: '카드', receipt: false, memo: '', created_at: date + 'T01:00:00Z' }, extra || {});
    localStorage.setItem('dah_saved', JSON.stringify([
      // X1 완납 뒤 증액: 총액 130만(성과 117만), 선금 50만(9/1)+잔금 50만(9/10) 뒤 추가 30만(10/5)
      { id: 'x1', clientId: 11, clientName: 'X1', price: 1300000, performanceRevenue: 1170000, depositAmount: 500000, depositDate: '2026-09-01', balanceAmount: 500000, balanceDate: '2026-09-10',
        extraPayRows: [xr('p1', 'x1', 300000, '2026-10-05')] },
      // X2 추가 결제가 있어도 총액이 더 커서 아직 미수금이 남음: 총액 150만, 선금 50만+잔금 50만+추가 30만 = 130만
      { id: 'x2', clientId: 12, clientName: 'X2', price: 1500000, performanceRevenue: 1350000, depositAmount: 500000, depositDate: '2026-09-01', balanceAmount: 500000, balanceDate: '2026-09-10',
        extraPayRows: [xr('p2', 'x2', 300000, '2026-10-05')] },
      // X3 추가 결제 없음(예전 계산 그대로)
      { id: 'x3', clientId: 13, clientName: 'X3', price: 1000000, performanceRevenue: 900000, depositAmount: 500000, depositDate: '2026-09-01', balanceAmount: 500000, balanceDate: '2026-10-02' },
      // X4 추가 결제 + 환불: 총액 120만(성과 108만), 선금 100만(9/1)에서 10만 환불(10/3, 칸 90만), 추가 20만(9/5)
      { id: 'x4', clientId: 14, clientName: 'X4', price: 1200000, performanceRevenue: 1080000, depositAmount: 900000, depositDate: '2026-09-01', balanceAmount: 0, balanceDate: '',
        refundRows: [{ id: 'rf4', entry_type: 'refund', estimate_id: 'x4', slot: 'deposit', amount: 100000, paid_date: '2026-09-01', refund_date: '2026-10-03' }],
        extraPayRows: [xr('p4', 'x4', 200000, '2026-09-05')] },
      // X5 총액을 이미 넘긴 뒤의 추가 결제: 총액 100만(성과 90만), 선금·잔금 100만 완납 뒤 추가 10만 -> 입금엔 잡히고 성과매출은 한도 초과분 0
      { id: 'x5', clientId: 15, clientName: 'X5', price: 1000000, performanceRevenue: 900000, depositAmount: 500000, depositDate: '2026-09-01', balanceAmount: 500000, balanceDate: '2026-09-10',
        extraPayRows: [xr('p5', 'x5', 100000, '2026-10-05')] },
      // X6 금액 0짜리 줄은 무시
      { id: 'x6', clientId: 16, clientName: 'X6', price: 1000000, performanceRevenue: 900000, depositAmount: 1000000, depositDate: '2026-09-01', balanceAmount: 0, balanceDate: '',
        extraPayRows: [xr('p6', 'x6', 0, '2026-10-05')] }
    ]));
    const sumBy = (c, m) => { const o = { rev: 0, perf: 0 }; splitCustomerPayments(c).forEach(p => { if ((p.date || '').slice(0, 7) === m) { o.rev += p.revenue; o.perf += p.perf; } }); o.perf = Math.round(o.perf); return o; };
    const cust = (id, stage) => ({ id, clientName: 'X' + (id - 10), date: '2026-09-01', stage: stage || '시공준비중', price: 0, depositAmount: 0, balanceAmount: 0 });
    const out = {};
    for (let i = 1; i <= 6; i++) {
      const c = cust(10 + i);
      out['x' + i] = { sep: sumBy(c, '2026-09'), oct: sumBy(c, '2026-10'), received: getReceivedAmount(c) };
    }
    out.unpaid2 = getUnpaidAmount(Object.assign(cust(12), { price: 1500000 }));
    out.unpaid1 = getUnpaidAmount(Object.assign(cust(11), { price: 1300000 }));
    out.status1 = getPayStatus(Object.assign(cust(11), { price: 1300000 })).state;
    out.rows6 = getEstExtraRows({ extraPayRows: [{ id: 'z', amount: 0, paid_date: '2026-10-05' }] }).length;
    // 화면: 추가 결제 영역
    const mk = (master) => {
      window.isMasterUser = () => master;
      const box = document.createElement('div');
      appendExtraPaySection(box, { id: 'x1', price: 1300000, depositAmount: 500000, balanceAmount: 500000, extraPayRows: [xr('p1', 'x1', 300000, '2026-10-05', { memo: '블라인드 추가' })] }, { id: 11, clientName: 'X1' });
      return { text: box.textContent, del: Array.from(box.querySelectorAll('button')).filter(b => b.textContent === '삭제').length, save: Array.from(box.querySelectorAll('button')).filter(b => b.textContent === '추가 결제 저장').length };
    };
    // 저장 버튼 경고: 금액을 넣고 저장을 눌렀을 때 confirm 이 뜨는지/어떤 문구인지(confirm 은 false 로 막아 서버 전송 없음)
    const tryTo = (est, amount) => {
      window.isMasterUser = () => true;
      const box = document.createElement('div');
      appendExtraPaySection(box, est, { id: 11, clientName: 'X1' });
      const msgs = [];
      const orig = window.confirm; window.confirm = (m) => { msgs.push(m); return false; };
      const inp = Array.from(box.querySelectorAll('input')).find(i => i.placeholder === '추가 결제 금액');
      inp.value = String(amount);
      Array.from(box.querySelectorAll('button')).find(b => b.textContent === '추가 결제 저장').click();
      window.confirm = orig;
      return msgs;
    };
    // 잔금 일부를 받은 뒤 남은 금액(45,000) 이하 → 확인창 없음(서버 전송 시도)
    out.warnSplit = tryTo({ id: 'w1', price: 1225000, depositAmount: 499000, balanceAmount: 681000, extraPayRows: [] }, 45000);
    // 잔금을 아직 못 받은 상태에서 추가 결제로 넣으려 함 → 잔금 칸 안내 경고
    out.warnNoBal = tryTo({ id: 'w2', price: 1225000, depositAmount: 499000, balanceAmount: 0, extraPayRows: [] }, 45000);
    // 남은 금액보다 많이 → 초과 경고
    out.warnOver = tryTo({ id: 'w3', price: 1225000, depositAmount: 499000, balanceAmount: 681000, extraPayRows: [] }, 100000);
    // 이미 채워진 상태(완납)에서 추가 → 초과 경고(증액 확인)
    out.warnFull = tryTo({ id: 'w4', price: 1180000, depositAmount: 499000, balanceAmount: 681000, extraPayRows: [] }, 50000);
    out.uiMaster = mk(true);
    out.uiStaff = mk(false);
    return out;
  });
  ok('X1 증액: 9월 입금 100만·성과 90만(130만 기준 선금·잔금분)', r.x1.sep.rev === 1000000 && r.x1.sep.perf === 900000, r.x1.sep);
  ok('X1 10월 추가 결제 30만 → 입금 30만·성과 27만', r.x1.oct.rev === 300000 && r.x1.oct.perf === 270000, r.x1.oct);
  ok('X1 받은 돈 130만, 미수금 0, 완납 판정', r.x1.received === 1300000 && r.unpaid1 === 0 && r.status1 === 'full', [r.x1.received, r.unpaid1, r.status1]);
  ok('X2 추가 결제를 합친 받은 돈 130만 → 미수금 20만', r.x2.received === 1300000 && r.unpaid2 === 200000, [r.x2.received, r.unpaid2]);
  ok('X3 추가 결제 없는 고객은 예전 계산 그대로(9월 50만/45만, 10월 50만/45만)', r.x3.sep.rev === 500000 && r.x3.sep.perf === 450000 && r.x3.oct.rev === 500000 && r.x3.oct.perf === 450000 && r.x3.received === 1000000, r.x3);
  ok('X4 추가+환불: 9월 입금 120만·성과 108만', r.x4.sep.rev === 1200000 && r.x4.sep.perf === 1080000, r.x4.sep);
  ok('X4 10월 환불 -10만·성과 -9만', r.x4.oct.rev === -100000 && r.x4.oct.perf === -90000, r.x4.oct);
  ok('X5 총액을 넘긴 추가 결제: 입금 10만은 잡히고 성과매출은 0', r.x5.oct.rev === 100000 && r.x5.oct.perf === 0 && r.x5.received === 1100000, r.x5);
  ok('X6 금액 0 줄은 무시', r.rows6 === 0 && r.x6.received === 1000000 && r.x6.oct.rev === 0, [r.rows6, r.x6]);
  ok('추가 결제 영역: 합계·메모가 보이고 저장 버튼이 있음', /합계 300,000원/.test(r.uiMaster.text) && /블라인드 추가/.test(r.uiMaster.text) && r.uiMaster.save === 1, r.uiMaster);
  ok('견적서 2개 고객: 결제 탭 위에 앱 받은 돈 합계(3,200,000원)와 안내가 보임', multi.has && /3,200,000원/.test(multi.text) && /2,580,000 \+ 620,000|620,000 \+ 2,580,000/.test(multi.text) && /중복/.test(multi.text), multi);
  ok('나눠 받은 잔금(남은 금액 이하)은 확인창 없이 저장 진행', r.warnSplit.length === 0, r.warnSplit);
  ok('잔금 칸이 빈 상태의 추가 결제는 잔금 칸 안내 경고', r.warnNoBal.length === 1 && /잔금 칸에 입력/.test(r.warnNoBal[0]), r.warnNoBal);
  ok('남은 금액보다 많으면 초과 경고', r.warnOver.length === 1 && /많아져요/.test(r.warnOver[0]), r.warnOver);
  ok('이미 완납인데 추가하면 증액 확인 경고', r.warnFull.length === 1 && /많아져요/.test(r.warnFull[0]), r.warnFull);
  ok('삭제 버튼은 마스터에게만 보임', r.uiMaster.del === 1 && r.uiStaff.del === 0, [r.uiMaster.del, r.uiStaff.del]);
  ok('자바스크립트 오류 없음', jsErrors.length === 0, jsErrors);

  console.log(log.join('\n'));
  await browser.close(); server.close();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
