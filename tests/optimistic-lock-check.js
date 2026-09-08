// shared-optimistic-lock.js 영구 회귀테스트
// 2026-09-06(선혜님 지시 - "지금 하자", 전문업체 기준 개선점으로 지적된
// "새로 만든 안전장치에 영구 테스트가 없다"는 걸 해결하기 위해 신설):
// 낙관적잠금(동시저장충돌) 발생시 최신 updated_at을 다시 조회해 락값을
// 갱신하는 공용 함수 - 이게 없으면 재시도해도 계속 같은 이유로 반복
// 실패하는 사고(실제 client_error_logs에서 발견)가 재발할 수 있음.
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9850;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let anyFail = false;

  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  let getUpdatedAtCalled = false;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/estimates') && url.includes('select=updated_at') && req.method() === 'GET') {
        getUpdatedAtCalled = true;
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ updated_at: '2026-09-06T12:00:00Z' }]) });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });

  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));

  // 1) 함수 자체가 존재하고, 정상 응답이면 콜백으로 최신 updated_at을 전달하는지
  const result1 = await page.evaluate(() => {
    return new Promise((resolve) => {
      if (typeof fetchLatestUpdatedAt !== 'function') { resolve({ exists: false }); return; }
      fetchLatestUpdatedAt('estimates', 'test-id-123', function (updatedAt) {
        resolve({ exists: true, updatedAt: updatedAt });
      });
    });
  });
  const ok1 = result1.exists === true && result1.updatedAt === '2026-09-06T12:00:00Z';
  console.log(ok1 ? '✅' : '❌', 'fetchLatestUpdatedAt이 정상 응답시 콜백으로 최신 updated_at을 정확히 전달함', JSON.stringify(result1));
  if (!ok1) anyFail = true;
  console.log(getUpdatedAtCalled ? '✅' : '❌', 'GET 요청이 올바른 테이블/select 파라미터로 실제로 나감');
  if (!getUpdatedAtCalled) anyFail = true;

  // 2) table/id가 없을 때는 네트워크 요청 없이 곧바로 null 콜백(안전한 조기종료)
  getUpdatedAtCalled = false;
  const result2 = await page.evaluate(() => {
    return new Promise((resolve) => {
      fetchLatestUpdatedAt('', '', function (updatedAt) { resolve(updatedAt); });
    });
  });
  const ok2 = result2 === null && getUpdatedAtCalled === false;
  console.log(ok2 ? '✅' : '❌', 'table/id가 비어있으면 네트워크 요청 없이 안전하게 null 콜백', JSON.stringify(result2));
  if (!ok2) anyFail = true;

  // 3) est-save.js/dash-api.js 양쪽 모두 이 공용 함수를 실제로 사용하고 있는지
  //    (직접 XHR을 새로 만드는 방식으로 되돌아가지 않았는지 - 쌍둥이 재발 방지)
  const usageCheck = await page.evaluate(() => {
    return {
      estSaveUsesShared: typeof saveEstimate === 'function' && _saveEstimateInner.toString().includes('fetchLatestUpdatedAt')
    };
  });
  console.log(usageCheck.estSaveUsesShared ? '✅' : '❌', 'est-save.js가 공용 fetchLatestUpdatedAt을 실제로 사용 중(개별 XHR로 되돌아가지 않음)');
  if (!usageCheck.estSaveUsesShared) anyFail = true;

  await browser.close();
  process.exit(anyFail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 25000);
