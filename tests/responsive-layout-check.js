#!/usr/bin/env node
// tests/responsive-layout-check.js
// 2026-07-19 발견: 지금까지 모바일/PC 큰화면 검증을 전부 "그때그때 수동
// puppeteer 스크립트"로만 했고, 자동 회귀 테스트로 하나도 안 박아뒀음.
// 그래서 매번 사람이 다시 확인해야 했고, 실제로 사용자(선혜님)가 27인치
// 모니터에서 문제를 먼저 발견한 뒤에야 알게 된 사례가 있었음.
//
// 이 테스트는 여러 해상도(모바일 390px / 노트북 1024px / PC 1400px /
// 큰모니터 2560px)에서 "한 번 확인해서 고친 것들"이 다시 깨지지 않는지
// 자동으로 감시한다.
//
// 사용법: node tests/responsive-layout-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node responsive-layout-check.js <dah-dashboard.html경로>');
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

  console.log('\n[반응형 레이아웃 회귀 검사] ' + file);

  try {
    // ── 1. 여러 해상도에서 가로스크롤 없어야 함 (홈+칸반) ──
    for (const width of [390, 1024, 1400, 2560]) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.setRequestInterception(true);
      page.on('request', (req) => { if (req.url().includes('supabase.co')) { req.abort(); return; } req.continue(); });
      await page.setViewport({ width, height: 900 });
      await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 700));
      await loginAs(page, 'master');
      await page.evaluate(() => {
        saveCustomers([{ clientName: '반응형검증고객', phone: '01000000000', addr: '서울시 강남구', stage: '계약금', staffName: '마스터', date: '2026-07-01' }]);
      });
      await new Promise(r => setTimeout(r, 400));
      await page.evaluate(() => goTab('pipe'));
      await new Promise(r => setTimeout(r, 300));
      const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      check(`${width}px에서 가로스크롤 없음(홈+진행현황)`, scroll.sw <= scroll.iw + 2, `scrollWidth=${scroll.sw} > innerWidth=${scroll.iw}`);
      check(`${width}px에서 JS 런타임 에러 없음`, errors.length === 0, JSON.stringify(errors));
      await page.close();
    }

    // ── 2. 콘텐츠 최대너비 + 빠른이동 내비 겹침 방지 (2026-07-19 발견) ──
    {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (req) => { if (req.url().includes('supabase.co')) { req.abort(); return; } req.continue(); });
      await page.setViewport({ width: 2560, height: 900 });
      await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 700));
      await loginAs(page, 'master');
      await page.evaluate(() => { saveCustomers([{ clientName: '검증', phone: '010', addr: '서울', stage: '계약금', staffName: '마스터' }]); renderHome(true); });
      await new Promise(r => setTimeout(r, 400));
      const wrapWidth = await page.evaluate(() => Math.round(document.getElementById('home').getBoundingClientRect().width));
      check('2560px에서 콘텐츠가 최대너비로 제한됨(늘어지지 않음)', wrapWidth <= 1250, `실제 너비=${wrapWidth}px (1250px 이하여야 함, 27인치 등 큰 모니터에서 카드가 과도하게 늘어지던 문제)`);

      // 1024px에서 quick-nav와 콘텐츠 간격 확인
      await page.setViewport({ width: 1024, height: 900 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 700));
      await loginAs(page, 'master');
      await page.evaluate(() => { saveCustomers([{ clientName: '검증2', phone: '010', addr: '서울', stage: '계약금', staffName: '마스터' }]); renderHome(true); });
      await new Promise(r => setTimeout(r, 400));
      const navGap = await page.evaluate(() => {
        var nav = document.getElementById('quick-nav');
        if (!nav || getComputedStyle(nav).display === 'none') return { hidden: true };
        var goalSec = document.getElementById('sec-goal');
        var r = goalSec.getBoundingClientRect();
        var navR = nav.getBoundingClientRect();
        return { hidden: false, gap: Math.round(navR.left - r.right) };
      });
      check('1024px에서 빠른이동 내비가 콘텐츠와 안전하게 분리됨(숨겨지거나 충분한 간격)', navGap.hidden || navGap.gap >= 30, `간격=${navGap.gap}px (숨겨지거나 30px 이상이어야 함)`);
      await page.close();
    }

    // ── 3. 달력: 겹치는 일정 축약(+N) 표시 + 클릭 가능함(cursor) + 실제 클릭시 노출 ──
    {
      const page = await browser.newPage();
      page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
      await page.setRequestInterception(true);
      page.on('request', (req) => { if (req.url().includes('supabase.co')) { req.abort(); return; } req.continue(); });
      await page.setViewport({ width: 390, height: 900 });
      await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 700));
      await loginAs(page, 'master');
      await page.evaluate(() => {
        saveCustomers([
          { clientName: '박서준', phone: '01000000003', addr: '서울', stage: '실측', staffName: '마스터', measureDate: '2026-07-19', date: '2026-07-06' },
          { clientName: '최유리', phone: '01000000004', addr: '인천', stage: '시공', staffName: '마스터', installDate: '2026-07-19', date: '2026-07-08' },
          { clientName: '정하늘', phone: '01000000005', addr: '부산', stage: '시공', staffName: '마스터', installDate: '2026-07-19', date: '2026-07-10' }
        ]);
      });
      await new Promise(r => setTimeout(r, 400));
      await page.evaluate(() => goTab('cal'));
      await new Promise(r => setTimeout(r, 400));

      const moreInfo = await page.evaluate(() => {
        var cells = Array.from(document.querySelectorAll('.cal-day-cell, [class*=day]'));
        var target = cells.find(c => c.textContent.trim().startsWith('19'));
        if (!target) return { found: false };
        var more = Array.from(target.querySelectorAll('*')).find(e => e.textContent.trim() === '+1');
        if (!more) return { found: false };
        return { found: true, cursor: getComputedStyle(more).cursor, overflow: target.scrollHeight > target.clientHeight };
      });
      check('겹치는 일정(3개) 중 2개 초과분이 "+N"으로 축약 표시됨', moreInfo.found, JSON.stringify(moreInfo));
      if (moreInfo.found) {
        check('날짜 셀 안에서 내용이 넘치지 않음(모바일 좁은 셀 기준)', !moreInfo.overflow, '셀 내용이 넘침');
      }

      const clickReveal = await page.evaluate(() => {
        var cells = Array.from(document.querySelectorAll('.cal-day-cell, [class*=day]'));
        var target = cells.find(c => c.textContent.trim().startsWith('19'));
        var more = Array.from(target.querySelectorAll('*')).find(e => e.textContent.trim() === '+1');
        if (!more) return false;
        more.click();
        return document.body.textContent.includes('정하늘');
      });
      await new Promise(r => setTimeout(r, 300));
      check('"+N" 클릭시 숨겨진 일정이 실제로 노출됨', clickReveal, '클릭해도 숨겨진 일정(정하늘)이 안 보임');
      await page.close();
    }

    process.exitCode = failCount === 0 ? 0 : 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
