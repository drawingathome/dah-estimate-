// N-233: 발주서를 열어 직접 고친 내용이 '닫기'만 눌러도 저장되고(견적서 되돌려 쓰기 칸은 견적서 저장까지), 다시 열면 복원되는지(가짜 서버, 운영 확인 아님)
//  1) 고친 칸(공간·사이즈·수량·비고 등)이 닫기만 해도 order_status.orderSnap.docEdits에 저장됨
//  2) 다시 열면 그 칸이 복원됨(견적이 그대로인 칸만 자동, 견적이 바뀐 칸은 자동 적용 안 함+불러오기 안내)
//  3) 견적서로 되돌려 쓰는 칸(원단 마수·코드 등)을 고친 뒤 닫으면 견적서 저장(saveEstimate)도 실행됨
//  4) 안 고치고 닫으면 서버에 아무것도 쓰지 않음
//  5) 서버가 응답하지 않아도 발주서는 열림
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };
let fail = 0; const ok = (l, c, d) => { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; };
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 170000);
(async () => {
  const port = 28703; const server = await startServer(path.resolve(__dirname, '..'), port); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  let db = { order_status: {}, updated_at: 'T0' }; let hang = false; let patches = 0;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/rest/v1/app_settings')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[{"value":{}}]' }); return; }
      if (url.includes('/auth/v1/token')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ access_token: 'fake', refresh_token: 'fake', expires_in: 3600, token_type: 'bearer' }) }); return; }
      if (url.includes('/rest/v1/customers') && req.method() === 'GET' && url.includes('select=order_status')) {
        if (hang) return;
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ order_status: db.order_status, updated_at: db.updated_at }]) }); return;
      }
      if (url.includes('/rest/v1/customers') && req.method() === 'PATCH') {
        patches++; const body = JSON.parse(req.postData() || '{}');
        if (body.order_status) { db.order_status = body.order_status; db.updated_at = 'T' + patches; }
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 374, order_status: db.order_status, updated_at: db.updated_at }]) }); return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return;
    }
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700)); await setupValidSession(page); await new Promise(r => setTimeout(r, 500));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await page.evaluate(() => {
    window._estEditState = window._estEditState || {}; window._estEditState.estSaveCustomerId = 374;
    window._saveCalls = 0; window.saveEstimate = function () { window._saveCalls++; };
    document.getElementById('c-name').value = '권재호'; document.getElementById('c-phone').value = '010-8914-1991';
    document.getElementById('c-addr').value = '서울 강남구 도산대로85길 52'; document.getElementById('c-region').value = '서울';
    document.getElementById('c-measure').value = '2026-12-02'; document.getElementById('c-install').value = '2026-12-10';
    var tr = document.querySelector('.row-curtain'); tr.querySelector('.space-inp').value = '안방';
    tr.querySelector('.mw').value = 200; calcCurtainRow(tr.querySelector('.mw')); tr.querySelector('.mh').value = 240; calcCurtainRow(tr.querySelector('.mh'));
    tr.querySelector('.cprice').value = 50000; calcCurtainRow(tr.querySelector('.cprice'));
    var f = tr.querySelector('.c-fabric'); if (f) f.value = 'AB-1001'; var v = tr.querySelector('.c-vendor'); if (v) v.value = '한솔';
    var y = tr.querySelector('.c-yardage'); if (y) y.value = '10마'; var rv = tr.querySelector('.c-rail-vendor'); if (rv) rv.value = '목성'; var dep = document.getElementById('deposit-input'); if (dep) { dep.value = '100000'; dep.dataset.depositSource = 'real'; }
  });
  const open = () => page.evaluate(() => printForVendor());
  const closePv = () => page.evaluate(() => { var o = document.getElementById('pv-overlay'); var b = o && Array.from(o.querySelectorAll('button')).find(x => /닫기/.test(x.textContent)); b && b.click(); });
  const cells = () => page.evaluate(() => Array.from(document.querySelectorAll('#pv-overlay [data-vendor] [contenteditable="true"]')).map(e => e.innerText.trim()));

  // 4) 안 고치고 닫기
  await open(); await wait(1500);
  const c0 = await cells(); ok('0. 발주서가 열리고 고칠 수 있는 칸이 있음', c0.length > 3, JSON.stringify(c0).slice(0, 200));
  await closePv(); await wait(1200);
  ok('4. 안 고치고 닫으면 서버에 아무것도 쓰지 않음', patches === 0, String(patches));

  // 1) 고치고 닫기: 비고 칸 + 첫 번째로 데이터 표시(data-ed) 없는 칸(공간 등)
  await open(); await wait(1500);
  const info = await page.evaluate(() => {
    var list = Array.from(document.querySelectorAll('#pv-overlay [data-vendor] [contenteditable="true"]'));
    var plain = list.findIndex(e => !e.hasAttribute('data-ed') && /안방/.test(e.innerText));
    var note = list.findIndex(e => e.classList.contains('pv-vendor-note-editable'));
    if (plain >= 0) list[plain].innerText = '안방(고침XYZ)';
    if (note >= 0) { list[note].innerText = '발주비고ABC 현관 비밀번호'; }
    return { plain: plain, note: note, n: list.length };
  });
  ok('1-0. 고칠 칸(공간, 비고)을 찾음', info.plain >= 0 && info.note >= 0, JSON.stringify(info));
  await closePv(); await wait(1800);
  const de = db.order_status.orderSnap && db.order_status.orderSnap.docEdits;
  ok('1. 닫기만 눌러도 고친 칸이 서버(orderSnap.docEdits)에 저장됨', !!de && JSON.stringify(de).includes('고침XYZ') && JSON.stringify(de).includes('발주비고ABC'), JSON.stringify(db.order_status).slice(0, 300));

  // 2) 다시 열면 복원
  await open(); await wait(2000);
  const c1 = await cells();
  ok('2a. 다시 열면 고친 공간 칸이 복원됨', c1.some(t => /고침XYZ/.test(t)), JSON.stringify(c1).slice(0, 200));
  ok('2b. 다시 열면 비고도 복원됨', c1.some(t => /발주비고ABC/.test(t)), JSON.stringify(c1).slice(0, 200));
  await closePv(); await wait(1000);

  // 2c) 견적이 바뀐 칸은 자동 적용하지 않음 + 안내
  await page.evaluate(() => { document.querySelector('.row-curtain .space-inp').value = '거실로변경'; });
  await open(); await wait(2000);
  const c2 = await cells(); const ovText = await page.evaluate(() => (document.getElementById('pv-overlay') || {}).innerText || '');
  ok('2c. 견적에서 바뀐 칸은 옛 고친 내용으로 덮지 않음', c2.some(t => /거실로변경/.test(t)) && !c2.some(t => /안방\(고침XYZ\)/.test(t)), JSON.stringify(c2).slice(0, 200));
  ok('2d. "이전에 고친 내용 불러오기" 안내가 보임', /이전에 고친 내용/.test(ovText), ovText.slice(0, 150));
  await closePv(); await wait(800);
  await page.evaluate(() => { document.querySelector('.row-curtain .space-inp').value = '안방'; });

  // 3) 견적서로 되돌려 쓰는 칸 고치고 닫기 → saveEstimate
  await open(); await wait(1800);
  await page.evaluate(() => { var td = document.querySelector('#pv-overlay td[data-ed="fqty"]') || document.querySelector('#pv-overlay td[data-ed="qty"]'); if (td) { td.textContent = '12마'; td.dispatchEvent(new Event('focusout', { bubbles: true })); } });
  const before = await page.evaluate(() => window._saveCalls);
  await closePv(); await wait(1500);
  const after = await page.evaluate(() => window._saveCalls);
  ok('3. 견적서로 되돌려 쓰는 칸을 고친 뒤 닫으면 견적서 저장도 실행됨', after === before + 1, JSON.stringify({ before, after }));

  // 7·8) N-236①: '발주완료 표시'·'인쇄 / PDF 저장' 버튼 경로에서도 고친 칸이 저장됨
  async function editThenClick(label, mark) {
    db.order_status = {}; db.updated_at = 'Tx'; await open(); await wait(1600);
    await page.evaluate((mark) => {
      window.print = function () {}; window.open = function () { return null; }; window.__toast = []; window.showToast = function (m) { window.__toast.push(m); };
      var list = Array.from(document.querySelectorAll('#pv-overlay [data-vendor] [contenteditable="true"]'));
      var plain = list.find(e => !e.hasAttribute('data-ed') && /안방/.test(e.innerText)); if (plain) plain.innerText = mark;
    }, mark);
    await page.evaluate((label) => { var o = document.getElementById('pv-overlay'); var b = Array.from(o.querySelectorAll('button')).find(x => x.textContent.indexOf(label) >= 0); b && b.click(); }, label);
    await wait(2200);
    const saved = JSON.stringify((db.order_status.orderSnap || {}).docEdits || {}).includes(mark);
    if (!saved) console.log('   (진단) toast=', JSON.stringify(await page.evaluate(() => window.__toast)).slice(0, 300), 'db=', JSON.stringify(db.order_status).slice(0, 200));
    await closePv(); await wait(800); return saved;
  }
  ok('7. "발주완료 표시"를 눌러도 고친 칸이 orderSnap.docEdits에 저장됨', await editThenClick('발주완료', '안방(완료고침QQ)'));
  ok('8. "인쇄 / PDF 저장"을 눌러도 고친 칸이 orderSnap.docEdits에 저장됨', await editThenClick('인쇄', '안방(인쇄고침WW)'));

  // 5) 서버 무응답
  hang = true; await open(); await wait(9000);
  const c5 = await cells(); ok('5. 서버가 응답하지 않아도 발주서가 열림', c5.length > 3, JSON.stringify(c5).slice(0, 100));
  ok('6. 화면 오류 없음', errs.length === 0, errs.join(';'));
  await browser.close(); server.close && server.close();
  console.log(fail ? '❌ 실패 ' + fail + '건' : '✅ 모두 통과'); process.exit(fail ? 1 : 0);
})();
