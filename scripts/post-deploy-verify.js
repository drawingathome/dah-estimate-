#!/usr/bin/env node
// scripts/post-deploy-verify.js
// ══════════════════════════════════════════════════
// 2026-10-05(선혜님 - "니가 테스트를 해야지 왜이래!!!" / "전문업체 기준으로 어떻게 해야할 것 같애"):
// 배포가 끝난 뒤 "운영에 실제로 올라간 화면"을 자동으로 열어 직접 검증한다. 지금까지는 CI 안에서 로컬 파일로만
// 테스트했고, 수정이 선혜님이 쓰시는 주소에 실제로 닿았는지는 아무도 확인하지 않았음(사람에게 떠넘김).
//
// 검증 3가지:
//  1) 배포 일치: 운영에서 내려오는 핵심 파일이 방금 푸시한 커밋의 파일과 바이트 단위로 같은지(전파 지연은 대기·재시도)
//  2) 운영 화면 E2E: 크롬 + 아이패드 사파리(WebKit, 터치)로 운영 대시보드를 열어 고객추가를 선혜님이 겪으신 두 가지 순서로
//     실행하고 서버로 나가는 주소를 확인(백엔드는 가짜로 대체 - 운영 데이터 안 건드림)
//  3) 외부 의존성 점검: 카카오 우편번호 스크립트가 실제로 로드되고 Postcode 생성자를 제공하는지(옛/새 주소 둘 다)
//
// 환경변수: BASE_URLS(쉼표 구분), DASH_PATH(기본 /dah-dashboard), VERIFY_WAIT_MIN(배포 전파 대기, 기본 0), SKIP_VENDOR_PROBE=1
// ══════════════════════════════════════════════════
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const { chromium, webkit, devices } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const BASES = (process.env.BASE_URLS || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
const DASH_PATH = process.env.DASH_PATH || '/dah-dashboard';
const WAIT_MIN = Number(process.env.VERIFY_WAIT_MIN || 0);
const CHROMIUM_EXECUTABLE = process.env.CHROMIUM_EXECUTABLE || undefined; // 로컬 점검용(CI는 playwright가 설치한 기본 크롬 사용)
const CORS = { 'access-control-allow-origin': '*' };
let failed = 0;
function ok(label, cond, detail) { console.log((cond ? '✅ ' : '❌ ') + label + (cond ? '' : ' — ' + (detail || ''))); if (!cond) failed++; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12);

async function fetchBuf(url) { const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'verify=' + Date.now(), { cache: 'no-store' }); return { status: r.status, buf: Buffer.from(await r.arrayBuffer()) }; }

async function checkDeployedVersion(base) {
  const files = ['shared-common-utils.js', 'dash-customer-add.js', 'est-save.js'];
  const deadline = Date.now() + WAIT_MIN * 60000;
  for (;;) {
    const diffs = [];
    for (const f of files) {
      let live = { status: 0, buf: Buffer.alloc(0) };
      try { live = await fetchBuf(`${base}/${f}`); } catch (e) {}
      const local = fs.readFileSync(path.join(ROOT, f));
      if (live.status !== 200 || sha(live.buf) !== sha(local)) diffs.push(`${f}(HTTP ${live.status}, 운영 ${sha(live.buf)} ≠ 커밋 ${sha(local)})`);
    }
    if (diffs.length === 0 || Date.now() > deadline) { ok(`[${base}] 운영에 올라간 파일이 이번 커밋과 동일`, diffs.length === 0, diffs.join(' | ')); return diffs.length === 0; }
    await sleep(20000);
  }
}

async function modalScenario(label, launcher, ctxOpts, base, order) {
  const browser = await launcher.launch(launcher === chromium && CHROMIUM_EXECUTABLE ? { executablePath: CHROMIUM_EXECUTABLE } : {});
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const touch = !!ctxOpts.hasTouch; const posts = []; const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.route('**/*', async (route) => {
    const url = route.request().url(); const method = route.request().method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-methods': '*', 'access-control-allow-headers': '*' } });
      let body = null; try { body = JSON.parse(route.request().postData() || 'null'); } catch (e) {}
      if (url.includes('/auth/v1/token')) { if (body && body.password === 'TEST_OK_PW') return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ access_token: 'test-fake-token', refresh_token: 'test-fake-refresh', expires_in: 3600, user: { id: 'test-fake-uuid', email: body.email } }) }); return route.fulfill({ status: 400, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error_description: 'Invalid login credentials' }) }); }
      if (url.includes('/rest/v1/app_settings') && url.includes('staff_emails')) return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ value: {} }]) });
      if (url.includes('rpc/check_phone_duplicate')) return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ exists_flag: false }]) });
      if (url.includes('/rest/v1/customers') && method !== 'GET') { posts.push({ method, body }); return route.fulfill({ status: 201, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 781, ...(Array.isArray(body) ? body[0] : body || {}) }]) }); }
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
    }
    if (/daumcdn\.net|kakaocdn\.net|postcode\.map\./.test(url)) return route.abort();   // 이 시나리오에선 가짜 검색창 사용(외부 의존성은 3번에서 따로 점검)
    if (url.startsWith(base)) return route.continue();
    return route.abort();
  });
  const press = (sel) => touch ? page.tap(sel) : page.click(sel);
  await page.goto(base + DASH_PATH, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { if (typeof setMasterEmail === 'function') setMasterEmail('test-master@dah-test.local'); });
  await page.evaluate(() => { const b = document.getElementById('btn-master-login'); if (b && b.onclick) b.onclick(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const el = document.getElementById('master-pw-input'); if (el) el.value = 'TEST_OK_PW'; });
  await page.evaluate(() => { const b = document.getElementById('btn-master-confirm'); if (b && b.onclick) b.onclick(); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => openAdd()); await page.waitForTimeout(500);
  const BASE_ADDR = '서울 서초구 서초대로 50'; const DETAIL = '디에이치방배 123동 401호';
  await page.fill('#add-name', '배포검증'); await page.fill('#add-phone', '01012345678');
  await page.evaluate((a) => { window.daum = { Postcode: function (o) { this.open = function () { o.oncomplete({ roadAddress: a, buildingName: '디에이치방배', query: '디에이치방배' }); }; } }; }, BASE_ADDR);
  if (order === 'detail-first') { await page.fill('#add-addr-detail', DETAIL); await press('#add-addr'); }
  else { await press('#add-addr'); await page.fill('#add-addr-detail', DETAIL); }
  await page.waitForTimeout(400);
  const seen = await page.inputValue('#add-addr');
  await press('#add-save-btn'); await page.waitForTimeout(1200);
  const sv = posts.find(p => p.method === 'POST' && p.body);
  const addr = sv && (Array.isArray(sv.body) ? sv.body[0] : sv.body).addr;
  ok(`[${base}] ${label} / ${order === 'detail-first' ? '상세주소 먼저→검색' : '검색→상세주소'}: 화면의 기본주소가 유지되고 저장값이 정확`, seen === BASE_ADDR && addr === BASE_ADDR + ' ' + DETAIL, JSON.stringify({ 화면: seen, 서버로나간주소: addr }));
  if (errors.length) console.log('   (참고) JS 에러:', errors.join(' | ').slice(0, 200));
  await browser.close();
}

async function vendorProbe() {
  if (process.env.SKIP_VENDOR_PROBE === '1') { console.log('⏭  카카오 스크립트 점검 건너뜀(SKIP_VENDOR_PROBE=1)'); return; }
  const browser = await chromium.launch(CHROMIUM_EXECUTABLE ? { executablePath: CHROMIUM_EXECUTABLE } : {}); const page = await (await browser.newContext()).newPage();
  await page.goto('about:blank');
  for (const [name, url] of [['새 주소(t1.kakaocdn.net)', 'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'], ['옛 주소(t1.daumcdn.net, 현재 우리가 사용)', 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js']]) {
    let res = { daum: false, kakao: false, err: null };
    try { await page.addScriptTag({ url }); res = await page.evaluate(() => ({ daum: !!(window.daum && window.daum.Postcode), kakao: !!(window.kakao && window.kakao.Postcode), err: null })); } catch (e) { res.err = e.message.slice(0, 80); }
    const warn = !(res.daum || res.kakao);
    console.log((warn ? '⚠️  ' : '✅ ') + `카카오 스크립트 ${name}: daum.Postcode=${res.daum} kakao.Postcode=${res.kakao}${res.err ? ' 오류=' + res.err : ''}`);
    // 옛 주소(우리가 쓰는 것)가 동작 안 하면 실제 장애 위험이므로 실패 처리
    if (name.startsWith('옛 주소') && warn) { failed++; console.log('❌ 우리가 사용하는 옛 카카오 주소/이름(daum.Postcode)이 동작하지 않음 — 즉시 새 방식(kakao.Postcode)으로 이전 필요'); }
    await page.evaluate(() => { delete window.daum; delete window.kakao; });
  }
  await browser.close();
}

(async () => {
  if (BASES.length === 0) { console.error('BASE_URLS가 비어있음'); process.exit(2); }
  for (const base of BASES) {
    console.log(`\n▶ 대상: ${base}`);
    const same = await checkDeployedVersion(base);
    if (!same) { console.log('   (배포 불일치 - 이후 E2E는 옛 코드를 검증하게 되므로 건너뜀)'); continue; }
    for (const order of ['detail-first', 'search-first']) {
      await modalScenario('크롬(PC)', chromium, { viewport: { width: 1280, height: 900 } }, base, order);
      await modalScenario('사파리 엔진(아이패드 터치)', webkit, { ...devices['iPad Pro 11'] }, base, order);
    }
  }
  console.log('\n▶ 외부 의존성(카카오 우편번호) 점검');
  await vendorProbe();
  console.log('\n' + (failed === 0 ? '✅ 운영 배포 검증 통과' : `❌ 운영 배포 검증 실패 ${failed}건`));
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('검증 스크립트 오류:', e.message); process.exit(1); });
