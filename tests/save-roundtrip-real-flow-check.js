// tests/save-roundtrip-real-flow-check.js
// 2026-10-21(W2 1단계 보완 — "전문업체 기준": 가짜 함수 호출이 아니라 실제 화면 흐름으로 확인):
// 견적서를 실제로 저장(POST) → 그 서버 행으로 실제 열기 경로(loadEstDbId&mode=edit) → 저장을 눌러 서버로 나가는 실제 요청을 확인.
//  A) 아무것도 안 바꾸고 저장 → PATCH에 금액·고객명·중복방지 키 외 칸이 없음(메모/주소/날짜/품목을 빈 값으로 덮지 않음)
//  B) 메모 하나만 바꿔 저장 → PATCH에 memo가 있고 install_date·line_items 등은 없음
//  C) 저장 실패(서버 500) → 재시도 큐에 전체 내용 + 열었을 때의 행이 보관되고, 재시도 요청은 바꾼 칸만 보냄
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const H = { 'Access-Control-Allow-Origin': '*' };
const J = (req, status, body) => req.respond({ status, contentType: 'application/json', headers: H, body: JSON.stringify(body) });

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 28640;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  const captured = [];
  let serverRow = null, failPatch = false;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url(), method = req.method();
    if (!url.includes('supabase.co')) { if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort(); return; }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
    if (url.includes('/rest/v1/app_settings')) { J(req, 200, [{ value: {} }]); return; }
    if (url.includes('/auth/v1/token')) { J(req, 200, { access_token: 'fake', refresh_token: 'fake', expires_in: 3600, token_type: 'bearer' }); return; }
    if (method === 'GET' && url.includes('/rest/v1/estimates') && url.includes('id=eq.srv-est-1')) { J(req, 200, serverRow ? [serverRow] : []); return; }
    if (method === 'GET' && url.includes('/rest/v1/estimates') && url.includes('select=id,price,performance_revenue')) { J(req, 200, []); return; }
    if (method === 'GET' && url.includes('/rest/v1/estimates') && url.includes('updated_at=gte')) { J(req, 200, []); return; }
    if (method === 'GET' && url.includes('/rest/v1/customers') && url.includes('id=eq.221')) { J(req, 200, [{ id: 221, client_name: '왕복시험', phone: '01000007777', addr: '서울 서초구 반포대로 1 101동 202호', addr_detail: '101동 202호', staff_name: '마스터' }]); return; }
    if (method === 'PATCH' && url.includes('/rest/v1/customers')) { captured.push({ type: 'PATCH-customer', body }); J(req, 200, [{ id: 221, updated_at: new Date().toISOString() }]); return; }
    if (method === 'POST' && url.includes('/rest/v1/customers')) { J(req, 201, [{ id: 221, updated_at: new Date().toISOString() }]); return; }
    if (method === 'POST' && url.includes('/rest/v1/estimates')) {
      serverRow = Object.assign({}, body, { id: 'srv-est-1', updated_at: '2026-10-21T01:00:00.000Z', created_at: '2026-10-21T01:00:00' });
      captured.push({ type: 'POST-estimate', body }); J(req, 201, [serverRow]); return;
    }
    if (method === 'PATCH' && url.includes('/rest/v1/estimates')) {
      captured.push({ type: 'PATCH-estimate', url, body });
      if (failPatch) { req.respond({ status: 500, contentType: 'application/json', headers: H, body: '{"message":"boom"}' }); return; }
      serverRow = Object.assign({}, serverRow, body, { updated_at: new Date().toISOString() });
      J(req, 200, [serverRow]); return;
    }
    J(req, 200, []);
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 500));
  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (cond ? '' : ' — ' + (detail !== undefined ? detail : ''))); }

  // 1) 실제 저장(신규 POST)으로 서버 행을 만든다
  await page.evaluate(() => {
    window._estEditState = window._estEditState || {}; window._estEditState.estSaveCustomerId = 221;
    localStorage.setItem('dah_customers', JSON.stringify([{ id: 221, clientName: '왕복시험', phone: '01000007777', stage: '상담', price: 0 }]));
    document.getElementById('c-name').value = '왕복시험';
    document.getElementById('c-phone').value = '01000007777';
    document.getElementById('c-addr').value = '서울 서초구 반포대로 1';
    document.getElementById('c-addr2').value = '101동 202호';
    document.getElementById('c-measure').value = '2026-10-25';
    document.getElementById('c-install').value = '2026-11-02';
    document.getElementById('c-memo') && (document.getElementById('c-memo').value = '현관 비번 1234');
    var tr = document.querySelector('.row-curtain');
    tr.querySelector('.space-inp').value = '거실';
    tr.querySelector('.mw').value = 100; calcCurtainRow(tr.querySelector('.mw'));
    tr.querySelector('.mh').value = 100; calcCurtainRow(tr.querySelector('.mh'));
    tr.querySelector('.cprice').value = 10000; calcCurtainRow(tr.querySelector('.cprice'));
    // 수동으로 추가하고 단가를 직접 친 시공 줄(윤세현 실데이터 모양: autoType 없음 + override=true)
    addSvcRow();
    var str = document.querySelector('#svc-body tr:last-child');
    str.querySelector('.svc-kind').value = '전동';
    str.querySelector('.svc-content').value = '리모콘 수동 추가';
    var sp = str.querySelector('.sprice'); sp.setAttribute('data-raw', '150000'); sp.value = '150000';
    if (typeof markSvcManualOverride === 'function') markSvcManualOverride(sp);
    if (typeof calcSvcRow === 'function') calcSvcRow(sp);
    saveEstimate();
  });
  await new Promise(r => setTimeout(r, 1500));
  ok('0-1. 준비: 수동 줄이 override=true로 저장됨', !!serverRow && (serverRow.line_items || []).some(function (x) { return x.type === 'svc' && x.content === '리모콘 수동 추가' && x.override === true && !x.autoType; }), JSON.stringify((serverRow && serverRow.line_items || []).filter(function (x) { return x.type === 'svc'; }).map(function (x) { return [x.content, x.autoType, x.override]; })));
  ok('0. 준비: 서버 행이 실제 저장으로 만들어짐', !!serverRow && serverRow.install_date === '2026-11-02', JSON.stringify(serverRow && serverRow.install_date));

  // 2) 실제 열기 경로로 다시 연다
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=srv-est-1&mode=edit`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2500));
  const opened = await page.evaluate(() => ({ id: window._estLoadedRow && window._estLoadedRow.id, edit: window._estEditState && window._estEditState.editingEstDbId, name: document.getElementById('c-name').value }));
  ok('0-2. 준비: 실제 열기 경로로 열림(수정 모드)', opened.id === 'srv-est-1' && opened.edit === 'srv-est-1', JSON.stringify(opened));

  // A) 안 바꾸고 저장
  captured.length = 0;
  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 1500));
  const pA = captured.filter(c => c.type === 'PATCH-estimate');
  ok('A-1. 안 바꾸고 저장하면 PATCH가 1번 나감', pA.length === 1, pA.length);
  if (pA.length) {
    const keys = Object.keys(pA[0].body).sort();
    const allowed = ['client_idempotency_key', 'customer_name', 'performance_revenue', 'price'];
    const extra = keys.filter(k => !allowed.includes(k));
    ok('A-2. [핵심] 허용된 칸(금액·고객명·중복방지 키) 외에 다른 칸이 서버로 안 나감', extra.length === 0, '추가로 나간 칸: ' + extra.join(','));
    ok('A-3. 금액이 열었을 때와 같음', Number(pA[0].body.price) === Number(serverRow.price), pA[0].body.price + ' vs ' + serverRow.price);
  }

  // B) 메모 하나만 바꿔 저장
  captured.length = 0;
  const memoId = await page.evaluate(() => { var el = document.getElementById('c-memo'); if (!el) return null; el.value = '현관 비번 바뀜 9999'; return el.id; });
  if (memoId) {
    await page.evaluate(() => { saveEstimate(); });
    await new Promise(r => setTimeout(r, 1500));
    const pB = captured.filter(c => c.type === 'PATCH-estimate');
    ok('B-1. 메모만 바꿔 저장하면 PATCH에 memo가 있음', pB.length === 1 && pB[0].body.memo === '현관 비번 바뀜 9999', JSON.stringify(pB[0] && pB[0].body.memo));
    ok('B-2. 안 바꾼 칸(install_date, line_items, date)은 안 나감', pB.length === 1 && !('install_date' in pB[0].body) && !('line_items' in pB[0].body) && !('date' in pB[0].body), pB[0] && Object.keys(pB[0].body).join(','));

    // B-3) 같은 화면에서 한 번 더: 메모를 원래 값으로 되돌려 저장 → 되돌린 값이 실제로 나가야 함(기준 갱신 확인)
    captured.length = 0;
    await page.evaluate(() => { document.getElementById('c-memo').value = '현관 비번 1234'; saveEstimate(); });
    await new Promise(r => setTimeout(r, 1500));
    const pB3 = captured.filter(c => c.type === 'PATCH-estimate');
    ok('B-3. [핵심] 바꿨다가 원래 값으로 되돌려 저장해도 되돌린 값이 서버로 나감(기준 행 갱신)', pB3.length === 1 && pB3[0].body.memo === '현관 비번 1234', JSON.stringify(pB3[0] && pB3[0].body.memo));
  } else {
    ok('B. 메모 칸(c-memo)을 찾음', false, '메모 칸 없음');
  }

  // C) 저장 실패 → 재시도 큐
  captured.length = 0; failPatch = true;
  await page.evaluate(() => { document.getElementById('c-memo').value = '실패 시험 메모'; saveEstimate(); });
  await new Promise(r => setTimeout(r, 1800));
  const q = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_pending_estimate_sync') || '[]'));
  ok('C-1. 저장 실패 시 재시도 큐에 쌓임', q.length >= 1, q.length);
  if (q.length) {
    const it = q[q.length - 1];
    ok('C-2. 큐 보관본은 전체 내용(memo, install_date, line_items 포함 — 아무것도 안 잃음)', it.payload && 'memo' in it.payload && 'install_date' in it.payload && 'line_items' in it.payload, it.payload && Object.keys(it.payload).join(','));
    ok('C-3. 큐에 열었을 때의 서버 행(baseRow)이 같이 보관됨', !!(it.baseRow && it.baseRow.id === 'srv-est-1'), JSON.stringify(it.baseRow && it.baseRow.id));
    failPatch = false; captured.length = 0;
    await page.evaluate(() => { window._estRetrySyncInProgress = false; _doRetryEstPendingSync(getEstPendingQueue()); });
    await new Promise(r => setTimeout(r, 1500));
    const pC = captured.filter(c => c.type === 'PATCH-estimate');
    ok('C-4. [핵심] 재시도 요청도 바꾼 칸만 나감(install_date·line_items 없음, memo 있음)', pC.length >= 1 && pC[0].body.memo === '실패 시험 메모' && !('install_date' in pC[0].body) && !('line_items' in pC[0].body), pC[0] && Object.keys(pC[0].body).join(','));
  }

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');
  await browser.close(); server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
