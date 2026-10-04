#!/usr/bin/env node
// tests/estimate-lifecycle-integration-check.js
// ══════════════════════════════════════════════════
// 2026-09-30(선혜님 - "니가 다 해결됐다고 말해도 실제로는 오류가 계속 고쳐지지 않고
// 있지?? ... 지금은 고치기만 했으니 한번더 확인해" - 개별 유닛테스트가 전부 통과해도
// 실제로 다 같이 얽혔을 때 안전한지는 따로 확인한 적이 없었음을 지적):
//
// 오늘 하루 동안 발견·수정한 4가지 문제(재시도 큐의 0건반영 오판, 신규견적서 is_archived
// 미명시, "오늘 이미 저장된 견적 찾기" 안전장치의 근본 결함, idempotency key가 대부분
// 진입경로에서 안 만들어지던 구조적 결함)가 전부 함께 작동하는 하루 전체 업무 흐름을
// 통째로 재현해서 검증 - 개별 시나리오 테스트만으로는 놓칠 수 있는 상호작용을 잡기 위함.
//
// 흐름: 신규 견적서 작성 저장 → 같은 날 두 번 재저장(실수로 두 번 클릭 흉내) →
// 며칠 뒤 복사해서 두 번째 견적서 생성 → 세 번째 견적서 저장 중 서버 순간오류로 재시도
// 큐行 → 네트워크 복구 후 재시도 → "견적서 확인" 버튼과 동일한 조회로 최종 확인.
// 끝까지 정확히 3건이 남고, 전부 is_archived=false로 목록에 보여야 통과.
//
// 주의(재작성시 실수하기 쉬운 부분 - 실제로 이 파일 최초 작성 때 겪은 실수):
// 이 테스트는 여러 페이지(탭)에 걸쳐 localStorage가 이어지는 것을 검증해야 하므로,
// 반드시 하나의 launchBrowser() 인스턴스를 모든 openPage() 호출에 공유해야 함 - 각
// openPage 호출마다 새 브라우저를 만들면(같은 origin이라도) localStorage가 안 이어져서
// 재시도 큐 관련 검증이 실제로는 아무것도 확인 안 하는 것처럼 거짓 통과/거짓 실패할 수 있음.
//
// 사용법: node tests/estimate-lifecycle-integration-check.js
// ══════════════════════════════════════════════════
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };

// 공유 가짜 DB - 여러 "페이지 방문"(다른 탭/다른 날 재접속 흉내)에 걸쳐 상태가 유지됨.
// PostgREST의 IS FALSE(NULL 안 걸러짐) 시맨틱과 idempotency key 유니크 제약을 정확히 흉내냄.
let fakeDb = [];
let idSeq = 1;
const events = []; // 사람이 읽을 수 있는 사건 로그

function log(msg) { events.push(msg); console.log('  ' + msg); }

function matchesQuery(row, sp) {
  for (const [k, v] of sp.entries()) {
    if (k === 'client_id' && v.startsWith('eq.') && String(row.client_id) !== v.slice(3)) return false;
    if (k === 'id' && v.startsWith('eq.') && String(row.id) !== v.slice(3)) return false;
    if (k === 'is_archived' && (v === 'is.false' || v === 'eq.false') && row.is_archived !== false) return false;
    if (k === 'updated_at' && v.startsWith('gte.')) { /* 오늘 안 저장된 견적 찾기 로직 자체가 제거됐으므로 이 조건 쓸 일 없음 */ }
  }
  return true;
}

async function handleEstimatesReq(req, opts) {
  const url = new URL(req.url());
  const sp = url.searchParams;
  if (process.env.DEBUG_REQ) console.log('      [요청]', req.method(), url.pathname, url.search.slice(0,120), req.postData()||'');
  if (req.method() === 'GET') {
    const rows = fakeDb.filter(r => matchesQuery(r, sp));
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(rows) });
    return;
  }
  if (req.method() === 'POST') {
    const body = JSON.parse(req.postData() || '{}');
    if (opts.capturePostKeys) opts.capturePostKeys.push(body.client_idempotency_key);
    if (opts.forceFail) { req.respond({ status: 500, contentType: 'application/json', headers: CORS, body: '{}' }); return; }
    const dupKey = body.client_idempotency_key && fakeDb.find(r => r.client_idempotency_key === body.client_idempotency_key);
    if (dupKey) {
      req.respond({ status: 409, contentType: 'application/json', headers: CORS, body: JSON.stringify({ message: 'duplicate key' }) });
      return;
    }
    const now = new Date(Date.now() + (idSeq * 1000)).toISOString();
    const row = Object.assign({ id: 'est-' + (idSeq++), created_at: now, updated_at: now }, body);
    if (!('is_archived' in body)) row.is_archived = null; // DB 기본값이 NULL이라고 가정(실제 우려했던 상황)
    fakeDb.push(row);
    req.respond({ status: 201, contentType: 'application/json', headers: CORS, body: JSON.stringify([row]) });
    return;
  }
  if (req.method() === 'PATCH') {
    const id = sp.get('id')?.replace('eq.', '');
    const body = JSON.parse(req.postData() || '{}');
    if (opts.forceFail) { req.respond({ status: 500, contentType: 'application/json', headers: CORS, body: '{}' }); return; }
    const row = fakeDb.find(r => r.id === id);
    if (row) Object.assign(row, body, { updated_at: new Date(Date.now() + (idSeq++) * 1000).toISOString() });
    req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(row ? [row] : []) });
    return;
  }
  req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
}

async function openPage(port, urlSuffix, opts, existingBrowser) {
  const browser = existingBrowser || await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      const u = new URL(url);
      if (u.pathname.includes('/rest/v1/estimates')) { handleEstimatesReq(req, opts || {}); return; }
      if (u.pathname.includes('/rest/v1/customers')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 501, updated_at: new Date().toISOString() }]) }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html${urlSuffix}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 700));
  return { browser, page };
}

async function fillForm(page, price) {
  await page.evaluate((price) => {
    window._estEditState.estSaveCustomerId = 501;
    const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
    if (!document.getElementById('c-name').value) set('c-name', '노지경');
    if (!document.getElementById('c-phone').value) set('c-phone', '01089130078');
    set('c-addr', '경기 과천시 별양로 11'); set('c-measure', '2026-10-05'); set('c-install', '2026-10-15');
    if (document.querySelectorAll('#curtain-body tr').length === 0) addCurtainRow();
    const tr = document.querySelector('#curtain-body tr');
    const priceEl = tr.querySelector('.cprice'); priceEl.value = String(price); priceEl.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof fmtPriceBlur === 'function') fmtPriceBlur(priceEl);
    const mw = tr.querySelector('.mw'); mw.value = '200'; mw.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof calcCurtainRow === 'function') calcCurtainRow(mw);
    if (typeof calcTotal === 'function') calcTotal();
  }, price);
}

async function clickSave(page) {
  await page.evaluate(() => { var b = document.getElementById('btn-save-estimate'); if (b) b.disabled = false; saveEstimate(); }).catch(() => {});
  await new Promise(r => setTimeout(r, 1200));
}

(async () => {
  const port = 43000;
  const server = await startServer(require('path').resolve(__dirname, '..'), port);
  let allOk = true;
  const sharedBrowser = await launchBrowser(); // localStorage가 유지되는 하나의 브라우저 - 실제 "같은 컴퓨터, 새 탭"을 정확히 흉내

  console.log('=== 1일차: 노지경 고객 견적서 새로 작성 ===');
  { const { page } = await openPage(port, '', {}, sharedBrowser);
    await fillForm(page, 1000000); await clickSave(page); await page.close(); }
  log(`저장 후 DB 상태: ${fakeDb.length}건, is_archived=[${fakeDb.map(r => r.is_archived)}]`);
  allOk = allOk && fakeDb.length === 1 && fakeDb[0].is_archived === false;

  console.log('\n=== 같은 날, 직원이 실수로 저장을 두 번 빠르게 시도(네트워크 지연으로 재시도됨) ===');
  { const { page } = await openPage(port, `?loadEstDbId=${fakeDb[0].id}&mode=edit`, {}, sharedBrowser);
    await fillForm(page, 1100000); await clickSave(page); // 1차: 금액 수정 후 저장
    await clickSave(page); // 2차: 같은 세션에서 또 저장(재시도/실수로 두 번 클릭 흉내)
    await page.close(); }
  log(`재저장 두 번 후 DB 상태: 여전히 ${fakeDb.length}건이어야 정상(중복 생성 안 됨), price=${fakeDb[0].price}`);
  allOk = allOk && fakeDb.length === 1; // 가격 자체는 폭수 자동계산이 섞여있어 단순 비교 대상 아님(개수/무결성이 핵심)

  console.log('\n=== 며칠 뒤, 이 견적서를 "복사해서 새로 만들기"로 두 번째 견적서 생성 ===');
  const origId = fakeDb[0].id;
  { const { page } = await openPage(port, `?loadEstDbId=${origId}&mode=copy`, {}, sharedBrowser);
    await fillForm(page, 2000000); await clickSave(page); await page.close(); }
  log(`복사저장 후 DB 상태: ${fakeDb.length}건이어야 정상(원본 보존+새것 추가), is_archived=[${fakeDb.map(r => r.is_archived)}]`);
  allOk = allOk && fakeDb.length === 2 && fakeDb.every(r => r.is_archived === false);

  console.log('\n=== 세 번째 견적서 작성 중 서버 순간 오류(500) 발생 → 재시도 큐로 → 네트워크 복구 후 재시도 ===');
  const capturedKeys = [];
  { const opts = { forceFail: true, capturePostKeys: capturedKeys };
    const { page } = await openPage(port, `?loadEstDbId=${origId}&mode=copy`, opts, sharedBrowser);
    await fillForm(page, 3000000); await clickSave(page); // 1차 실패 유도(forceFail)
    // 2026-09-30: 같은 페이지를 벗어나지 않고 사용자가 직접 "저장" 버튼을 다시 눌러보는 것도
    // 흔한 실제 행동 - 이때 매번 새 idempotency key가 만들어지면(자기치유 로직이 세션에
    // 저장을 안 하면) 두 시도가 서로 다른 키를 쓰게 되어 서버의 유니크 제약으로도 중복방지가
    // 안 됨(처음 이 통합테스트를 만들 때는 재시도 큐 경로만 확인해서 이 구멍을 놓쳤었음 -
    // 재시도 큐는 실패 시점 payload에 키가 이미 박혀있어 자기치유와 무관하게 안전했던 것).
    // window._estEditState.currentEstIdempotencyKey를 직접 비교하면 자기치유가 없어도
    // 둘 다 undefined라 우연히 같다고 오판할 수 있어서, 실제로 서버에 전송된 키 값
    // (capturedKeys)로 검증.
    await clickSave(page); // 2차: 같은 페이지에서 직접 재시도(따닥/재클릭 흉내)
    log(`같은 페이지 안 1차/2차로 실제 전송된 키: ${JSON.stringify(capturedKeys)}`);
    allOk = allOk && capturedKeys.length === 2 && !!capturedKeys[0] && capturedKeys[0] === capturedKeys[1];
    const failedSaves = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_pending_estimate_sync') || '[]'));
    log(`실패 후 재시도 대기열에 등록됨: ${failedSaves.length}건`);
    await page.close(); }
  // forceFail 옵션은 page별로 고정이라, 같은 공유 브라우저의 새 탭(정상 옵션)에서 재시도 큐를 마저 처리
  { const { page } = await openPage(port, '', {}, sharedBrowser);
    const beforeQueue = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_pending_estimate_sync') || '[]'));
    log(`새 탭에서 localStorage 재시도 큐 확인: ${beforeQueue.length}건(1건이어야 이어짐)`);
    await page.evaluate(() => { if (typeof retryEstPendingSync === 'function') retryEstPendingSync(); });
    await new Promise(r => setTimeout(r, 1200));
    const remaining = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_pending_estimate_sync') || '[]'));
    log(`재시도 큐 처리 후 남은 대기 건수: ${remaining.length}(0이어야 정상)`);
    await page.close();
  }
  log(`3번째 견적서까지 저장 완료 후 DB 상태: ${fakeDb.length}건이어야 정상`);
  allOk = allOk && fakeDb.length === 3;

  console.log('\n=== "견적서 확인" 버튼과 완전히 동일한 조회로 최종 확인 ===');
  { const { page } = await openPage(port, '', {}, sharedBrowser);
    const result = await page.evaluate((custId) => new Promise((resolve) => {
      var url = SUPABASE_URL + '/rest/v1/estimates?client_id=eq.' + custId + '&is_archived=is.false&order=created_at.desc&select=id,created_at,price,estimate_status';
      var x = new XMLHttpRequest(); x.open('GET', url, true); x.setRequestHeader('apikey', SUPABASE_KEY);
      x.onload = function() { try { resolve(JSON.parse(x.responseText)); } catch (e) { resolve([]); } };
      x.send();
    }), 501);
    log(`최종 목록 조회 결과: ${result.length}건, 가격들=[${result.map(r => r.price)}]`);
    allOk = allOk && result.length === 3;
    await page.close();
  }

  await sharedBrowser.close();
  server.kill();
  console.log('\n=== 최종 DB 전체 내용 ===');
  console.log(fakeDb.map(r => ({ id: r.id, price: r.price, is_archived: r.is_archived, key: r.client_idempotency_key })));
  console.log('\n' + (allOk ? '✅ 하루 전체 업무 흐름 통합 시나리오 - 전부 정상' : '❌ 문제 발견됨'));
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('예외 발생:', e); process.exit(1); });
