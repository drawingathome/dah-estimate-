#!/usr/bin/env node
// tests/order-completeness-check.js
// 2026-07-21 발견: 홈 "처리필요"의 발주 감지 로직이 "5개 항목 전부 미체크"일
// 때만 작동해서, 하나라도 체크하면 나머지를 깜빡해도 목록에서 완전히
// 사라지는 심각한 버그가 있었음. 발주탭(dash-customer-order.js)의 정확한
// 관련항목 판단 로직을 공용함수(getRelevantOrderItems/hasIncompleteOrder)로
// 분리해서 홈화면도 같은 기준을 쓰도록 통일함.
// 사용법: node tests/order-completeness-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node order-completeness-check.js <dah-dashboard.html경로>'); process.exit(1); }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9901 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let failCount = 0;
  function check(label, condition, detail) {
    if (condition) { console.log(`  ✅ ${label}`); }
    else { console.log(`  ❌ ${label} — ${detail}`); failCount++; }
  }

  console.log('\n[발주 부분누락 감지 회귀 검사] ' + file);

  try {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await page.setRequestInterception(true);
    page.on('request', (req) => { if (req.url().includes('supabase.co')) { req.abort(); return; } req.continue(); });
    await page.setViewport({ width: 1400, height: 1000 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    // 케이스1: 원단만 체크, 나머지(제작/자재/시공) 미완료 — 발주필요로 떠야 함
    await page.evaluate(() => {
      saveCustomers([{
        clientName: '발주누락검증', phone: '01000000020', addr: '서울', stage: '시공', staffName: '마스터', date: '2026-07-01',
        orderStatus: { fabric: true, production: false, blind: false, material: false, install: false }
      }]);
      localStorage.setItem('dah_saved', JSON.stringify([{ clientName: '발주누락검증', no: 'A-1', curtainCount: 2, blindCount: 0, savedAt: '2026-07-01' }]));
      renderHome(true);
    });
    await new Promise(r => setTimeout(r, 400));
    const case1 = await page.evaluate(() => document.getElementById('home').textContent.includes('발주누락검증'));
    check('발주 항목 중 1개만 체크하고 나머지를 깜빡해도 "발주필요"로 표시됨', case1, `실제=${case1} (true여야 함 — 예전엔 하나라도 체크하면 사라졌음)`);

    // 케이스2: 커튼전용 고객, 관련있는 4개(원단/제작/자재/시공) 전부 완료, blind는 무관 — 안 떠야 함(오탐 없음)
    await page.evaluate(() => {
      saveCustomers([{
        clientName: '발주완료검증', phone: '01000000021', addr: '서울', stage: '시공', staffName: '마스터', date: '2026-07-01',
        orderStatus: { fabric: true, production: true, blind: false, material: true, install: true }
      }]);
      localStorage.setItem('dah_saved', JSON.stringify([{ clientName: '발주완료검증', no: 'B-1', curtainCount: 2, blindCount: 0, savedAt: '2026-07-01' }]));
      renderHome(true);
    });
    await new Promise(r => setTimeout(r, 400));
    const case2 = await page.evaluate(() => document.getElementById('home').textContent.includes('발주완료검증'));
    check('커튼전용 고객이 관련항목(4개) 다 완료하면 안 뜸(블라인드 무관 항목 오탐 없음)', !case2, `실제=${case2} (false여야 함)`);

    process.exitCode = failCount === 0 ? 0 : 1;
    await page.close();
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
