#!/usr/bin/env node
// tests/multi-device-sync-check.js
// 마스터/스태프 로그인 이메일의 "다른 기기 간 동기화" 회귀 테스트
//
// 2026-07-15 세션에서 실제로 발견/수정한 버그: 컴퓨터에서 설정탭으로 마스터
// 이메일을 등록하면 Supabase(app_settings 테이블)에는 저장되지만, 휴대폰 등
// 다른 기기(=localStorage가 비어있는 새 브라우저)가 그 값을 다시 불러오는
// 로직이 빠져있어서 "이메일이 등록 안 됨" 오류가 계속 떴던 문제.
//   1) 대시보드: loadAppSettingsAsync가 Supabase의 master_email/staff_emails를
//      정확히 localStorage로 내려받는지
//   2) 견적서 앱: 로컬에 이메일이 전혀 없는 상태(=다른 기기)에서 로그인 시도하면
//      fetchAndCacheMasterEmail로 Supabase에서 직접 조회해 로그인에 성공하는지
//
// 사용법:
//   node tests/multi-device-sync-check.js dah-dashboard.html
//   node tests/multi-device-sync-check.js dah-estimate.html

const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node multi-device-sync-check.js <html경로>');
    process.exit(1);
  }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9601 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);

  const browser = await launchBrowser();
  let failCount = 0;
  function check(label, condition, detail) {
    if (condition) { console.log(`  ✅ ${label}`); }
    else { console.log(`  ❌ ${label} — ${detail}`); failCount++; }
  }

  // 다른 기기(=Supabase엔 이미 값이 저장돼 있고, 이 브라우저 localStorage는 완전히 빈 상태)를
  // 흉내내는 공용 요청 인터셉터. 실제 데이터 요청은 차단하되, master_email 조회에는
  // 미리 정해둔 값을, 그 외 app_settings 조회에는 빈 배열을 응답한다.
  async function setupFakeOtherDevice(page) {
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
          if (body.email === 'other-device@dah-test.local' && body.password === 'TEST_OK_PW') {
            req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ access_token: 'multi-device-token', refresh_token: 'r', expires_in: 3600, user: { id: 'u-multi', email: body.email } }) });
          } else {
            req.respond({ status: 400, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error_description: 'Invalid login credentials' }) });
          }
          return;
        }
        if (url.includes('app_settings') && url.includes('master_email')) {
          req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ value: 'other-device@dah-test.local' }]) });
          return;
        }
        if (url.includes('app_settings')) {
          // 다른 설정값들도 조회하는 로직(대시보드 loadAppSettingsAsync)이 있으므로
          // master_email을 포함해 한 번에 내려주는 전체 목록 형태로도 응답
          req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ key: 'master_email', value: 'other-device@dah-test.local' }]) });
          return;
        }
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
        return;
      }
      req.continue();
    });
  }

  try {
    if (/dah-dashboard/.test(file)) {
      const page = await browser.newPage();
      await setupFakeOtherDevice(page);
      await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 700));

      console.log('\n[대시보드 다중기기 동기화 검사] ' + file);
      // 대시보드는 페이지 로드시 자동으로 loadAppSettingsAsync를 호출하므로
      // (로그인화면에 담당자 목록을 보여주기 위해), 그 자동 동기화 결과를 직접 검증한다.
      const autoSyncedEmail = await page.evaluate(() => localStorage.getItem('dah_master_email'));
      check('페이지 로드시 자동으로 Supabase의 마스터 이메일이 로컬에 동기화됨', autoSyncedEmail === 'other-device@dah-test.local', '실제값=' + autoSyncedEmail);

      // 명시적으로 다시 호출해도 여전히 정확한 값을 유지/갱신하는지 확인
      await page.evaluate(() => new Promise((resolve) => { loadAppSettingsAsync(resolve); }));
      await new Promise(r => setTimeout(r, 300));
      const afterSync = await page.evaluate(() => localStorage.getItem('dah_master_email'));
      check('명시적으로 다시 호출해도 Supabase의 마스터 이메일이 정확히 유지됨', afterSync === 'other-device@dah-test.local', '실제값=' + afterSync);

      process.exitCode = failCount === 0 ? 0 : 1;
      await page.close();
    } else if (/dah-estimate/.test(file)) {
      const page = await browser.newPage();
      await setupFakeOtherDevice(page);
      await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 700));

      console.log('\n[견적서앱 다중기기 동기화 검사] ' + file);
      const localEmailBefore = await page.evaluate(() => localStorage.getItem('dah_master_email'));
      check('시작 시점엔 로컬에 마스터 이메일 없음(다른기기 전제조건)', !localEmailBefore, '실제값=' + localEmailBefore);

      const gateVisibleBefore = await page.evaluate(() => document.getElementById('est-auth-gate')?.style.display);
      check('세션 없을 때 게이트가 표시됨', gateVisibleBefore === 'flex', '실제값=' + gateVisibleBefore);

      await page.evaluate(() => { document.getElementById('est-auth-pw').value = 'TEST_OK_PW'; });
      await page.evaluate(() => document.getElementById('est-auth-btn').click());
      await new Promise(r => setTimeout(r, 800));

      const result = await page.evaluate(() => ({
        gateVisible: document.getElementById('est-auth-gate')?.style.display,
        cachedEmail: localStorage.getItem('dah_master_email')
      }));
      check('로컬에 이메일 없어도 Supabase에서 자동조회해 로그인 성공(게이트 닫힘)', result.gateVisible === 'none', '실제값=' + JSON.stringify(result));
      check('조회된 이메일이 이 기기 로컬에도 캐싱됨', result.cachedEmail === 'other-device@dah-test.local', '실제값=' + result.cachedEmail);

      process.exitCode = failCount === 0 ? 0 : 1;
      await page.close();
    } else {
      console.log('대시보드/견적서 앱이 아닌 파일이라 다중기기 동기화 검사를 건너뜁니다: ' + file);
      process.exitCode = 0;
    }
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
