#!/usr/bin/env node
// tests/obs-click-watch-check.js
// ══════════════════════════════════════════════════
// 2026-10-07(선혜님 - 17:30경 김성은님 견적을 저장했는데 서버에 요청이 한 건도 없었음, 17:29 김나진님 저장은 성공, 같은 시각 대시보드는 정상 통신):
// 서버 기록만으로는 "저장 버튼이 눌렸는지, 무엇이 가렸는지, 탭이 멈췄는지, 로그인 덮개가 떴는지"를 가릴 수 없어서, 앱이 스스로 "눌림 관측"을 남기게 한다.
//   - 저장 버튼 영역을 누른 pointerdown을 화면 전체에서(캡처 단계) 지켜봄: 정상/비활성(click이 안 옴)/다른 요소가 덮음을 구별
//   - 기기에 순환 기록(localStorage)을 먼저 쓰고, 서버(save_receipts, kind=obs)로는 나중에 보냄(서버로 못 가는 상황의 증거가 같이 막히지 않게)
//   - 눌렀는데 저장이 시작되지 않으면(press-no-start) 기록, 켜져 있으면 상시 배너(원인 불문 경보)
//   - 로그인 덮개(showReloginPrompt) 표시, 탭 숨김/복귀/폐기 여부 기록
// 모든 시험은 (1) 현실적인 로그인(dah_session + dah_auth_session) (2) 사람처럼 실제 마우스 클릭 (3) 시험이 유효한지 먼저 검사 - 로 한다.
//
//  1) 정상 클릭: 저장 버튼 눌림이 "대상=저장 버튼, 비활성 아님, 가려지지 않음"으로 남고 저장이 시작되며 press-no-start는 없음 / 저장 동작 자체는 감시가 없어도 같음
//  2) 다른 요소가 덮음: 대상=덮은 요소, covered=true, 저장 요청 0건, press-no-start 기록
//  3) 버튼 비활성: disabled=true(click이 안 오는 경우도 pointerdown으로 잡힘), press-no-start 기록
//  4) 로그인 덮개가 뜨면 auth-gate-shown 기록
//  5) 서버가 못 받아도(500) 기기 기록은 남고, 서버가 살아나면 한 번만 올라감(중복 전송 없음)
//  6) 안전장치: 기기 저장공간이 가득 차 쓰기가 실패해도 화면 오류 없이 저장은 정상
//  7) 끄기 스위치: 꺼져 있으면 기록 0건
//  8) 배너: 기본은 꺼짐(조용히 기록만), 켜면 press-no-start 때 배너가 뜸
//  9) 개인정보: 비밀번호 입력칸에 친 값이 기록에 절대 안 남음
// 10) 폭주 방지: 탭 숨김/복귀를 100번 해도 기록이 상한 안
//
// 사용법: node tests/obs-click-watch-check.js
// ══════════════════════════════════════════════════
const path = require('path');
const { launchBrowser, startServer, setupRealisticLogin, assertEstimatePageUsable } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };
const root = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let failed = 0;
function ok(label, cond, detail) { console.log((cond ? '✅ ' : '❌ ') + label + (cond ? '' : ' — ' + (detail || ''))); if (!cond) failed++; }

const FILL = `
  document.getElementById('c-name').value = '관측고객';
  document.getElementById('c-phone').value = '01012345678';
  document.getElementById('c-addr').value = '서울 서초구';
  document.getElementById('c-measure').value = '2026-10-01';
  document.getElementById('c-install').value = '2026-10-05';
  var tr = document.querySelector('.row-curtain');
  tr.querySelector('.space-inp').value = '거실';
  tr.querySelector('.mw').value = 300; calcCurtainRow(tr.querySelector('.mw'));
  tr.querySelector('.mh').value = 240; calcCurtainRow(tr.querySelector('.mh'));
  tr.querySelector('.cprice').value = 45000; calcCurtainRow(tr.querySelector('.cprice'));
  document.getElementById('c-name').dispatchEvent(new Event('input', { bubbles: true }));
`;

async function open(port, opt) {
  opt = opt || {};
  const server = await startServer(root, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  const rec = { writes: [], obsPosts: [], jsErrors: [], dialogs: [] };
  const state = { obsFail: false, flags: opt.flags || null };
  page.on('pageerror', e => rec.jsErrors.push(e.message));
  page.on('dialog', async d => { rec.dialogs.push(d.message().slice(0, 60)); try { await d.accept(); } catch (e) {} });
  await setupRealisticLogin(page);
  if (opt.beforeLoad) await page.evaluateOnNewDocument(opt.beforeLoad);
  await page.setRequestInterception(true);
  let estN = 0;
  page.on('request', (req) => {
    const u = req.url(), method = req.method();
    if (!u.includes('supabase.co')) { if (u.startsWith('http://localhost')) req.continue(); else req.abort(); return; }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } }); return; }
    const p = new URL(u).pathname; const q = new URL(u).search; let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
    const ok2 = (b, s = 200) => req.respond({ status: s, contentType: 'application/json', headers: CORS, body: JSON.stringify(b) });
    if (method === 'POST' && p.includes('/rest/v1/save_receipts')) {
      if (body && body.kind === 'obs') { if (state.obsFail) { ok2({ message: 'down' }, 500); return; } rec.obsPosts.push(body); }
      ok2([], 201); return;
    }
    if (method === 'GET' && p.includes('/rest/v1/app_settings') && /feature_flags/.test(q)) { ok2(state.flags ? [{ key: 'feature_flags', value: state.flags }] : []); return; }
    if (method !== 'GET' && p.includes('/rest/v1/estimates')) { estN++; rec.writes.push('estimates'); ok2([{ id: 'srv-est-' + estN, updated_at: new Date().toISOString(), ...(Array.isArray(body) ? body[0] : body || {}) }], method === 'POST' ? 201 : 200); return; }
    if (method !== 'GET' && p.includes('/rest/v1/customers')) { rec.writes.push('customers'); ok2([{ id: 777, ...(Array.isArray(body) ? body[0] : body || {}) }], method === 'POST' ? 201 : 200); return; }
    if (p.includes('rpc/check_phone_duplicate')) { ok2([{ exists_flag: false }]); return; }
    ok2([]);
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(2600);
  await assertEstimatePageUsable(page);                         // 시험이 유효한지 먼저 검사
  return { server, browser, page, rec, state };
}
// 저장 버튼 중앙을 화면 안으로 가져온 뒤 사람처럼 실제 마우스 클릭
async function humanPressSave(page) {
  await page.evaluate(() => document.getElementById('btn-save-estimate').scrollIntoView({ block: 'center' })); await sleep(400);
  const c = await page.evaluate(() => { const r = document.getElementById('btn-save-estimate').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), inView: r.top >= 0 && r.bottom <= innerHeight }; });
  if (!c.inView) throw new Error('시험 무효: 저장 버튼이 화면 안에 없음');
  await page.mouse.click(c.x, c.y);
}
const ring = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('dah_obs_ring') || '[]'); } catch (e) { return null; } });
const kinds = (r) => (r || []).map(e => e.k);

(async () => {
  // 1) 정상 클릭
  {
    const { server, browser, page, rec } = await open(38600, {});
    await page.evaluate(FILL); await humanPressSave(page); await sleep(3200);
    const r = await ring(page);
    const press = (r || []).find(e => e.k === 'save-press') || {};
    ok('1-1. [정상 클릭] 저장 버튼 눌림이 기록됨(대상=저장 버튼, 비활성 아님, 가려지지 않음)', press.d && press.d.target === 'btn-save-estimate' && press.d.disabled === false && press.d.covered === false, JSON.stringify(press));
    ok('1-2. [정상 클릭] 저장이 시작됨 기록이 있고 press-no-start는 없음', kinds(r).includes('save-start') && !kinds(r).includes('press-no-start'), JSON.stringify(kinds(r)));
    ok('1-3. [정상 클릭] 저장 동작 자체는 그대로(서버에 견적서·고객 저장 요청이 나감)', rec.writes.includes('estimates') && rec.writes.includes('customers'), JSON.stringify(rec.writes));
    ok('1-4. 기록에 로그인 남은 시간·온라인 여부가 들어 있음', press.d && typeof press.d.tokenLeftSec === 'number' && typeof press.d.online === 'boolean', JSON.stringify(press.d));
    ok('1-5. JS 에러 없음', rec.jsErrors.length === 0, rec.jsErrors.join('; '));
    await browser.close(); server.kill();
  }
  // 2) 다른 요소가 덮음
  {
    const { server, browser, page, rec } = await open(38601, {});
    await page.evaluate(FILL);
    await page.evaluate(() => { const o = document.createElement('div'); o.id = 'probe-overlay'; o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.2)'; document.body.appendChild(o); });
    await humanPressSave(page); await sleep(2600);
    const r = await ring(page); const press = (r || []).find(e => e.k === 'save-press') || {};
    ok('2-1. [다른 요소가 덮음] 눌림 기록: 대상=덮은 요소, covered=true', press.d && press.d.target === 'probe-overlay' && press.d.covered === true, JSON.stringify(press));
    ok('2-2. [다른 요소가 덮음] 저장 요청은 0건(앱은 저장 클릭을 받지 못함)', rec.writes.length === 0, JSON.stringify(rec.writes));
    ok('2-3. [다른 요소가 덮음] 눌렀는데 저장이 시작되지 않았다(press-no-start)가 기록됨', kinds(r).includes('press-no-start'), JSON.stringify(kinds(r)));
    await browser.close(); server.kill();
  }
  // 3) 버튼 비활성
  {
    const { server, browser, page, rec } = await open(38602, {});
    await page.evaluate(FILL); await page.evaluate(() => { const b = document.getElementById('btn-save-estimate'); b.disabled = true; b.title = '담당자 확인 중...'; });
    await humanPressSave(page); await sleep(2600);
    const r = await ring(page); const press = (r || []).find(e => e.k === 'save-press') || {};
    ok('3-1. [버튼 비활성] 눌림이 기록됨(disabled=true, 안내 문구 포함) - 비활성 버튼은 click이 안 와도 pointerdown으로 잡힘', press.d && press.d.disabled === true && /담당자/.test(press.d.title || ''), JSON.stringify(press));
    ok('3-2. [버튼 비활성] press-no-start 기록, 저장 요청 0건', kinds(r).includes('press-no-start') && rec.writes.length === 0, JSON.stringify({ k: kinds(r), w: rec.writes }));
    await browser.close(); server.kill();
  }
  // 4) 로그인 덮개
  {
    const { server, browser, page } = await open(38603, {});
    await page.evaluate(() => { try { showReloginPrompt(function () {}); } catch (e) { window.__e = String(e); } }); await sleep(600);
    const r = await ring(page);
    ok('4-1. [로그인 덮개] 덮개가 뜨면 auth-gate-shown이 기록됨', kinds(r).includes('auth-gate-shown'), JSON.stringify(kinds(r)));
    const shown = await page.evaluate(() => getComputedStyle(document.getElementById('est-auth-gate')).display !== 'none');
    ok('4-2. [로그인 덮개] 기록 장치를 달아도 덮개는 원래대로 뜸(동작 보존)', shown, 'display 숨김 상태');
    await browser.close(); server.kill();
  }
  // 5) 서버 장애 → 기기 기록 유지 → 복구 후 한 번만 전송
  {
    const { server, browser, page, rec, state } = await open(38604, {});
    state.obsFail = true;
    await page.evaluate(FILL); await humanPressSave(page); await sleep(3000);
    await page.evaluate(() => { try { estObsFlush(true); } catch (e) { window.__e = String(e); } }); await sleep(1500);
    const r1 = await ring(page);
    ok('5-1. [서버 장애] 서버로 못 가도 기기 기록은 그대로 남음', kinds(r1).includes('save-press'), JSON.stringify(kinds(r1)));
    ok('5-2. [서버 장애] 서버에 도착한 건 0건', rec.obsPosts.length === 0, String(rec.obsPosts.length));
    state.obsFail = false;
    await page.evaluate(() => { try { estObsFlush(true); } catch (e) { window.__e = String(e); } }); await sleep(1800);
    const entries1 = rec.obsPosts.reduce((n, b) => n + ((b.detail && b.detail.entries) || []).length, 0);
    ok('5-3. [서버 복구] 쌓인 기록이 서버로 올라감(종류 obs, 기록 여러 건)', rec.obsPosts.length >= 1 && entries1 >= 2, 'posts=' + rec.obsPosts.length + ' entries=' + entries1);
    await page.evaluate(() => { try { estObsFlush(true); } catch (e) {} }); await sleep(1500);
    const entries2 = rec.obsPosts.reduce((n, b) => n + ((b.detail && b.detail.entries) || []).length, 0);
    ok('5-4. [서버 복구] 한 번 올린 기록은 다시 올라가지 않음(중복 전송 없음)', entries2 === entries1, entries1 + ' → ' + entries2);
    await browser.close(); server.kill();
  }
  // 6) 안전장치: 기기 저장공간 쓰기 실패
  {
    const { server, browser, page, rec } = await open(38605, { beforeLoad: () => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(k) === 'dah_obs_ring') throw new Error('QuotaExceededError(시뮬레이션)'); return orig.apply(this, arguments); }; } });
    await page.evaluate(FILL); await humanPressSave(page); await sleep(3200);
    ok('6-1. [저장공간 쓰기 실패] 화면 오류가 없고 저장은 정상(서버에 저장 요청이 나감)', rec.jsErrors.length === 0 && rec.writes.includes('estimates'), JSON.stringify({ e: rec.jsErrors, w: rec.writes }));
    await browser.close(); server.kill();
  }
  // 7) 끄기 스위치
  {
    const { server, browser, page, rec } = await open(38606, { flags: { obs_record: { enabled: false } } });
    await page.evaluate(FILL); await humanPressSave(page); await sleep(3000);
    const r = await ring(page);
    ok('7-1. [끄기 스위치] 꺼져 있으면 기기 기록 0건', (r || []).length === 0, JSON.stringify(kinds(r)));
    ok('7-2. [끄기 스위치] 꺼져 있어도 저장은 정상', rec.writes.includes('estimates'), JSON.stringify(rec.writes));
    await browser.close(); server.kill();
  }
  // 8) 배너: 기본 꺼짐 / 켜면 표시
  {
    const a = await open(38607, {});
    await a.page.evaluate(FILL); await a.page.evaluate(() => { const o = document.createElement('div'); o.style.cssText = 'position:fixed;inset:0;z-index:99999'; document.body.appendChild(o); });
    await humanPressSave(a.page); await sleep(2800);
    const bannerOff = await a.page.evaluate(() => !!document.getElementById('obs-no-start-banner'));
    ok('8-1. [배너 기본 꺼짐] 눌렀는데 저장이 시작되지 않아도 화면 배너는 안 뜸(조용히 기록만)', bannerOff === false, 'banner=' + bannerOff);
    await a.browser.close(); a.server.kill();
    const b = await open(38608, { flags: { obs_banner: { enabled: true } } });
    await b.page.evaluate(FILL); await b.page.evaluate(() => { const o = document.createElement('div'); o.style.cssText = 'position:fixed;inset:0;z-index:99999'; document.body.appendChild(o); });
    await humanPressSave(b.page); await sleep(2800);
    const bannerOn = await b.page.evaluate(() => { const e = document.getElementById('obs-no-start-banner'); return e ? e.textContent.slice(0, 60) : null; });
    ok('8-2. [배너 켜짐] 눌렀는데 저장이 시작되지 않으면 "저장이 확인되지 않았어요" 배너가 뜸', !!bannerOn && /저장/.test(bannerOn), String(bannerOn));
    await b.browser.close(); b.server.kill();
  }
  // 9) 개인정보
  {
    const { server, browser, page } = await open(38609, {});
    await page.evaluate(() => { try { showReloginPrompt(function () {}); } catch (e) {} }); await sleep(400);
    await page.evaluate(() => { const i = document.getElementById('est-auth-pw'); i.focus(); }); await page.keyboard.type('SECRET-PW-12345', { delay: 20 }); await sleep(300);
    const raw = await page.evaluate(() => localStorage.getItem('dah_obs_ring') || '');
    ok('9-1. [개인정보] 비밀번호 입력칸에 친 값이 기기 기록에 절대 남지 않음', raw.indexOf('SECRET-PW-12345') === -1, '기록에 비밀번호가 섞임');
    await browser.close(); server.kill();
  }
  // 10) 폭주 방지
  {
    const { server, browser, page } = await open(38610, {});
    await page.evaluate(() => { for (let i = 0; i < 100; i++) { Object.defineProperty(document, 'visibilityState', { value: i % 2 ? 'hidden' : 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); } });
    await sleep(500);
    const r = await ring(page); const tabN = (r || []).filter(e => /^tab-/.test(e.k)).length;
    ok('10-1. [폭주 방지] 탭 숨김/복귀를 100번 해도 탭 기록은 상한(25건) 이하', tabN <= 25, 'tab 기록 ' + tabN + '건');
    ok('10-2. [폭주 방지] 전체 기록도 상한(200건) 이하', (r || []).length <= 200, String((r || []).length));
    await browser.close(); server.kill();
  }

  console.log('\n' + (failed === 0 ? '✅ 전체 통과' : '❌ 실패 ' + failed + '건'));
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
