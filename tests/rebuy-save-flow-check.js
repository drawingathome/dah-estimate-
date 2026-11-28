// tests/rebuy-save-flow-check.js (N-226) — 재구매: 이 기기 캐시에 같은 이름·번호의 '시공완료' 고객이 있어도 새 고객으로 저장되는지(실제 저장 흐름, 가짜 서버)
// N-183(2026-11-19, 선혜님 '소지선 — 마스터가 입력한 고객인데 오지은 실장 쪽에서 중복을 못 잡아준다'):
// 견적서 앱이 '새 고객'을 만들기 직전에 서버(check_phone_duplicate)에 같은 연락처 고객이 있는지 물어보는지 확인한다.
// 배경: DB 잠금은 시공완료 고객을 제외하고, 실장 계정은 마스터 담당 고객이 조회되지 않아서, 서버에 묻지 않으면 경고 없이 같은 사람이 두 줄이 된다.
//  A) 서버가 '같은 번호·같은 이름 고객이 이미 있다(마스터 담당)'고 하면: 담당자 이름이 든 확인창이 뜨고, 취소=새 고객·견적서 저장 안 함 / 확인=재구매로 새 건 저장(소지선은 둘 다 실제 구매 — 막지 않고 알림)
//  B) 서버가 '같은 번호지만 이름이 다르다(가족)'고 하면: 확인창이 뜨고, 취소=저장 안 함 / 확인=새 고객으로 저장
//  C) 서버가 '없다'고 하면: 예전처럼 새 고객·견적서가 저장됨(회귀 없음)
//  D) 서버 확인이 실패하면(오류): '확인하지 못했어요' 확인창, 확인=저장 / 취소=저장 안 함
//  E) 이미 고객 번호를 알고 있는 저장(수정)은 서버에 묻지 않음
// 한계: 가짜 서버 시험이며, 실제 운영 실장 화면·실제 DB 응답은 확인하지 않음.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const H = { 'Access-Control-Allow-Origin': '*' };
const J = (req, status, body) => req.respond({ status, contentType: 'application/json', headers: H, body: JSON.stringify(body) });
let fail = 0; const ok = (l, c, d) => { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; };
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 120000);
(async () => {
  const dir = path.resolve(__dirname, '..'); const port = 28697;
  const server = await startServer(dir, port); const browser = await launchBrowser();
  // rpc: { status, body } / confirmAnswer: 확인창에서 누를 버튼(true=확인) / knownCustomerId: 이미 아는 고객 번호
  async function scenario(rpc, confirmAnswer, knownCustomerId, visibleRows, cacheRows) {
    const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const dialogs = [];
    page.on('dialog', async d => {
      const msg = d.message();
      // 저장 전 '다음 항목이 비어있어요' 확인창은 이 시험의 대상이 아니므로 항상 확인(안 그러면 취소 시험이 헛통과함)
      if (/다음 항목이 비어있어요/.test(msg)) { try { await d.accept(); } catch (e) {} return; }
      dialogs.push({ type: d.type(), msg });
      try { if (d.type() === 'confirm' && confirmAnswer === false) await d.dismiss(); else await d.accept(); } catch (e) {}
    });
    const cap = { rpc: 0, postCust: 0, patchCust: 0, postEst: 0 };
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url(), method = req.method();
      if (!url.includes('supabase.co')) { if (url.startsWith('http://localhost')) req.continue(); else req.abort(); return; }
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
      if (url.includes('/rest/v1/app_settings')) { J(req, 200, [{ value: {} }]); return; }
      if (url.includes('/auth/v1/token')) { J(req, 200, { access_token: 'fake', refresh_token: 'fake', expires_in: 3600, token_type: 'bearer' }); return; }
      if (url.includes('rpc/check_phone_duplicate')) { cap.rpc++; J(req, rpc.status, rpc.body); return; }
      if (method === 'GET' && url.includes('/rest/v1/customers') && url.includes('client_name=eq.')) { cap.getCust = (cap.getCust || 0) + 1; J(req, 200, visibleRows || []); return; }
      if (method === 'POST' && url.includes('/rest/v1/customers')) { cap.postCust++; J(req, 201, [{ id: 901, updated_at: new Date().toISOString() }]); return; }
      if (method === 'PATCH' && url.includes('/rest/v1/customers')) { cap.patchCust++; J(req, 200, [{ id: knownCustomerId || 901, updated_at: new Date().toISOString() }]); return; }
      if (method === 'POST' && url.includes('/rest/v1/estimates')) { cap.postEst++; J(req, 201, [Object.assign({}, body, { id: 'srv-est-9', updated_at: new Date().toISOString(), created_at: new Date().toISOString() })]); return; }
      J(req, 200, []);
    });
    await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700)); await setupValidSession(page); await new Promise(r => setTimeout(r, 500));
    await page.evaluate((kid, cacheRows) => {
      window._estEditState = window._estEditState || {};
      // 이미 아는 고객(E)은 이 기기 고객 목록에도 있어야 현실과 같음(저장 단계가 목록에서 번호를 다시 정함)
      localStorage.setItem('dah_customers', cacheRows ? JSON.stringify(cacheRows) : kid ? JSON.stringify([{ id: kid, clientName: '권재호', phone: '010-1111-2222', stage: '가견적', price: 0 }]) : '[]');
      document.getElementById('c-name').value = '권재호'; document.getElementById('c-phone').value = '010-1111-2222';
      var tr = document.querySelector('.row-curtain'); tr.querySelector('.space-inp').value = '거실';
      tr.querySelector('.mw').value = 100; calcCurtainRow(tr.querySelector('.mw')); tr.querySelector('.mh').value = 100; calcCurtainRow(tr.querySelector('.mh'));
      tr.querySelector('.cprice').value = 10000; calcCurtainRow(tr.querySelector('.cprice'));
      window._estEditState.estSaveCustomerId = kid || null;
      saveEstimate();
    }, knownCustomerId || null, cacheRows || null);
    await new Promise(r => setTimeout(r, 3500));
    const st = await page.evaluate(() => ({ btnDisabled: !!(document.querySelector('#save-btn, .save-btn, button[onclick*="saveEstimate"]') || {}).disabled }));
    await page.close(); return { cap, dialogs, st, errs };
  }

  const done53 = [{ id: 53, clientName: '권재호', phone: '010-1111-2222', stage: '시공완료', price: 3735000 }];
  const rpcHit = { status: 200, body: [{ exists_flag: true, staff_name: '마스터', same_name: true }] };
  const vis53 = [{ id: 53, client_name: '권재호', phone: '01011112222', stage: '시공완료' }];
  // H. 캐시에 시공완료 53번이 있고 재구매 확인창에서 확인 — 새 고객 1·옛 고객 PATCH 0이어야 함
  let r = await scenario(rpcHit, true, null, vis53, done53);
  ok('H. 재구매 확인창이 뜸', r.dialogs.some(d => d.type === 'confirm' && /이미/.test(d.msg)), JSON.stringify(r.dialogs));
  ok('H. 옛 시공완료 고객(53)을 덮어쓰지 않음(PATCH 0)', r.cap.patchCust === 0, JSON.stringify(r.cap));
  ok('H. 새 고객 1줄이 만들어지고 견적서가 저장됨', r.cap.postCust === 1 && r.cap.postEst >= 1, JSON.stringify(r.cap));
  // H2. 확인창에서 취소 — 아무것도 저장 안 함
  r = await scenario(rpcHit, false, null, vis53, done53);
  ok('H2. 취소하면 저장 안 함', r.cap.postCust === 0 && r.cap.patchCust === 0 && r.cap.postEst === 0, JSON.stringify(r.cap));
  // H3. 서버 확인이 실패해도(확인 누르면) 캐시의 시공완료 고객에 붙지 않음
  r = await scenario({ status: 500, body: {} }, true, null, [], done53);
  ok('H3. 서버확인 실패+확인: 옛 고객 덮어쓰기 없음', r.cap.patchCust === 0 && r.cap.postCust === 1, JSON.stringify(r.cap));
  // H4. 회귀: 캐시에 진행 중(가견적) 같은 고객이면 그 고객에 이어서 저장
  r = await scenario({ status: 200, body: [{ exists_flag: true, staff_name: '마스터', same_name: true }] }, true, null, [{ id: 55, client_name: '권재호', phone: '01011112222', stage: '가견적' }], [{ id: 55, clientName: '권재호', phone: '010-1111-2222', stage: '가견적', price: 0 }]);
  ok('H4. 진행 중 고객은 이어서 저장(PATCH, 새 고객 0)', r.cap.postCust === 0 && r.cap.patchCust >= 1, JSON.stringify(r.cap));

  await browser.close(); server.close && server.close();
  console.log(fail ? '❌ 실패 ' + fail + '건' : '✅ 모두 통과'); process.exit(fail ? 1 : 0);
})();
