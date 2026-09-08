#!/usr/bin/env node
// tests/home-duplication-check.js
// 홈화면에 같은 고객이 서로 다른 이유로 여러 카드에 중복 노출되는 문제의 회귀 테스트
// 2026-07-16 발견, 2026-07-21 모바일 케이스 추가 (예전엔 PC만 검사)
// 사용법: node tests/home-duplication-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node home-duplication-check.js <dah-dashboard.html경로>'); process.exit(1); }
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

  console.log('\n[홈화면 UI 중복노출 검사] ' + file);

  async function testOnDevice(width, label) {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await page.setViewport({ width, height: width < 500 ? 2400 : 2200, isMobile: width < 500, hasTouch: width < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    await page.evaluate((suffix) => {
      const pastDate = '2026-01-01';
      saveCustomers([
        { clientName: '중복검사고객계약금' + suffix, phone: '01011112222', stage: '선금결제', staffName: '마스터', price: 800000, date: pastDate, createdAt: new Date().toISOString(), orderStatus: {} },
        // 2026-08-28(선혜님 요청 - "잔금 리마인더"로 홈화면 미수금 감지가
        // 새로 추가되면서, 이 고객이 결제데이터 없이(선금 0원) "시공준비중"
        // 단계였던 게 뜻하지 않게 "미수금" 사유에도 걸려 이 테스트 본연의
        // 목적(발주 중복표시 검사)과 안 맞게 2번 나타나게 됨 - 실제
        // 업무흐름처럼 선금을 이미 받은 상태로 채워서 발주 검사만 순수하게 함.
        { clientName: '중복검사고객시공' + suffix, phone: '01033334444', stage: '시공준비중', staffName: '마스터', price: 500000, depositAmount: 500000, date: pastDate, createdAt: new Date().toISOString(), orderStatus: {} },
        { clientName: '중복검사고객잔금' + suffix, phone: '01055556666', stage: '잔금결제', staffName: '마스터', price: 700000, date: pastDate, createdAt: new Date().toISOString(), orderStatus: { fabric: true, production: true, blind: true, material: true, install: true } }
      ]);
      renderHome(true);
    }, label);
    await new Promise(r => setTimeout(r, 700));

    const homeText = await page.evaluate(() => document.getElementById('home').innerText);
    ['중복검사고객계약금' + label, '중복검사고객시공' + label, '중복검사고객잔금' + label].forEach((name) => {
      const count = (homeText.match(new RegExp(name, 'g')) || []).length;
      check(`[${label}] "${name}"이 홈화면에 정확히 1번만 나타남`, count === 1, `실제 등장횟수=${count}`);
    });
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
