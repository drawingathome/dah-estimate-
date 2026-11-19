// tests/est-new-customer-dup-guard-check.js
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
  const dir = path.resolve(__dirname, '..'); const port = 28691;
  const server = await startServer(dir, port); const browser = await launchBrowser();
  // rpc: { status, body } / confirmAnswer: 확인창에서 누를 버튼(true=확인) / knownCustomerId: 이미 아는 고객 번호
  async function scenario(rpc, confirmAnswer, knownCustomerId, visibleRows) {
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
    await page.evaluate((kid) => {
      window._estEditState = window._estEditState || {};
      // 이미 아는 고객(E)은 이 기기 고객 목록에도 있어야 현실과 같음(저장 단계가 목록에서 번호를 다시 정함)
      localStorage.setItem('dah_customers', kid ? JSON.stringify([{ id: kid, clientName: '소지선', phone: '010-6258-8804', stage: '가견적', price: 0 }]) : '[]');
      document.getElementById('c-name').value = '소지선'; document.getElementById('c-phone').value = '010-6258-8804';
      var tr = document.querySelector('.row-curtain'); tr.querySelector('.space-inp').value = '거실';
      tr.querySelector('.mw').value = 100; calcCurtainRow(tr.querySelector('.mw')); tr.querySelector('.mh').value = 100; calcCurtainRow(tr.querySelector('.mh'));
      tr.querySelector('.cprice').value = 10000; calcCurtainRow(tr.querySelector('.cprice'));
      window._estEditState.estSaveCustomerId = kid || null;
      saveEstimate();
    }, knownCustomerId || null);
    await new Promise(r => setTimeout(r, 3500));
    const st = await page.evaluate(() => ({ btnDisabled: !!(document.querySelector('#save-btn, .save-btn, button[onclick*="saveEstimate"]') || {}).disabled }));
    await page.close(); return { cap, dialogs, st, errs };
  }

  // A. 마스터 담당 같은 이름·같은 번호 고객이 이미 있음(내 화면에는 안 보임) — 취소 / 확인(재구매)
  let r = await scenario({ status: 200, body: [{ exists_flag: true, staff_name: '마스터', same_name: true }] }, false);
  ok('A-취소. 서버에 같은 연락처 고객 확인을 물어봄', r.cap.rpc >= 1, JSON.stringify(r.cap));
  ok('A-취소. 담당자(마스터)가 든 확인창이 뜸', r.dialogs.some(d => d.type === 'confirm' && /마스터/.test(d.msg) && /이미/.test(d.msg)), JSON.stringify(r.dialogs));
  ok('A-취소. 취소하면 새 고객·견적서 저장 안 함', r.cap.postCust === 0 && r.cap.postEst === 0, JSON.stringify(r.cap));
  ok('A-취소. 화면 오류(JS) 없음', r.errs.length === 0, r.errs.join(';'));
  r = await scenario({ status: 200, body: [{ exists_flag: true, staff_name: '마스터', same_name: true }] }, true);
  ok('A-확인. 재구매로 확인하면 새 건(고객 1·견적서 1)으로 저장됨 — 둘 다 구매한 고객을 막지 않음', r.cap.postCust === 1 && r.cap.postEst >= 1, JSON.stringify(r.cap));
  ok('A-확인. 기존 고객에 덮어쓰기(PATCH) 없음', r.cap.patchCust === 0, JSON.stringify(r.cap));

  // B. 같은 번호·이름 다름(가족) — 취소 / 확인
  r = await scenario({ status: 200, body: [{ exists_flag: true, staff_name: '마스터', same_name: false }] }, false);
  ok('B-취소. 가족 확인창이 뜸', r.dialogs.some(d => d.type === 'confirm' && /마스터/.test(d.msg)), JSON.stringify(r.dialogs));
  ok('B-취소. 취소하면 새 고객·견적서 저장 안 함', r.cap.postCust === 0 && r.cap.postEst === 0, JSON.stringify(r.cap));
  r = await scenario({ status: 200, body: [{ exists_flag: true, staff_name: '마스터', same_name: false }] }, true);
  ok('B-확인. 확인하면 별도 고객으로 저장됨(고객 1·견적서 1)', r.cap.postCust === 1 && r.cap.postEst >= 1, JSON.stringify(r.cap));

  // C. 중복 없음 — 예전처럼 저장
  r = await scenario({ status: 200, body: [{ exists_flag: false }] }, true);
  ok('C. 중복 없음이면 새 고객·견적서가 저장됨', r.cap.postCust === 1 && r.cap.postEst >= 1, JSON.stringify(r.cap));
  ok('C. 중복 없음이면 안내창이 없음', r.dialogs.length === 0, JSON.stringify(r.dialogs));
  r = await scenario({ status: 200, body: [] }, true);
  ok('C2. 서버가 빈 목록을 줘도 저장됨', r.cap.postCust === 1 && r.cap.postEst >= 1, JSON.stringify(r.cap));

  // D. 서버 확인 실패
  r = await scenario({ status: 500, body: { message: 'boom' } }, true);
  ok('D-확인. 확인 실패 안내가 뜸', r.dialogs.some(d => d.type === 'confirm' && /확인하지 못했어요/.test(d.msg)), JSON.stringify(r.dialogs));
  ok('D-확인. 본인이 확인을 누르면 저장됨', r.cap.postCust === 1 && r.cap.postEst >= 1, JSON.stringify(r.cap));
  r = await scenario({ status: 500, body: { message: 'boom' } }, false);
  ok('D-취소. 취소하면 새 고객·견적서 저장 안 함', r.cap.postCust === 0 && r.cap.postEst === 0, JSON.stringify(r.cap));

  // E. 이미 고객 번호를 아는 저장(수정)은 서버에 묻지 않음
  r = await scenario({ status: 200, body: [{ exists_flag: true, staff_name: '마스터', same_name: true }] }, true, 555);
  ok('E. 기존 고객 수정은 중복 확인을 묻지 않음', r.cap.rpc === 0, JSON.stringify(r.cap));
  ok('E. 기존 고객 수정은 새 고객 POST 없이 PATCH', r.cap.postCust === 0 && r.cap.patchCust >= 1, JSON.stringify(r.cap));

  // F. 같은 이름·번호인데 내가 볼 수 있는 진행 중(가견적) 고객 — 새로 만들지 않고 그 고객에 이어서 저장
  r = await scenario({ status: 200, body: [{ exists_flag: true, staff_name: '오지은 실장', same_name: true }] }, true, null, [{ id: 555, client_name: '소지선', phone: '01062588804', stage: '가견적' }]);
  ok('F. 내 진행 중 고객이면 새 고객 POST 없음', r.cap.postCust === 0, JSON.stringify(r.cap));
  ok('F. 그 고객에 이어서 저장(PATCH)·견적서 저장', r.cap.patchCust >= 1 && r.cap.postEst >= 1, JSON.stringify(r.cap));
  ok('F. 안내·확인창 없이 이어서 저장', r.dialogs.length === 0, JSON.stringify(r.dialogs));
  // G. 보이는 것이 시공완료 고객뿐(마스터 화면 등) — 그 고객에 덮어쓰지 않고, 알린 뒤 확인하면 재구매 새 건으로 저장
  r = await scenario({ status: 200, body: [{ exists_flag: true, staff_name: '마스터', same_name: true }] }, true, null, [{ id: 112, client_name: '소지선', phone: '01062588804', stage: '시공완료' }]);
  ok('G. 시공완료 고객에 덮어쓰지 않음(PATCH 없음)', r.cap.patchCust === 0, JSON.stringify(r.cap));
  ok('G. 담당자 안내 확인창이 뜸', r.dialogs.some(d => d.type === 'confirm' && /마스터/.test(d.msg)), JSON.stringify(r.dialogs));
  ok('G. 확인하면 새 건으로 저장(고객 1·견적서 1)', r.cap.postCust === 1 && r.cap.postEst >= 1, JSON.stringify(r.cap));

  await browser.close(); server.close && server.close();
  console.log(fail ? '❌ 실패 ' + fail + '건' : '✅ 모두 통과'); process.exit(fail ? 1 : 0);
})();
