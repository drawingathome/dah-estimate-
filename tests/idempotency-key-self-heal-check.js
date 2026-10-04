#!/usr/bin/env node
// tests/idempotency-key-self-heal-check.js
// ══════════════════════════════════════════════════
// 2026-09-30(선혜님 - "전문업체 기준으로 봤을때 이렇게 하는게 맞아??" 지적으로 발견):
//
// "오늘 이미 저장된 견적 찾기" 안전장치(같은 날 실수로 이중 저장하는 것을 대충 막던 것)를
// 제거하면서, 그 대신 "이미 있다"고 믿었던 client_idempotency_key가 실제로는 대부분의
// 진입 경로(빈 화면으로 새로 열기, mode=edit, mode=copy)에서 아예 안 만들어지고 있었음을
// 뒤늦게 발견 - resetEstEditingState()(키를 만드는 유일한 곳)를 부르는 곳이 "고객 불러오기"
// 와 "새 견적서" 버튼 단 둘뿐이었음.
//
// 진입 경로를 하나씩 찾아 고치는 대신(같은 클래스의 "깜빡함"이 나중에 새 진입경로가 생길
// 때마다 재발할 수 있음), 저장이 실제로 실행되는 한 지점(_saveStage_estimatesActual) 자체가
// "키가 없으면 지금 만들고 세션 내내 재사용"하도록 스스로 보장하게 고침 - 이 기록은 그
// 자기치유가 모든 진입 경로에서 실제로 작동하는지, 그리고 같은 세션의 재시도가 항상 같은
// 키를 재사용하는지 감시함.
//
// 사용법: node tests/idempotency-key-self-heal-check.js dah-estimate.html
// ══════════════════════════════════════════════════
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };

const log = [];
function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

async function checkEntry(dir, urlSuffix, label) {
  const port = 30900 + Math.floor(Math.random() * 400);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  const postedKeys = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      const u = new URL(url);
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (u.pathname.includes('/rest/v1/estimates') && u.searchParams.get('id') === 'eq.orig' && req.method() === 'GET') {
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 'orig', client_id: 501, customer_name: '테스트', phone: '01011112222', line_items: [{ type: 'curtain', price: 100000 }], updated_at: '2026-09-29T00:00:00Z' }]) });
        return;
      }
      if (u.pathname.includes('/rest/v1/customers')) {
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 501, updated_at: new Date().toISOString() }]) });
        return;
      }
      if (u.pathname.includes('/rest/v1/estimates') && (req.method() === 'POST' || req.method() === 'PATCH')) {
        const body = JSON.parse(req.postData() || '{}');
        postedKeys.push(body.client_idempotency_key);
        req.respond({ status: req.method() === 'POST' ? 201 : 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([Object.assign({ id: 'orig' }, body)]) });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html${urlSuffix}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 900));
  await page.evaluate(() => {
    window._estEditState.estSaveCustomerId = 501;
    const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
    if (!document.getElementById('c-name').value) set('c-name', '키테스트');
    if (!document.getElementById('c-phone').value) set('c-phone', '01011112222');
    set('c-addr', '경기 과천시'); set('c-measure', '2026-10-05'); set('c-install', '2026-10-15');
    if (document.querySelectorAll('#curtain-body tr').length === 0) addCurtainRow();
    const tr = document.querySelector('#curtain-body tr');
    const priceEl = tr.querySelector('.cprice'); priceEl.value = '100000'; priceEl.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof fmtPriceBlur === 'function') fmtPriceBlur(priceEl);
    const mw = tr.querySelector('.mw'); mw.value = '200'; mw.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof calcCurtainRow === 'function') calcCurtainRow(mw);
    if (typeof calcTotal === 'function') calcTotal();
  });
  // 같은 세션에서 저장을 두 번(재시도/재저장 흉내) - 매번 버튼 잠금을 풀어줌
  await page.evaluate(() => { saveEstimate(); }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => { var b = document.getElementById('btn-save-estimate'); if (b) b.disabled = false; saveEstimate(); }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));

  const keyInState = await page.evaluate(() => window._estEditState.currentEstIdempotencyKey);
  await browser.close(); server.kill();

  ok('[' + label + '] 저장 실행 후 세션에 idempotency key가 만들어짐', !!keyInState, keyInState || '없음');
  ok('[' + label + '] 실제로 서버에 보낸 요청이 있음', postedKeys.length >= 1, JSON.stringify(postedKeys));
  ok('[' + label + '] 같은 세션의 반복 저장이 항상 같은 키를 재사용함(다른 값이면 중복방지 무력화)', postedKeys.length < 2 || new Set(postedKeys).size === 1, JSON.stringify(postedKeys));
}

async function run() {
  const dir = path.resolve(__dirname, '..');
  await checkEntry(dir, '', '빈 화면(파라미터 없음)');
  await checkEntry(dir, '?loadEstDbId=orig&mode=edit', 'mode=edit(수정)');
  await checkEntry(dir, '?loadEstDbId=orig&mode=copy', 'mode=copy(복사)');

  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n✅ 전체 통과' : '\n❌ ' + failed.length + '건 실패');
  process.exit(failed.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
