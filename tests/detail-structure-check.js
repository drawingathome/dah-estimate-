#!/usr/bin/env node
// tests/detail-structure-check.js
// "화면 구조 고정 규칙" 회귀 테스트 — 고객상세보기(정보 탭)에 새 기능을 추가하다가
// 최상위 콘텐츠 섹션이 계속 늘어나서 다시 복잡해지는 문제를 자동으로 잡아낸다.
// 2026-07-21: 모바일 케이스 추가 (예전엔 PC만 검사)
// 사용법: node tests/detail-structure-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

const MAX_CONTENT_SECTIONS = 4;

async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node detail-structure-check.js <dah-dashboard.html경로>'); process.exit(1); }
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

  console.log('\n[고객상세보기 구조 고정 규칙 검사] ' + file);

  async function testOnDevice(width, label) {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    const pageErrors = [];
    page.on('pageerror', (err) => { pageErrors.push(err.message); });

    await page.setViewport({ width, height: width < 500 ? 1600 : 1200, isMobile: width < 500, hasTouch: width < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    await page.evaluate((suffix) => {
      saveCustomers([{
        clientName: '구조검사고객' + suffix, phone: '01012345678', addr: '서울시 강남구',
        stage: '계약금', staffName: '마스터', date: '2026-07-01', memo: '테스트 메모',
        createdAt: new Date().toISOString(), orderStatus: {}
      }]);
    }, label);
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((suffix) => { openDetail('구조검사고객' + suffix, null, '정보'); }, label);
    await new Promise(r => setTimeout(r, 500));

    const result = await page.evaluate((MAX) => {
      const body = document.getElementById('detail-body');
      if (!body) return { error: 'detail-body 요소를 찾을 수 없음' };
      const children = Array.from(body.children);
      const isPureButtonRow = (el) => {
        if (el.tagName === 'BUTTON') return true;
        if (el.children.length === 0) return false;
        return Array.from(el.children).every((c) => c.tagName === 'BUTTON');
      };
      const contentSections = children.filter((el) => !isPureButtonRow(el));
      return {
        contentSectionCount: contentSections.length,
        contentPreview: contentSections.map((el) => el.textContent.trim().slice(0, 20)),
        exceeds: contentSections.length > MAX
      };
    }, MAX_CONTENT_SECTIONS);

    if (result.error) {
      check(`[${label}] detail-body 요소 존재`, false, result.error);
    } else {
      check(`[${label}] 정보 탭 최상위 콘텐츠 섹션이 ${MAX_CONTENT_SECTIONS}개 이하`, !result.exceeds, `실제 ${result.contentSectionCount}개: ${JSON.stringify(result.contentPreview)}`);
    }

    const tabIds = ['dtab-info', 'dtab-pay', 'dtab-alim', 'dtab-order', 'dtab-est'];
    const tabsExist = await page.evaluate((ids) => ids.every((id) => !!document.getElementById(id)), tabIds);
    check(`[${label}] 5탭 구조 유지됨`, tabsExist, '탭 버튼 중 일부가 사라짐');

    const scrollChk = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`[${label}] 고객상세 화면 가로스크롤 없음`, !scrollChk, '가로스크롤 발생');

    check(`[${label}] 마스터 권한으로 상세보기 열 때 JS 런타임 에러 없음`, pageErrors.length === 0, `발생한 에러: ${JSON.stringify(pageErrors)}`);

    pageErrors.length = 0;
    await page.evaluate(() => { closeDetail(); });
    await new Promise(r => setTimeout(r, 200));
    await loginAs(page, 'staff');
    await page.evaluate((suffix) => {
      saveCustomers([{
        clientName: '구조검사고객스태프' + suffix, phone: '01099998888', addr: '서울시 강남구',
        stage: '계약금', staffName: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.name : '담당자',
        date: '2026-07-01', orderStatus: {}
      }]);
    }, label);
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((suffix) => { openDetail('구조검사고객스태프' + suffix, null, '정보'); }, label);
    await new Promise(r => setTimeout(r, 500));
    check(`[${label}] 스태프 권한으로 상세보기 열 때 JS 런타임 에러 없음`, pageErrors.length === 0, `발생한 에러: ${JSON.stringify(pageErrors)}`);

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
