// tests/est-retry-queue-golden-master-check.js
// ══════════════════════════════════════════════════
// 견적서 재시도 큐(est-sync-queue.js) 동작 고정(골든마스터) 테스트
//
// 2026-09-30(선혜님 - "지금 고쳐야지" - 노지경 견적서 사례): 저장이 실패해서 재시도 큐에 들어간
// 뒤, 재시도 PATCH가 서버에서 HTTP상 성공(2xx)해도 실제로는 0건 매칭(권한문제/동시저장충돌)될
// 수 있는데, 이 재시도 경로가 그동안 이걸 전혀 확인 안 해서(return=minimal) "성공"으로 착각하고
// 조용히 큐에서 지워버리던 근본 원인 버그를 수정. 이 기록은 그 수정이 앞으로도 유지되는지 감시함 -
// 특히 "0건 반영을 성공으로 오판하지 않는다"가 핵심이라, 이 시나리오가 제일 중요함.
//
// 사용법
//   node tests/est-retry-queue-golden-master-check.js            → 기록과 비교
//   node tests/est-retry-queue-golden-master-check.js --update   → 의도적으로 동작을 바꿨을 때만: 기록 갱신
// ══════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const GOLDEN = path.join(__dirname, 'golden', 'est-retry-queue-flow.json');
const UPDATE = process.argv.includes('--update');
const CORS = { 'Access-Control-Allow-Origin': '*' };

function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach(k => { o[k] = canon(v[k]); }); return o; }
  return v;
}

const SCENARIOS = {
  // 핵심 회귀 감시 대상: HTTP 200이지만 실제 반영 0건(권한문제/동시저장충돌 추정)
  S1_0건반영_가짜성공: (req) => req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }),
  // 정상 회귀 없음 확인: 진짜 성공(1건 반영)
  S2_정상성공_1건반영: (req) => req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 'test-est-id-abc', client_id: 999, price: 12345 }]) }),
  // 정상 회귀 없음 확인: 진짜 HTTP 실패(500) - 여전히 큐에 남아야 함
  S3_진짜HTTP실패_500: (req) => req.respond({ status: 500, contentType: 'application/json', headers: CORS, body: JSON.stringify({ message: 'internal error' }) }),
  // 409(idempotency, 이미 성공한 걸로 간주) - 회귀 없음 확인
  S4_409_이미성공한것으로간주: (req) => req.respond({ status: 409, contentType: 'application/json', headers: CORS, body: JSON.stringify({ message: 'duplicate key' }) }),
  // 401(세션문제) - 재로그인 프롬프트 유도 경로, alert 억제되는지 확인
  S5_401_인증문제: (req) => req.respond({ status: 401, contentType: 'application/json', headers: CORS, body: JSON.stringify({ message: 'JWT expired' }) }),
  // 응답 파싱 자체가 실패하는 경우(깨진 JSON) - 안전하게 "확인 필요"로 취급되는지
  S6_응답파싱실패: (req) => req.respond({ status: 200, contentType: 'text/plain', headers: CORS, body: 'not-json{{{' })
};

async function runScenario(dir, name, responder, idx) {
  const port = 30800 + idx;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const alerts = []; page.on('dialog', async d => { alerts.push(d.message()); try { await d.dismiss(); } catch (e) {} });
  const jsErrors = []; page.on('pageerror', e => jsErrors.push(e.message));
  const sentHeaders = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/rest/v1/estimates')) { sentHeaders.push(req.headers()['prefer'] || null); responder(req); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 600));
  await setupValidSession(page);
  const result = await page.evaluate(() => {
    localStorage.setItem('dah_pending_estimate_sync', JSON.stringify([
      { payload: { client_id: 999, price: 12345 }, addedAt: '2026-09-29T00:00:00.000Z', isEditMode: true, dbId: 'test-est-id-abc' }
    ]));
    return new Promise((resolve) => {
      retryEstPendingSync();
      setTimeout(() => {
        resolve({
          pendingQueueLen: JSON.parse(localStorage.getItem('dah_pending_estimate_sync') || '[]').length,
          failedSavesLen: JSON.parse(localStorage.getItem('dah_failed_saves') || '[]').length,
          failedSaveReason: (JSON.parse(localStorage.getItem('dah_failed_saves') || '[]')[0] || {}).reason || null,
          bannerText: (document.getElementById('est-sync-pending-banner') || {}).textContent || null
        });
      }, 900);
    });
  });
  await browser.close(); server.kill();
  return canon({ ...result, alertCount: alerts.length, alertFirstLine: (alerts[0] || '').split('\n')[0] || null, jsErrors, sentPreferHeader: sentHeaders[0] || null });
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
  for (const [name, responder] of Object.entries(SCENARIOS)) {
    const idx = Object.keys(SCENARIOS).indexOf(name);
    process.stdout.write('  · ' + name + ' ... ');
    result[name] = await runScenario(dir, name, responder, idx);
    console.log('큐남음=' + result[name].pendingQueueLen + ' 백업=' + result[name].failedSavesLen + ' alert=' + result[name].alertCount);
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
    explainDiff(golden[name], result[name]).forEach(l => console.log('     Δ ' + l));
  });
  console.log(fails === 0 ? '\n✅ 전체 통과(재시도 큐 동작이 기록과 동일)' : '\n❌ ' + fails + '건 다름 — 의도한 변경이면 --update, 아니면 코드를 되돌리세요');
  process.exit(fails === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
