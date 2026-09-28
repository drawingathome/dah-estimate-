// tests/save-golden-master-check.js
// ══════════════════════════════════════════════════
// 견적서 저장 로직 "동작 고정(골든마스터)" 테스트
//
// 2026-09-28(선혜님 - "전문업체서 잡으면 어떻게 하겠니" - est-save.js는 버그 수정이
// 83번 중 70번으로 재발 버그가 가장 많이 몰린 파일인데 763줄짜리 함수 하나라 손을
// 못 대고 있었음): 이런 코드를 전문가가 고칠 때는 먼저 "지금 이 코드가 무엇을 하는지"를
// 기록해두고(특성화 테스트), 구조를 바꾼 뒤에도 기록이 글자 하나까지 같은지 비교함.
// 내부를 어떻게 바꿨든 바깥에서 보이는 동작(서버로 나가는 요청, 화면 메시지, 로컬 저장값)이
// 같으면 안전하다는 뜻.
//
// 기록하는 것: 시나리오마다 (1) 서버로 나가는 요청 전부(순서·주소·본문·Prefer 헤더),
// (2) 화면에 뜬 확인창/토스트, (3) 로컬저장소 내용, (4) 저장 상태값.
// 시간(Date)·난수는 고정해서 같은 코드면 항상 같은 기록이 나오게 함.
//
// 사용법
//   node tests/save-golden-master-check.js            → 기록(tests/golden/save-flow.json)과 비교
//   node tests/save-golden-master-check.js --update   → 의도적으로 동작을 바꿨을 때만: 기록 갱신
// ══════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const GOLDEN = path.join(__dirname, 'golden', 'save-flow.json');
const UPDATE = process.argv.includes('--update');

const FREEZE = `(() => {
  const FIXED = new Date('2026-09-28T12:00:00+09:00').getTime();
  const RealDate = Date;
  function FakeDate(...a) {
    if (!(this instanceof FakeDate)) return new RealDate(FIXED).toString();
    return a.length ? new RealDate(...a) : new RealDate(FIXED);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => FIXED; FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  window.Date = FakeDate;
  let seed = 12345;
  Math.random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  if (window.crypto && crypto.randomUUID) { let u = 0; crypto.randomUUID = () => '00000000-0000-4000-8000-' + String(++u).padStart(12, '0'); }
})();`;

const CORS = { 'Access-Control-Allow-Origin': '*' };
const json = (o) => JSON.stringify(o);

// 시나리오 정의: 준비(setup) → 실행(act) 단계에서 화면을 채우고 saveEstimate()를 부름
const FILL = `
  document.getElementById('c-name').value = '골든고객';
  document.getElementById('c-phone').value = '01012345678';
  document.getElementById('c-addr').value = '서울 서초구';
  document.getElementById('c-measure').value = '2026-10-01';
  document.getElementById('c-install').value = '2026-10-05';
  var tr = document.querySelector('.row-curtain');
  tr.querySelector('.space-inp').value = '거실';
  tr.querySelector('.mw').value = 300; calcCurtainRow(tr.querySelector('.mw'));
  tr.querySelector('.mh').value = 240; calcCurtainRow(tr.querySelector('.mh'));
  tr.querySelector('.cprice').value = 45000; calcCurtainRow(tr.querySelector('.cprice'));
`;
const EXISTING_CUSTOMER = `
  window._estEditState = window._estEditState || {};
  window._estEditState.estSaveCustomerId = 221;
  localStorage.setItem('dah_customers', JSON.stringify([{ id: 221, clientName: '골든고객', phone: '01012345678', stage: '상담', price: 0 }]));
`;
const SCENARIOS = [
  { name: 'S1_신규고객_신규견적', pre: '', fill: FILL, acts: ['saveEstimate()'] },
  { name: 'S2_기존고객_견적추가_후_재저장', pre: EXISTING_CUSTOMER, fill: FILL, acts: ['saveEstimate()', 'saveEstimate()'] },
  { name: 'S3_수정모드', pre: EXISTING_CUSTOMER + `window._estEditState.editingEstDbId = 'srv-est-EDIT';`, fill: FILL, acts: ['saveEstimate()'] },
  { name: 'S4_검증실패_이름없음', pre: '', fill: FILL + `document.getElementById('c-name').value = '';`, acts: ['saveEstimate()'] },
  { name: 'S5_확정상태_저장', pre: EXISTING_CUSTOMER + `window._estEditState.estimateConfirmedAt = '2026-09-28T00:00:00.000Z';`, fill: FILL, acts: ['saveEstimate()'] },
  { name: 'S6_수정모드_0건반영(권한/충돌)', pre: EXISTING_CUSTOMER + `window._estEditState.editingEstDbId = 'srv-est-EDIT';`, fill: FILL, acts: ['saveEstimate()'], opt: { patchEstimateZeroRows: true } },
  { name: 'S7_신규견적_서버오류500', pre: EXISTING_CUSTOMER, fill: FILL, acts: ['saveEstimate()'], opt: { postEstimate500: true } },
  { name: 'S8_고객저장_서버오류500', pre: EXISTING_CUSTOMER, fill: FILL, acts: ['saveEstimate()'], opt: { customer500: true } }
];

function normalize(v) {
  return JSON.parse(JSON.stringify(v).replace(/localhost:\d+/g, 'localhost:PORT'));
}

async function runScenario(dir, sc, idx) {
  const port = 28700 + idx;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const rec = { requests: [], dialogs: [], jsErrors: [] };
  page.on('pageerror', e => rec.jsErrors.push(e.message));
  page.on('dialog', async d => { rec.dialogs.push(d.message()); try { await d.accept(); } catch (e) {} });
  await page.evaluateOnNewDocument(FREEZE);
  await page.setRequestInterception(true);
  const opt = sc.opt || {};
  const estimates = []; let estN = 0, custN = 0;
  page.on('request', (req) => {
    const url = req.url(); const method = req.method();
    if (!url.includes('supabase.co')) {
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
      return;
    }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
    const u = new URL(url); const p = u.pathname + u.search;
    if (p.includes('/auth/v1/token')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: json({ access_token: 'x', refresh_token: 'y', expires_in: 3600, user: { id: 'u', email: 'a@b.c' } }) }); return; }
    if (p.includes('/rest/v1/app_settings')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return; }
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) { body = req.postData() || null; }
    const prefer = req.headers()['prefer'];
    rec.requests.push({ method, path: p, body, ...(prefer ? { prefer } : {}) });
    const ok = (status, data) => req.respond({ status, contentType: 'application/json', headers: CORS, body: json(data) });
    if (method === 'GET' && p.includes('/rest/v1/estimates') && p.includes('updated_at=gte')) return ok(200, estimates.length ? [estimates[estimates.length - 1]] : []);
    if (method === 'GET' && p.includes('/rest/v1/estimates') && p.includes('select=id,price,performance_revenue')) return ok(200, estimates.slice());
    if (method === 'GET' && p.includes('select=updated_at')) return ok(200, [{ updated_at: '2026-09-28T03:00:00Z' }]);
    if (method === 'PATCH' && p.includes('/rest/v1/customers')) { if (opt.customer500) return ok(500, { message: 'boom' }); return ok(200, [{ id: 221, ...(body || {}) }]); }
    if (method === 'POST' && p.includes('/rest/v1/customers')) { if (opt.customer500) return ok(500, { message: 'boom' }); custN++; return ok(201, [{ id: 900 + custN, ...(body || {}) }]); }
    if (method === 'POST' && p.includes('/rest/v1/estimates')) {
      if (opt.postEstimate500) return ok(500, { message: 'boom' });
      estN++; const rec2 = { id: 'srv-est-' + estN, price: body && body.price, performance_revenue: body && body.performance_revenue };
      estimates.push(rec2);
      if ((prefer || '').includes('return=minimal')) return req.respond({ status: 201, headers: CORS });
      return ok(201, [{ ...rec2, ...(body || {}) }]);
    }
    if (method === 'PATCH' && p.includes('/rest/v1/estimates')) { if (opt.patchEstimateZeroRows) return ok(200, []); return ok(200, [{ id: 'srv-est-EDIT', ...(body || {}) }]); }
    return ok(200, []);
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(sc.pre + '\n' + sc.fill);
  for (const act of sc.acts) {
    await page.evaluate(act);
    await new Promise(r => setTimeout(r, 1800));
  }
  await new Promise(r => setTimeout(r, 1200));
  const state = await page.evaluate(() => {
    const ls = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!/session|auth|token/i.test(k)) ls[k] = localStorage.getItem(k); }
    const toast = document.getElementById('toast');
    return {
      localStorage: ls,
      toast: toast ? toast.textContent : null,
      estEditState: JSON.parse(JSON.stringify(window._estEditState || {})),
      saveBtnDisabled: (document.getElementById('save-btn') || {}).disabled === true
    };
  });
  await browser.close(); server.kill();
  // 진단 로그(client_error_logs)/행동 로그(analytics_events)는 저장 도중 다른 요청과 "동시에" 나가서
  // 어느 게 먼저 관찰되는지가 실행마다 달라짐(2026-09-28 검증 중 실제로 S8이 가끔 실패해서 발견).
  // 순서가 진짜 의미 있는 업무 요청(고객 저장 → 견적서 저장 등)은 순서까지 그대로 비교하고,
  // 로그류는 내용만(순서 무관) 비교함.
  const isLog = (r) => /\/rest\/v1\/(client_error_logs|analytics_events)/.test(r.path);
  const logs = rec.requests.filter(isLog).map(r => JSON.stringify(r)).sort().map(x => JSON.parse(x));
  const biz = rec.requests.filter(r => !isLog(r));
  return normalize({ requests: biz, logs, dialogs: rec.dialogs, jsErrors: rec.jsErrors, ...state });
}

async function run() {
  const dir = path.resolve(__dirname, '..');
  const result = {};
  for (let i = 0; i < SCENARIOS.length; i++) {
    process.stdout.write('  · ' + SCENARIOS[i].name + ' ... ');
    result[SCENARIOS[i].name] = await runScenario(dir, SCENARIOS[i], i);
    console.log('업무요청 ' + result[SCENARIOS[i].name].requests.length + '건 + 로그 ' + result[SCENARIOS[i].name].logs.length + '건 기록');
  }
  if (UPDATE) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, JSON.stringify(result, null, 1));
    console.log('✅ 기록 갱신: ' + GOLDEN);
    process.exit(0);
  }
  if (!fs.existsSync(GOLDEN)) { console.log('❌ 기록 파일이 없어요. 먼저 --update로 만드세요.'); process.exit(1); }
  const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf-8'));
  let fails = 0;
  Object.keys(result).forEach(name => {
    const a = JSON.stringify(golden[name], null, 1), b = JSON.stringify(result[name], null, 1);
    if (a === b) { console.log('✅ ' + name + ' — 기록과 완전히 동일'); return; }
    fails++;
    console.log('❌ ' + name + ' — 기록과 다름');
    const al = a.split('\n'), bl = b.split('\n');
    let shown = 0;
    for (let i = 0; i < Math.max(al.length, bl.length) && shown < 6; i++) if (al[i] !== bl[i]) { console.log('     기록: ' + (al[i] || '(없음)').slice(0, 140)); console.log('     지금: ' + (bl[i] || '(없음)').slice(0, 140)); shown++; }
  });
  Object.keys(golden).filter(k => !(k in result)).forEach(k => { fails++; console.log('❌ ' + k + ' — 시나리오가 사라짐'); });
  console.log(fails === 0 ? '\n✅ 전체 통과(저장 동작이 기록과 동일)' : '\n❌ ' + fails + '건 다름 — 의도한 변경이면 --update, 아니면 코드를 되돌리세요');
  process.exit(fails === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
