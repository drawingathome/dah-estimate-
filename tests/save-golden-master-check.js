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

// 객체의 키 순서에 의존하지 않도록 재귀적으로 정렬(배열 순서는 그대로).
// 2026-09-28: GitHub CI에서 골든마스터가 8개 시나리오 전부 실패했는데, 원인은 localStorage 키를
// 돌려주는 순서가 CI의 브라우저/OS에서 달라서(내용은 같음)였음 - 내 컴퓨터에서만 우연히 맞던 순서에 의존.
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach(k => { o[k] = canon(v[k]); }); return o; }
  return v;
}
function normalize(v) {
  // 실행 환경/코드 변경에 따라 달라지는 값들은 비교에서 제외:
  //  - 포트 번호, 파일 버전 해시(?v=...), 오류 스택의 줄:칸 위치(.js:60:10)
  return canon(JSON.parse(JSON.stringify(v)
    .replace(/localhost:\d+/g, 'localhost:PORT')
    .replace(/\?v=[0-9a-f]{12}/g, '?v=HASH')
    // 2026-10-06: 저장 영수증(save_receipts)의 app_version은 스크립트 주소의 ?v=해시 값이라 파일 내용이 바뀔 때마다(정적 점검의 캐시버전 갱신 포함) 달라짐 - 감시 대상이 아님
    .replace(/"app_version":"[0-9a-f]{12}"/g, '"app_version":"HASH"')
    // 2026-10-06: 영수증의 device(브라우저 종류·화면 크기)와 at_local(시간대 이름이 들어간 현지 시각)도 실행 환경(CI·다른 컴퓨터)마다 달라지는 값 - 감시 대상이 아님.
    // (CI가 device 차이로 실패해서 발견: 환경에 따라 달라질 수 있는 영수증 값은 한 번에 전수 점검해서 제외한다 - 체크리스트 55번)
    .replace(/"device":"[^"]*"/g, '"device":"DEVICE"')
    .replace(/"at_local":"[^"]*"/g, '"at_local":"AT_LOCAL"')
    .replace(/\.js(\?v=HASH)?:\d+:\d+/g, '.js:L:C')));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 고정 시간 대신 "요청이 조용해질 때까지" 기다림(느린 CI 서버에서도 같은 상태에서 캡처되게).
// 2026-09-28: 고정 1.8초 대기 + 요청 순서 비교로 만들었더니, 컴퓨터가 느리면(CPU 부하 실험으로
// 재현) 같은 코드인데도 기록과 달라져서 GitHub CI가 실패했음.
async function settle(page, state, quietMs = 3000, maxMs = 25000) {
  const t0 = Date.now();
  await sleep(800);
  while (Date.now() - t0 < maxMs) {
    const idle = Date.now() - state.lastReqAt;
    const disabled = await page.evaluate(() => (document.getElementById('save-btn') || {}).disabled === true).catch(() => false);
    if (idle >= quietMs && !disabled) return;
    await sleep(200);
  }
}

async function runScenario(dir, sc, idx) {
  const port = 28700 + idx;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const rec = { requests: [], dialogs: [], jsErrors: [] };
  const state = { lastReqAt: Date.now() };
  page.on('pageerror', e => rec.jsErrors.push(e.message));
  page.on('dialog', async d => { rec.dialogs.push(d.message()); try { await d.accept(); } catch (e) {} });
  await page.evaluateOnNewDocument(FREEZE);
  // 검증용: GM_REVERSE_KEYS=1 이면 브라우저가 localStorage 항목을 "거꾸로 된 순서"로 알려주게 만듦
  // (GitHub CI에서 실제로 일어난 상황을 내 컴퓨터에서 재현 - 순서가 달라도 통과해야 함)
  if (process.env.GM_REVERSE_KEYS) await page.evaluateOnNewDocument(`(() => {
    const ok = Storage.prototype.key; const len = Object.getOwnPropertyDescriptor(Storage.prototype, 'length').get;
    Storage.prototype.key = function (i) { const n = len.call(this); const ks = []; for (let j = 0; j < n; j++) ks.push(ok.call(this, j)); ks.sort().reverse(); return i < ks.length ? ks[i] : null; };
  })();`);
  await page.setRequestInterception(true);
  const opt = sc.opt || {};
  const estimates = []; let estN = 0, custN = 0;
  page.on('request', (req) => {
    const url = req.url(); const method = req.method();
    const host = (() => { try { return new URL(url).hostname; } catch (e) { return ''; } })();
    if (host === 'localhost' || host === '127.0.0.1') { req.continue(); return; }
    // 구글 Apps Script 웹훅(고객명단/드라이브 동기화): 실제로는 no-cors라 응답 내용이 필요 없음.
    // 예전엔 abort해서 "재시도 2회" 로그가 시간에 따라 달라졌으므로, 즉시 성공 응답으로 고정하고
    // 어떤 내용을 보냈는지(본문)는 기록함.
    if (/google(usercontent)?\.com$/.test(host)) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } }); return; }
      state.lastReqAt = Date.now();
      let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) { body = req.postData() || null; }
      const u0 = new URL(url);
      rec.requests.push({ method, path: 'EXTERNAL:' + host + u0.pathname.replace(/\/macros\/s\/[^/]+/, '/macros/s/ID'), body });
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '{}' });
      return;
    }
    if (!url.includes('supabase.co')) { req.abort(); return; }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
    const u = new URL(url); const p = u.pathname + u.search;
    if (p.includes('/auth/v1/token')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: json({ access_token: 'x', refresh_token: 'y', expires_in: 3600, user: { id: 'u', email: 'a@b.c' } }) }); return; }
    if (p.includes('/rest/v1/app_settings')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return; }
    state.lastReqAt = Date.now();
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
  await sleep(700);
  await setupValidSession(page);
  await settle(page, state);
  await page.evaluate(sc.pre + '\n' + sc.fill);
  for (const act of sc.acts) {
    state.lastReqAt = Date.now();
    await page.evaluate(act);
    await settle(page, state);
  }
  const st = await page.evaluate((rev) => {
    const ls = {}; const idxs = []; for (let i = 0; i < localStorage.length; i++) idxs.push(i); if (rev) idxs.reverse();
    idxs.forEach(i => { const k = localStorage.key(i); if (!/session|auth|token/i.test(k)) ls[k] = localStorage.getItem(k); });
    const toast = document.getElementById('toast');
    return {
      localStorage: ls,
      toast: toast ? toast.textContent : null,
      estEditState: JSON.parse(JSON.stringify(window._estEditState || {})),
      saveBtnDisabled: (document.getElementById('save-btn') || {}).disabled === true
    };
  }, process.env.GM_REVERSE_LS === '1');
  await browser.close(); server.kill();
  // 비교 구조:
  //  writes = 고객/견적서를 실제로 "쓰는"(POST/PATCH/DELETE) 요청 - 앞뒤가 정해진 흐름(고객 저장 → 견적서 저장)이라
  //           순서까지 그대로 비교
  //  others = 그 밖의 요청(조회 GET, 진단/행동 로그, 외부 동기화) - 서로 무관하게 동시에 나가서 순서가
  //           실행마다 달라질 수 있으므로 내용만(순서 무관) 비교
  const isWrite = (r) => ['POST', 'PATCH', 'DELETE'].includes(r.method) && /\/rest\/v1\/(customers|estimates)\b/.test(r.path);
  const writes = rec.requests.filter(isWrite);
  const others = rec.requests.filter(r => !isWrite(r)).map(r => JSON.stringify(r)).sort().map(x => JSON.parse(x));
  return normalize({ writes, others, dialogs: rec.dialogs, jsErrors: rec.jsErrors, ...st });
}

// 기록과 지금이 "어디가 어떻게" 다른지 사람이 읽을 수 있게 설명(CI 로그를 직접 못 볼 때도 원인이 보이게).
function short(x, n = 90) { const t = typeof x === 'string' ? x : JSON.stringify(x); return (t === undefined ? 'undefined' : t).slice(0, n); }
// 두 값에서 "실제로 다른 항목"의 경로와 값을 콕 집어 알려줌(예: body.performance_revenue : 기록 225000 → 지금 225001)
function leafDiffs(a, b, path, out) {
  if (out.length >= 6 || JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach(k => leafDiffs(a[k], b[k], path + '.' + k, out));
  } else if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) leafDiffs(a[i], b[i], path + '[' + i + ']', out);
  } else out.push(path + ' : 기록 ' + short(a, 70) + ' → 지금 ' + short(b, 70));
  return out;
}
function explainDiff(g, r) {
  const out = [];
  new Set([...Object.keys(g), ...Object.keys(r)]).forEach(k => {
    if (JSON.stringify(g[k]) === JSON.stringify(r[k])) return;
    if (k === 'localStorage') {
      const gk = Object.keys(g[k] || {}), rk = Object.keys(r[k] || {});
      const onlyG = gk.filter(x => !rk.includes(x)), onlyR = rk.filter(x => !gk.includes(x));
      if (onlyG.length) out.push('localStorage - 기록에만 있는 항목: ' + onlyG.join(', '));
      if (onlyR.length) out.push('localStorage - 지금만 있는 항목: ' + onlyR.join(', '));
      gk.filter(x => rk.includes(x) && g[k][x] !== r[k][x]).forEach(x => out.push('localStorage[' + x + '] 값이 다름 | 기록: ' + short(g[k][x]) + ' | 지금: ' + short(r[k][x])));
    } else if (Array.isArray(g[k]) && Array.isArray(r[k])) {
      out.push(k + ': 개수 기록 ' + g[k].length + '개 / 지금 ' + r[k].length + '개');
      const n = Math.max(g[k].length, r[k].length); let c = 0;
      for (let i = 0; i < n && c < 3; i++) if (JSON.stringify(g[k][i]) !== JSON.stringify(r[k][i])) { leafDiffs(g[k][i], r[k][i], '  ' + k + '[' + i + ']', []).forEach(x => out.push(x)); c++; }
    } else out.push(k + ' 다름 | 기록: ' + short(g[k], 120) + ' | 지금: ' + short(r[k], 120));
  });
  return out;
}

async function run() {
  const dir = path.resolve(__dirname, '..');
  const result = {};
  for (let i = 0; i < SCENARIOS.length; i++) {
    process.stdout.write('  · ' + SCENARIOS[i].name + ' ... ');
    result[SCENARIOS[i].name] = await runScenario(dir, SCENARIOS[i], i);
    console.log('쓰기요청 ' + result[SCENARIOS[i].name].writes.length + '건 + 기타 ' + result[SCENARIOS[i].name].others.length + '건 기록');
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
    const a = JSON.stringify(canon(golden[name]), null, 1), b = JSON.stringify(result[name], null, 1);
    if (a === b) { console.log('✅ ' + name + ' — 기록과 완전히 동일'); return; }
    fails++;
    console.log('❌ ' + name + ' — 기록과 다름');
    explainDiff(canon(golden[name]), result[name]).slice(0, 16).forEach(l => console.log('     Δ ' + l));
  });
  Object.keys(golden).filter(k => !(k in result)).forEach(k => { fails++; console.log('❌ ' + k + ' — 시나리오가 사라짐'); });
  console.log(fails === 0 ? '\n✅ 전체 통과(저장 동작이 기록과 동일)' : '\n❌ ' + fails + '건 다름 — 의도한 변경이면 --update, 아니면 코드를 되돌리세요');
  process.exit(fails === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
