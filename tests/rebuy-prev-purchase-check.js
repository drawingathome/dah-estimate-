// N-230 ③: 재구매를 새 고객 줄로 나눈 뒤에도 고객 상세 요약줄에 '이전 구매 N건'이 이어서 보이는지(가짜 목록, 운영 확인 아님)
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
(async () => {
  const dir = path.resolve(__dirname, '..'); const port = 28705;
  const server = await startServer(dir, port); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
  const log = []; const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || '')));
  const txt = await page.evaluate(() => {
    var list = [
      { id: 901, clientName: '이전구매시험', phone: '010-3333-4444', stage: '시공완료', staffName: '마스터', visitCount: 1, date: '2026-06-01' },
      { id: 902, clientName: '이전구매시험', phone: '01033334444', stage: '상담', staffName: '마스터', visitCount: 1, date: '2026-11-20' },
      { id: 903, clientName: '혼자고객', phone: '010-9999-0000', stage: '상담', staffName: '마스터', visitCount: 1, date: '2026-11-20' },
      { id: 904, clientName: '이전구매시험', phone: '010-7777-1111', stage: '시공완료', staffName: '마스터', visitCount: 1, date: '2026-05-01' }
    ];
    function summary(c) { renderDetailHeader(c); var s = document.getElementById('detail-summary-row'); return s ? s.textContent : null; }
    return { rebuy: summary(list[1]), old: summary(list[0]), solo: summary(list[2]) , _l: (saveCustomers(list), 1) };
  });
  // renderDetailHeader가 loadCustomers()를 보므로 목록 저장 뒤 다시 측정
  const t2 = await page.evaluate(() => {
    function summary(id) { var c = loadCustomers().find(x => x.id === id); renderDetailHeader(c); var s = document.getElementById('detail-summary-row'); return s ? s.textContent : null; }
    return { rebuy: summary(902), old: summary(901), solo: summary(903), diffPhone: summary(904) };
  });
  ok('1. 새 줄(902)에 같은 이름+번호 이전 시공 1건이 "같은 연락처 다른 구매 1건"으로 이어 보임', /다른 구매 1건/.test(t2.rebuy || ''), JSON.stringify(t2));
  ok('2. 옛 줄(901)에서도 같은 연락처의 다른 구매(새 줄)를 알려 줌', /다른 구매 1건/.test(t2.old || ''), JSON.stringify(t2));
  ok('3. 같은 연락처가 없는 고객에는 표시 없음', !/다른 구매/.test(t2.solo || ''), JSON.stringify(t2));
  ok('4. 이름만 같고 연락처가 다른 고객(904)은 이어 붙이지 않음', !/다른 구매/.test(t2.diffPhone || ''), JSON.stringify(t2));
  ok('0. 화면 오류 없음', errs.length === 0, errs.join(';'));
  log.forEach(l => console.log(l)); await browser.close(); server.kill && server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
