#!/usr/bin/env node
// tests/race-condition-check.js
// 신규고객 등록 직후 발생하는 경쟁조건(race condition) 회귀 테스트
//
// 2026-07-16 실무 워크플로우 시뮬레이션 중 발견한 버그:
// saveCustomer()가 새 고객을 localStorage에 저장한 직후 renderHome()을 호출하는데,
// 예전 renderHome()은 항상 Supabase에 서버 재조회를 했다. 만약 그 조회 응답이
// (네트워크 지연 등으로) 방금 등록한 고객을 아직 반영 못한 옛날 상태로 오면,
// 그 응답이 그대로 로컬을 덮어써서 방금 등록한 고객이 사라지는 문제가 있었다.
// 수정: 방금 로컬을 갱신한 직후 호출되는 renderHome(true)는 서버 재조회를 건너뛰고
// 이미 최신인 로컬 데이터로만 그리도록 함.
//
// 사용법: node tests/race-condition-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node race-condition-check.js <dah-dashboard.html경로>');
    process.exit(1);
  }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9801 + Math.floor(Math.random() * 500);
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

    // 최악의 조건을 흉내냄: Supabase의 모든 데이터 조회 요청이 "아직 아무것도
    // 반영 안 된" 빈 배열을 반환하도록 함(실제로는 느린 서버 응답을 흉내내는 것).
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('supabase.co') || url.includes('script.google.com')) {
        if (req.method() === 'OPTIONS') {
          req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } });
          return;
        }
        if (url.includes('/auth/v1/token') && req.postData()) {
          let body; try { body = JSON.parse(req.postData()); } catch (e) { body = {}; }
          if (body.password === 'TEST_OK_PW') {
            req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ access_token: 'test-fake-token', refresh_token: 'r', expires_in: 3600, user: { id: 'u1', email: body.email } }) });
          } else {
            req.respond({ status: 400, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error_description: 'Invalid' }) });
          }
          return;
        }
        // 항상 성공(200)이지만 빈 배열 — "서버는 살아있지만 아직 반영 전" 상황을 흉내냄
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
        return;
      }
      req.continue();
    });

    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await page.evaluate(() => { if (typeof setMasterEmail === 'function') setMasterEmail('test-master@dah-test.local'); });
    await page.evaluate(() => document.getElementById('btn-master-login') && document.getElementById('btn-master-login').click());
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((pw) => { const el = document.getElementById('master-pw-input'); if (el) el.value = pw; }, 'TEST_OK_PW');
    await page.evaluate(() => document.getElementById('btn-master-confirm') && document.getElementById('btn-master-confirm').click());
    await new Promise(r => setTimeout(r, 1000));

    console.log('\n[경쟁조건(신규등록 직후 서버덮어쓰기) 검사] ' + file);

    // 신규 고객 등록
    await page.evaluate(() => { openAdd(); });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => {
      document.getElementById('add-name').value = '경쟁조건회귀테스트고객';
      document.getElementById('add-phone').value = '01077778888';
      document.getElementById('add-date').value = (typeof todayStr === 'function' ? todayStr() : '');
      saveCustomer();
    });
    await new Promise(r => setTimeout(r, 1000));

    const afterSave = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_customers') || '[]').length);
    check('서버가 빈 배열을 반환해도 방금 등록한 고객이 로컬에 유지됨', afterSave === 1, '실제 저장건수=' + afterSave + ' (예상: 1건, 0건이면 서버응답에 덮어써진 것)');

    // 고객 상태 변경(계약금 등)도 같은 방식으로 안전한지 확인
    await page.evaluate(() => { openDetail('경쟁조건회귀테스트고객'); });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => { changeStage('계약금'); });
    await new Promise(r => setTimeout(r, 500));
    const afterStageChange = await page.evaluate(() => {
      const arr = JSON.parse(localStorage.getItem('dah_customers') || '[]');
      const c = arr.find(x => x.clientName === '경쟁조건회귀테스트고객');
      return c ? c.stage : 'not-found';
    });
    check('단계변경 직후에도 서버응답으로 덮어써지지 않고 유지됨', afterStageChange === '계약금', '실제값=' + afterStageChange);

    process.exitCode = failCount === 0 ? 0 : 1;
    await page.close();
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
