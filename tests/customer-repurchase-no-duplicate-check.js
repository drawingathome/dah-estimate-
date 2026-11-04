// tests/customer-repurchase-no-duplicate-check.js
// 2026-11-04(선혜님 - 임현정이 마스터/오지은 둘로 등록됨): "이미 있는 고객, 재구매로 업데이트할까요?"에서 '예'를 눌러도
// 기존 고객을 고치지 않고 새 행을 또 만들던 버그 방지.
//  A) 내 화면에 이미 있는 고객 → 새 행(POST) 없이 기존 행(id 유지)을 갱신, 돈/단계 유지, 방문횟수 +1
//  B) 서버에만 있는 고객(다른 담당자 것) → 새 행을 만들지 않고 안내 메시지
const { launchBrowser, startServer, loginAs } = require('./_helpers');
const path = require('path');
const CORS = { 'Access-Control-Allow-Origin': '*' };
const json = (o) => JSON.stringify(o);

async function scenario(name, idx, serverDup, noId, rpcFail) {
  const dir = path.resolve(__dirname, '..');
  const port = 30700 + idx;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const rec = { reqs: [], dialogs: [], errs: [] };
  page.on('pageerror', e => rec.errs.push(e.message));
  page.on('dialog', async d => { rec.dialogs.push(d.message()); try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url(); const method = req.method();
    if (!url.includes('supabase.co')) { if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort(); return; }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
    const p = new URL(url).pathname + new URL(url).search;
    if (p.includes('/rest/v1/app_settings')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return; }
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
    if (p.includes('rpc/check_phone_duplicate') && rpcFail) { req.respond({ status: 500, contentType: 'application/json', headers: CORS, body: json({ message: 'boom' }) }); return; }
    if (p.includes('rpc/check_phone_duplicate')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: json([{ exists_flag: !!serverDup, staff_name: '마스터' }]) }); return; }
    if (p.includes('/rest/v1/customers')) { rec.reqs.push({ method, p, body }); req.respond({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', headers: CORS, body: json([{ id: 777, ...(body || {}) }]) }); return; }
    req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
  });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  await page.evaluate((withLocal, noId) => {
    localStorage.setItem('dah_settings', JSON.stringify({ account: '123-456-789', holder: '선혜' }));
    saveCustomers(withLocal ? [{ id: noId ? undefined : 701, memo: '기존메모', date: '2026-10-01', clientName: '재구매고객', phone: '010-5555-6666', stage: '시공완료', staffName: '마스터', price: 1000000, performanceRevenue: 800000, depositAmount: 500000, balanceAmount: 500000, visitCount: 1 }] : []);
  }, !serverDup, noId);
  const setNative = (id, v) => page.evaluate((id, v) => { const el = document.getElementById(id); const proto = window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }, id, v);
  await page.evaluate(() => openAdd());
  await new Promise(r => setTimeout(r, 250));
  await setNative('add-name', '재구매고객');
  await setNative('add-phone', '01055556666');
  await page.click('#add-save-btn');
  await new Promise(r => setTimeout(r, 800));
  const state = await page.evaluate(() => loadCustomers().filter(c => (c.phone || '').replace(/\D/g, '') === '01055556666').map(c => ({ id: c.id, price: c.price, stage: c.stage, visitCount: c.visitCount, deposit: c.depositAmount, memo: c.memo, date: c.date })));
  await browser.close(); server.kill();
  return { rec, state };
}

(async () => {
  const log = []; const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (d !== undefined && !c ? ' — ' + JSON.stringify(d) : ''));
  const A = await scenario('A', 1, false);
  const posts = A.rec.reqs.filter(r => r.method === 'POST');
  ok('A1. 재구매 확인 후 새 행(POST)이 만들어지지 않음', posts.length === 0, A.rec.reqs);
  ok('A2. 내 화면에 같은 전화번호 고객이 1명뿐', A.state.length === 1, A.state);
  ok('A3. 기존 고객 id(701)와 금액·단계가 그대로', A.state[0] && A.state[0].id === 701 && A.state[0].price === 1000000 && A.state[0].stage === '시공완료' && A.state[0].deposit === 500000, A.state);
  ok('A4. 방문횟수가 2로 올라감', A.state[0] && A.state[0].visitCount === 2, A.state);
  ok('A5. 기존 행(701) 갱신 요청(PATCH)이 나감', A.rec.reqs.some(r => r.method === 'PATCH' && /701/.test(r.p)), A.rec.reqs);
  ok('A6. 화면 오류 없음', A.rec.errs.length === 0, A.rec.errs);
  ok('A7. 기존 메모는 유지(이어 붙임), 기존 상담일은 덮어쓰지 않음', A.state[0] && String(A.state[0].memo).indexOf('기존메모') !== -1 && A.state[0].date === '2026-10-01', A.state);
  const C = await scenario('C', 3, false, true);
  ok('C1. 서버에 안 올라간(id 없는) 같은 사람 행이 있어도 내 화면에 1명만 남음', C.state.length === 1, C.state);
  const D = await scenario('D', 4, false, false, true);
  ok('D1. 중복 확인이 서버 오류로 실패하면 사용자에게 확인을 물음(조용히 등록 안 함)', D.rec.dialogs.some(d => d.indexOf('확인하지 못했어요') !== -1), D.rec.dialogs);
  const B = await scenario('B', 2, true);
  ok('B1. 서버에만 있는 고객(다른 담당자)이면 새 행(POST)을 만들지 않음', B.rec.reqs.filter(r => r.method === 'POST').length === 0, B.rec.reqs);
  ok('B2. 내 화면에도 새로 생기지 않음', B.state.length === 0, B.state);
  ok('B3. 이유 안내 메시지가 뜸', B.rec.dialogs.some(d => d.indexOf('담당') !== -1 && d.indexOf('이미') !== -1), B.rec.dialogs);
  ok('B4. 화면 오류 없음', B.rec.errs.length === 0, B.rec.errs);
  log.forEach(l => console.log(l));
  const f = log.filter(l => l.startsWith('❌')).length;
  console.log(f === 0 ? '\n전체 통과' : '\n실패 ' + f + '건');
  process.exit(f === 0 ? 0 : 1);
})();
