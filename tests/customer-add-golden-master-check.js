// tests/customer-add-golden-master-check.js
// ══════════════════════════════════════════════════
// 고객 추가/수정 모달 동작 고정(골든마스터) 테스트
//
// 2026-09-29(선혜님 - "고객 추가 모달의 로직 통합부터"): dash-customer-add.js의 openAdd/saveCustomer가
// dah-dashboard.html 안의 인라인 <script>에서 몽키패치(원본을 감싸서 검증/담당자칩 초기화 등을 추가)돼
// 있었음 - 이 흩어진 로직을 dash-customer-add.js 한 곳으로 합치기 전, "지금 통합 전체가 무엇을 하는지"를
// 기록해둠. 통합 후에도 이 기록과 같아야 함(로직 위치만 바뀌고 동작은 그대로).
//
// 사용법
//   node tests/customer-add-golden-master-check.js            → 기록과 비교
//   node tests/customer-add-golden-master-check.js --update   → 의도적으로 동작을 바꿨을 때만: 기록 갱신
// ══════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
const GOLDEN = path.join(__dirname, 'golden', 'customer-add-flow.json');
const UPDATE = process.argv.includes('--update');
const CORS = { 'Access-Control-Allow-Origin': '*' };
const json = (o) => JSON.stringify(o);

function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach(k => { o[k] = canon(v[k]); }); return o; }
  return v;
}
function normalize(v) { return canon(JSON.parse(JSON.stringify(v).replace(/localhost:\d+/g, 'localhost:PORT'))); }

// 시간 고정(validateDate가 "지금부터 5년전~3년후" 범위를 실제 시스템 시계로 판단하므로 반드시 고정)
const FREEZE = `(() => {
  const FIXED = new Date('2026-09-29T12:00:00+09:00').getTime();
  const RealDate = Date;
  function FakeDate(...a) {
    if (!(this instanceof FakeDate)) return new RealDate(FIXED).toString();
    return a.length ? new RealDate(...a) : new RealDate(FIXED);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => FIXED; FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  window.Date = FakeDate;
})();`;

const EXTRACT = `(() => {
  const ov = document.getElementById('add-overlay');
  const errs = Array.from(ov.querySelectorAll('.field-err')).map(e => e.textContent);
  const staffChips = Array.from(document.querySelectorAll('.staff-btn')).map(b => b.textContent + (b.classList.contains('active') ? '*' : ''));
  return {
    isOpen: ov.className.includes('open'),
    title: (document.getElementById('add-modal-title') || {}).textContent,
    name: (document.getElementById('add-name') || {}).value,
    phone: (document.getElementById('add-phone') || {}).value,
    accountHint: (document.getElementById('add-account-hint') || {}).textContent || null,
    fieldErrors: errs,
    staffChips: staffChips,
    saveBtnDisabled: (document.getElementById('add-save-btn') || {}).disabled === true
  };
})()`;

const SCENARIOS = ['S1_신규_유효성실패', 'S2_신규_정상저장', 'S3_전화번호중복', 'S4_동명이인', 'S5_수정모드_열기_계좌힌트', 'S6_네이버붙여넣기'];

async function runScenario(dir, name, idx) {
  const port = 30500 + idx;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const rec = { requests: [], jsErrors: [], dialogs: [] };
  page.on('pageerror', e => rec.jsErrors.push(e.message));
  page.on('dialog', async d => { rec.dialogs.push(d.message()); try { await (name === 'S4_동명이인' || name === 'S3_전화번호중복' ? d.dismiss() : d.accept()); } catch (e) {} });
  await page.evaluateOnNewDocument(FREEZE);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url(); const method = req.method();
    if (!url.includes('supabase.co')) { if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort(); return; }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
    const u = new URL(url); const p = u.pathname + u.search;
    if (p.includes('/rest/v1/app_settings')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return; }
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) { body = req.postData() || null; }
    if (p.includes('rpc/check_phone_duplicate')) { rec.requests.push({ method, path: 'rpc/check_phone_duplicate', body }); req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: json([{ exists_flag: false }]) }); return; }
    if (p.includes('/rest/v1/customers')) { rec.requests.push({ method, path: p, body }); return req.respond({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', headers: CORS, body: json([{ id: 777, ...(body || {}) }]) }); }
    req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
  });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  await page.evaluate(() => {
    localStorage.setItem('dah_settings', JSON.stringify({ account: '123-456-789', holder: '선혜' }));
    saveCustomers([
      { id: 701, clientName: '기존폰중복', phone: '01055556666', stage: '상담', staffName: '마스터' },
      { id: 702, clientName: '기존이름중복', phone: '01099998888', stage: '상담', staffName: '마스터' }
    ]);
  });

  const setNative = (id, v) => `(() => { const el = document.getElementById('${id}'); const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`;

  let snap1 = null, snap2 = null;
  if (name === 'S1_신규_유효성실패') {
    await page.evaluate(() => openAdd());
    await new Promise(r => setTimeout(r, 200));
    snap1 = await page.evaluate(EXTRACT);
    await page.evaluate(setNative('add-name', '김'));
    await page.evaluate(setNative('add-phone', '123'));
    await page.click('#add-save-btn');
    await new Promise(r => setTimeout(r, 300));
    snap2 = await page.evaluate(EXTRACT);
  } else if (name === 'S2_신규_정상저장') {
    await page.evaluate(() => openAdd());
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(setNative('add-name', '신규고객'));
    await page.evaluate(setNative('add-phone', '01011112222'));
    await page.click('#add-save-btn');
    await new Promise(r => setTimeout(r, 500));
    snap1 = await page.evaluate(EXTRACT);
  } else if (name === 'S3_전화번호중복') {
    await page.evaluate(() => openAdd());
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(setNative('add-name', '신규이름'));
    await page.evaluate(setNative('add-phone', '01055556666'));
    await page.click('#add-save-btn');
    await new Promise(r => setTimeout(r, 400));
    snap1 = await page.evaluate(EXTRACT);
  } else if (name === 'S4_동명이인') {
    await page.evaluate(() => openAdd());
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(setNative('add-name', '기존이름중복'));
    await page.evaluate(setNative('add-phone', '01000001111'));
    await page.click('#add-save-btn');
    await new Promise(r => setTimeout(r, 400));
    snap1 = await page.evaluate(EXTRACT);
  } else if (name === 'S5_수정모드_열기_계좌힌트') {
    await page.evaluate(() => { openAdd('기존폰중복'); });
    await new Promise(r => setTimeout(r, 250));
    snap1 = await page.evaluate(EXTRACT);
  } else if (name === 'S6_네이버붙여넣기') {
    await page.evaluate(() => openAdd());
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(setNative('add-naver-paste', '예약자\n김철수\n전화번호\n010-2222-3333\n이용일시\n2026. 10. 5.(월) 오후 2:00'));
    await page.click('button[onclick="parseNaverReservationPaste()"]');
    await new Promise(r => setTimeout(r, 300));
    snap1 = await page.evaluate(EXTRACT);
  }

  await browser.close(); server.kill();
  return normalize({ snap1, snap2, requests: rec.requests, jsErrors: rec.jsErrors, dialogs: rec.dialogs });
}

function short(x, n = 130) { const t = typeof x === 'string' ? x : JSON.stringify(x); return (t === undefined ? 'undefined' : t).slice(0, n); }
function explainDiff(g, r) {
  const out = [];
  new Set([...Object.keys(g || {}), ...Object.keys(r || {})]).forEach(k => {
    if (JSON.stringify(g && g[k]) === JSON.stringify(r && r[k])) return;
    out.push(k + ' 다름 | 기록: ' + short(g && g[k]) + ' | 지금: ' + short(r && r[k]));
  });
  return out;
}

async function run() {
  const dir = path.resolve(__dirname, '..');
  const result = {};
  for (let i = 0; i < SCENARIOS.length; i++) {
    process.stdout.write('  · ' + SCENARIOS[i] + ' ... ');
    result[SCENARIOS[i]] = await runScenario(dir, SCENARIOS[i], i);
    console.log('요청 ' + result[SCENARIOS[i]].requests.length + '건, 확인창 ' + result[SCENARIOS[i]].dialogs.length + '건');
  }
  if (UPDATE) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, JSON.stringify(result, null, 1));
    console.log('✅ 기록 갱신: ' + GOLDEN);
    process.exit(0);
  }
  if (!fs.existsSync(GOLDEN)) { console.log('❌ 기록 파일이 없어요. 먼저 --update로 만드세요.'); process.exit(1); }
  const golden = canon(JSON.parse(fs.readFileSync(GOLDEN, 'utf-8')));
  let fails = 0;
  Object.keys(result).forEach(name => {
    if (JSON.stringify(golden[name]) === JSON.stringify(result[name])) { console.log('✅ ' + name + ' — 기록과 완전히 동일'); return; }
    fails++;
    console.log('❌ ' + name + ' — 기록과 다름');
    explainDiff(golden[name], result[name]).slice(0, 10).forEach(l => console.log('     Δ ' + l));
  });
  console.log(fails === 0 ? '\n✅ 전체 통과(고객추가 모달 동작이 기록과 동일)' : '\n❌ ' + fails + '건 다름 — 의도한 변경이면 --update, 아니면 코드를 되돌리세요');
  process.exit(fails === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
