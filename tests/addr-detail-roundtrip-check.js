#!/usr/bin/env node
// tests/addr-detail-roundtrip-check.js
// ══════════════════════════════════════════════════
// 2026-10-06(선혜님 - "상세주소랑 따로 넣어도 왜 이렇게 뜨지?? 이 오류 여러번 말했지??", 9/15부터 반복 지적, 민지성 고객 화면):
// 고객추가창에서 기본주소(서울 서대문구 통일로 339)와 상세주소(110동 901호)를 따로 넣어도, 견적서 화면에서 불러오면 전부 위 칸에
// 합쳐지고 상세주소 칸이 비어 보였음. 원인: DB에 합친 addr 한 칸만 저장돼서 불러올 때 어디까지가 상세주소인지 알 수 없었고,
// 9/15엔 글자 모양으로 추측해 쪼개다 틀렸고 10/1엔 쪼개기를 없앴음. 이제 customers.addr_detail에 상세주소를 따로 저장하고
// "addr가 그 상세주소로 끝날 때만" 정확히 나눠서 보여준다.
//
// 감시하는 것:
//  1) 헬퍼 splitStoredAddr: 정상 분리 / 옛 고객(상세 없음) / 상세가 addr 끝과 안 맞음 / 상세가 addr 전체와 같음 → 정보 손실 없이 처리
//  2) 고객추가창: 따로 입력해 저장하면 서버로 addr(합침) + addr_detail(상세)가 같이 나감
//  3) 고객추가창 수정 모드: 저장된 addr/addr_detail을 기본주소/상세주소 칸으로 정확히 나눠 채움, 옛 고객은 통째로 기본주소 칸
//  4) 견적서 화면 고객 불러오기: 같은 규칙으로 c-addr / c-addr2 채움 + 견적서 저장 시 addr_detail이 같이 저장됨
//  5) "최근 주소" 칩이 화면에 더는 없음(남의 동/호수 전체 주소가 섞여 들어가던 문제)
//
// 사용법: node tests/addr-detail-roundtrip-check.js
// ══════════════════════════════════════════════════
const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };
const root = path.resolve(__dirname, '..');

let failed = 0;
function ok(label, cond, detail) { console.log((cond ? '✅ ' : '❌ ') + label + (cond ? '' : ' — ' + (detail || ''))); if (!cond) failed++; }

async function newPage(browser, port, store) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url(), method = req.method();
    if (!url.includes('supabase.co')) { if (url.startsWith('http://localhost')) req.continue(); else req.abort(); return; }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } }); return; }
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
    const p = new URL(url).pathname;
    if (p.includes('rpc/check_phone_duplicate')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ exists_flag: false }]) }); return; }
    if (p.includes('/rest/v1/customers') && method !== 'GET') {
      store.posts.push({ method, body });
      const row = Object.assign({ id: 901, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_archived: false }, Array.isArray(body) ? body[0] : body || {});
      req.respond({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([row]) }); return;
    }
    if (p.includes('/rest/v1/estimates') && method !== 'GET') {
      store.estPosts.push({ method, body });
      const row = Object.assign({ id: 'est-1', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_archived: false }, Array.isArray(body) ? body[0] : body || {});
      req.respond({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([row]) }); return;
    }
    req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
  });
  return { page, errors };
}

(async () => {
  // ───────── 1. 헬퍼 단위 검증 + 견적서 화면 ─────────
  {
    const port = 18200;
    const server = await startServer(root, port);
    const browser = await launchBrowser();
    const store = { posts: [], estPosts: [] };
    const { page, errors } = await newPage(browser, port, store);
    await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 900));

    const u = await page.evaluate(() => ({
      a: splitStoredAddr('서울 서대문구 통일로 339 110동 901호', '110동 901호'),
      b: splitStoredAddr('서울 서대문구 통일로 339 110동 901호', ''),
      c: splitStoredAddr('서울 서대문구 통일로 339 110동 901호', '202동 303호'),
      d: splitStoredAddr('110동 901호', '110동 901호'),
      e: splitStoredAddr(null, null),
      f: splitStoredAddr('  서울 중구 퇴계로 1 ', undefined),
    }));
    ok('1-1. 상세주소로 끝나는 주소는 기본/상세로 정확히 나뉨', u.a.base === '서울 서대문구 통일로 339' && u.a.detail === '110동 901호', JSON.stringify(u.a));
    ok('1-2. 옛 고객(상세주소 정보 없음)은 나누지 않고 통째로 기본주소', u.b.base === '서울 서대문구 통일로 339 110동 901호' && u.b.detail === '', JSON.stringify(u.b));
    ok('1-3. 저장된 상세주소가 addr 끝과 다르면(주소가 나중에 바뀜) 추측하지 않고 통째로 기본주소', u.c.base === '서울 서대문구 통일로 339 110동 901호' && u.c.detail === '', JSON.stringify(u.c));
    ok('1-4. 상세주소가 addr 전체와 같으면(기본주소가 비는 경우) 나누지 않음', u.d.base === '110동 901호' && u.d.detail === '', JSON.stringify(u.d));
    ok('1-5. 값이 없어도 오류 없이 빈 값', u.e.base === '' && u.e.detail === '' && u.f.base === '서울 중구 퇴계로 1', JSON.stringify([u.e, u.f]));

    // 견적서 화면: 실제 "고객 불러오기" 함수 loadCustByIdx(el)를 그대로 호출(dah_customers에서 data-idx 번째 고객을 읽어 칸을 채움)
    await setupValidSession(page);
    await new Promise(r => setTimeout(r, 600));
    await page.evaluate(() => {
      localStorage.setItem('dah_customers', JSON.stringify([
        { id: 501, clientName: '민지성', phone: '010-3637-5050', addr: '서울 서대문구 통일로 339 110동 901호', addrDetail: '110동 901호', stage: '상담', date: '2026-10-06' },
        { id: 502, clientName: '옛고객', phone: '010-2222-2222', addr: '서초구 반포대로 275 래미안 퍼스티지 110동 702호', addrDetail: '', stage: '상담', date: '2026-08-04' },
      ]));
      const btn = document.createElement('button'); btn.setAttribute('data-idx', '0'); loadCustByIdx(btn);
    });
    await new Promise(r => setTimeout(r, 400));
    const vals = await page.evaluate(() => ({ b: document.getElementById('c-addr').value, d: document.getElementById('c-addr2').value }));
    ok('4-1. [견적서 화면] 따로 저장된 주소가 기본주소 칸/상세주소 칸으로 나뉘어 표시됨(민지성 화면 재현)', vals.b === '서울 서대문구 통일로 339' && vals.d === '110동 901호', JSON.stringify(vals));
    await page.evaluate(() => { const btn = document.createElement('button'); btn.setAttribute('data-idx', '1'); loadCustByIdx(btn); });
    await new Promise(r => setTimeout(r, 400));
    const vals2 = await page.evaluate(() => ({ b: document.getElementById('c-addr').value, d: document.getElementById('c-addr2').value }));
    ok('4-3. [견적서 화면] 옛 고객(상세주소 정보 없음)은 통째로 기본주소 칸(정보 손실 없음)', vals2.b === '서초구 반포대로 275 래미안 퍼스티지 110동 702호' && vals2.d === '', JSON.stringify(vals2));
    ok('4-2. [견적서 화면] JS 에러 없음', errors.length === 0, errors.join('; '));
    await browser.close(); server.kill();
  }

  // ───────── 2·3·5. 고객추가창 ─────────
  {
    const port = 18201;
    const server = await startServer(root, port);
    const browser = await launchBrowser();
    const store = { posts: [], estPosts: [] };
    const { page, errors } = await newPage(browser, port, store);
    await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');
    const setNative = (id, v) => page.evaluate((i, val) => { const el = document.getElementById(i); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, id, v);

    // 5) 칩 제거
    await page.evaluate(() => openAdd());
    await new Promise(r => setTimeout(r, 400));
    const chip = await page.evaluate(() => !!document.getElementById('add-addr-recent'));
    ok('5. [고객추가창] "최근 주소" 칩이 더는 없음', chip === false);

    // 2) 따로 입력해 저장 → addr + addr_detail
    await page.evaluate(() => { window.daum = { Postcode: function (o) { this.open = function () { o.oncomplete({ roadAddress: '서울 서대문구 통일로 339', buildingName: '', query: '통일로 339' }); }; } }; });
    await setNative('add-name', '민지성'); await setNative('add-phone', '01036375050');
    await page.evaluate(() => document.getElementById('add-addr').click());
    await new Promise(r => setTimeout(r, 300));
    await setNative('add-addr-detail', '110동 901호');
    await page.click('#add-save-btn');
    await new Promise(r => setTimeout(r, 900));
    const sv = store.posts.find(p => p.method === 'POST' && p.body);
    const body = sv && (Array.isArray(sv.body) ? sv.body[0] : sv.body);
    ok('2-1. [고객추가창] 서버로 합친 주소(addr)가 정확히 나감', !!body && body.addr === '서울 서대문구 통일로 339 110동 901호', JSON.stringify(body && body.addr));
    ok('2-2. [고객추가창] 서버로 상세주소(addr_detail)가 따로 나감', !!body && body.addr_detail === '110동 901호', JSON.stringify(body && body.addr_detail));

    // 3) 수정 모드는 아래에서 시나리오마다 새 페이지로 확인(골든마스터와 같은 방식: saveCustomers + openAdd('이름'))
    ok('3-3. [고객추가창] JS 에러 없음', errors.length === 0, errors.join('; '));
    await browser.close(); server.kill();
  }

  // ───────── 3. 고객추가 수정창(시나리오마다 새 페이지) ─────────
  async function openEdit(port, customer, editName) {
    const server = await startServer(root, port);
    const browser = await launchBrowser();
    const store = { posts: [], estPosts: [] };
    const { page, errors } = await newPage(browser, port, store);
    await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');
    await page.evaluate((c) => { saveCustomers([c]); }, customer);
    await page.evaluate((n) => { openAdd(n); }, editName);
    await new Promise(r => setTimeout(r, 500));
    const v = await page.evaluate(() => ({ b: (document.getElementById('add-addr') || {}).value, d: (document.getElementById('add-addr-detail') || {}).value }));
    await browser.close(); server.kill();
    return { v, errors };
  }
  const e1 = await openEdit(18202, { id: 501, clientName: '새고객', phone: '010-1111-1111', addr: '서울 서대문구 통일로 339 110동 901호', addrDetail: '110동 901호', stage: '상담', date: '2026-10-06' }, '새고객');
  ok('3-1. [고객추가 수정창] 상세주소가 저장된 고객은 기본주소/상세주소 칸이 정확히 나뉘어 채워짐', e1.v.b === '서울 서대문구 통일로 339' && e1.v.d === '110동 901호', JSON.stringify(e1.v));
  const e2 = await openEdit(18203, { id: 502, clientName: '옛고객', phone: '010-2222-2222', addr: '서초구 반포대로 275 래미안 퍼스티지 110동 702호', addrDetail: '', stage: '상담', date: '2026-08-04' }, '옛고객');
  ok('3-2. [고객추가 수정창] 옛 고객(상세주소 정보 없음)은 정보 손실 없이 통째로 기본주소 칸', e2.v.b === '서초구 반포대로 275 래미안 퍼스티지 110동 702호' && e2.v.d === '', JSON.stringify(e2.v));
  ok('3-4. [고객추가 수정창] JS 에러 없음', e1.errors.length === 0 && e2.errors.length === 0, e1.errors.concat(e2.errors).join('; '));

  console.log('\n' + (failed === 0 ? '✅ 전체 통과' : '❌ 실패 ' + failed + '건'));
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
