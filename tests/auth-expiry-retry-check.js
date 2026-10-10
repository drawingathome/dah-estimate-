#!/usr/bin/env node
// tests/auth-expiry-retry-check.js
// ══════════════════════════════════════════════════
// 2026-10-06(선혜님 - "100만원만 받았다고 뜨는데 실제로는 다 체크돼 있어, 여러 번 전달했었다", 이민선님 잔금):
// 서버 로그로 확인한 원인 - 로그인 토큰(유효 약 1시간)이 만료된 채 탭이 방치됐다가, 돌아와서 곧바로 저장하면 갱신이 끝나기 전에 요청이
// 옛 토큰으로 나가 401로 거절됨(06:45:26 견적서·고객 PATCH 401 + 같은 초에 토큰 갱신). sbXHR은 한 번만 보내고 끝이라 서버엔 안 가고,
// 화면은 브라우저에 먼저 저장한 값을 보여줘서 "결제 탭은 완납 / 칸반은 100만원만 받음"이 됐음.
//
// 감시하는 것(실제 앱 화면에서 sbXHR을 실행, 서버는 로그에서 본 그대로 흉내: 옛 토큰=401, 새 토큰=200):
//  1) 401을 받으면 토큰을 갱신하고 같은 요청을 1번 다시 보내 서버 반영에 성공
//  2) 토큰이 이미 만료된 상태면 요청을 보내기 전에 먼저 갱신(401을 아예 안 맞음)
//  3) 동시에 여러 저장이 나가도 갱신 요청은 딱 1번(갱신 토큰은 1회용 - 여러 번 갱신하면 서로 무효화)
//  4) 갱신이 실패해도 무한 재시도 없이 호출한 쪽에 오류를 알림
//  5) 결제 저장이 끝내 서버에 못 가면 사라지는 알림이 아니라 화면에 남는 경고 + "다시 저장" 버튼
//
// 사용법: node tests/auth-expiry-retry-check.js
// ══════════════════════════════════════════════════
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };
const root = path.resolve(__dirname, '..');

let failed = 0;
function ok(label, cond, detail) { console.log((cond ? '✅ ' : '❌ ') + label + (cond ? '' : ' — ' + (detail || ''))); if (!cond) failed++; }

// 서버 흉내: 옛 토큰(old-token)으로 온 PATCH/POST는 401, 갱신된 토큰(new-token-*)은 200. 갱신 요청은 mode에 따라 성공/실패.
function attachServer(page, state) {
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  return page.setRequestInterception(true).then(() => {
    page.on('request', (req) => {
      const url = req.url(), method = req.method();
      if (!url.includes('supabase.co')) { if (url.startsWith('http://localhost')) req.continue(); else req.abort(); return; }
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } }); return; }
      const auth = req.headers()['authorization'] || '';
      const p = new URL(url).pathname;
      if (url.includes('/auth/v1/token') && url.includes('refresh_token')) {
        state.refreshCalls++;
        if (state.refreshMode === 'fail') { req.respond({ status: 400, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: 'invalid_grant' }) }); return; }
        const n = state.refreshCalls;
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ access_token: 'new-token-' + n, refresh_token: 'refresh-' + n, expires_in: 3600, user: { id: 'u1', email: 'master@test.local' } }) });
        return;
      }
      if (p.includes('/rest/v1/') && method !== 'GET') {
        state.writes.push({ method, path: p, token: auth.replace('Bearer ', '') });
        if (state.writeMode === 'always500') { req.respond({ status: 500, contentType: 'application/json', headers: CORS, body: JSON.stringify({ message: 'server error' }) }); return; }
        if (auth.includes('old-token') || auth.includes('expired-token')) { req.respond({ status: 401, contentType: 'application/json', headers: CORS, body: JSON.stringify({ message: 'JWT expired' }) }); return; }
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 1, ok: true }]) }); return;
      }
      if (p.includes('/rest/v1/app_settings')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
    });
  });
}

async function openApp(port, state) {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await attachServer(page, state);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 800));
  return { browser, page, errors };
}
const setSession = (page, token, expiresInMs) => page.evaluate((t, ms) => {
  localStorage.setItem('dah_auth_session', JSON.stringify({ access_token: t, refresh_token: 'refresh-0', expires_at: Date.now() + ms, user_id: 'u1', email: 'master@test.local' }));
}, token, expiresInMs);
const runSb = (page, label) => page.evaluate((lb) => new Promise((resolve) => {
  sbXHR('PATCH', 'estimates?id=eq.' + lb, { deposit_amount: 1 }, function (err, data) { resolve({ err: err ? err.status : null, rows: data ? data.length : 0 }); });
}), label);

(async () => {
  const port = 18300;
  const server = await startServer(root, port);

  // 1) 401을 받으면 갱신 후 재시도
  {
    const state = { refreshCalls: 0, refreshMode: 'ok', writeMode: 'normal', writes: [] };
    const { browser, page, errors } = await openApp(port, state);
    state.writes.length = 0; state.refreshCalls = 0;
    await setSession(page, 'old-token', 60 * 60 * 1000);                  // 시각상으론 아직 유효하지만 서버는 "만료"로 판단(로그에서 본 상황)
    const r = await runSb(page, 'A');
    const patches = state.writes.filter(w => w.method === 'PATCH');
    ok('1-1. [401 재시도] 저장이 결국 서버에 반영됨(성공 콜백)', r.err === null && r.rows === 1, JSON.stringify(r));
    ok('1-2. [401 재시도] 옛 토큰으로 1번 거절된 뒤 새 토큰으로 정확히 1번 재전송', patches.length === 2 && patches[0].token === 'old-token' && /^new-token-/.test(patches[1].token), JSON.stringify(patches));
    ok('1-3. [401 재시도] 토큰 갱신 요청은 1번', state.refreshCalls === 1, 'refreshCalls=' + state.refreshCalls);
    ok('1-4. [401 재시도] JS 에러 없음', errors.length === 0, errors.join('; '));
    await browser.close();
  }

  // 2) 이미 만료된 토큰이면 보내기 전에 먼저 갱신
  {
    const state = { refreshCalls: 0, refreshMode: 'ok', writeMode: 'normal', writes: [] };
    const { browser, page } = await openApp(port, state);
    state.writes.length = 0; state.refreshCalls = 0;
    await setSession(page, 'expired-token', -5000);                       // 5초 전에 만료
    const r = await runSb(page, 'B');
    const patches = state.writes.filter(w => w.method === 'PATCH');
    ok('2-1. [요청 전 점검] 만료된 토큰이면 갱신부터 하고 새 토큰으로 1번만 전송(401을 아예 안 맞음)', r.err === null && patches.length === 1 && /^new-token-/.test(patches[0].token) && state.refreshCalls === 1, JSON.stringify({ r, patches, refresh: state.refreshCalls }));
    await browser.close();
  }

  // 3) 동시에 여러 저장 → 갱신은 1번
  {
    const state = { refreshCalls: 0, refreshMode: 'ok', writeMode: 'normal', writes: [] };
    const { browser, page } = await openApp(port, state);
    state.writes.length = 0; state.refreshCalls = 0;
    await setSession(page, 'expired-token', -5000);
    const results = await page.evaluate(() => Promise.all([1, 2, 3].map(i => new Promise((resolve) => {
      sbXHR('PATCH', 'estimates?id=eq.C' + i, { deposit_amount: i }, function (err, data) { resolve(err ? err.status : 'ok'); });
    }))));
    ok('3-1. [동시 저장 3건] 모두 성공하고 갱신 요청은 딱 1번(갱신 토큰 충돌 방지)', results.every(x => x === 'ok') && state.refreshCalls === 1, JSON.stringify({ results, refresh: state.refreshCalls }));
    await browser.close();
  }

  // 4) 갱신이 실패하면 무한 재시도 없이 오류 전달
  {
    const state = { refreshCalls: 0, refreshMode: 'fail', writeMode: 'normal', writes: [] };
    const { browser, page } = await openApp(port, state);
    state.writes.length = 0; state.refreshCalls = 0;
    await setSession(page, 'old-token', 60 * 60 * 1000);
    const r = await runSb(page, 'D');
    await new Promise(r2 => setTimeout(r2, 500));
    const patches = state.writes.filter(w => w.method === 'PATCH');
    ok('4-1. [갱신 실패] 호출한 쪽에 401 오류로 알림(저장된 척하지 않음)', r.err === 401, JSON.stringify(r));
    ok('4-2. [갱신 실패] 무한 재시도 없음(전송 1번, 갱신 시도 1번)', patches.length === 1 && state.refreshCalls === 1, JSON.stringify({ patches: patches.length, refresh: state.refreshCalls }));
    await browser.close();
  }

  // 5) 결제 저장이 끝내 서버에 못 가면 화면에 남는 경고 + 다시 저장 버튼
  {
    const state = { refreshCalls: 0, refreshMode: 'ok', writeMode: 'always500', writes: [] };
    const { browser, page, errors } = await openApp(port, state);
    const bar = await page.evaluate(() => new Promise((resolve) => {
      const host = document.createElement('div'); host.id = 'pay-host-test'; document.body.appendChild(host);
      const est = { id: 'est-test-1', price: 1000000, depositAmount: 0, balanceAmount: 0 };
      const c = { id: 9, clientName: '결제테스트', phone: '010-0000-0000', price: 1000000, stage: '선금결제', depositAmount: 0, balanceAmount: 0 };
      try { renderPaySection(c, host, est); } catch (e) { resolve({ error: 'render:' + e.message }); return; }
      // 실제 화면의 "선금 저장" 버튼을 눌러 저장 경로를 그대로 탄다
      const inputs = host.querySelectorAll('input');
      const btn = Array.from(host.querySelectorAll('button')).find(b => /선금 저장/.test(b.textContent));
      if (!btn) { resolve({ error: 'no-save-button', buttons: Array.from(host.querySelectorAll('button')).map(b => b.textContent.trim()).slice(0, 8) }); return; }
      const amt = Array.from(inputs).find(i => /선금|금액/.test((i.placeholder || '') + (i.getAttribute('aria-label') || '')) ) || inputs[0];
      if (amt) { amt.value = '500000'; amt.dispatchEvent(new Event('input', { bubbles: true })); }
      btn.click();
      setTimeout(() => { const b = host.querySelector('.pay-unsynced'); resolve({ shown: !!b, hasRetry: !!(b && Array.from(b.querySelectorAll('button')).some(x => x.textContent.trim() === '다시 저장')) }); }, 1500);
    }));
    ok('5-1. [결제 저장 실패] 화면에 남는 경고(.pay-unsynced)와 "다시 저장" 버튼이 표시됨', bar && bar.shown === true && bar.hasRetry === true, JSON.stringify(bar));
    ok('5-2. [결제 저장 실패] JS 에러 없음', errors.length === 0, errors.join('; '));
    await browser.close();
  }

  server.kill();
  console.log('\n' + (failed === 0 ? '✅ 전체 통과' : '❌ 실패 ' + failed + '건'));
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
