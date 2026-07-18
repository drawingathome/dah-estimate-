#!/usr/bin/env node
// tests/detail-structure-check.js
// "화면 구조 고정 규칙" 회귀 테스트 — 고객상세보기(정보 탭)에 새 기능을 추가하다가
// 최상위 콘텐츠 섹션이 계속 늘어나서 다시 복잡해지는 문제를 자동으로 잡아낸다.
//
// 배경: 2026-07-18~19에 고객상세 헤더/발주현황/디자인을 여러 차례 정리했는데,
// 그때마다 "다음에 또 복잡해지지 않게" 규칙(정보/결제/소통/발주/이력 5탭 유지,
// 최상위 섹션 4개 이하)만 문서로 남겨뒀을 뿐 자동 검증은 없었다. 이 테스트가
// 그 규칙을 코드로 강제한다.
//
// 판정 기준: #detail-body(정보 탭)의 최상위 자식 중 "순수 버튼줄"(자기 자신이
// <button>이거나, 자식이 전부 <button>인 경우)은 세지 않고, 그 외 실제 콘텐츠
// 섹션만 센다. 이게 4개를 넘으면 실패.
//
// 사용법: node tests/detail-structure-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

const MAX_CONTENT_SECTIONS = 4;

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node detail-structure-check.js <dah-dashboard.html경로>');
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

  try {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await page.setViewport({ width: 1280, height: 1200 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    console.log('\n[고객상세보기 구조 고정 규칙 검사] ' + file);

    // 지금 해야 할 일(처리필요) 섹션까지 포함해서 확인하도록, 계약금 단계+미완료
    // 발주 상태의 고객으로 최대한 "다 채워진" 상태에서 검사 (평소보다 섹션이
    // 늘어나기 쉬운 조건일 때 통과해야 진짜 안전함)
    await page.evaluate(() => {
      saveCustomers([{
        clientName: '구조검사고객', phone: '01012345678', addr: '서울시 강남구',
        stage: '계약금', staffName: '마스터', date: '2026-07-01', memo: '테스트 메모',
        createdAt: new Date().toISOString(), orderStatus: {}
      }]);
    });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => { openDetail('구조검사고객', null, '정보'); });
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
        totalChildren: children.length,
        contentSectionCount: contentSections.length,
        contentPreview: contentSections.map((el) => el.textContent.trim().slice(0, 20)),
        exceeds: contentSections.length > MAX
      };
    }, MAX_CONTENT_SECTIONS);

    if (result.error) {
      check('detail-body 요소 존재', false, result.error);
    } else {
      check(
        `정보 탭 최상위 콘텐츠 섹션이 ${MAX_CONTENT_SECTIONS}개 이하 (버튼줄 제외)`,
        !result.exceeds,
        `실제 ${result.contentSectionCount}개 발견: ${JSON.stringify(result.contentPreview)} — 새 기능을 추가하기 전에 "화면 구조 고정 규칙"을 먼저 확인하세요 (기존 탭 안에 넣거나 접이식으로 처리)`
      );
    }

    // 탭 구조(정보/결제/소통/발주/이력) 자체가 유지되는지도 같이 확인
    const tabIds = ['dtab-info', 'dtab-pay', 'dtab-alim', 'dtab-order', 'dtab-est'];
    const tabsExist = await page.evaluate((ids) => ids.every((id) => !!document.getElementById(id)), tabIds);
    check('5탭 구조(정보/결제/소통/발주/이력) 유지됨', tabsExist, '탭 버튼 중 일부가 사라짐 — 탭 구조를 임의로 바꾸지 않았는지 확인 필요');

    process.exitCode = failCount === 0 ? 0 : 1;
    await page.close();
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
