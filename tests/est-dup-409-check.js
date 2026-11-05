// tests/est-dup-409-check.js
// N-128(2026-11-06): DB가 '같은 번호+같은 이름의 진행 중 고객' 새 등록을 거절(409)할 때 견적서 앱이
//  A) 내가 볼 수 있는 기존 고객이면 새로 만들지 않고(POST 1번뿐) 그 고객에 이어서 저장(PATCH)하고 견적서도 그 고객 번호로 저장
//  B) 못 찾으면(다른 담당자 고객) 같은 요청을 되풀이하지 않고(POST 1번뿐) 안내 후 멈춤(무한 재시도 없음)
// 한계: 가짜 서버 시험이며, 실제 DB 잠금은 아직 운영에 적용 전.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const H = { 'Access-Control-Allow-Origin': '*' };
const J = (req, status, body) => req.respond({ status, contentType: 'application/json', headers: H, body: JSON.stringify(body) });
let fail = 0; const ok = (l, c, d) => { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; };
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 90000);
(async () => {
  const dir = path.resolve(__dirname, '..'); const port = 28677;
  const server = await startServer(dir, port); const browser = await launchBrowser();
  async function scenario(visibleRows) {
    const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    const cap = { postCust: 0, patchCust: 0, getCust: 0, postEst: [] };
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url(), method = req.method();
      if (!url.includes('supabase.co')) { if (url.startsWith('http://localhost')) req.continue(); else req.abort(); return; }
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
      if (url.includes('/rest/v1/app_settings')) { J(req, 200, [{ value: {} }]); return; }
      if (url.includes('/auth/v1/token')) { J(req, 200, { access_token: 'fake', refresh_token: 'fake', expires_in: 3600, token_type: 'bearer' }); return; }
      if (method === 'POST' && url.includes('/rest/v1/customers')) { cap.postCust++; J(req, 409, { code: '23505', message: 'duplicate key value violates unique constraint "customers_active_phone_name_uniq"' }); return; }
      if (method === 'PATCH' && url.includes('/rest/v1/customers')) { cap.patchCust++; J(req, 200, [{ id: 555, updated_at: new Date().toISOString() }]); return; }
      if (method === 'GET' && url.includes('/rest/v1/customers') && url.includes('client_name=eq.')) { cap.getCust++; J(req, 200, visibleRows); return; }
      if (method === 'POST' && url.includes('/rest/v1/estimates')) { cap.postEst.push(body); J(req, 201, [Object.assign({}, body, { id: 'srv-est-9', updated_at: new Date().toISOString(), created_at: new Date().toISOString() })]); return; }
      J(req, 200, []);
    });
    await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700)); await setupValidSession(page); await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => {
      window._estEditState = window._estEditState || {}; window._estEditState.estSaveCustomerId = null;
      localStorage.setItem('dah_customers', '[]');
      document.getElementById('c-name').value = '김태연'; document.getElementById('c-phone').value = '010-7502-7924';
      var tr = document.querySelector('.row-curtain'); tr.querySelector('.space-inp').value = '거실';
      tr.querySelector('.mw').value = 100; calcCurtainRow(tr.querySelector('.mw')); tr.querySelector('.mh').value = 100; calcCurtainRow(tr.querySelector('.mh'));
      tr.querySelector('.cprice').value = 10000; calcCurtainRow(tr.querySelector('.cprice'));
      saveEstimate();
    });
    await new Promise(r => setTimeout(r, 3000));
    const st = await page.evaluate(() => ({ custId: window._estEditState && window._estEditState.estSaveCustomerId }));
    await page.close(); return { cap, st, errs };
  }
  let r = await scenario([{ id: 555, client_name: '김태연', phone: '01075027924', stage: '상담' }]);
  ok('A. 새 고객 등록(POST)은 한 번만 시도됨', r.cap.postCust === 1, JSON.stringify(r.cap));
  ok('A. 기존 고객을 찾아 그 고객에 이어서 저장(PATCH 1번)', r.cap.patchCust === 1, JSON.stringify(r.cap));
  ok('A. 견적서가 기존 고객 번호(555)로 저장됨', r.cap.postEst.length >= 1 && String(r.cap.postEst[0].client_id) === '555', JSON.stringify(r.cap.postEst.map(x => x && x.client_id)));
  ok('A. 화면 오류(JS) 없음', r.errs.length === 0, r.errs.join(';'));
  r = await scenario([]);
  ok('B. 못 찾아도 새 고객 등록 요청을 되풀이하지 않음(POST 1번)', r.cap.postCust === 1, JSON.stringify(r.cap));
  ok('B. 찾기(GET)는 한 번만', r.cap.getCust === 1, JSON.stringify(r.cap));
  ok('B. 다른 고객에 덮어쓰기(PATCH) 없음', r.cap.patchCust === 0, JSON.stringify(r.cap));
  ok('B. 화면 오류(JS) 없음', r.errs.length === 0, r.errs.join(';'));
  r = await scenario([{ id: 777, client_name: '김태연', phone: '01075027924', stage: '시공완료' }]);
  ok('C. 시공완료 고객만 보이면 그 고객에 덮어쓰지 않음(재구매는 새 건)', r.cap.patchCust === 0 && r.cap.postCust === 1, JSON.stringify(r.cap));
  await browser.close(); server.close && server.close();
  console.log(fail ? '❌ 실패 ' + fail + '건' : '✅ 모두 통과'); process.exit(fail ? 1 : 0);
})();
