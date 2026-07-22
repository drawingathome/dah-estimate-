#!/usr/bin/env node
// tests/role-permission-check.js
// 대시보드(dah-dashboard.html)에서 마스터/스태프 권한별로
// 노출되면 안 되는 요소(고객상세 수정/삭제 버튼, 매출탭)가 실제로 숨겨지는지 검사
// 2026-07-21: PC 케이스 추가 (예전엔 모바일만 검사)
// 사용법: node tests/role-permission-check.js <dah-dashboard.html 경로> [마스터비번]

const path = require('path');
const { launchBrowser, blockRealNetwork, startServer } = require('./_helpers');

const TEST_STAFF_NAME = '_테스트실장';
const TEST_CUSTOMER_NAME = '_테스트고객';

async function setupTestData(page) {
  await page.evaluate((staffName, customerName) => {
    var staffList = [];
    try { staffList = JSON.parse(localStorage.getItem('dah_staff_list') || '[]'); } catch (e) {}
    if (staffList.indexOf(staffName) === -1) staffList.push(staffName);
    localStorage.setItem('dah_staff_list', JSON.stringify(staffList));
    try { localStorage.setItem('dah_master_email', 'test-master@dah-test.local'); } catch (e) {}
    try {
      var emailMap = {};
      try { emailMap = JSON.parse(localStorage.getItem('dah_staff_emails') || '{}'); } catch (e2) {}
      emailMap[staffName] = 'test-staff@dah-test.local';
      localStorage.setItem('dah_staff_emails', JSON.stringify(emailMap));
    } catch (e) {}
    var customers = [];
    try { customers = JSON.parse(localStorage.getItem('dah_customers') || '[]'); } catch (e) {}
    if (!customers.some(c => c.clientName === customerName)) {
      customers.push({
        clientName: customerName, phone: '010-0000-0000', addr: '서울',
        stage: '상담', staffName: staffName, visitCount: 1, price: 0,
        createdAt: new Date().toISOString(), date: new Date().toISOString().slice(0, 10)
      });
    }
    localStorage.setItem('dah_customers', JSON.stringify(customers));
  }, TEST_STAFF_NAME, TEST_CUSTOMER_NAME);
}

async function checkAsMaster(browser, port, file, masterPw, width) {
  const page = await browser.newPage();
  await blockRealNetwork(page);
  await page.setViewport({ width, height: 900, isMobile: width < 500, hasTouch: width < 500 });
  await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 500));
  await setupTestData(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => document.getElementById('btn-master-login').click());
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate((pw) => { document.getElementById('master-pw-input').value = pw; }, masterPw);
  await page.evaluate(() => document.getElementById('btn-master-confirm').click());
  await new Promise(r => setTimeout(r, 1200));

  const result = await evaluateChecks(page, width);
  await page.close();
  return result;
}

async function checkAsStaff(browser, port, file, width) {
  const page = await browser.newPage();
  await blockRealNetwork(page);
  await page.setViewport({ width, height: 900, isMobile: width < 500, hasTouch: width < 500 });
  await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 500));
  await setupTestData(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate((name) => { if (typeof loginAs === 'function') loginAs(name); }, TEST_STAFF_NAME);
  await new Promise(r => setTimeout(r, 1200));

  const result = await evaluateChecks(page, width);
  await page.close();
  return result;
}

async function evaluateChecks(page, width) {
  return page.evaluate((customerName, isMobileWidth) => {
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    if (typeof openDetail === 'function') {
      try { openDetail(customerName); } catch (e) {}
    }

    const detailOverlay = document.getElementById('detail-overlay');
    const detailButtons = detailOverlay ? Array.from(detailOverlay.querySelectorAll('button')) : [];
    const hasDeleteBtn = detailButtons.some(b => /^삭제$/.test((b.textContent || '').trim()));
    const hasEditBtn = detailButtons.some(b => /수정/.test(b.textContent || ''));

    // 모바일은 하단 네비(data-mob-tab), PC는 상단 탭(data-tab)으로 매출탭 확인
    const salesTab = isMobileWidth
      ? document.querySelector('[data-mob-tab="chart"]')
      : document.querySelector('[data-tab="chart"]');

    return {
      bodyRole: document.body.className,
      deleteBtnVisible: hasDeleteBtn,
      editBtnVisible: hasEditBtn,
      salesTabDisplayed: isVisible(salesTab)
    };
  }, TEST_CUSTOMER_NAME, width < 500);
}

async function run() {
  const filePath = process.argv[2];
  const masterPw = process.argv[3] || 'TEST_OK_PW';
  if (!filePath) { console.error('사용법: node role-permission-check.js <dah-dashboard.html 경로> [마스터비번]'); process.exit(1); }

  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9101 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let anyFailed = false;

  try {
    console.log(`\n[권한별 UI 검사] ${file}`);
    console.log('⚠️  참고: CSS/DOM 노출 여부만 확인합니다. Supabase 데이터 접근권한(RLS)은 별도 확인 필요.\n');

    async function testOnDevice(width, label) {
      const master = await checkAsMaster(browser, port, file, masterPw, width);
      const staff = await checkAsStaff(browser, port, file, width);
      const checks = [
        ['고객상세 삭제 버튼', 'deleteBtnVisible'],
        ['고객상세 수정 버튼', 'editBtnVisible'],
        [width < 500 ? '모바일 하단네비 매출탭' : 'PC 상단 매출탭', 'salesTabDisplayed']
      ];
      console.log(`(참고,${label}) 로그인 후 body class — 마스터: "${master.bodyRole}" / 스태프: "${staff.bodyRole}"\n`);
      checks.forEach(([desc, key]) => {
        const m = master[key];
        const s = staff[key];
        const ok = m === true && s === false;
        if (!ok) anyFailed = true;
        console.log(`${ok ? '✅' : '❌'} [${label}] ${desc}: 마스터=${m ? '노출' : '숨김'} / 스태프=${s ? '노출' : '숨김'}`);
      });
    }

    await testOnDevice(390, '모바일');
    await testOnDevice(1400, 'PC');

    process.exitCode = anyFailed ? 1 : 0;
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
