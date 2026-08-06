#!/usr/bin/env node
// tests/lead-followup-check.js
// 2026-07-20 신규기능: ① 홈 "처리필요"에 상담단계 오래된 리드(놓친 리드) 표시
// ② 달력 일정목록에 실측/시공과 함께 선금·잔금 입금여부 표시
// 2026-07-21: 모바일 케이스 추가 (예전엔 PC만 검사)
// 사용법: node tests/lead-followup-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node lead-followup-check.js <dah-dashboard.html경로>'); process.exit(1); }
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

  console.log('\n[놓친리드/결제상태 표시 회귀 검사] ' + file);

  async function testOnDevice(width, label) {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await blockRealNetwork(page);
    await page.setViewport({ width, height: 1000, isMobile: width < 500, hasTouch: width < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    await page.evaluate((suffix) => {
      function daysAgo(n) {
        var d = new Date();
        d.setDate(d.getDate() - n);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      }
      var todayTs = daysAgo(0);
      saveCustomers([
        { clientName: '놓친리드테스트' + suffix, phone: '01000000010', addr: '서울', stage: '상담', staffName: '마스터', date: daysAgo(16), price: 1000000 },
        { clientName: '최근상담테스트' + suffix, phone: '01000000011', addr: '서울', stage: '상담', staffName: '마스터', date: daysAgo(2), price: 1000000 },
        { clientName: '결제상태테스트' + suffix, phone: '01000000012', addr: '서울', stage: '시공', staffName: '마스터', date: daysAgo(30),
          depositAmount: 1000000, depositDate: daysAgo(20), measureDate: todayTs, installDate: todayTs, price: 2000000 }
      ]);
      goTab('home');
      renderHome(true);
    }, label);
    await new Promise(r => setTimeout(r, 400));

    const home = await page.evaluate(() => document.getElementById('home').textContent);
    check(`[${label}] 상담 후 오래된 고객(놓친리드)이 처리필요에 표시됨`, home.includes('놓친리드테스트' + label), '표시 안 됨');
    check(`[${label}] 최근 상담 고객은 처리필요에 안 뜸(오탐 없음)`, !home.includes('최근상담테스트' + label), '잘못 표시됨');

    const gotChk = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`[${label}] 홈 화면 가로스크롤 없음`, !gotChk, '가로스크롤 발생');

    // 2026-08-05 신규: "처리 필요" 리스트 스테이지 컬러가 확정된 3색 체계를 따르는지 검증.
    // (실제로 이 부분만 폐기된 4색 체계(그린/레드/다크)가 남아있던 버그가 있었음 — 재발 방지용)
    const preContractDotColor = await page.evaluate(() => {
      var el = Array.from(document.querySelectorAll('#sec-todo [data-cname]'))
        .find(function(e){ return e.getAttribute('data-cname').indexOf('놓친리드테스트') >= 0; });
      if (!el) return null;
      var dot = el.querySelector('div[style*="border-radius:50%"]');
      return dot ? getComputedStyle(dot).backgroundColor : null;
    });
    check(`[${label}] 처리필요 리스트에서 상담단계 고객 dot이 회색(#8A8378)`, preContractDotColor === 'rgb(138, 131, 120)', '실제값=' + preContractDotColor);
    const noOldSchemeColors = await page.evaluate(() => {
      // 레드(#C0392B)나 다크(#282828 계열)가 스테이지 dot에 남아있으면 폐기된 4색 체계 잔존
      var bad = false;
      document.querySelectorAll('#sec-todo [data-cname] div[style*="border-radius:50%"]').forEach(function(dot){
        var c = getComputedStyle(dot).backgroundColor;
        if (c === 'rgb(192, 57, 43)') bad = true; // #C0392B
      });
      return !bad;
    });
    check(`[${label}] 처리필요 리스트에 경고색(레드) 스테이지 dot 없음`, noOldSchemeColors, '레드 계열 dot 발견됨(4색 체계 잔존 의심)');

    await page.evaluate(() => goTab('cal'));
    await new Promise(r => setTimeout(r, 400));
    const cal = await page.evaluate(() => document.getElementById('cal').textContent);
    check(`[${label}] 달력 일정목록에 선금 입금 상태(✅)가 표시됨`, cal.includes('선금✅'), '표시 안 됨');
    const calScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`[${label}] 달력 화면 가로스크롤 없음`, !calScroll, '가로스크롤 발생');

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
