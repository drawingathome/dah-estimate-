#!/usr/bin/env node
// tests/dashboard-data-check.js
// 대시보드(dah-dashboard.html) 데이터 검증/검색 로직 회귀 테스트
//
// 2026-07-15 세션에서 실제로 발견/수정한 3개의 데이터 품질 버그가
// 다시 재발하지 않는지 확인하는 영구 회귀 테스트입니다.
//   1) 초성검색: CHOSUNG 배열 13번째 자리(쌍지읒 ㅉ)에 ㄱ이 잘못 들어가 있어서
//      'ㅉ'으로 시작하는 고객명이 초성검색으로 전혀 안 찾아지던 버그
//   2) 중복고객: 같은 연락처로 중복 등록해도 경고 없이 그냥 등록되던 문제
//      (checkDuplicate가 정의만 되고 실제 저장흐름에 연결 안 되어 있었음)
//   3) 방문예정일: 1900년 같은 비합리적 날짜를 입력해도 그대로 저장되던 문제
//      (validateDate가 정의만 되고 실제 저장흐름에 연결 안 되어 있었음)
//
// 사용법: node tests/dashboard-data-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, blockRealNetwork, startServer, loginAs } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node dashboard-data-check.js <dah-dashboard.html경로>');
    process.exit(1);
  }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9501 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);

  const browser = await launchBrowser();
  let failCount = 0;

  function check(label, condition, detail) {
    if (condition) {
      console.log(`  ✅ ${label}`);
    } else {
      console.log(`  ❌ ${label} — ${detail}`);
      failCount++;
    }
  }

  try {
    const page = await browser.newPage();
    await blockRealNetwork(page);
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    console.log('\n[대시보드 데이터검증 검사] ' + file);

    // ── 테스트 1: 초성검색 'ㅉ' 매핑 ──
    const chosungResult = await page.evaluate(() => ({
      jj: typeof getChosung === 'function' ? getChosung('짱구') : 'no-fn',
      ga: typeof getChosung === 'function' ? getChosung('가나다') : 'no-fn'
    }));
    check("초성 'ㅉ' 정확히 매핑됨(짱구 -> ㅉㄱ)", chosungResult.jj === 'ㅉㄱ', '실제값=' + chosungResult.jj);
    check("초성 'ㄱ' 회귀없음(가나다 -> ㄱㄴㄷ)", chosungResult.ga === 'ㄱㄴㄷ', '실제값=' + chosungResult.ga);

    // ── 테스트 2: 중복고객 경고 ──
    await page.evaluate(() => {
      localStorage.removeItem('dah_customers');
      saveCustomers([{ clientName: '회귀중복원본', phone: '01099998888', stage: '상담', staffName: '마스터', price: 100000, date: (typeof todayStr === 'function' ? todayStr() : ''), createdAt: new Date().toISOString() }]);
    });
    await new Promise(r => setTimeout(r, 300));
    let dupDialogMsg = '';
    page.removeAllListeners('dialog');
    page.on('dialog', async d => { dupDialogMsg = d.message(); await d.dismiss(); });
    await page.evaluate(() => { openAdd(); });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => {
      document.getElementById('add-name').value = '회귀중복시도';
      document.getElementById('add-phone').value = '01099998888';
      saveCustomer();
    });
    await new Promise(r => setTimeout(r, 500));
    const custCountAfterCancel = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_customers') || '[]').length);
    check('중복 연락처 등록시 확인창이 뜸', dupDialogMsg.includes('이미 등록된 연락처'), '실제메시지="' + dupDialogMsg + '"');
    check('확인창 취소시 저장이 차단됨', custCountAfterCancel === 1, '실제 저장건수=' + custCountAfterCancel + ' (예상: 1건, 중복등록 안 됨)');

    // ── 테스트 3: 방문예정일 비합리값 방어 (독립된 새 페이지에서 실행 — 이전 단계의
    //    비동기 Supabase 캐시 갱신이 겹치는 걸 피하기 위함) ──
    const page3 = await browser.newPage();
    await blockRealNetwork(page3);
    page3.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await page3.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page3, 'master');
    await page3.evaluate(() => { localStorage.removeItem('dah_customers'); });
    await page3.evaluate(() => { openAdd(); });
    await new Promise(r => setTimeout(r, 300));
    await page3.evaluate(() => {
      document.getElementById('add-name').value = '회귀날짜테스트';
      document.getElementById('add-phone').value = '01011112222';
      document.getElementById('add-date').value = '1900-01-01';
      saveCustomer();
    });
    await new Promise(r => setTimeout(r, 500));
    const custCountBadDate = await page3.evaluate(() => JSON.parse(localStorage.getItem('dah_customers') || '[]').length);
    check('1900년 같은 비합리적 날짜 저장이 차단됨', custCountBadDate === 0, '실제 저장건수=' + custCountBadDate + ' (예상: 0건, 차단되어야 함)');

    // 정상 날짜는 회귀 없이 저장되는지 확인
    await page3.evaluate(() => {
      document.getElementById('add-date').value = '2026-08-01';
      saveCustomer();
    });
    await new Promise(r => setTimeout(r, 800));
    const custCountGoodDate = await page3.evaluate(() => {
      var arr = JSON.parse(localStorage.getItem('dah_customers') || '[]');
      return arr.filter(function (c) { return c.clientName === '회귀날짜테스트'; }).length;
    });
    check('정상 날짜는 회귀없이 저장됨', custCountGoodDate === 1, '실제 저장건수=' + custCountGoodDate + ' (예상: 1건)');
    await page3.close();

    process.exitCode = failCount === 0 ? 0 : 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
