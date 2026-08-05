#!/usr/bin/env node
// tests/order-completeness-check.js
// 2026-07-21 발견: 홈 "처리필요"의 발주 감지 로직이 "5개 항목 전부 미체크"일
// 때만 작동해서, 하나라도 체크하면 나머지를 깜빡해도 목록에서 완전히
// 사라지는 심각한 버그가 있었음. 공용함수(getRelevantOrderItems/hasIncompleteOrder)로 통일함.
// 2026-07-21 추가: 모바일 케이스 (예전엔 PC만 검사)
// 사용법: node tests/order-completeness-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

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

  async function testOnDevice(width, label) {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await blockRealNetwork(page);
    await page.setViewport({ width, height: 1000, isMobile: width < 500, hasTouch: width < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    await page.evaluate((suffix) => {
      saveCustomers([{
        clientName: '발주누락검증' + suffix, phone: '01000000020', addr: '서울', stage: '시공준비중', staffName: '마스터', date: '2026-07-01',
        orderStatus: { fabric: true, production: false, blind: false, material: false, install: false }
      }]);
      localStorage.setItem('dah_saved', JSON.stringify([{ clientName: '발주누락검증' + suffix, no: 'A-1', curtainCount: 2, blindCount: 0, savedAt: '2026-07-01' }]));
      goTab('home');
      renderHome(true);
    }, label);
    await new Promise(r => setTimeout(r, 400));
    const case1 = await page.evaluate((suffix) => document.getElementById('home').textContent.includes('발주누락검증' + suffix), label);
    check(`[${label}] 발주 항목 중 1개만 체크해도 나머지 미완료면 "발주필요"로 표시됨`, case1, `실제=${case1}`);

    await page.evaluate((suffix) => {
      saveCustomers([{
        clientName: '발주완료검증' + suffix, phone: '01000000021', addr: '서울', stage: '시공준비중', staffName: '마스터', date: '2026-07-01',
        orderStatus: { fabric: true, production: true, blind: false, material: true, install: true }
      }]);
      localStorage.setItem('dah_saved', JSON.stringify([{ clientName: '발주완료검증' + suffix, no: 'B-1', curtainCount: 2, blindCount: 0, savedAt: '2026-07-01' }]));
      renderHome(true);
    }, label);
    await new Promise(r => setTimeout(r, 400));
    const case2 = await page.evaluate((suffix) => document.getElementById('home').textContent.includes('발주완료검증' + suffix), label);
    check(`[${label}] 커튼전용 고객이 관련항목 다 완료하면 안 뜸(오탐 없음)`, !case2, `실제=${case2}`);

    const scrollChk = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`[${label}] 홈 화면 가로스크롤 없음`, !scrollChk, '가로스크롤 발생');

    await page.close();
  }

  try {
    await testOnDevice(390, '모바일');
    await testOnDevice(1400, 'PC');
    process.exitCode = failCount === 0 ? 0 : 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
