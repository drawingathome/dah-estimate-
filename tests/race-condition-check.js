#!/usr/bin/env node
// tests/race-condition-check.js
// 신규고객 등록 직후 발생하는 경쟁조건(race condition) 회귀 테스트
// 2026-07-21: 모바일 케이스 추가 (예전엔 PC만 검사)
// 사용법: node tests/race-condition-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node race-condition-check.js <dah-dashboard.html경로>'); process.exit(1); }
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

  console.log('\n[경쟁조건(신규등록 직후 서버덮어쓰기) 검사] ' + file);

  async function testOnDevice(width, label) {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

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
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
        return;
      }
      req.continue();
    });

    await page.setViewport({ width, height: 900, isMobile: width < 500, hasTouch: width < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await page.evaluate(() => { if (typeof setMasterEmail === 'function') setMasterEmail('test-master@dah-test.local'); });
    await page.evaluate(() => document.getElementById('btn-master-login') && document.getElementById('btn-master-login').click());
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((pw) => { const el = document.getElementById('master-pw-input'); if (el) el.value = pw; }, 'TEST_OK_PW');
    await page.evaluate(() => document.getElementById('btn-master-confirm') && document.getElementById('btn-master-confirm').click());
    await new Promise(r => setTimeout(r, 1000));

    await page.evaluate(() => { openAdd(); });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((suffix) => {
      document.getElementById('add-name').value = '경쟁조건회귀테스트고객' + suffix;
      document.getElementById('add-phone').value = '01077778888';
      document.getElementById('add-date').value = (typeof todayStr === 'function' ? todayStr() : '');
      saveCustomer();
    }, label);
    await new Promise(r => setTimeout(r, 1000));

    const afterSave = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_customers') || '[]').length);
    check(`[${label}] 서버가 빈 배열을 반환해도 방금 등록한 고객이 로컬에 유지됨`, afterSave === 1, '실제 저장건수=' + afterSave);

    await page.evaluate((suffix) => { openDetail('경쟁조건회귀테스트고객' + suffix); }, label);
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => { changeStage('계약금'); });
    await new Promise(r => setTimeout(r, 500));
    const afterStageChange = await page.evaluate((suffix) => {
      const arr = JSON.parse(localStorage.getItem('dah_customers') || '[]');
      const c = arr.find(x => x.clientName === '경쟁조건회귀테스트고객' + suffix);
      return c ? c.stage : 'not-found';
    }, label);
    check(`[${label}] 단계변경 직후에도 서버응답으로 덮어써지지 않고 유지됨`, afterStageChange === '계약금', '실제값=' + afterStageChange);

    await page.evaluate((suffix) => {
      saveCustomers([{ clientName: '경쟁조건칸반테스트고객' + suffix, phone: '01088889999', stage: '상담', staffName: '마스터', price: 100000, date: (typeof todayStr === 'function' ? todayStr() : ''), createdAt: new Date().toISOString() }]);
    }, label);
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((suffix) => { changeStageByName('경쟁조건칸반테스트고객' + suffix, '계약금'); }, label);
    await new Promise(r => setTimeout(r, 800));
    const kanbanStageAfter = await page.evaluate((suffix) => {
      const arr = JSON.parse(localStorage.getItem('dah_customers') || '[]');
      const c = arr.find(x => x.clientName === '경쟁조건칸반테스트고객' + suffix);
      return c ? c.stage : 'not-found';
    }, label);
    check(`[${label}] 칸반 단계변경 이후에도 서버응답으로 덮어써지지 않고 유지됨`, kanbanStageAfter === '계약금', '실제값=' + kanbanStageAfter);

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
