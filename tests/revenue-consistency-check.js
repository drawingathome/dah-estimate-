#!/usr/bin/env node
// tests/revenue-consistency-check.js
// 2026-07-20 발견: 매출 계산 방식이 화면마다 3가지로 제각각이었음.
// splitCustomerPayments() 공용함수로 통일한 뒤, 함수 자체의 정확성뿐 아니라
// 홈/매출탭 화면에 실제로 표시되는 값까지 검증한다.
// 2026-07-21 추가: 모바일 케이스 (예전엔 PC만 검사, 함수계산은 뷰포트무관하지만
// 화면표시는 뷰포트마다 별도로 확인해야 의미가 있음)
// 사용법: node tests/revenue-consistency-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node revenue-consistency-check.js <dah-dashboard.html경로>'); process.exit(1); }
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
        clientName: '매출검증고객' + suffix, phone: '01000000001', addr: '서울', stage: '잔금',
        staffName: '검증담당자', price: 1000000, performanceRevenue: 800000,
        depositAmount: 600000, depositDate: '2026-07-15',
        balanceAmount: 400000, balanceDate: '2026-08-05'
      }]);
    }, label);
    await new Promise(r => setTimeout(r, 300));

    const calc = await page.evaluate(() => {
      const c = loadCustomers();
      return {
        julyRev: getMonthRevenue(c, '2026-07'), augRev: getMonthRevenue(c, '2026-08'),
        julyPerf: getMonthPerformanceRevenue(c, '2026-07'), augPerf: getMonthPerformanceRevenue(c, '2026-08'),
      };
    });
    check(`[${label}] 7월 매출 = 선금액(60만원)만 반영`, calc.julyRev === 600000, `실제=${calc.julyRev}`);
    check(`[${label}] 8월 매출 = 잔금액(40만원)만 반영`, calc.augRev === 400000, `실제=${calc.augRev}`);
    check(`[${label}] 7월 성과매출 = 전체×선금비율(48만원)`, calc.julyPerf === 480000, `실제=${calc.julyPerf}`);
    check(`[${label}] 8월 성과매출 = 전체×잔금비율(32만원)`, calc.augPerf === 320000, `실제=${calc.augPerf}`);

    // 화면 표시 검증 — 홈 "이달 매출" (오늘이 7월이라고 가정, 함수와 별개로 실제 렌더된 텍스트 확인)
    await page.evaluate(() => { goTab('home'); renderHome(true); });
    await new Promise(r => setTimeout(r, 400));
    const homeText = await page.evaluate(() => document.getElementById('home').textContent);
    const homeMatch = homeText.match(/이달 매출([\d,]+)만원/);
    check(`[${label}] 홈화면 "이달 매출"이 실제로 렌더링됨(숫자 형식)`, !!homeMatch, `홈텍스트일부="${homeText.slice(0, 60)}"`);

    // 매출탭 이번달요약 표시 검증
    await page.evaluate(() => goTab('chart'));
    await new Promise(r => setTimeout(r, 400));
    await page.evaluate(() => {
      var m = Array.from(document.querySelectorAll('.chart-tab')).find(t => t.textContent.trim() === '월');
      if (m) m.click();
    });
    await new Promise(r => setTimeout(r, 400));
    const chartText = await page.evaluate(() => document.getElementById('chart-summary')?.textContent || '');
    check(`[${label}] 매출탭 요약에 "성과매출" 항목이 실제로 표시됨`, chartText.includes('성과매출'), `요약텍스트="${chartText.slice(0, 80)}"`);
    const chartScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`[${label}] 매출탭 가로스크롤 없음`, !chartScroll, '가로스크롤 발생');

    // 담당자별 성과 월 필터
    const staffCheck = await page.evaluate(() => {
      const c = loadCustomers();
      const july = getMonthStaffPerformance(c, '2026-07');
      const aug = getMonthStaffPerformance(c, '2026-08');
      return { julyStaffRev: july['검증담당자'] ? july['검증담당자'].rev : 0, augStaffRev: aug['검증담당자'] ? aug['검증담당자'].rev : 0 };
    });
    check(`[${label}] 담당자별 성과도 월별로 다르게 집계됨`, staffCheck.julyStaffRev === 480000 && staffCheck.augStaffRev === 320000, JSON.stringify(staffCheck));

    // 하위호환
    await page.evaluate((suffix) => {
      saveCustomers([{ clientName: '예전고객검증' + suffix, phone: '01000000002', addr: '서울', stage: '시공', staffName: '이담당', price: 500000, performanceRevenue: 400000, date: '2026-07-10' }]);
    }, label);
    await new Promise(r => setTimeout(r, 300));
    const legacyCheck = await page.evaluate(() => {
      const c = loadCustomers();
      return { rev: getMonthRevenue(c, '2026-07'), perf: getMonthPerformanceRevenue(c, '2026-07') };
    });
    check(`[${label}] 선금/잔금 정보 없는 예전 고객은 계약일 기준 폴백(하위호환)`, legacyCheck.rev >= 500000 && legacyCheck.perf >= 400000, JSON.stringify(legacyCheck));

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
