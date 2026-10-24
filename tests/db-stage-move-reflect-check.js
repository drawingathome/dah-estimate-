// 2026-10-24: DB 규칙이 결제 저장 때문에 단계를 올렸을 때, 이 기기 화면/저장소가 새 단계를 바로 받는지 시험.
// (서버가 PATCH 응답 행에 stage를 "잔금결제"로 돌려주는 상황을 흉내냄)
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9885;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let anyFail = false;
  function ok(label, cond, detail) { console.log((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); if (!cond) anyFail = true; }
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(''); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url(); const H = { 'Access-Control-Allow-Origin': '*' };
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (req.method() === 'PATCH' && url.includes('/customers')) {
        req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([{ id: 11, client_name: '반영테스트', stage: '잔금결제', deposit_amount: 500000, updated_at: '2026-10-24T10:00:00.000Z' }]) }); return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' }); return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate(() => { saveCustomers([{ id: 11, clientName: '반영테스트', staffName: '마스터', stage: '확정견적', price: 500000, updatedAt: '2026-10-24T09:00:00.000Z', is_archived: false }]); openDetail('반영테스트', 11); });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => { switchDetailTab('pay'); });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => {
    var a = document.querySelector('input[placeholder^="잔금 금액"]'); a.value = '500000'; a.dispatchEvent(new Event('input'));
    var d = a.parentElement.querySelector('input[type="date"]'); if (d) { d.value = '2026-10-24'; d.dispatchEvent(new Event('change')); }
  });
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => { var b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('잔금 저장')); if (b) b.click(); });
  await new Promise(r => setTimeout(r, 1200));
  const r = await page.evaluate(() => ({ stage: loadCustomers().find(x => x.id === 11).stage, toast: (document.getElementById('toast') || document.body).textContent }));
  ok('DB가 올린 단계(잔금결제)를 이 기기 저장소가 바로 받음', r.stage === '잔금결제', r.stage);
  ok('자동 이동 안내가 뜸', /자동으로/.test(r.toast), r.toast.slice(-70));
  await browser.close(); server.close && server.close();
  process.exit(anyFail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
