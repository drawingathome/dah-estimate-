#!/usr/bin/env node
// tests/dashboard-data-check.js
// 대시보드(dah-dashboard.html) 데이터 검증/검색 로직 회귀 테스트
// 1) 초성검색 'ㅉ' 매핑 2) 중복고객 경고 3) 비합리적 날짜 방어
// 2026-07-21: 모바일 케이스 추가 (예전엔 PC만 검사)
// 사용법: node tests/dashboard-data-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, blockRealNetwork, startServer, loginAs } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node dashboard-data-check.js <dah-dashboard.html경로>'); process.exit(1); }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9501 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let failCount = 0;
  function check(label, condition, detail) {
    if (condition) { console.log(`  ✅ ${label}`); }
    else { console.log(`  ❌ ${label} — ${detail}`); failCount++; }
  }

  console.log('\n[대시보드 데이터검증 검사] ' + file);

  async function testOnDevice(width, label) {
    const page = await browser.newPage();
    await blockRealNetwork(page);
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await page.setViewport({ width, height: 900, isMobile: width < 500, hasTouch: width < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    const chosungResult = await page.evaluate(() => ({
      jj: typeof getChosung === 'function' ? getChosung('짱구') : 'no-fn',
      ga: typeof getChosung === 'function' ? getChosung('가나다') : 'no-fn'
    }));
    check(`[${label}] 초성 'ㅉ' 정확히 매핑됨(짱구 -> ㅉㄱ)`, chosungResult.jj === 'ㅉㄱ', '실제값=' + chosungResult.jj);
    check(`[${label}] 초성 'ㄱ' 회귀없음(가나다 -> ㄱㄴㄷ)`, chosungResult.ga === 'ㄱㄴㄷ', '실제값=' + chosungResult.ga);

    await page.evaluate((suffix) => {
      localStorage.removeItem('dah_customers');
      saveCustomers([{ clientName: '회귀중복원본' + suffix, phone: '01099998888', stage: '상담', staffName: '마스터', price: 100000, date: (typeof todayStr === 'function' ? todayStr() : ''), createdAt: new Date().toISOString() }]);
    }, label);
    await new Promise(r => setTimeout(r, 300));
    let dupDialogMsg = '';
    page.removeAllListeners('dialog');
    page.on('dialog', async d => { dupDialogMsg = d.message(); await d.dismiss(); });
    await page.evaluate(() => { openAdd(); });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((suffix) => {
      document.getElementById('add-name').value = '회귀중복시도' + suffix;
      document.getElementById('add-phone').value = '01099998888';
      saveCustomer();
    }, label);
    await new Promise(r => setTimeout(r, 500));
    const custCountAfterCancel = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_customers') || '[]').length);
    check(`[${label}] 중복 연락처 등록시 확인창이 뜸`, dupDialogMsg.includes('이미 등록된 연락처'), '실제메시지="' + dupDialogMsg + '"');
    check(`[${label}] 확인창 취소시 저장이 차단됨`, custCountAfterCancel === 1, '실제 저장건수=' + custCountAfterCancel);

    // 방문예정일 비합리값 방어 — 독립 페이지에서
    const page3 = await browser.newPage();
    await blockRealNetwork(page3);
    page3.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await page3.setViewport({ width, height: 900, isMobile: width < 500, hasTouch: width < 500 });
    await page3.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page3, 'master');
    await page3.evaluate(() => { localStorage.removeItem('dah_customers'); });
    await page3.evaluate(() => { openAdd(); });
    await new Promise(r => setTimeout(r, 300));
    await page3.evaluate((suffix) => {
      document.getElementById('add-name').value = '회귀날짜테스트' + suffix;
      document.getElementById('add-phone').value = '01011112222';
      document.getElementById('add-date').value = '1900-01-01';
      saveCustomer();
    }, label);
    await new Promise(r => setTimeout(r, 500));
    const custCountBadDate = await page3.evaluate(() => JSON.parse(localStorage.getItem('dah_customers') || '[]').length);
    check(`[${label}] 1900년 같은 비합리적 날짜 저장이 차단됨`, custCountBadDate === 0, '실제 저장건수=' + custCountBadDate);

    await page3.evaluate(() => {
      document.getElementById('add-date').value = '2026-08-01';
      saveCustomer();
    });
    await new Promise(r => setTimeout(r, 800));
    const custCountGoodDate = await page3.evaluate((suffix) => {
      var arr = JSON.parse(localStorage.getItem('dah_customers') || '[]');
      return arr.filter(function (c) { return c.clientName === '회귀날짜테스트' + suffix; }).length;
    }, label);
    check(`[${label}] 정상 날짜는 회귀없이 저장됨`, custCountGoodDate === 1, '실제 저장건수=' + custCountGoodDate);
    await page3.close();
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
