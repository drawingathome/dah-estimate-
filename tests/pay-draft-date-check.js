// tests/pay-draft-date-check.js (N-63)
// 고객 상세 결제 탭: 선금·잔금 날짜 기본값은 오늘이어야 한다. 예전(어제 이전) 임시저장 날짜가 기본값으로 뜨면 안 되고,
// 같은 날 임시저장은 되살아나며, 견적서 2개 고객에서 한 견적서의 임시저장이 다른 견적서 칸에 섞이면 안 된다.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + JSON.stringify(d))); if (!c) failed++; }
(async () => {
  const root = path.resolve(__dirname, '..');
  const server = await startServer(root, 9984); const browser = await launchBrowser();
  async function open(draftSetup) {
    const page = await browser.newPage(); await page.setViewport({ width: 900, height: 1400 });
    await blockRealNetwork(page);
    await page.goto('http://localhost:9984/dah-dashboard.html', { waitUntil: 'domcontentloaded' }); await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');
    const r = await page.evaluate(async (setup) => {
      const cust = { id: 271, clientName: '시험이', date: '2026-10-17', stage: '선금결제', price: 4862000, depositAmount: 1559000, balanceAmount: 0, staffName: '마스터' };
      localStorage.setItem('dah_customers', JSON.stringify([cust])); if (typeof _customerCache !== 'undefined') { _customerCache.length = 0; _customerCache.push(cust); }
      localStorage.setItem('dah_saved', JSON.stringify([
        { id: 'estA', clientId: 271, clientName: '시험이', price: 3099000, depositAmount: 1559000, depositDate: '2026-10-20', balanceAmount: 0, savedAt: '2026-10-17T01:00:00Z', confirmedAt: 'x', contractStatus: 'contracted' },
        { id: 'estB', clientId: 271, clientName: '시험이', price: 1763000, depositAmount: 500000, depositDate: '2026-10-20', balanceAmount: 0, savedAt: '2026-10-17T03:00:00Z', confirmedAt: 'x', contractStatus: 'contracted' }]));
      const today = todayStr();
      const stale = { bal: { method: '현금', amount: '1,540,000', date: '2026-10-20', receipt: false, day: '2026-10-20' } };
      const same = { bal: { method: '현금', amount: '777,000', date: today, receipt: false, day: today } };
      const old = { bal: { method: '현금', amount: '1,540,000', date: '2026-10-20', receipt: false } }; // 예전 형식(day 없음)
      const sets = { stale, same, old };
      if (setup === 'stale-A') localStorage.setItem('dah_pay_draft_271_estA', JSON.stringify(stale));
      if (setup === 'old-format-customer-key') localStorage.setItem('dah_pay_draft_271', JSON.stringify(old));
      if (setup === 'same-A') localStorage.setItem('dah_pay_draft_271_estA', JSON.stringify(same));
      openDetail('시험이', 271); await new Promise(r => setTimeout(r, 800));
      const tab = [...document.querySelectorAll('button,div,span')].find(e => e.textContent.trim() === '결제' && e.children.length === 0); if (tab) tab.click();
      await new Promise(r => setTimeout(r, 600));
      const secs = [...document.querySelectorAll('.multi-est-pay-summary')][0].parentElement;
      const rows = [...secs.querySelectorAll('input[type=date]')].map(i => i.value);
      const amts = [...secs.querySelectorAll('input[type=text]')].map(i => i.placeholder + '=' + i.value).filter(x => /^잔금/.test(x));
      return { today, rows, amts };
    }, draftSetup);
    await page.close(); return r;
  }
  let r = await open('none'); ok('임시저장 없음 → 모든 날짜 칸이 오늘', r.rows.length >= 2 && r.rows.every(v => v === r.today), r);
  r = await open('stale-A'); ok('어제 이전 임시저장(10-20) → 날짜 칸이 오늘로 뜸', r.rows.every(v => v === r.today), r); ok('어제 이전 임시저장 → 금액도 되살리지 않음', r.amts.every(x => /=$/.test(x)), r);
  r = await open('old-format-customer-key'); ok('예전 형식(고객 단위 키) 임시저장은 쓰지 않음', r.rows.every(v => v === r.today), r);
  r = await open('same-A'); ok('같은 날 임시저장은 되살아남(견적서 A의 잔금 금액 777,000)', r.amts.some(x => /777,000/.test(x)), r); ok('같은 날 임시저장이 다른 견적서(B) 칸에 섞이지 않음', r.amts.filter(x => /777,000/.test(x)).length === 1, r);
  await browser.close(); server.kill && server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 전부 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
