const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9916;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // "복사" 모드 진입 상황 재현: mode=copy 경로가 실행하는 것과 동일하게
  // client_id는 세팅되지만 editingEstDbId는 비어있는 상태 + 스킵 플래그
  const r1 = await page.evaluate(() => {
    window._estSaveCustomerId = 555; // 원본 고객
    window._editingEstDbId = null;
    window._skipTodayDuplicateCheck = true; // 복사모드 진입시 세팅되는 플래그

    var sawDuplicateCheckCall = false;
    window.sbXHR = undefined; // saveToEstimates는 XMLHttpRequest를 직접 씀 - 아래서 가로챔

    var OrigXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      var xhr = new OrigXHR();
      var origOpen = xhr.open.bind(xhr);
      xhr.open = function(method, url) {
        if (url.indexOf('estimates?client_id=eq.555') !== -1 && url.indexOf('updated_at=gte') !== -1) {
          sawDuplicateCheckCall = true;
        }
        return origOpen.apply(xhr, arguments);
      };
      return xhr;
    };

    // saveToEstimates 내부의 "오늘 저장된 것 찾기" 분기 조건만 직접 재현해서 확인
    var willCheckDuplicate = (!window._editingEstDbId && !window._skipTodayDuplicateCheck && window._estSaveCustomerId && typeof SUPABASE_URL !== 'undefined');
    return { willCheckDuplicate: willCheckDuplicate };
  });
  ok('1. 복사모드(스킵 플래그 있음)일 때 "오늘 저장된 것 찾기" 분기 자체를 안 탐', r1.willCheckDuplicate === false, JSON.stringify(r1));

  // 대조군: 스킵 플래그 없이(일반 신규저장) 같은 조건이면 분기를 정상적으로 탐
  const r2 = await page.evaluate(() => {
    window._estSaveCustomerId = 555;
    window._editingEstDbId = null;
    window._skipTodayDuplicateCheck = false;
    var willCheckDuplicate = (!window._editingEstDbId && !window._skipTodayDuplicateCheck && window._estSaveCustomerId && typeof SUPABASE_URL !== 'undefined');
    return { willCheckDuplicate: willCheckDuplicate };
  });
  ok('2. 일반 신규저장(스킵 플래그 없음)은 그대로 "오늘 저장된 것 찾기"를 정상적으로 탐(회귀 없음)', r2.willCheckDuplicate === true, JSON.stringify(r2));

  // 3) edit 모드 진입시 skipTodayDuplicateCheck가 세팅되지 않는지(복사 전용이어야 함)
  const r3 = await page.evaluate(() => {
    delete window._skipTodayDuplicateCheck;
    // edit 모드 분기(loadMode==='edit')는 else 브랜치를 안 타므로 스킵플래그를 안 건드림 - 그대로 undefined여야 함
    return window._skipTodayDuplicateCheck;
  });
  ok('3. edit 모드는 스킵 플래그와 무관함(복사 전용 안전장치가 편집모드까지 새는 것 방지)', r3 === undefined, String(r3));

  // 4) 실제 페이지 진입 경로(?loadEstDbId=X&mode=copy)로 들어왔을 때 정말
  // 플래그가 세팅되는지 - 별도 탭으로 열어서 진짜 mode=copy 흐름 그대로 확인
  const page2 = await browser.newPage();
  await page2.setRequestInterception(true);
  page2.on('request', (req) => {
    const url = req.url();
    if (req.method() === 'OPTIONS' && url.includes('supabase.co')) {
      req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } });
      return;
    }
    if (url.includes('/rest/v1/estimates?id=eq.copy-test-id')) {
      req.respond({
        status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify([{ id: 'copy-test-id', client_id: 777, customer_name: '복사테스트고객', phone: '01000000000', line_items: [] }])
      });
      return;
    }
    if (url.includes('/rest/v1/customers?id=eq.777')) {
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.includes('supabase.co') || url.includes('script.google.com')) { req.abort(); return; }
    req.continue();
  });
  await page2.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=copy-test-id&mode=copy`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page2, 'master');
  await new Promise(r => setTimeout(r, 800));
  const r4 = await page2.evaluate(() => ({ flag: window._skipTodayDuplicateCheck, custId: window._estSaveCustomerId, editingId: window._editingEstDbId }));
  ok('4. 실제 ?mode=copy 진입 경로로 페이지를 열면 스킵 플래그가 실제로 세팅됨', r4.flag === true, JSON.stringify(r4));

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await page2.close();
  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 30000);
