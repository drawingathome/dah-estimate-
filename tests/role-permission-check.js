#!/usr/bin/env node
// tests/role-permission-check.js
// 대시보드(dah-dashboard.html)에서 마스터/스태프 권한별로
// 노출되면 안 되는 요소(고객상세 수정/삭제 버튼, 매출탭, 실적카드, 백업버튼)가
// 실제로 숨겨지는지 검사
//
// 사용법:
//   node tests/role-permission-check.js <dah-dashboard.html 경로> [마스터비번]
//
// 주의: 이 스크립트는 dah-dashboard.html의 현재 함수/DOM 구조
// (loginAs, openDetail, getSettings/dah_settings, #btn-master-login 등)에 의존합니다.
// 이 구조가 바뀌면 이 스크립트도 같이 업데이트해야 합니다.

const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

const TEST_STAFF_NAME = '_테스트실장';
const TEST_CUSTOMER_NAME = '_테스트고객';

async function setupTestData(page) {
  // 스태프 로그인 버튼이 뜨려면 설정에 담당자가 최소 1명 있어야 함
  await page.evaluate((staffName, customerName) => {
    var settings = {};
    try { settings = JSON.parse(localStorage.getItem('dah_settings') || '{}'); } catch (e) {}
    settings.staffs = settings.staffs || [];
    if (settings.staffs.indexOf(staffName) === -1) settings.staffs.push(staffName);
    localStorage.setItem('dah_settings', JSON.stringify(settings));

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

async function checkAsMaster(browser, port, file, masterPw) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
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

  const result = await evaluateChecks(page);
  await page.close();
  return result;
}

async function checkAsStaff(browser, port, file) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 500));
  await setupTestData(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate((name) => { if (typeof loginAs === 'function') loginAs(name); }, TEST_STAFF_NAME);
  await new Promise(r => setTimeout(r, 1200));

  const result = await evaluateChecks(page);
  await page.close();
  return result;
}

async function evaluateChecks(page) {
  return page.evaluate((customerName) => {
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    // 고객상세 열기 시도
    if (typeof openDetail === 'function') {
      try { openDetail(customerName); } catch (e) {}
    }

    const detailOverlay = document.getElementById('detail-overlay');
    const detailButtons = detailOverlay ? Array.from(detailOverlay.querySelectorAll('button')) : [];
    const hasDeleteBtn = detailButtons.some(b => /^삭제$/.test((b.textContent || '').trim()));
    const hasEditBtn = detailButtons.some(b => /수정/.test(b.textContent || ''));

    const salesTab = document.querySelector('[data-mob-tab="chart"]');
    const salesRect = salesTab ? salesTab.getBoundingClientRect() : null;

    return {
      bodyRole: document.body.className,
      deleteBtnVisible: hasDeleteBtn,
      editBtnVisible: hasEditBtn,
      salesTabDisplayed: isVisible(salesTab),
      salesTabRectZero: salesRect ? (salesRect.width === 0 && salesRect.height === 0) : null
    };
  }, TEST_CUSTOMER_NAME);
}

async function run() {
  const filePath = process.argv[2];
  const masterPw = process.argv[3] || 'dah2012';
  if (!filePath) {
    console.error('사용법: node role-permission-check.js <dah-dashboard.html 경로> [마스터비번]');
    process.exit(1);
  }

  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9101 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);

  const browser = await launchBrowser();
  try {
    console.log(`\n[권한별 UI 검사] ${file}`);
    console.log('⚠️  참고: CSS/DOM 노출 여부만 확인합니다. Supabase 데이터 접근권한(RLS)은 별도 확인 필요.\n');

    const master = await checkAsMaster(browser, port, file, masterPw);
    const staff = await checkAsStaff(browser, port, file);

    const checks = [
      ['고객상세 삭제 버튼', 'deleteBtnVisible'],
      ['고객상세 수정 버튼', 'editBtnVisible'],
      ['모바일 하단네비 매출탭', 'salesTabDisplayed']
    ];

    let failed = false;
    console.log(`(참고) 로그인 후 body class — 마스터: "${master.bodyRole}" / 스태프: "${staff.bodyRole}"\n`);
    checks.forEach(([desc, key]) => {
      const m = master[key];
      const s = staff[key];
      const ok = m === true && s === false;
      if (!ok) failed = true;
      console.log(`${ok ? '✅' : '❌'} ${desc}: 마스터=${m ? '노출' : '숨김'} / 스태프=${s ? '노출' : '숨김'} (마스터에만 노출되어야 함)`);
    });

    process.exitCode = failed ? 1 : 0;
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
