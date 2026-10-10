// tests/pay-status-chip-check.js
// 2026-10-10(선혜님 - "선금을 보내면 잔금이 얼마 남았는지 뜨고 금액이 같으면 매칭되는지 눈으로 확인돼야 한다.
// 결제 탭에만 있으면 허술해 보인다"): 칸반 카드·고객목록에도 같은 기준(getPayStatus)으로
// 잔금 남음 / 완납 / 초과 입금 표시. 판정 함수 + 칸반 카드 + 고객목록 렌더를 검증.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27141;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 1) 판정 함수
  const st = await page.evaluate(() => {
    function s(o) { var r = getPayStatus(Object.assign({ id: 1, clientName: 'x' }, o)); return r.state + ':' + r.diff; }
    return {
      full:    s({ stage: '시공완료',   price: 1000000, depositAmount: 500000, balanceAmount: 500000 }),
      partial: s({ stage: '선금결제',   price: 1000000, depositAmount: 300000, balanceAmount: 0 }),
      over:    s({ stage: '시공준비중', price: 1000000, depositAmount: 600000, balanceAmount: 500000 }),
      none0:   s({ stage: '선금결제',   price: 1000000, depositAmount: 0, balanceAmount: 0 }),
      quote:   s({ stage: '가견적',     price: 1000000, depositAmount: 300000, balanceAmount: 0 }),
      noprice: s({ stage: '선금결제',   price: 0,       depositAmount: 300000, balanceAmount: 0 })
    };
  });
  ok('1. 딱 맞으면 full', st.full === 'full:0', st.full);
  ok('1-1. 일부만 받으면 partial(남은 700,000)', st.partial === 'partial:700000', st.partial);
  ok('1-2. 더 받으면 over(-100,000)', st.over === 'over:-100000', st.over);
  ok('1-3. 받은 돈이 0이면 none(미수금 표시는 기존 방식)', st.none0.indexOf('none') === 0, st.none0);
  ok('1-4. 견적 단계(가견적)는 none', st.quote.indexOf('none') === 0, st.quote);
  ok('1-5. 총액이 없으면 none', st.noprice.indexOf('none') === 0, st.noprice);

  // 2) 칸반 카드
  const kb = await page.evaluate(() => {
    var list = [
      { id: 9401, clientName: '칸반남음', stage: '선금결제',   staffName: '마스터', price: 1000000, depositAmount: 300000, balanceAmount: 0, date: '2026-10-01' },
      { id: 9402, clientName: '칸반완납', stage: '시공완료',   staffName: '마스터', price: 1000000, depositAmount: 500000, balanceAmount: 500000, date: '2026-10-01' },
      { id: 9403, clientName: '칸반초과', stage: '시공준비중', staffName: '마스터', price: 1000000, depositAmount: 600000, balanceAmount: 500000, date: '2026-10-01' }
    ];
    var wrap = document.createElement('div'); document.body.appendChild(wrap);
    renderKanbanCols(list, wrap);
    var chips = Array.prototype.slice.call(wrap.querySelectorAll('.pay-status-chip')).map(function(e){ return e.textContent; });
    return chips;
  });
  ok('2. 칸반: "잔금 700,000원 남음" 표시', kb.indexOf('잔금 700,000원 남음') !== -1, JSON.stringify(kb));
  ok('2-1. 칸반: "✓ 완납" 표시', kb.indexOf('✓ 완납') !== -1, JSON.stringify(kb));
  ok('2-2. 칸반: "초과 입금" 경고 표시', kb.some(t => t.indexOf('100,000원 초과 입금') !== -1), JSON.stringify(kb));

  // 3) 고객목록
  const ls = await page.evaluate(() => {
    saveCustomers([
      { id: 9411, clientName: '목록남음', phone: '01000000001', stage: '선금결제',   staffName: '마스터', price: 1000000, depositAmount: 300000, balanceAmount: 0, date: '2026-10-01' },
      { id: 9412, clientName: '목록완납', phone: '01000000002', stage: '시공완료',   staffName: '마스터', price: 1000000, depositAmount: 500000, balanceAmount: 500000, date: '2026-10-01' },
      { id: 9413, clientName: '목록초과', phone: '01000000003', stage: '시공준비중', staffName: '마스터', price: 1000000, depositAmount: 600000, balanceAmount: 500000, date: '2026-10-01' },
      { id: 9414, clientName: '목록무입금', phone: '01000000004', stage: '시공준비중', staffName: '마스터', price: 1000000, depositAmount: 0, balanceAmount: 0, date: '2026-10-01' }
    ]);
    try { if (typeof showTab === 'function') showTab('search'); } catch (e) {}
    renderSearch();
    return Array.prototype.slice.call(document.querySelectorAll('.pay-status-chip')).map(function(e){ return e.textContent; });
  });
  ok('3. 목록: "잔금 700,000원 남음" 표시', ls.indexOf('잔금 700,000원 남음') !== -1, JSON.stringify(ls));
  ok('3-1. 목록: "✓ 완납" 표시', ls.indexOf('✓ 완납') !== -1, JSON.stringify(ls));
  ok('3-2. 목록: "초과 입금" 경고 표시', ls.some(t => t.indexOf('100,000원 초과 입금') !== -1), JSON.stringify(ls));
  ok('3-3. 목록: 받은 돈이 0이면 기존처럼 "미수금 1,000,000원"', ls.indexOf('미수금 1,000,000원') !== -1, JSON.stringify(ls));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');
  await browser.close(); server.kill();
  process.exit(allPass && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
