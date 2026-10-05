#!/usr/bin/env node
// tests/addr-empty-base-guard-check.js
// ══════════════════════════════════════════════════
// 2026-10-05(선혜님 - "주소 해결됐다고하지만 주소 여전히 오류야 제대로 확인해", 김유진 고객):
// 주소 버그를 "고쳤다"고 한 지 3일 뒤 등록분에서 재발. DB 증거: 저장된 값이
// " 힐스테이트라군인테라스2차 201동 2602호" - 맨 앞 공백은 저장 코드가 기본주소(빈 문자열) + ' ' +
// 상세주소로 합쳤다는 서명이고, 같은 서명이 배수희(9/19, 힐스테이트등촌역)에도 있었음. 둘 다 입주 초기
// 신축 단지 - 다음 우편번호 API는 "도로명주소가 발급된 주소만 검색 가능"(공식 Q&A)이라 검색에 안 잡히면,
// 기본주소 칸이 readOnly라 사용자는 상세주소 칸에 전부 쓸 수밖에 없었고, 저장 시 막는 검증도 없었음.
//
// 이 테스트가 감시하는 것(견적서 화면 + 고객추가 모달 두 저장 경로 모두):
//  1) 기본주소는 비었는데 상세주소만 있으면 저장 차단(+안내 문구)
//  2) 둘 다 비어있는 건(주소를 아직 모르는 상태) 막지 않음
//  3) "직접입력" 탈출구: 기본주소 칸이 풀려 직접 쓸 수 있고, 그렇게 쓰면 앞 공백 없이 정상 저장
//  4) 검색 결과에서 주소를 못 가져오면(모든 필드가 빈 경우) 그 자리에서 알리고 기본주소 칸을 안 건드림
//
// 사용법: node tests/addr-empty-base-guard-check.js
// ══════════════════════════════════════════════════
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };
const root = path.resolve(__dirname, '..');

let failed = 0;
function ok(label, cond, detail) {
  console.log((cond ? '✅ ' : '❌ ') + label + (cond ? '' : ' — ' + (detail || '')));
  if (!cond) failed++;
}

async function newPage(browser, port, posts) {
  const page = await browser.newPage();
  const dialogs = [];
  page.daumRequests = 0; // 다음 우편번호 스크립트 요청 횟수(미리 불러오기 검증용)
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { dialogs.push(d.message()); try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url(); const method = req.method();
    if (url.includes('daumcdn.net')) { page.daumRequests++; req.abort(); return; }
    if (!url.includes('supabase.co')) {
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
      return;
    }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) { body = req.postData() || null; }
    const p = new URL(url).pathname;
    if (p.includes('rpc/check_phone_duplicate')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ exists_flag: false }]) }); return; }
    if (p.includes('/rest/v1/customers') && method !== 'GET') {
      posts.push({ method, body });
      req.respond({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 777, ...(body || {}) }]) });
      return;
    }
    req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
  });
  return { page, dialogs, jsErrors };
}

(async () => {
  // ───────── A. 견적서 화면 ─────────
  {
    const port = 38100;
    const server = await startServer(root, port);
    const browser = await launchBrowser();
    const posts = [];
    const { page, dialogs, jsErrors } = await newPage(browser, port, posts);
    await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));

    const fill = (base, detail) => page.evaluate((b, d) => {
      document.getElementById('c-name').value = '김유진';
      document.getElementById('c-phone').value = '010-9985-8429';
      document.getElementById('c-addr').value = b;
      document.getElementById('c-addr2').value = d;
      document.querySelectorAll('.field-err').forEach(e => e.remove());
      return validateEstimate();
    }, base, detail).then(async (ret) => ({ ret, reason: await page.evaluate(() => window._lastValidationFailReason) }));

    const r1 = await fill('', '힐스테이트라군인테라스2차 201동 2602호');
    ok('A1. [견적서] 기본주소 비고 상세주소만 있으면 저장 차단', r1.ret === false && /기본주소 없음/.test(r1.reason || ''), JSON.stringify(r1));
    const errText = await page.evaluate(() => (document.querySelector('.field-err') || {}).textContent || '');
    ok('A2. [견적서] 차단 사유가 화면에 안내됨(검색/직접입력 안내 포함)', /기본주소/.test(errText) && /직접입력/.test(errText), errText);

    const r2 = await fill('서울 서초구 신반포로 20', '디에이치방배 123동 401호');
    ok('A3. [견적서] 기본주소가 있으면 이 검증에 안 걸림', !/기본주소 없음/.test(r2.reason || ''), JSON.stringify(r2));

    const r3 = await fill('', '');
    ok('A4. [견적서] 둘 다 비어있는 건(주소 미정)은 이 검증으로 막지 않음', !/기본주소 없음/.test(r3.reason || ''), JSON.stringify(r3));

    // 직접입력 탈출구
    await page.evaluate(() => { document.getElementById('c-addr').value = ''; });
    const before = await page.evaluate(() => document.getElementById('c-addr').readOnly);
    // 견적서 화면은 로그인 오버레이가 버튼 위를 덮고 있어 좌표 클릭이 안 닿음(진단으로 확인) - 요소의 click()으로 실제 inline 핸들러를 호출
    await page.evaluate(() => document.getElementById('c-addr-manual-btn').click());
    const after = await page.evaluate(() => document.getElementById('c-addr').readOnly);
    ok('A5. [견적서] 기본은 readOnly, [직접입력]을 누르면 기본주소 칸이 풀림', before === true && after === false, `before=${before} after=${after}`);
    await page.focus('#c-addr');
    await page.keyboard.type('경기 안산시 단원구 성곡동 843');
    const typed = await page.evaluate(() => document.getElementById('c-addr').value);
    ok('A6. [견적서] 직접입력 모드에서 실제로 타이핑됨(검색 팝업이 다시 뜨지 않음)', typed === '경기 안산시 단원구 성곡동 843', typed);

    // 미리 불러오기: 페이지를 연 것만으로(클릭 전) 다음 우편번호 스크립트를 이미 요청했는지
    ok('A11. [견적서] 페이지 로드 때 우편번호 스크립트를 미리 요청함(첫 클릭이 비동기 팝업이 되지 않게)', page.daumRequests >= 1, 'daumRequests=' + page.daumRequests);
    // 로드 실패: 스크립트를 못 받는 상황(테스트 하네스가 요청을 중단시킴)에서 [검색]을 누르면 조용히 먹통이 아니라 알림이 떠야 함
    await page.evaluate(() => { window.__rce = []; window.reportClientError = function (m) { window.__rce.push(m); }; });
    dialogs.length = 0;
    await page.evaluate(() => { delete window.daum; openKakaoAddr('c-addr', 'c-addr2'); });
    await new Promise(r => setTimeout(r, 800));
    const rceLoad = await page.evaluate(() => window.__rce.slice());
    ok('A12. [견적서] 검색 스크립트 로드 실패 시 알림이 뜸(조용한 먹통 방지) + 에러로그 기록', dialogs.some(m => /불러오지 못했어요/.test(m)) && rceLoad.some(m => /스크립트로드실패/.test(m)), JSON.stringify({ dialogs, rceLoad }));

    // 검색 결과가 전부 비었을 때
    await page.evaluate(() => { document.getElementById('c-addr').value = ''; window.daum = { Postcode: function (o) { this.open = function () { o.oncomplete({ roadAddress: '', autoRoadAddress: '', jibunAddress: '', autoJibunAddress: '', query: '힐스테이트라군인테라스2차', buildingName: '' }); }; } }; window.__rce = []; });
    dialogs.length = 0;
    await page.evaluate(() => openKakaoAddr('c-addr', 'c-addr2'));
    const afterEmpty = await page.evaluate(() => document.getElementById('c-addr').value);
    ok('A7. [견적서] 검색 결과에서 주소를 못 가져오면 그 자리에서 알림 + 기본주소 칸은 그대로', dialogs.some(m => /주소를 가져오지 못했어요/.test(m)) && afterEmpty === '', JSON.stringify({ dialogs, afterEmpty }));

    const rceEmpty = await page.evaluate(() => window.__rce.slice());
    ok('A13. [견적서] 빈 결과일 때 사용자가 검색한 단어(query)가 에러로그에 남음(다음엔 추측 대신 기록으로 원인 확인)', rceEmpty.some(m => /결과비어있음/.test(m) && /힐스테이트라군인테라스2차/.test(m)), JSON.stringify(rceEmpty));

    // data.address 안전망
    await page.evaluate(() => { window.daum = { Postcode: function (o) { this.open = function () { o.oncomplete({ roadAddress: '', autoRoadAddress: '', jibunAddress: '', autoJibunAddress: '', address: '경기 안산시 단원구 성곡동 843' }); }; } }; });
    await page.evaluate(() => openKakaoAddr('c-addr', 'c-addr2'));
    const viaAddress = await page.evaluate(() => document.getElementById('c-addr').value);
    ok('A8. [견적서] 4개 필드가 다 비어도 data.address가 있으면 그걸로 채움(마지막 안전망)', viaAddress === '경기 안산시 단원구 성곡동 843', viaAddress);
    await page.setViewport({ width: 390, height: 844 });
    const wEst = await page.evaluate(() => document.getElementById('c-addr').getBoundingClientRect().width);
    // 수정 전 main에서 실측한 원래 폭이 86px(견적서 정보칸은 원래 좁게 설계됨) - 버튼을 같은 줄에 넣었을 땐 13px로 쪼그라들었음
    ok('A10. [견적서] 모바일(390px)에서 기본주소 칸 폭이 원래 수준(86px) 유지 - 버튼 추가로 쪼그라든 사고(13px) 재발 감시', wEst >= 80, 'width=' + wEst);
    ok('A9. [견적서] JS 에러 없음', jsErrors.length === 0, jsErrors.join('; '));
    await browser.close(); server.kill();
  }

  // ───────── B. 고객추가 모달 ─────────
  {
    const port = 38101;
    const server = await startServer(root, port);
    const browser = await launchBrowser();
    const posts = [];
    const { page, dialogs, jsErrors } = await newPage(browser, port, posts);
    await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');
    const setNative = (id, v) => page.evaluate((i, val) => { const el = document.getElementById(i); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, id, v);

    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => openAdd());
    await new Promise(r => setTimeout(r, 300));
    // 수정 전 main에서 실측한 원래 폭 264px - 버튼을 같은 줄에 넣었을 땐 188px로 줄었음(긴 도로명주소가 더 잘림)
    const wMod = await page.evaluate(() => { const el = document.getElementById('add-addr'); return el ? el.getBoundingClientRect().width : -1; });
    ok('B5. [모달] 모바일(390px)에서 기본주소 칸 폭이 원래 수준(264px) 유지', wMod >= 250, 'width=' + wMod);
    await setNative('add-name', '김유진');
    await setNative('add-phone', '01099858429');
    await setNative('add-addr-detail', '힐스테이트라군인테라스2차 201동 2602호');
    await page.click('#add-save-btn');
    await new Promise(r => setTimeout(r, 500));
    const errs = await page.evaluate(() => Array.from(document.querySelectorAll('#add-overlay .field-err')).map(e => e.textContent));
    ok('B1. [모달] 기본주소 비고 상세주소만 있으면 저장 차단 + 안내', errs.some(t => /기본주소/.test(t)) && posts.length === 0, JSON.stringify({ errs, posts: posts.length }));

    const roBefore = await page.evaluate(() => document.getElementById('add-addr').readOnly);
    await page.click('#add-addr-manual-btn');
    await new Promise(r => setTimeout(r, 200));
    const roAfter = await page.evaluate(() => document.getElementById('add-addr').readOnly);
    ok('B2. [모달] 기본은 readOnly, [직접 입력]을 누르면 풀림', roBefore === true && roAfter === false, `before=${roBefore} after=${roAfter}`);

    await setNative('add-addr', '경기 안산시 단원구 성곡동 843');
    await page.click('#add-save-btn');
    await new Promise(r => setTimeout(r, 700));
    const saved = posts.find(p => p.method === 'POST' && p.body);
    const savedAddr = saved && (Array.isArray(saved.body) ? saved.body[0] : saved.body).addr;
    ok('B3. [모달] 직접입력한 기본주소 + 상세주소가 앞 공백 없이 정상 저장됨', savedAddr === '경기 안산시 단원구 성곡동 843 힐스테이트라군인테라스2차 201동 2602호', JSON.stringify(savedAddr));
    ok('B4. [모달] JS 에러 없음', jsErrors.length === 0, jsErrors.join('; '));
    await browser.close(); server.kill();
  }

  console.log('\n' + (failed === 0 ? '✅ 전체 통과' : '❌ 실패 ' + failed + '건'));
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
