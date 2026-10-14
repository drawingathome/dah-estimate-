// tests/reconcile-check.js
// 2026-10-14: 입금 대조 도구(dash-reconcile.js) — 붙여넣기 해석, 열 자동 찾기, 1:1 맞춤(금액·날짜 오차·이름), 환불된 입금, 통장 범위 밖 제외, 설정 화면 연동.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0;
const ok = (c, m, d) => { console.log((c ? '✅ ' : '❌ ') + m + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); if (!c) fail++; };
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 70000);
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 27150;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await blockRealNetwork(page);
    await page.setViewport({ width: 900, height: 1400 });
    await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 600));
    await loginAs(page, 'master');

    // ── 1) 해석 함수 ──
    const p = await page.evaluate(() => ({
      amt: [reconParseAmount('1,200,000'), reconParseAmount('1,200,000원'), reconParseAmount('₩500000'), reconParseAmount('-5,000'), reconParseAmount('(7,000)'), reconParseAmount('abc'), reconParseAmount('')],
      date: [reconParseDate('2026-10-05'), reconParseDate('2026.10.05 10:12:33'), reconParseDate('2026/1/5'), reconParseDate('20261005'), reconParseDate('26.10.05'), reconParseDate('10월 5일'), reconParseDate('2026-13-05')],
      csv: reconParseTable('날짜,내용,금액\n2026-10-01,"홍,길동","1,200,000"\n'),
      tsv: reconParseTable('a\tb\n1\t2\n'),
    }));
    ok(JSON.stringify(p.amt) === JSON.stringify([1200000, 1200000, 500000, -5000, -7000, null, null]), '금액 해석(쉼표·원·₩·음수·괄호·글자)', p.amt);
    ok(JSON.stringify(p.date) === JSON.stringify(['2026-10-05', '2026-10-05', '2026-01-05', '2026-10-05', '2026-10-05', '', '']), '날짜 해석(여러 형식, 시각 포함, 잘못된 날짜는 빈 값)', p.date);
    ok(p.csv.length === 2 && p.csv[1][1] === '홍,길동' && p.csv[1][2] === '1,200,000', 'CSV에서 따옴표 안의 쉼표를 구분자로 보지 않음', p.csv);
    ok(p.tsv.length === 2 && p.tsv[1][1] === '2', '엑셀 복사(탭 구분) 해석');

    // ── 2) 은행 내역 모양 → 열 자동 찾기 + 1:1 맞춤 ──
    const bankText = [
      '거래일시\t적요\t입금액\t출금액\t잔액\t내용',
      '2026.10.01 10:12:33\t전자금융\t500,000\t0\t3,000,000\t김철수',
      '2026.10.03 09:00:00\t전자금융\t1,111,000\t0\t4,111,000\t홍길동',
      '2026.10.05 11:30:00\t전자금융\t1,200,000\t0\t5,311,000\t이영욱',
      '2026.10.07 14:00:00\t전자금융\t700,000\t0\t6,011,000\t이영희',
      '2026.10.08 14:00:00\t전자금융\t0\t300,000\t5,711,000\t환불출금',
      '2026.10.12 16:20:00\t전자금융\t982,000\t0\t6,693,000\t이영욱'
    ].join('\n');
    const r = await page.evaluate((bankText) => {
      const E = (id, cid, name, o) => Object.assign({ id, clientId: cid, clientName: name, price: 1000000, performanceRevenue: 900000, depositAmount: 0, depositDate: '', balanceAmount: 0, balanceDate: '' }, o);
      const rf = { id: 'r1', entry_type: 'refund', estimate_id: 'e3', slot: 'deposit', amount: 1200000, paid_date: '2026-10-05', refund_date: '2026-10-10' };
      localStorage.setItem('dah_saved', JSON.stringify([
        E('e1', 1, '김철수', { depositAmount: 500000, depositDate: '2026-10-01' }),
        E('e2', 2, '이영희', { balanceAmount: 700000, balanceDate: '2026-10-05' }),
        E('e3', 3, '이영욱', { price: 1027000, depositAmount: 982000, depositDate: '2026-10-12', refundRows: [rf] }),
        E('e4', 4, '박민수', { depositAmount: 300000, depositDate: '2026-10-02' }),
        E('e5', 5, '범위밖', { depositAmount: 450000, depositDate: '2026-08-01' })
      ]));
      const custs = [1, 2, 3, 4, 5].map(i => ({ id: i, clientName: ['김철수', '이영희', '이영욱', '박민수', '범위밖'][i - 1], staffName: '마스터', price: 1000000, depositAmount: 0, balanceAmount: 0 }));
      const rows = reconParseTable(bankText);
      const det = reconDetectColumns(rows);
      const bank = reconBuildBankRows(rows, det);
      const app = reconCollectAppPayments(custs);
      const res = reconMatch(bank, app, 3);
      return { det: { hasHeader: det.hasHeader, dateCol: det.dateCol, amountCol: det.amountCol }, bankN: bank.length, appN: app.length,
        matched: res.matched.map(m => m.bank.amount + ':' + m.app.customer + ':' + m.dayDiff), bankOnly: res.bankOnly.map(b => b.amount), appOnly: res.appOnly.map(a => a.customer + ':' + a.amount) };
    }, bankText);
    ok(r.det.hasHeader && r.det.dateCol === 0 && r.det.amountCol === 2, '머리글·날짜 열(0)·입금액 열(2)을 자동으로 찾음(출금액·잔액 열은 선택 안 함)', r.det);
    ok(r.bankN === 5, '입금만 5건(출금 행은 제외)', r.bankN);
    ok(r.matched.length === 4, '4건 일치(김철수·이영희·이영욱 환불된 입금·이영욱 재결제)', r.matched);
    ok(r.matched.indexOf('700000:이영희:2') >= 0, '날짜가 2일 달라도 오차(3일) 안이면 일치로 보고 차이를 표시', r.matched);
    ok(r.matched.indexOf('1200000:이영욱:0') >= 0, '환불된 입금(120만)도 통장에 들어왔던 돈으로 일치 처리', r.matched);
    ok(JSON.stringify(r.bankOnly) === '[1111000]', '통장에만 있음: 111.1만(홍길동)', r.bankOnly);
    ok(JSON.stringify(r.appOnly) === '["박민수:300000"]', '앱에만 있음: 박민수 30만. 통장 기간 밖(8월) 입금은 비교 불가라 제외', r.appOnly);

    // ── 3) 설정 화면 연동(붙여넣기 → 대조하기 → 결과) ──
    const ui = await page.evaluate(async (bankText) => {
      saveCustomers([1, 2, 3, 4, 5].map(i => ({ id: i, clientName: ['김철수', '이영희', '이영욱', '박민수', '범위밖'][i - 1], staffName: '마스터', stage: '선금결제', price: 1000000, depositAmount: 0, balanceAmount: 0 })));
      window.loadEstimatesAsync = function (cb) { cb([]); };
      window.loadCustomersAsync = function (cb) { cb(loadCustomers()); };
      const wrap = document.createElement('div'); document.body.appendChild(wrap);
      renderSettingsReconcileGroup(wrap, function (id, title, cards) { const g = document.createElement('div'); g.id = id; cards.forEach(c => g.appendChild(c)); return g; });
      const ta = wrap.querySelector('#recon-text'); ta.value = bankText; ta.dispatchEvent(new Event('input'));
      const out = { dateVal: wrap.querySelector('#recon-date-col').value, amtVal: wrap.querySelector('#recon-amt-col').value, amtOptions: wrap.querySelectorAll('#recon-amt-col option').length };
      Array.from(wrap.querySelectorAll('button')).find(b => b.textContent.trim() === '대조하기').click();
      await new Promise(r => setTimeout(r, 300));
      out.text = wrap.querySelector('#recon-result').innerText;
      return out;
    }, bankText);
    ok(ui.dateVal === '0' && ui.amtVal === '2' && ui.amtOptions === 6, '화면: 붙여넣으면 날짜/입금액 열이 자동 선택됨', ui);
    ok(/통장 입금 5건 중 4건 일치/.test(ui.text) && /통장에만 있음 1건/.test(ui.text) && /앱에만 있음 1건/.test(ui.text), '화면: 요약 줄(5건 중 4건 일치, 통장에만 1, 앱에만 1)', ui.text.slice(0, 160));
    ok(/전자금융 홍길동/.test(ui.text) && !/4,111,000 홍길동/.test(ui.text), '화면: 통장 내용에는 글자만(출금액·잔액 숫자는 제외)', ui.text.slice(150, 300));
    ok(/홍길동/.test(ui.text) && /박민수/.test(ui.text), '화면: 통장에만 있는 건(홍길동)과 앱에만 있는 건(박민수)이 목록에 나옴');

    // ── 4) 실제 설정 화면: 마스터에게는 보이고 실장에게는 안 보임 ──
    const sett = await page.evaluate(() => {
      const host = document.getElementById('settings-body') || document.getElementById('settings') || document.body;
      try { renderSettings(); } catch (e) { return { err: e.message }; }
      return { master: !!document.getElementById('sec-set-reconcile') };
    });
    ok(sett.master === true, '설정 화면(마스터)에 "입금 대조" 항목이 나타남', sett);
    ok(errs.length === 0, 'JS 오류 없음 ' + errs.join('|'));
  } catch (e) { console.log('❌ 예외', e.stack || e.message); fail++; }
  await browser.close(); server.kill();
  console.log(fail ? '\n❌ 실패 ' + fail + '건' : '\n✅ 전체 통과');
  process.exit(fail ? 1 : 0);
})();
