#!/usr/bin/env node
// tests/lead-followup-check.js
// 2026-07-20 신규기능: ① 홈 "처리필요"에 상담단계 오래된 리드(놓친 리드) 표시
// ② 달력 일정목록에 실측/시공과 함께 선금·잔금 입금여부 표시
// 사용법: node tests/lead-followup-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node lead-followup-check.js <dah-dashboard.html경로>'); process.exit(1); }
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

  console.log('\n[놓친리드/결제상태 표시 회귀 검사] ' + file);

  try {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await page.setRequestInterception(true);
    page.on('request', (req) => { if (req.url().includes('supabase.co')) { req.abort(); return; } req.continue(); });
    await page.setViewport({ width: 1400, height: 1000 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    await page.evaluate(() => {
      saveCustomers([
        { clientName: '놓친리드테스트', phone: '01000000010', addr: '서울', stage: '상담', staffName: '마스터', date: '2026-07-05', price: 1000000 },
        { clientName: '최근상담테스트', phone: '01000000011', addr: '서울', stage: '상담', staffName: '마스터', date: '2026-07-19', price: 1000000 },
        { clientName: '결제상태테스트', phone: '01000000012', addr: '서울', stage: '시공', staffName: '마스터', date: '2026-07-01',
          depositAmount: 1000000, depositDate: '2026-07-10', measureDate: '2026-07-18', installDate: '2026-07-25', price: 2000000 }
      ]);
      renderHome(true);
    });
    await new Promise(r => setTimeout(r, 400));

    const home = await page.evaluate(() => document.getElementById('home').textContent);
    check('상담 후 오래된 고객(놓친리드)이 처리필요에 표시됨', home.includes('놓친리드테스트'), '표시 안 됨');
    check('최근 상담 고객은 처리필요에 안 뜸(오탐 없음)', !home.includes('최근상담테스트'), '잘못 표시됨');

    await page.evaluate(() => goTab('cal'));
    await new Promise(r => setTimeout(r, 400));
    const cal = await page.evaluate(() => document.getElementById('cal').textContent);
    check('달력 일정목록에 선금 입금 상태(✅)가 표시됨', cal.includes('선금✅'), '표시 안 됨');

    process.exitCode = failCount === 0 ? 0 : 1;
    await page.close();
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
