#!/usr/bin/env node
// tests/home-duplication-check.js
// 홈화면에 같은 고객이 서로 다른 이유로 여러 카드에 중복 노출되는 문제의 회귀 테스트
//
// 2026-07-16 발견: "발주 시작 안 된 고객" 카드를 새로 추가했는데, 기존에 이미
// 있던 "처리 필요" 카드(계약금/잔금 단계 고객)와 조건이 겹쳐서, 같은 고객
// 이름이 홈화면에 중복으로 나타났었다. "한눈에 보이는지 확인해달라"는 요청으로
// 실제 화면을 뽑아보고서야 발견함. 처리필요 카드에 발주 조건을 통합하고
// 이유 태그를 붙이는 방식으로 수정.
//
// 이 테스트는 "여러 조건에 동시에 해당하는 고객이 홈화면 어디에도 두 번
// 나타나지 않는지"를 자동으로 검증한다 (단, '오늘/내일 일정'처럼 목적이
// 명확히 다른 섹션에 나타나는 건 정상이므로 그건 제외하고 확인한다).
//
// 사용법: node tests/home-duplication-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node home-duplication-check.js <dah-dashboard.html경로>');
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
    await page.setViewport({ width: 1280, height: 2200 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    console.log('\n[홈화면 UI 중복노출 검사] ' + file);

    // 여러 "처리 필요" 조건에 동시에 해당하는 고객을 만들어서, 홈화면 어디에도
    // 중복으로 나타나지 않는지 확인. 오늘/내일 일정과는 안 겹치도록 과거 날짜 사용.
    await page.evaluate(() => {
      const pastDate = '2026-01-01';
      saveCustomers([
        { clientName: '중복검사고객계약금', phone: '01011112222', stage: '계약금', staffName: '마스터', price: 800000, date: pastDate, createdAt: new Date().toISOString(), orderStatus: {} },
        { clientName: '중복검사고객시공', phone: '01033334444', stage: '시공', staffName: '마스터', price: 500000, date: pastDate, createdAt: new Date().toISOString(), orderStatus: {} },
        { clientName: '중복검사고객잔금', phone: '01055556666', stage: '잔금', staffName: '마스터', price: 700000, date: pastDate, createdAt: new Date().toISOString(), orderStatus: { fabric: true } }
      ]);
      renderHome(true);
    });
    await new Promise(r => setTimeout(r, 700));

    const homeText = await page.evaluate(() => document.getElementById('home').innerText);
    const names = ['중복검사고객계약금', '중복검사고객시공', '중복검사고객잔금'];
    names.forEach((name) => {
      const count = (homeText.match(new RegExp(name, 'g')) || []).length;
      check(`"${name}"이 홈화면에 정확히 1번만 나타남(여러 조건에 해당해도 중복노출 안 됨)`, count === 1, `실제 등장횟수=${count}`);
    });

    process.exitCode = failCount === 0 ? 0 : 1;
    await page.close();
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
