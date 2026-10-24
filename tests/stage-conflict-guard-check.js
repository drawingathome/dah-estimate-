// 2026-10-24: 단계 저장 충돌 방지 시험. 오래된 기기가 서버의 새 단계를 옛 단계로 덮어쓰지 않는지 확인한다.
// (1) 단계 PATCH에 "서버 단계가 내가 본 단계일 때만" 조건(stage=eq.)이 붙는다
// (2) 서버가 0건 반영(= 그 사이 단계가 바뀜)이면 서버 단계를 읽어 화면을 맞추고 덮어쓰지 않으며 안내가 뜬다
// (3) 충돌이 없으면 평소처럼 저장된다
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9884;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let anyFail = false;
  function ok(label, cond, detail) { console.log((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); if (!cond) anyFail = true; }
  async function scenario(mode, call) {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(''); } catch (e) {} });
    const patches = [];
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url(); const H = { 'Access-Control-Allow-Origin': '*' };
      if (url.includes('supabase.co')) {
        if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
        if (req.method() === 'PATCH' && url.includes('/customers')) {
          patches.push({ url, body: req.postData() || '' });
          if (mode === 'conflict') { req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' }); return; }
          req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([{ id: 9, client_name: '충돌테스트', stage: '선금결제', updated_at: '2026-10-24T10:00:00.000Z' }]) });
          return;
        }
        if (req.method() === 'GET' && url.includes('/customers') && url.includes('select=stage')) { req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([{ stage: '실측준비중' }]) }); return; }
        req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' }); return;
      }
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
    });
    await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'networkidle0', timeout: 20000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');
    await new Promise(r => setTimeout(r, 800));
    await page.evaluate(() => { saveCustomers([{ id: 9, clientName: '충돌테스트', staffName: '마스터', stage: '선금결제', price: 1000000, updatedAt: '2026-10-24T09:00:00.000Z', is_archived: false }]); });
    await page.evaluate(call);
    await new Promise(r => setTimeout(r, 1200));
    const local = await page.evaluate(() => loadCustomers().find(x => x.id === 9).stage);
    const toast = await page.evaluate(() => (document.getElementById('toast') || document.body).textContent);
    await page.close();
    return { patches, local, toast };
  }
  for (const [name, fn] of [['상세', async () => { openDetail('충돌테스트', 9); await new Promise(r => setTimeout(r, 600)); changeStage('잔금결제'); }], ['칸반', () => { changeStageByName('충돌테스트', '잔금결제', 9); }]]) {
    let r = await scenario('conflict', fn);
    ok('[' + name + '] 단계 PATCH에 "내가 본 단계일 때만" 조건이 붙음', r.patches.length >= 1 && r.patches[0].url.includes('stage=eq.' + encodeURIComponent('선금결제')), r.patches[0] && r.patches[0].url);
    ok('[' + name + '] 충돌 시 화면 단계를 서버 단계(실측준비중)로 맞춤(내 선택으로 덮어쓰지 않음)', r.local === '실측준비중', r.local);
    ok('[' + name + '] 충돌 안내가 뜸', /이미|덮어쓰지/.test(r.toast), r.toast.slice(-80));
    r = await scenario('normal', fn);
    ok('[' + name + '] 충돌 없으면 평소처럼 저장', r.patches.length === 1 && !/이미/.test(r.toast), r.patches.length + '건');
  }
  await browser.close(); server.close && server.close();
  process.exit(anyFail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
