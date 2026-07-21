#!/usr/bin/env node
// tests/revenue-consistency-check.js
// 2026-07-20 발견: 매출 계산 방식이 화면마다 3가지로 제각각이었음
// (일정화면=선금·잔금 정확분리 / 매출화면=등록일+전체금액 / 홈화면=선금일만+잔금누락).
// 또한 "담당자별 성과"는 월 구분 없이 전체 누적이라 매달 인센티브 정산이 불가능했음.
//
// splitCustomerPayments() 공용함수로 통일한 뒤, 홈/매출탭/일정 3개 화면이
// 같은 결과를 내는지, 그리고 선금:잔금 비율로 성과매출이 정확히 분배되는지
// 자동으로 검증한다.
//
// 사용법: node tests/revenue-consistency-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node revenue-consistency-check.js <dah-dashboard.html경로>');
    process.exit(1);
  }
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

  console.log('\n[매출 계산 일관성 회귀 검사] ' + file);

  try {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await page.setRequestInterception(true);
    page.on('request', (req) => { if (req.url().includes('supabase.co')) { req.abort(); return; } req.continue(); });
    await page.setViewport({ width: 1400, height: 1000 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    // 선금 60만원(7/15) / 잔금 40만원(8/5) / 성과매출 총 80만원인 고객
    await page.evaluate(() => {
      saveCustomers([{
        clientName: '매출검증고객', phone: '01000000001', addr: '서울', stage: '잔금',
        staffName: '검증담당자', price: 1000000, performanceRevenue: 800000,
        depositAmount: 600000, depositDate: '2026-07-15',
        balanceAmount: 400000, balanceDate: '2026-08-05'
      }]);
    });
    await new Promise(r => setTimeout(r, 300));

    // 1. 함수 자체 정확성
    const calc = await page.evaluate(() => {
      const c = loadCustomers();
      return {
        julyRev: getMonthRevenue(c, '2026-07'),
        augRev: getMonthRevenue(c, '2026-08'),
        julyPerf: getMonthPerformanceRevenue(c, '2026-07'),
        augPerf: getMonthPerformanceRevenue(c, '2026-08'),
      };
    });
    check('7월 매출 = 선금액(60만원)만 반영', calc.julyRev === 600000, `실제=${calc.julyRev}`);
    check('8월 매출 = 잔금액(40만원)만 반영', calc.augRev === 400000, `실제=${calc.augRev}`);
    check('7월 성과매출 = 전체×선금비율(48만원)', calc.julyPerf === 480000, `실제=${calc.julyPerf}`);
    check('8월 성과매출 = 전체×잔금비율(32만원)', calc.augPerf === 320000, `실제=${calc.augPerf}`);

    // 2. 담당자별 성과에 월 필터가 적용되는지 (예전엔 전체누적이었음)
    const staffCheck = await page.evaluate(() => {
      const c = loadCustomers();
      const july = getMonthStaffPerformance(c, '2026-07');
      const aug = getMonthStaffPerformance(c, '2026-08');
      return {
        julyStaffRev: july['검증담당자'] ? july['검증담당자'].rev : 0,
        augStaffRev: aug['검증담당자'] ? aug['검증담당자'].rev : 0,
      };
    });
    check('담당자별 성과도 7월/8월 각각 다르게 집계됨(월필터 정상)',
      staffCheck.julyStaffRev === 480000 && staffCheck.augStaffRev === 320000,
      JSON.stringify(staffCheck));

    // 3. 하위호환: 선금/잔금 정보 없는 예전 고객은 계약일 기준 폴백
    await page.evaluate(() => {
      saveCustomers([{
        clientName: '예전고객검증', phone: '01000000002', addr: '서울', stage: '시공',
        staffName: '이담당', price: 500000, performanceRevenue: 400000, date: '2026-07-10'
      }]);
    });
    await new Promise(r => setTimeout(r, 300));
    const legacyCheck = await page.evaluate(() => {
      const c = loadCustomers();
      return { rev: getMonthRevenue(c, '2026-07'), perf: getMonthPerformanceRevenue(c, '2026-07') };
    });
    check('선금/잔금 정보 없는 예전 고객은 계약일 기준으로 정상 집계(하위호환)',
      legacyCheck.rev === 500000 && legacyCheck.perf === 400000, JSON.stringify(legacyCheck));

    process.exitCode = failCount === 0 ? 0 : 1;
    await page.close();
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
