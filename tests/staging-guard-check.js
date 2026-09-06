// shared-staging-guard.js 영구 회귀테스트
// 2026-09-06(선혜님 지시 - "지금 하자", 전문업체 기준 개선점으로 지적된
// "새로 만든 안전장치에 영구 테스트가 없다"는 점을 해결하기 위해 신설):
// 스테이징 쓰기차단 안전장치가 검증 없이(임시 스크립트로만 확인하고)
// 배포됐던 걸, 앞으로 누군가 이 파일을 실수로 건드려도 자동으로 잡히도록
// tests/ 폴더에 영구 회귀테스트로 남김.
const fs = require('fs');
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9840;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let anyFail = false;

  // ── 1) localhost(안전한 개발·테스트 환경)에서는 쓰기가 차단되지 않아야 함 ──
  {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    let customerWriteReachedNetwork = false;
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/customers') && req.method() !== 'GET' && req.method() !== 'OPTIONS') { customerWriteReachedNetwork = true; }
      if (url.includes('supabase.co')) {
        if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
        return;
      }
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
    });
    await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://sradnglutbzbyyunjyah.supabase.co/rest/v1/customers', true);
      xhr.send('{}');
    });
    await new Promise(r => setTimeout(r, 300));
    const ok1 = customerWriteReachedNetwork === true;
    console.log(ok1 ? '✅' : '❌', 'localhost(안전한 환경)에서는 쓰기가 차단되지 않음');
    if (!ok1) anyFail = true;
    await page.close();
  }

  // ── 2) 알 수 없는 도메인(스테이징 등)에서는 Supabase/구글드라이브 쓰기가 차단되어야 함 ──
  //     hostname을 직접 재정의할 수 없으므로, isSafeWriteDomain을 강제로
  //     false로 만든 사본을 그 요청에서만 대신 서빙해서 스테이징 상황을 재현.
  const guardPath = path.join(dir, 'shared-staging-guard.js');
  const originalGuard = fs.readFileSync(guardPath, 'utf-8');
  const forcedStagingGuard = originalGuard.replace(
    /var isSafeWriteDomain = \/\\\.vercel\\\.app\$\/\.test\(window\.location\.hostname\)\s*\|\|\s*window\.location\.hostname === 'localhost'\s*\|\|\s*window\.location\.hostname === '127\.0\.0\.1';/,
    "var isSafeWriteDomain = false; // 테스트 전용: 강제로 스테이징(안전하지 않은 도메인) 상황 재현"
  );
  if (forcedStagingGuard === originalGuard) {
    console.log('❌ 안전장치 소스코드 패턴이 바뀌어 강제-스테이징 치환이 안 됨(테스트 갱신 필요)');
    anyFail = true;
  } else {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    let customerWriteReachedNetwork = false, docWebhookReachedNetwork = false, errorLogReachedNetwork = false;
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/shared-staging-guard.js')) {
        req.respond({ status: 200, contentType: 'application/javascript', body: forcedStagingGuard });
        return;
      }
      if (url.includes('client_error_logs')) { errorLogReachedNetwork = true; req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' }); return; }
      if (url.includes('/customers') && req.method() !== 'GET' && req.method() !== 'OPTIONS') { customerWriteReachedNetwork = true; }
      if (url.includes('script.google.com')) { docWebhookReachedNetwork = true; }
      if (url.includes('supabase.co') || url.includes('script.google.com')) {
        if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
        return;
      }
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
    });
    await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 500));

    // 2-a) 고객 데이터(customers) 쓰기 - XHR - 차단되어야 함
    await page.evaluate(() => {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://sradnglutbzbyyunjyah.supabase.co/rest/v1/customers', true);
      xhr.send('{}');
    });
    await new Promise(r => setTimeout(r, 300));
    const ok2 = customerWriteReachedNetwork === false;
    console.log(ok2 ? '✅' : '❌', '스테이징 상황(XHR): 고객데이터(customers) 쓰기가 실제 네트워크로 안 나감');
    if (!ok2) anyFail = true;

    // 2-b) 구글드라이브 웹훅 쓰기 - fetch - 차단되어야 함
    await page.evaluate(() => {
      fetch('https://script.google.com/macros/s/FAKE/exec', { method: 'POST', body: '{}' }).catch(function(){});
    });
    await new Promise(r => setTimeout(r, 300));
    const ok3 = docWebhookReachedNetwork === false;
    console.log(ok3 ? '✅' : '❌', '스테이징 상황(fetch): 구글드라이브 웹훅 쓰기가 실제 네트워크로 안 나감');
    if (!ok3) anyFail = true;

    // 2-c) client_error_logs는 예외로 허용되어야 함
    await page.evaluate(() => {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://sradnglutbzbyyunjyah.supabase.co/rest/v1/client_error_logs', true);
      xhr.send('{}');
    });
    await new Promise(r => setTimeout(r, 300));
    const ok4 = errorLogReachedNetwork === true;
    console.log(ok4 ? '✅' : '❌', '스테이징 상황: client_error_logs(진단로그)는 예외로 정상 통과됨');
    if (!ok4) anyFail = true;

    // 2-d) GET(읽기)은 스테이징에서도 항상 정상 통과되어야 함
    let getReachedNetwork = false;
    page.removeAllListeners('request');
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/shared-staging-guard.js')) { req.respond({ status: 200, contentType: 'application/javascript', body: forcedStagingGuard }); return; }
      if (url.includes('/customers') && req.method() === 'GET') { getReachedNetwork = true; }
      if (url.includes('supabase.co')) {
        if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
        return;
      }
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
    });
    await page.evaluate(() => {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'https://sradnglutbzbyyunjyah.supabase.co/rest/v1/customers?select=*', true);
      xhr.send();
    });
    await new Promise(r => setTimeout(r, 300));
    const ok5 = getReachedNetwork === true;
    console.log(ok5 ? '✅' : '❌', '스테이징 상황: GET(읽기)은 항상 정상 통과됨(화면 확인 용도 보장)');
    if (!ok5) anyFail = true;

    await page.close();
  }

  await browser.close();
  process.exit(anyFail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 30000);
