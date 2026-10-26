// tests/stage-auto-note-check.js
// 2026-10-26(N-12): 고객상세의 "자동 이동" 안내가 (1) 실제 이동일 때만 보이고 (2) '[기록전용]' 시험 기록·낡은 기록·서버 오류에서는
// 보이지 않으며 (3) 화면이 깨지지 않는지 확인한다.
// 한계: 가짜 서버·Chromium 환경의 시험이다. 실제 운영 기록·Edge 화면 확인은 아니다.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 9980;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  let mode = 'real'; const asked = [];
  const rows = {
    real: [{ from_stage: '상담', to_stage: '선금결제', reason: '선금 입금이 기록되어 자동 이동', changed_at: '2026-10-26T06:08:59Z' }],
    shadowOnly: [{ from_stage: '선금결제', to_stage: '선금결제', reason: '[기록전용] 규칙이 이동했을 결과: 선금결제 → 실측준비중', changed_at: '2026-10-26T07:47:17Z' }],
    stale: [{ from_stage: '상담', to_stage: '가견적', reason: '선금 입금이 기록되어 자동 이동', changed_at: '2026-10-20T06:00:00Z' }],
    realBehindShadow: [
      { from_stage: '선금결제', to_stage: '실측준비중', reason: '[기록전용] 규칙이 이동했을 결과: 선금결제 → 실측준비중', changed_at: '2026-10-26T07:47:17Z' },
      { from_stage: '상담', to_stage: '선금결제', reason: '선금 입금이 기록되어 자동 이동', changed_at: '2026-10-26T06:08:59Z' }
    ],
    none: []
  };
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url(), method = req.method();
    if (!url.includes('supabase.co')) { if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort(); return; }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
    if (url.includes('/rest/v1/customer_stage_auto_log')) {
      asked.push(url);
      if (mode === 'error') return req.respond({ status: 500, contentType: 'application/json', headers: CORS, body: '{"message":"boom"}' });
      return req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(rows[mode] || []) });
    }
    req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
  });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  const noteOf = async (m, stage) => {
    mode = m;
    await page.evaluate((st) => { saveCustomers([{ id: 601, clientName: '자동이동시험', phone: '01011112222', stage: st, staffName: '마스터' }]); openDetail('자동이동시험', 601, 'info'); }, stage);
    await new Promise(r => setTimeout(r, 900));
    return page.evaluate(() => { const n = document.getElementById('stage-auto-note'); return n ? { shown: n.style.display !== 'none', text: n.textContent } : null; });
  };
  let r = await noteOf('real', '선금결제');
  ok('실제 이동 기록 + 현재 단계 일치 → 안내가 보임', r && r.shown && r.text.includes('상담') && r.text.includes('선금결제') && r.text.includes('자동 이동'), JSON.stringify(r));
  ok('서버에 해당 고객(601) 기록만 요청함', asked.some(u => u.includes('customer_id=eq.601')));
  r = await noteOf('shadowOnly', '선금결제');
  ok("'[기록전용]' 시험 기록만 있으면 안내가 안 보임(거짓 안내 방지)", r && !r.shown, JSON.stringify(r));
  r = await noteOf('stale', '선금결제');
  ok('기록의 도착 단계가 지금 단계와 다르면(낡은 기록) 안내가 안 보임', r && !r.shown, JSON.stringify(r));
  r = await noteOf('realBehindShadow', '선금결제');
  ok("최신 행이 '[기록전용]'이어도 그 뒤의 실제 이동 기록을 찾아 보여줌", r && r.shown && r.text.includes('상담'), JSON.stringify(r));
  r = await noteOf('none', '선금결제');
  ok('기록이 없으면 안내가 안 보임', r && !r.shown, JSON.stringify(r));
  r = await noteOf('error', '선금결제');
  ok('서버 오류여도 안내만 숨고 화면은 정상(오류 없음)', r && !r.shown && errs.length === 0, JSON.stringify(r) + ' ' + errs.join('|'));
  ok('JS 에러 없음', errs.length === 0, errs.join(' | '));
  await browser.close(); server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 모두 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
