// tests/stage-alert-and-pay-jump-check.js (N-62, N-61)
// ① 홈 처리필요 "완납 단계 확인"에 현재 단계와 다음 단계(잔금결제)가 같이 표시된다.
// ② 견적서 2개 고객에서 완납된 쪽 '추가 결제'에 다른 견적서의 잔금 금액을 넣으면 경고가 뜨고, [취소]를 누르면 그 견적서 결제 칸으로 화면이 이동·강조된다(확인을 누르면 이동하지 않는다).
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + JSON.stringify(d))); if (!c) failed++; }
(async () => {
  const root = path.resolve(__dirname, '..');
  const server = await startServer(root, 9985); const browser = await launchBrowser();
  const page = await browser.newPage(); await page.setViewport({ width: 900, height: 900 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await blockRealNetwork(page);
  await page.goto('http://localhost:9985/dah-dashboard.html', { waitUntil: 'domcontentloaded' }); await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  // ① 홈 알림 문구
  const home = await page.evaluate(async () => {
    const base = { date: '2026-10-10', staffName: '마스터', phone: '01000000000' };
    const cs = [Object.assign({ id: 901, clientName: '완납선금A', stage: '선금결제', price: 1000000, depositAmount: 500000, balanceAmount: 500000 }, base)];
    localStorage.setItem('dah_customers', JSON.stringify(cs)); if (typeof _customerCache !== 'undefined') { _customerCache.length = 0; cs.forEach(c => _customerCache.push(c)); }
    goTab('home'); renderHome(true); await new Promise(r => setTimeout(r, 600));
    const row = Array.from(document.querySelectorAll('[data-cname]')).find(e => e.getAttribute('data-cname') === '완납선금A');
    return row ? row.textContent : null;
  });
  ok('완납 단계 확인에 현재 단계가 표시됨', !!home && /완납 단계 확인\(현재 선금결제/.test(home), home);
  ok('완납 단계 확인에 다음 단계(잔금결제)가 표시됨', !!home && /다음 단계 잔금결제/.test(home), home);
  // ② 경고 후 이동
  async function scenario(accept) {
    return await page.evaluate(async (accept) => {
      const cust = { id: 271, clientName: '시험이', date: '2026-10-17', stage: '선금결제', price: 4862000, depositAmount: 3322000, balanceAmount: 0, staffName: '마스터' };
      localStorage.setItem('dah_customers', JSON.stringify([cust])); if (typeof _customerCache !== 'undefined') { _customerCache.length = 0; _customerCache.push(cust); }
      localStorage.setItem('dah_saved', JSON.stringify([
        { id: 'estOld', clientId: 271, clientName: '시험이', price: 3099000, depositAmount: 1559000, depositDate: '2026-10-20', balanceAmount: 0, savedAt: '2026-10-17T01:00:00Z', confirmedAt: 'x', contractStatus: 'contracted' },
        { id: 'estNew', clientId: 271, clientName: '시험이', price: 1763000, depositAmount: 1763000, depositDate: '2026-10-20', balanceAmount: 0, savedAt: '2026-10-17T03:00:00Z', confirmedAt: 'x', contractStatus: 'contracted' }]));
      openDetail('시험이', 271); await new Promise(r => setTimeout(r, 800));
      const tab = [...document.querySelectorAll('button,div,span')].find(e => e.textContent.trim() === '결제' && e.children.length === 0); if (tab) tab.click();
      await new Promise(r => setTimeout(r, 600));
      const target = document.querySelector('[data-est-pay-id="estOld"]');
      const mine = document.querySelector('[data-est-pay-id="estNew"]');
      let msg = '';
      window.confirm = (m) => { msg = m; return accept; };
      const amt = [...mine.querySelectorAll('input[type=text]')].find(i => /추가 결제 금액/.test(i.placeholder));
      amt.value = '1,540,000'; amt.dispatchEvent(new Event('input', { bubbles: true }));
      const btn = [...mine.querySelectorAll('button')].find(b => /추가 결제 저장/.test(b.textContent));
      btn.click(); await new Promise(r => setTimeout(r, 900));
      return { hasTarget: !!target, msg, glow: (target && target.style.boxShadow) || '' };
    }, accept);
  }
  let r = await scenario(false);
  ok('다른 견적서의 결제 칸에 표시(data-est-pay-id)가 있음', r.hasTarget, r);
  ok('경고 문구가 "그 견적서 칸으로 이동해요"로 안내됨', /그 견적서 칸으로 이동해요/.test(r.msg), r.msg);
  ok('[취소]를 누르면 그 견적서 칸이 강조됨', /rgb\(232, 176, 74\)|#E8B04A/i.test(r.glow), r);
  ok('JS 에러 없음', errs.length === 0, errs);
  await browser.close(); server.close && server.close();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 전부 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
