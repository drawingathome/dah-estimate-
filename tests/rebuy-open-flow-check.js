// N-229: 시공완료 고객의 '견적서' 버튼 → 재구매 새 견적. ①대시보드 openEstimate 분기(함수만 떼어 가짜 환경에서 실행) ②견적서 앱이 ?rebuy=1로 열릴 때 고객 번호·옛 견적을 잡지 않음
const fs = require('fs'); const vm = require('vm'); const path = require('path');
let fail = 0; const ok = (l, c, d) => { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; };
const src = fs.readFileSync(path.resolve(__dirname, '../dash-customer-estimates.js'), 'utf8');
const m = src.match(/function openEstimate\(name, id\) \{[\s\S]*?\n\}\n/);
ok('openEstimate 함수가 있음', !!m);
function runDash(stage, confirmAnswer) {
  const nav = []; let asked = 0, xhrs = 0;
  const ctx = { window: { location: { set href(v) { nav.push(v); } } }, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k',
    currentDetailId: null, getAuthToken: () => 't', getCustomerCurrentStage: () => stage,
    confirm: () => { asked++; return confirmAnswer; }, encodeURIComponent,
    XMLHttpRequest: function () { this.open = () => { xhrs++; }; this.setRequestHeader = () => {}; this.send = () => { this.responseText = '[]'; this.onload && this.onload(); }; },
    showEstimatePickerModal: () => {}, JSON, console };
  ctx.window.location = { _h: '', set href(v) { nav.push(v); } };
  vm.createContext(ctx); vm.runInContext(m ? m[0] : '', ctx);
  ctx.openEstimate('권재호', 53); return { nav, asked, xhrs };
}
if (m) {
  let r = runDash('시공완료', true);
  ok('시공완료+확인 → 재구매 주소(rebuy=1)로 열림', r.nav.length === 1 && /loadCustId=53/.test(r.nav[0]) && /rebuy=1/.test(r.nav[0]), JSON.stringify(r));
  ok('시공완료+확인 → 옛 견적을 수정 모드로 열지 않음', !r.nav.some(u => /loadEstDbId/.test(u)), JSON.stringify(r));
  r = runDash('시공완료', false);
  ok('시공완료+취소 → 확인창은 1번 뜨고 기존 흐름(견적 조회)으로 감', r.asked === 1 && r.xhrs >= 1 && !r.nav.some(u => /rebuy=1/.test(u)), JSON.stringify(r));
  r = runDash('가견적', true);
  ok('진행 중 고객은 확인창 없이 기존 흐름', r.asked === 0 && r.xhrs >= 1, JSON.stringify(r));
}
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 90000);
(async () => {
  const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
  const H = { 'Access-Control-Allow-Origin': '*' }; const J = (req, s, b) => req.respond({ status: s, contentType: 'application/json', headers: H, body: JSON.stringify(b) });
  const port = 28699; const server = await startServer(path.resolve(__dirname, '..'), port); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept().catch(() => {}));
  const cap = { estGets: 0, writes: 0 };
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url(), method = req.method();
    if (!url.includes('supabase.co')) { url.startsWith('http://localhost') ? req.continue() : req.abort(); return; }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
    if (url.includes('/rest/v1/app_settings')) { J(req, 200, [{ value: {} }]); return; }
    if (url.includes('/auth/v1/token')) { J(req, 200, { access_token: 'fake', refresh_token: 'fake', expires_in: 3600, token_type: 'bearer' }); return; }
    if (method === 'GET' && url.includes('/rest/v1/customers') && url.includes('id=eq.53')) { J(req, 200, [{ id: 53, client_name: '권재호', phone: '010-8914-1991', addr: '서울 강남구 도산대로85길 52', addr_detail: '301호', staff_name: '마스터', stage: '시공완료', measure_date: null }]); return; }
    if (method === 'GET' && url.includes('/rest/v1/estimates')) { cap.estGets++; J(req, 200, [{ id: 'old-est', client_id: 53, price: '3735000', is_archived: false, line_items: [] }]); return; }
    if (method !== 'GET') cap.writes++;
    J(req, 200, []);
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadCustId=53&rebuy=1`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700)); await setupValidSession(page);
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadCustId=53&rebuy=1`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3500));
  const st = await page.evaluate(() => ({ name: document.getElementById('c-name').value, phone: document.getElementById('c-phone').value, addr: document.getElementById('c-addr').value,
    id: window._estEditState.estSaveCustomerId || null, est: window._estEditState.editingEstDbId || null, url: location.search }));
  ok('R1. 이름·연락처·주소가 채워짐', st.name === '권재호' && st.phone === '010-8914-1991' && /도산대로/.test(st.addr), JSON.stringify(st));
  ok('R2. 옛 고객 번호(53)를 저장 대상으로 잡지 않음', st.id === null, JSON.stringify(st));
  ok('R3. 옛 견적을 수정 대상으로 잡지 않음·주소가 견적 수정 모드로 바뀌지 않음', st.est === null && !/loadEstDbId/.test(st.url), JSON.stringify(st));
  ok('R4. 화면 오류 없음', errs.length === 0, errs.join(';'));
  await browser.close(); server.close && server.close();
  console.log(fail ? '❌ 실패 ' + fail + '건' : '✅ 모두 통과'); process.exit(fail ? 1 : 0);
})();
