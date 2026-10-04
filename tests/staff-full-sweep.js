#!/usr/bin/env node
// tests/staff-full-sweep.js
// 실장(스태프) 권한으로 로그인한 상태에서 dah-dashboard.html의 모든 주요 탭을
// PC(1400px)와 모바일(390px) 양쪽에서 순회하며 콘솔에러/가로스크롤/화면별 이상을 점검.
// 기존 role-permission-check.js는 특정 항목(수정/삭제버튼, 매출탭)만 확인하지만
// 이 스크립트는 "전체 화면 훑기" 목적.
const path = require('path');
const fs = require('fs');
const { launchBrowser, blockRealNetwork, startServer, loginAs } = require('./_helpers');

const TABS_PC = ['home', 'pipe', 'est-list', 'search', 'cal', 'chart'];
const MOB_TABS = ['home', 'pipe', 'est-list', 'search', 'cal', 'chart'];

async function sweep(width, label) {
  const port = width < 500 ? 8931 : 8932;
  const server = await startServer(__dirname + '/..', port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));
  await blockRealNetwork(page);
  await page.setViewport({ width, height: 900, isMobile: width < 500, hasTouch: width < 500 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 500));

  // 테스트 고객 데이터 주입 (역할검사 스크립트와 동일 패턴)
  await page.evaluate(() => {
    var staffList = [];
    try { staffList = JSON.parse(localStorage.getItem('dah_staff_list') || '[]'); } catch (e) {}
    if (staffList.indexOf('_실장A') === -1) staffList.push('_실장A');
    localStorage.setItem('dah_staff_list', JSON.stringify(staffList));
    var customers = [];
    try { customers = JSON.parse(localStorage.getItem('dah_customers') || '[]'); } catch (e) {}
    var names = ['_실장A고객1', '_실장A고객2'];
    names.forEach((n, i) => {
      if (!customers.some(c => c.clientName === n)) {
        customers.push({
          clientName: n, phone: '010-1234-000' + i, addr: '서울시 서초구',
          stage: i === 0 ? '상담' : '계약금', staffName: '_실장A', visitCount: 1, price: 1000000 * (i + 1),
          createdAt: new Date().toISOString(), date: new Date().toISOString().slice(0, 10)
        });
      }
    });
    localStorage.setItem('dah_customers', JSON.stringify(customers));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  await loginAs(page, 'staff'); // 내부적으로 _테스트실장 계정 사용 (기존 헬퍼 재사용)

  const findings = [];

  // 1) 로그인 직후 화면 상태
  const afterLogin = await page.evaluate(() => ({
    bodyText: document.body.innerText.slice(0, 200),
    hasLoginGate: !!document.querySelector('#login-overlay, #auth-gate')
      && getComputedStyle(document.querySelector('#login-overlay, #auth-gate') || document.body).display !== 'none'
  }));
  if (afterLogin.hasLoginGate) findings.push('[' + label + '] 로그인 후에도 로그인 게이트가 안 닫힘');

  const tabSelector = width < 500 ? '[data-mob-tab]' : '[data-tab]';
  const tabsPresent = await page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map(b => b.getAttribute('data-tab') || b.getAttribute('data-mob-tab')), tabSelector);

  for (const tabName of TABS_PC) {
    if (!tabsPresent.includes(tabName)) continue;
    await page.evaluate((sel, name) => {
      const btn = Array.from(document.querySelectorAll(sel)).find(b => (b.getAttribute('data-tab') || b.getAttribute('data-mob-tab')) === name);
      if (btn) btn.click();
    }, tabSelector, tabName);
    await new Promise(r => setTimeout(r, 400));

    const check = await page.evaluate((name) => {
      const scrollW = document.documentElement.scrollWidth;
      const clientW = document.documentElement.clientWidth;
      const tabEl = document.getElementById(name);
      const visible = tabEl ? getComputedStyle(tabEl).display !== 'none' : false;
      return { scrollW, clientW, visible, exists: !!tabEl };
    }, tabName);

    if (check.scrollW > check.clientW + 2) {
      findings.push(`[${label}] 탭 "${tabName}" 에서 가로스크롤 발생 (scrollWidth=${check.scrollW} > clientWidth=${check.clientW})`);
    }
    if (!check.visible) {
      findings.push(`[${label}] 탭 "${tabName}" 클릭했는데 해당 컨텐츠가 안 보임(display:none 유지)`);
    }

    // 매출탭(chart)은 스태프에게 숨겨져야 정상 — 클릭 자체가 안 먹혀야 함
    if (tabName === 'chart') {
      const salesTabVisible = await page.evaluate((sel) => {
        const el = document.querySelector(sel + '[data-tab="chart"], ' + sel + '[data-mob-tab="chart"]');
        if (!el) return false;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && r.width > 0;
      }, tabSelector);
      if (salesTabVisible) findings.push(`[${label}] 스태프 로그인 상태인데 매출탭 버튼이 노출됨(권한 누락 의심)`);
    }

    await page.screenshot({ path: `/tmp/dah-repo/tests/_shot_${label}_${tabName}.png` }).catch(() => {});
  }

  // 고객상세 열어보기
  await page.evaluate(() => { if (typeof openDetail === 'function') { try { openDetail('_실장A고객1'); } catch (e) {} } });
  await new Promise(r => setTimeout(r, 400));
  const detailCheck = await page.evaluate(() => {
    const overlay = document.getElementById('detail-overlay');
    if (!overlay) return { exists: false };
    const visible = getComputedStyle(overlay).display !== 'none';
    const scrollW = overlay.scrollWidth, clientW = overlay.clientWidth;
    return { exists: true, visible, scrollW, clientW };
  });
  if (!detailCheck.exists) findings.push(`[${label}] 고객상세 openDetail 호출했는데 overlay 자체가 없음`);
  else if (!detailCheck.visible) findings.push(`[${label}] 고객상세 openDetail 호출했는데 화면에 안 뜸`);
  else if (detailCheck.scrollW > detailCheck.clientW + 2) findings.push(`[${label}] 고객상세 화면에서 가로스크롤 발생`);
  await page.screenshot({ path: `/tmp/dah-repo/tests/_shot_${label}_detail.png` }).catch(() => {});

  if (consoleErrors.length) {
    const realErrors = consoleErrors.filter(e =>
      !/Failed to load resource/.test(e) &&
      !/net::ERR_FAILED/.test(e) &&
      !/the server responded with a status of 4\d\d/.test(e)
    );
    if (realErrors.length) {
      findings.push(`[${label}] 콘솔 에러 ${realErrors.length}건 발생: ` + realErrors.slice(0, 8).join(' | '));
    }
  }

  await browser.close();
  server.kill();
  return findings;
}

(async () => {
  const all = [];
  all.push(...await sweep(390, 'PC아님-모바일390'));
  all.push(...await sweep(1400, 'PC1400'));

  console.log('\n========================================');
  if (all.length === 0) {
    console.log('✅ 실장 권한 전체 탐색 — 발견된 문제 없음 (PC 1400px + 모바일 390px)');
  } else {
    console.log('🔴 발견된 문제 ' + all.length + '건:');
    all.forEach(f => console.log('  - ' + f));
  }
  console.log('========================================');
  process.exit(all.length ? 1 : 0);
})();
