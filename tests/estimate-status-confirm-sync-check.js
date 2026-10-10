const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9942;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  let capturedPayloads = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/customers') && method === 'POST') { req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 'new-cust-1' }]) }); return; }
      if (url.includes('/estimates') && (method === 'POST' || method === 'PATCH')) {
        try { capturedPayloads.push(JSON.parse(req.postData())); } catch (e) {}
        req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[{"id":"new-est-1","updated_at":"2026-09-22T00:00:00Z"}]' });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.setViewport({ width: 1280, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 기본 정보 채우기
  await page.evaluate(() => {
    document.getElementById('c-name').value = '탭확정테스트';
    document.getElementById('c-phone').value = '01099990002';
    document.getElementById('c-addr').value = '서울시 어딘가';
    document.getElementById('c-measure-tbd').checked = true;
    document.getElementById('c-install-tbd').checked = true;
    var addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '+ 커튼 추가');
    addBtn.click();
    var tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.mw').value = 300; calcCurtainRow(tr.querySelector('.mw'));
    tr.querySelector('.cprice').value = 100000; calcCurtainRow(tr.querySelector('.cprice'));
  });

  // 1) 최금희 실사례 재현: "최종 견적서" 탭으로만 전환(확정 버튼은 안 누름) 후 저장
  await page.evaluate(() => {
    var finalTabBtn = Array.from(document.querySelectorAll('button, [onclick*="setStatus"]')).find(b => b.textContent && b.textContent.trim() === '최종 견적서');
    if (finalTabBtn) finalTabBtn.click();
    else if (typeof setStatus === 'function') setStatus('final');
  });
  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 1500));
  const payload1 = capturedPayloads[capturedPayloads.length - 1];
  ok('1. [핵심] 확정 버튼을 안 눌렀으면, "최종견적서" 탭만 봐도 estimate_status는 여전히 ga로 저장됨(확정 버튼과 무관)', payload1 && payload1.estimate_status === 'ga', JSON.stringify(payload1 && payload1.estimate_status));

  // 2) 대조군: 확정 버튼을 눌렀으면 탭 상태와 무관하게 estimate_status가 final로 저장돼야 함
  capturedPayloads = [];
  await page.evaluate(() => {
    if (typeof setStatus === 'function') setStatus('ga'); // 가견적서 탭으로 되돌림
    toggleConfirmEstimate(); // 확정 버튼 클릭
  });
  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 1500));
  const payload2 = capturedPayloads[capturedPayloads.length - 1];
  ok('2. [핵심] 확정 버튼을 눌렀으면, "가견적서" 탭이어도 estimate_status는 final로 저장됨(회귀 없음)', payload2 && payload2.estimate_status === 'final', JSON.stringify(payload2 && payload2.estimate_status));

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 30000);
