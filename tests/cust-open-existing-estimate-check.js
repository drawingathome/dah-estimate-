// N-211 (2026-11-24, 강미진 사례): 고객 불러오기 주소(loadCustId)로 열었는데 그 고객에게 이미 견적이 있으면
// '이어서 수정'(editingEstDbId 세팅 → 저장이 PATCH)으로 열려야 한다. 옛 코드: 번호 없이 열려 저장이 새 견적(POST)을 하나 더 만듦.
// 대조군: 견적이 없는 고객은 그대로 신규(번호 없음). 한계: 가짜 서버 시험이며 운영 화면 확인이 아님.
const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession } = require('./_helpers');
const H = { 'Access-Control-Allow-Origin': '*' };
const EST = { 'ce-1': { id: 'ce-1', client_id: 781, customer_name: '시험기존견적', phone: '01090002001', price: 997500, deposit_amount: 0, balance_amount: 0, line_items: [], estimate_status: 'ga', is_archived: false, created_at: '2026-11-23T07:25:00Z', updated_at: '2026-11-23T07:36:00Z' } };
const CUST = {
  781: { id: 781, client_name: '시험기존견적', phone: '01090002001', addr: '서울 서초구', deposit_amount: 0, measure_date: null, install_date: null },
  782: { id: 782, client_name: '시험견적없음', phone: '01090002002', addr: '서울 서초구', deposit_amount: 0, measure_date: null, install_date: null },
};
async function run() {
  const port = 9958; const server = await startServer(path.resolve(__dirname, '..'), port); const browser = await launchBrowser();
  const page = await browser.newPage(); const jsErrors = []; const writes = [];
  page.on('pageerror', e => jsErrors.push(e.message)); page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } });
      if (req.method() !== 'GET' && url.includes('/estimates')) writes.push(req.method());
      let m = url.match(/\/estimates\?id=eq\.([^&]+)/);
      if (m && EST[decodeURIComponent(m[1])]) return req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([EST[decodeURIComponent(m[1])]]) });
      m = url.match(/\/estimates\?client_id=eq\.(\d+)/);
      if (m) { const rows = Object.values(EST).filter(e => e.client_id === Number(m[1])); return req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(rows) }); }
      m = url.match(/\/customers\?id=eq\.(\d+)/);
      if (m && CUST[Number(m[1])]) return req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([CUST[Number(m[1])]]) });
      return req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' });
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
  });
  await page.setViewport({ width: 1280, height: 1400 });
  const log = []; const ok = (l, c, d) => log.push((c ? '✅' : '❌') + ' ' + l + (d !== undefined ? ' — ' + d : ''));
  async function open(query) {
    await page.goto(`http://localhost:${port}/dah-estimate.html?${query}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500)); await loginAs(page, 'master'); await setupValidSession(page);
    await new Promise(r => setTimeout(r, 6000));
    return page.evaluate(() => ({ id: window._estEditState && window._estEditState.editingEstDbId, url: location.search }));
  }
  const a = await open('loadCustId=781');
  ok('1. [핵심] 견적이 이미 있는 고객을 loadCustId로 열면 기존 견적 번호(ce-1)를 잡음(저장=수정)', a.id === 'ce-1', JSON.stringify(a));
  ok('2. 주소가 이어서 수정(loadEstDbId, mode=edit)로 바뀜', /loadEstDbId=ce-1/.test(a.url) && /mode=edit/.test(a.url), a.url);
  const b = await open('loadCustId=782');
  ok('3. 대조군: 견적이 없는 고객은 신규로 열림(견적 번호 없음, 주소 유지)', !b.id && /loadCustId=782/.test(b.url), JSON.stringify(b));
  console.log(log.join('\n')); console.log('JS 에러:', jsErrors.length ? jsErrors.slice(0, 3).join(' | ') : '없음');
  await browser.close(); server.close();
  const fail = log.filter(l => l.startsWith('❌')).length; if (fail) { console.log('\n❌ ' + fail + '개 실패'); process.exit(1); } console.log('\n✅ 모든 항목 통과');
}
run().catch(e => { console.error(e); process.exit(1); });
