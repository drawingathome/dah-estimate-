// tests/as-section-golden-master-check.js
// ══════════════════════════════════════════════════
// A/S 탭(renderASSection) 동작 고정(골든마스터) 테스트
//
// 2026-09-28(선혜님 - "React 전환부터" 선택): dash-customer-as.js를 React로 바꾸기 전, "지금 이 화면이
// 무엇을 보여주고 무엇을 서버로 보내는지"를 먼저 기록해둠. React로 다시 짜도 겉보기 동작(화면에 보이는
// 텍스트/버튼, 서버로 나가는 요청 내용)이 같은지 비교하는 용도 - DOM 태그 구조 자체는 React가 다르게
// 그릴 수 있으므로 비교 기준으로 삼지 않고, "사람이 보고 확인할 수 있는 내용"만 비교함.
//
// 사용법
//   node tests/as-section-golden-master-check.js            → 기록과 비교
//   node tests/as-section-golden-master-check.js --update   → 의도적으로 동작을 바꿨을 때만: 기록 갱신
// ══════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
const GOLDEN = path.join(__dirname, 'golden', 'as-section-flow.json');
const UPDATE = process.argv.includes('--update');
const CORS = { 'Access-Control-Allow-Origin': '*' };
const json = (o) => JSON.stringify(o);

function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach(k => { o[k] = canon(v[k]); }); return o; }
  return v;
}
function normalize(v) { return canon(JSON.parse(JSON.stringify(v).replace(/localhost:\d+/g, 'localhost:PORT'))); }

// 화면에서 "사람이 보는 내용"만 추출 - 태그 구조가 아니라 텍스트/버튼 유무
const EXTRACT = `(() => {
  const body = document.getElementById('detail-as-body');
  const rows = Array.from(body.querySelectorAll('div')).filter(d => d.children.length === 0 && d.textContent.trim());
  // 폼 요소 상태
  const form = {
    hasSymptomBox: !!body.querySelector('textarea'),
    hasVisitDateBox: !!body.querySelector('input[type="date"]'),
    feeOptions: Array.from(body.querySelectorAll('select option')).map(o => o.value),
    feeAmountVisible: (() => { const el = body.querySelectorAll('input[type="number"]')[0]; return el ? el.style.display !== 'none' : null; })(),
    addButtonText: (() => { const btns = Array.from(body.querySelectorAll('button')); return (btns.find(b => b.textContent.includes('등록')) || {}).textContent; })()
  };
  // 목록에 보이는 것 - 각 기록의 상태뱃지/증상/메타/다음단계버튼 존재 여부
  const listText = body.textContent.replace(/\\s+/g, ' ').trim();
  const nextStepButtons = Array.from(body.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t.includes('→'));
  return { form, listText, nextStepButtons };
})()`;

const SCENARIOS = [
  { name: 'S1_목록없음', records: [] },
  { name: 'S2_접수_한건', records: [{ id: 1, status: '접수', receipt_date: '2026-09-20', symptom: '블라인드 줄 끊어짐', fee_type: '무상', fee_amount: 0, visit_date: null }] },
  { name: 'S3_방문예정_유상', records: [{ id: 2, status: '방문예정', receipt_date: '2026-09-18', symptom: '커튼 레일 처짐', fee_type: '유상', fee_amount: 30000, visit_date: '2026-09-25' }] },
  { name: 'S4_완료건', records: [{ id: 3, status: '완료', receipt_date: '2026-09-01', symptom: '블라인드 각도조절 안됨', fee_type: '무상', fee_amount: 0, visit_date: '2026-09-05' }] },
  { name: 'S5_여러건_최신순', records: [
    { id: 5, status: '접수', receipt_date: '2026-09-22', symptom: '최신 접수건', fee_type: '무상', fee_amount: 0, visit_date: null },
    { id: 4, status: '방문예정', receipt_date: '2026-09-15', symptom: '중간 접수건', fee_type: '유상', fee_amount: 15000, visit_date: '2026-09-28' },
    { id: 3, status: '완료', receipt_date: '2026-09-01', symptom: '오래된 접수건', fee_type: '무상', fee_amount: 0, visit_date: '2026-09-05' }
  ]},
  { name: 'S6_서버오류', records: null, serverError: true }
];

async function runScenario(dir, sc, idx) {
  const port = 29900 + idx;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const rec = { requests: [], jsErrors: [], dialogs: [] };
  page.on('pageerror', e => rec.jsErrors.push(e.message));
  page.on('dialog', async d => { rec.dialogs.push(d.message()); try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url(); const method = req.method();
    if (!url.includes('supabase.co')) { if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort(); return; }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
    const u = new URL(url); const p = u.pathname + u.search;
    if (p.includes('/rest/v1/app_settings')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return; }
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) { body = req.postData() || null; }
    if (p.includes('/rest/v1/as_records')) {
      if (method === 'GET') {
        rec.requests.push({ method, path: p.replace(/customer_id=eq\.\d+/, 'customer_id=eq.ID') });
        if (sc.serverError) return req.respond({ status: 500, contentType: 'application/json', headers: CORS, body: json({ message: 'boom' }) });
        return req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: json(sc.records) });
      }
      rec.requests.push({ method, path: p.replace(/id=eq\.\d+/, 'id=eq.ID'), body });
      return req.respond({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', headers: CORS, body: json([{ id: 99, ...(body || {}) }]) });
    }
    req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
  });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  await page.evaluate(() => {
    saveCustomers([{ id: 501, clientName: 'AS테스트고객', phone: '01011112222', stage: '시공완료', staffName: '마스터', installDate: '2026-08-01' }]);
    openDetail('AS테스트고객', 501, 'as');
  });
  await new Promise(r => setTimeout(r, 900));
  const snap1 = await page.evaluate(EXTRACT);

  let snap2 = null;
  if (!sc.serverError) {
    // 접수 등록 폼 실제 입력 → 등록 (S1에서만: 등록 후 폼이 초기화되고 목록이 갱신되는지)
    if (sc.name === 'S1_목록없음') {
      await page.evaluate(() => {
        const body = document.getElementById('detail-as-body');
        body.querySelector('textarea').value = '새 접수 테스트';
        body.querySelector('input[type=date]').value = '2026-10-01';
        const sel = body.querySelector('select'); sel.value = '유상'; sel.dispatchEvent(new Event('change', { bubbles: true }));
        body.querySelectorAll('input[type=number]')[0].value = '20000';
      });
      await page.click('#detail-as-body button');
      await new Promise(r => setTimeout(r, 700));
      snap2 = await page.evaluate(EXTRACT);
    }
    // 다음 단계 버튼 클릭(있으면): 접수→방문예정, 방문예정→완료
    if (sc.records && sc.records.length && ['S2_접수_한건', 'S3_방문예정_유상'].includes(sc.name)) {
      const has = await page.evaluate(() => !!Array.from(document.querySelectorAll('#detail-as-body button')).find(b => b.textContent.includes('→')));
      if (has) {
        await page.evaluate(() => Array.from(document.querySelectorAll('#detail-as-body button')).find(b => b.textContent.includes('→')).click());
        await new Promise(r => setTimeout(r, 700));
        snap2 = await page.evaluate(EXTRACT);
      }
    }
  }
  await browser.close(); server.kill();
  return normalize({ initial: snap1, afterAction: snap2, requests: rec.requests, jsErrors: rec.jsErrors, dialogs: rec.dialogs });
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
    process.stdout.write('  · ' + SCENARIOS[i].name + ' ... ');
    result[SCENARIOS[i].name] = await runScenario(dir, SCENARIOS[i], i);
    console.log('요청 ' + result[SCENARIOS[i].name].requests.length + '건 기록');
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
    explainDiff(golden[name], result[name]).slice(0, 8).forEach(l => console.log('     Δ ' + l));
  });
  console.log(fails === 0 ? '\n✅ 전체 통과(A/S 화면 동작이 기록과 동일)' : '\n❌ ' + fails + '건 다름 — 의도한 변경이면 --update, 아니면 코드를 되돌리세요');
  process.exit(fails === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
