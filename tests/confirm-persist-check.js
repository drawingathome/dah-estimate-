// tests/confirm-persist-check.js
// 2026-10-17(선혜님 - "확정견적서를 눌러도 자꾸 가견적서로 바뀐다", 시험너 사례).
// DB 이력 조사: 그 견적서는 한 번도 확정으로 저장된 적이 없었고, 다른 견적서 3개에서 사유 기록 없이 확정이 풀린 흔적(3건)이 있었음.
// 원인: ① 확정 버튼이 화면 메모리만 바꿨고 DB엔 "저장"을 따로 눌러야 들어감(안내는 "확정됐습니다")
//       ② 저장이 확정 칸까지 화면 값으로 덮어써서, 화면이 확정 상태를 모르면 DB 확정이 null로 지워짐.
// 이 시험이 고정하는 약속:
//  1) DB에 있는 견적서: 확정을 누르면 즉시 확정 칸만 서버에 저장(내가 본 updated_at일 때만), 성공해야 확정으로 남음
//  2) 그 사이 다른 곳에서 먼저 수정됐거나(0건) 서버 오류면 화면도 원래대로(확정 안 된 척 하지 않음)
//  3) 아직 DB에 없는 새 견적서: 서버 호출 없이 "저장 전" 안내
//  4) 확정 취소(사유 선택)도 즉시 저장, 실패하면 확정 유지
//  5) 서버가 확정 상태였는데 화면 메모리가 비어 있는 채로 "저장"해도 확정 칸을 안 보냄(DB 확정을 안 지움)
//  6) 사유와 함께 정상 해제한 뒤 저장하면 확정 해제가 정상 반영됨
const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27161;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  const H = { 'Access-Control-Allow-Origin': '*' };
  const ctl = { mode: 'ok', patches: [], receipts: [], estPatchBodies: [] };
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url(); const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' }, H) }); return; }
      let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) { body = null; }
      const u = new URL(url); const p = u.pathname + u.search;
      if (p.includes('/save_receipts') && method === 'POST') { ctl.receipts.push(Array.isArray(body) ? body[0] : body); req.respond({ status: 201, contentType: 'application/json', headers: H, body: '[]' }); return; }
      if (method === 'PATCH' && p.includes('/rest/v1/estimates')) {
        const isConfirmPatch = body && Object.keys(body).every(k => k === 'confirmed_at' || k === 'estimate_status' || k === 'unconfirm_reason');
        if (isConfirmPatch) {
          ctl.patches.push({ path: p, body });
          if (ctl.mode === 'conflict') { req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' }); return; }
          if (ctl.mode === 'nocolumn' && body && 'unconfirm_reason' in body) { req.respond({ status: 400, contentType: 'application/json', headers: H, body: '{"code":"PGRST204","message":"Could not find the \'unconfirm_reason\' column of \'estimates\' in the schema cache"}' }); return; }
          if (ctl.mode === 'error') { req.respond({ status: 500, contentType: 'application/json', headers: H, body: '{"message":"boom"}' }); return; }
          req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([{ updated_at: '2026-10-17T05:00:00Z', confirmed_at: body.confirmed_at }]) });
          return;
        }
        ctl.estPatchBodies.push({ path: p, body });
        req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([{ id: 'est-X', updated_at: '2026-10-17T06:00:00Z', ...(body || {}) }]) });
        return;
      }
      if (method === 'PATCH' && p.includes('/rest/v1/customers')) { req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([{ id: 221, ...(body || {}) }]) }); return; }
      if (method === 'GET' && p.includes('select=updated_at')) { req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([{ updated_at: '2026-10-17T06:00:00Z' }]) }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' });
      return;
    }
    if (/google(usercontent)?\.com/.test(url)) { req.respond({ status: 200, contentType: 'application/json', headers: H, body: '{}' }); return; }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
  });
  await page.setViewport({ width: 1280, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const st = () => page.evaluate(() => ({ conf: window._estEditState.estimateConfirmedAt, lock: window._estEditState.editingEstUpdatedAt, loadedConf: window._estLoadedRow ? window._estLoadedRow.confirmed_at : undefined }));
  const reset = (extra) => page.evaluate((x) => {
    window._estEditState.estimateConfirmedAt = null;
    window._estEditState.editingEstDbId = x.id || null;
    window._estEditState.editingEstUpdatedAt = x.lock || null;
    window._estLoadedRow = x.loaded === undefined ? null : x.loaded;
    document.getElementById('c-name').value = '확정시험';
  }, extra);
  const reasonUnconfirm = async () => {
    await page.evaluate(() => { toggleConfirmEstimate(); var r = Array.from(document.querySelectorAll('input[name="est-unconfirm-reason"]')).find(i => i.value === '금액 오류 수정'); r.click(); });
    await page.evaluate(() => { document.getElementById('est-unconfirm-ok').click(); });
    await sleep(800);
  };

  // 1) DB에 있는 견적서 + 확정 → 즉시 저장(잠금 포함), 성공 시 확정 유지 + 잠금 갱신
  ctl.mode = 'ok'; ctl.patches.length = 0;
  await reset({ id: 'est-X', lock: '2026-10-17T04:00:00Z', loaded: { confirmed_at: null, deposit_amount: 0, balance_amount: 0, price: 1000000 } });
  await page.evaluate(() => { toggleConfirmEstimate(); });
  await sleep(800);
  let s = await st();
  ok('1. 확정을 누르면 확정 칸만 즉시 서버에 PATCH됨(updated_at 잠금 포함)', ctl.patches.length === 1 && ctl.patches[0].path.includes('id=eq.est-X') && ctl.patches[0].path.includes('updated_at=eq.2026-10-17T04%3A00%3A00Z') && ctl.patches[0].body.estimate_status === 'final' && !!ctl.patches[0].body.confirmed_at, JSON.stringify(ctl.patches[0]));
  ok('1-1. 성공하면 확정 유지 + 잠금값이 서버가 준 새 값으로 갱신 + 불러온 행도 확정으로 맞춤', !!s.conf && s.lock === '2026-10-17T05:00:00Z' && !!s.loadedConf, JSON.stringify(s));

  // 2) 충돌(0건) → 화면 확정 되돌림
  ctl.mode = 'conflict'; ctl.patches.length = 0;
  await reset({ id: 'est-X', lock: '2026-10-17T04:00:00Z', loaded: { confirmed_at: null, price: 1 } });
  await page.evaluate(() => { toggleConfirmEstimate(); });
  await sleep(800);
  s = await st();
  ok('2. 그 사이 다른 곳에서 수정돼 0건이면 확정이 되돌려짐(확정된 척 하지 않음)', s.conf === null, JSON.stringify(s));

  // 2-1) 서버 오류 → 되돌림
  ctl.mode = 'error'; ctl.patches.length = 0;
  await reset({ id: 'est-X', lock: '2026-10-17T04:00:00Z', loaded: { confirmed_at: null, price: 1 } });
  await page.evaluate(() => { toggleConfirmEstimate(); });
  await sleep(800);
  s = await st();
  ok('2-1. 서버 오류면 확정이 되돌려짐', s.conf === null, JSON.stringify(s));

  // 3) 새 견적서(DB에 아직 없음) → 서버 호출 없음 + 확정은 화면에만(저장 때 함께 들어감)
  ctl.mode = 'ok'; ctl.patches.length = 0;
  await reset({ id: null, lock: null, loaded: null });
  await page.evaluate(() => { toggleConfirmEstimate(); });
  await sleep(500);
  s = await st();
  ok('3. 새 견적서는 확정 즉시저장 호출을 하지 않음(아직 DB에 없음)', ctl.patches.length === 0);
  ok('3-1. 화면에는 확정으로 표시(저장 시 함께 반영)', !!s.conf, JSON.stringify(s));

  // 4) 확정 취소(사유) → 즉시 저장 + 영수증에 persisted:'ok'
  ctl.mode = 'ok'; ctl.patches.length = 0; ctl.receipts.length = 0;
  await reset({ id: 'est-X', lock: '2026-10-17T04:00:00Z', loaded: { confirmed_at: '2026-10-10T00:00:00Z', deposit_amount: 500000, balance_amount: 0, price: 1000000 } });
  await page.evaluate(() => { window._estEditState.estimateConfirmedAt = '2026-10-10T00:00:00Z'; });
  await reasonUnconfirm();
  s = await st();
  ok('4. 사유를 고르고 확정을 취소하면 서버에 confirmed_at=null, 상태=ga로 즉시 저장', ctl.patches.length === 1 && ctl.patches[0].body.confirmed_at === null && ctl.patches[0].body.estimate_status === 'ga', JSON.stringify(ctl.patches[0]));
  ok('4-0. 해제 요청에 사유(unconfirm_reason)가 함께 전송됨', ctl.patches.length === 1 && ctl.patches[0].body.unconfirm_reason === '금액 오류 수정', JSON.stringify(ctl.patches[0] && ctl.patches[0].body));
  ok('4-1. 성공하면 화면도 해제 + 불러온 행도 해제로 맞춤', s.conf === null && s.loadedConf === null, JSON.stringify(s));
  const rc = ctl.receipts.find(r => r && r.kind === 'unconfirm');
  ok('4-2. 영수증에 사유와 persisted=ok가 남음', !!rc && rc.outcome === '금액 오류 수정' && rc.detail && rc.detail.persisted === 'ok', JSON.stringify(rc && { o: rc.outcome, p: rc.detail && rc.detail.persisted }));

  // 4-3) 해제 저장 실패 → 확정 유지
  ctl.mode = 'conflict'; ctl.patches.length = 0; ctl.receipts.length = 0;
  await reset({ id: 'est-X', lock: '2026-10-17T04:00:00Z', loaded: { confirmed_at: '2026-10-10T00:00:00Z', deposit_amount: 0, balance_amount: 0, price: 1 } });
  await page.evaluate(() => { window._estEditState.estimateConfirmedAt = '2026-10-10T00:00:00Z'; });
  await reasonUnconfirm();
  s = await st();
  ok('4-3. 해제 저장이 실패(충돌)하면 확정이 그대로 유지됨', s.conf === '2026-10-10T00:00:00Z', JSON.stringify(s));
  ok('4-4. 실패한 해제는 영수증(unconfirm 성공 기록)을 남기지 않음', !ctl.receipts.some(r => r && r.kind === 'unconfirm'));

  // 4-5) DB에 사유 칸이 아직 없는 시기: 400(칸 없음)이면 사유 없이 한 번 더 보내서 정상 해제
  ctl.mode = 'nocolumn'; ctl.patches.length = 0; ctl.receipts.length = 0;
  await reset({ id: 'est-X', lock: '2026-10-17T04:00:00Z', loaded: { confirmed_at: '2026-10-10T00:00:00Z', deposit_amount: 0, balance_amount: 0, price: 1 } });
  await page.evaluate(() => { window._estEditState.estimateConfirmedAt = '2026-10-10T00:00:00Z'; });
  await reasonUnconfirm();
  s = await st();
  ok('4-5. 사유 칸이 없다는 오류(400)면 사유 없이 재전송해 해제됨', s.conf === null && ctl.patches.length === 2 && 'unconfirm_reason' in ctl.patches[0].body && !('unconfirm_reason' in ctl.patches[1].body), JSON.stringify({ n: ctl.patches.length, conf: s.conf }));

  // 5) 서버는 확정인데 화면 메모리가 비어 있는 채로 저장 → 확정 칸을 보내지 않음
  ctl.mode = 'ok'; ctl.estPatchBodies.length = 0;
  await reset({ id: 'est-X', lock: '2026-10-17T06:00:00Z', loaded: { confirmed_at: '2026-10-10T00:00:00Z', deposit_amount: 0, balance_amount: 0, price: 1000000 } });
  await page.evaluate(() => {
    window._estEditState.estSaveCustomerId = 221;
    localStorage.setItem('dah_customers', JSON.stringify([{ id: 221, clientName: '확정시험', phone: '01012345678', stage: '상담', price: 0 }]));
    document.getElementById('c-name').value = '확정시험';
    document.getElementById('c-phone').value = '01012345678';
    document.getElementById('c-addr').value = '서울 서초구';
    document.getElementById('c-measure').value = '2026-10-20';
    document.getElementById('c-install').value = '2026-10-25';
    var tr = document.querySelector('.row-curtain');
    tr.querySelector('.space-inp').value = '거실';
    tr.querySelector('.mw').value = 300; calcCurtainRow(tr.querySelector('.mw'));
    tr.querySelector('.mh').value = 240; calcCurtainRow(tr.querySelector('.mh'));
    tr.querySelector('.cprice').value = 45000; calcCurtainRow(tr.querySelector('.cprice'));
    saveEstimate();
  });
  await sleep(4000);
  const full = ctl.estPatchBodies.find(x => x.body && 'customer_name' in x.body);
  ok('5. (확정 유지 보호) 서버가 확정이었는데 화면이 비어 있어도 저장 요청이 나감', !!full, String(ctl.estPatchBodies.length));
  ok('5-1. 그 저장에는 confirmed_at/estimate_status가 들어 있지 않음(DB의 확정을 지우지 않음)', !!full && !('confirmed_at' in full.body) && !('estimate_status' in full.body), JSON.stringify(full && Object.keys(full.body).filter(k => /confirm|status/.test(k))));

  // 6) 정상 해제 후 저장 → 확정 해제가 정상 반영됨(null 전송)
  ctl.estPatchBodies.length = 0;
  await page.evaluate(() => { window._estEditState.editingEstUpdatedAt = '2026-10-17T06:00:00Z'; window._estLoadedRow = { confirmed_at: null, deposit_amount: 0, balance_amount: 0, price: 1000000 }; window._estEditState.estimateConfirmedAt = null; saveEstimate(); });
  await sleep(4000);
  const full2 = ctl.estPatchBodies.find(x => x.body && 'customer_name' in x.body);
  ok('6. 서버도 해제 상태로 맞춘 뒤 저장하면 confirmed_at=null, estimate_status=ga가 정상 전송됨', !!full2 && full2.body.confirmed_at === null && full2.body.estimate_status === 'ga', JSON.stringify(full2 && { c: full2.body.confirmed_at, s: full2.body.estimate_status }));

  ok('JS 오류 없음', jsErrors.length === 0, jsErrors.join(' | '));
  await browser.close(); server.close();
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌')).length;
  console.log('\n' + (log.length - failed) + '건 통과, ' + failed + '건 실패');
  process.exit(failed === 0 ? 0 : 1);
}
run().catch(e => { console.error('시험 실행 오류:', e); process.exit(1); });
