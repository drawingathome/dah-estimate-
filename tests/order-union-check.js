#!/usr/bin/env node
// tests/order-union-check.js (H-30, 2026-10-27)
// 같은 고객이 커튼·블라인드 견적서와 '기타만' 견적서를 같이 가졌을 때, 발주 항목이 '최신 1건'이 아니라 모든 견적서(보관 제외)의 합집합으로 정해지는지.
// DB 규칙 dah_order_complete(docs/db/2026-10-27_order_complete_union_apply.sql)와 같은 기준이어야 화면과 단계가 어긋나지 않는다.
// 사용법: node tests/order-union-check.js dah-dashboard.html
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
(async () => {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node order-union-check.js <dah-dashboard.html경로>'); process.exit(1); }
  const dir = path.dirname(path.resolve(filePath)); const file = path.basename(filePath);
  const port = 20401 + Math.floor(Math.random() * 400);
  const server = await startServer(dir, port); const browser = await launchBrowser();
  let fail = 0; const check = (l, c, d) => { if (c) console.log('  ✅ ' + l); else { console.log('  ❌ ' + l + ' — ' + d); fail++; } };
  console.log('\n[발주 항목 합집합 검사] ' + file);
  const page = await browser.newPage(); await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
  const keys = async (ests, cid) => page.evaluate((ests, cid) => {
    localStorage.setItem('dah_saved', JSON.stringify(ests));
    return getRelevantOrderItems({ id: cid, clientName: '검증' }).map(i => i.key).sort().join(',');
  }, ests, cid);
  const ALL = 'blind,fabric,install,material,production', CURT = 'fabric,install,material,production', BLIND = 'blind,install';
  check('최신이 기타만이어도 이전 커튼·블라인드 견적의 발주 항목이 전부 나옴(시험카 사례)', await keys([
    { clientId: 1, curtainCount: 2, blindCount: 1, lineItems: [{}], savedAt: '2026-10-17 02:53' },
    { clientId: 1, curtainCount: 0, blindCount: 0, lineItems: [{}, {}], savedAt: '2026-10-17 03:03' }], 1) === ALL, '');
  check('기타만 있는 고객은 발주 항목 0개(시험드 사례, 기존 동작 유지)', (await keys([{ clientId: 2, curtainCount: 0, blindCount: 0, lineItems: [{}], savedAt: '2026-10-12' }], 2)) === '', '');
  check('견적서가 없으면 5개 전부', (await keys([], 3)) === ALL, '');
  check('보관된 커튼 견적은 무시', (await keys([
    { clientId: 4, curtainCount: 3, blindCount: 0, lineItems: [{}], isArchived: true, savedAt: '2026-10-01' },
    { clientId: 4, curtainCount: 0, blindCount: 0, lineItems: [{}], savedAt: '2026-10-02' }], 4)) === '', '');
  check('커튼 견적 + 블라인드 견적이 따로 있으면 합쳐서 5개', (await keys([
    { clientId: 5, curtainCount: 1, blindCount: 0, lineItems: [{}], savedAt: '2026-10-01' },
    { clientId: 5, curtainCount: 0, blindCount: 2, lineItems: [{}], savedAt: '2026-10-02' }], 5)) === ALL, '');
  check('커튼만 있는 고객은 커튼 항목만', (await keys([{ clientId: 6, curtainCount: 1, blindCount: 0, lineItems: [{}], savedAt: '2026-10-01' }], 6)) === CURT, '');
  check('블라인드만 있는 고객은 블라인드·시공만', (await keys([{ clientId: 7, curtainCount: 0, blindCount: 1, lineItems: [{}], savedAt: '2026-10-01' }], 7)) === BLIND, '');
  await browser.close(); server.close();
  if (fail) { console.log(`\n❌ ${fail}개 실패`); process.exit(1); } console.log('\n✅ 모두 통과');
})();
