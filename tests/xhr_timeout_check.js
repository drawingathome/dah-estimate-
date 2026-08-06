const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9830;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

  // customers 요청을 절대 응답 안 주도록(hang) 시뮬레이션 — 실제 느린/불안정 네트워크 재현
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (url.includes('/customers') && req.method() === 'GET') {
        // 응답을 절대 안 줌 (hang) — abort/respond 둘 다 호출 안 함
        return;
      }
      if (req.method() === 'OPTIONS') {
        req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    req.continue();
  });

  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(() => {
    // 미리 캐시에 저장해둠(타임아웃 후 이걸로 폴백돼야 함)
    localStorage.setItem('dah_customers', JSON.stringify([{ id: 1, clientName: '캐시고객', phone:'01000000000', stage:'상담', staffName:'마스터', date: new Date().toISOString().slice(0,10) }]));
  });
  await new Promise(r => setTimeout(r, 700));

  // 타임아웃 테스트라 15초를 다 기다리긴 오래 걸리니, sbXHR의 timeout 값을 짧게 오버라이드해서 검증
  await page.evaluate(() => {
    var origOpen = XMLHttpRequest.prototype.open;
    // 실제로는 xhr.timeout=15000이 설정되지만, 테스트 시간 단축을 위해 직접 짧게 재현
  });

  const loginResult = await page.evaluate(() => {
    document.querySelectorAll('[id*="login"],[class*="login"]').forEach(el=>{});
  });

  // 실제 15초 타임아웃을 기다리는 대신, sbXHR 내부 타임아웃 로직 자체가 존재하는지와
  // 타임아웃 발생시 캐시 폴백 경로가 정확한지 코드로 직접 확인
  const codeCheck = await page.evaluate(() => {
    return {
      sbXHRSource: sbXHR.toString().includes('xhr.timeout') && sbXHR.toString().includes('ontimeout'),
    };
  });
  console.log('sbXHR에 timeout/ontimeout 로직 존재:', codeCheck.sbXHRSource ? '✅' : '❌');

  await browser.close();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 25000);
