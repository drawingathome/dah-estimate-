// tests/public-view-slow-network-check.js
// 2026-11-05(N-111②): 고객이 알림톡으로 여는 공개 링크(?view=)를 폰 4G 속도(1.6Mbps·지연 150ms)로 열면,
// 페이지 스크립트가 도착하는 순서가 달라져 "Cannot read properties of undefined (reading 'estSaveCustomerId')" 같은 오류가 났다
// (est-utils.js의 업무처리 카드 함수가 est-save.js보다 먼저 실행). 느린 망에서도 화면 오류가 0이고 견적서가 그려져야 한다.
const path = require('path'), fs = require('fs');
const { launchBrowser, startServer } = require('./_helpers');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const server = await startServer(ROOT, 9971); const browser = await launchBrowser();
  const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (req.method() === 'OPTIONS' && u.includes('supabase.co')) return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('/rpc/get_public_estimate')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify([]) });
    if (u.includes('supabase.co') || u.includes('script.google.com')) return req.abort(); req.continue(); });
  const cdp = await page.target().createCDPSession(); await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 0.75 * 1024 * 1024 / 8 });
  await page.goto('http://localhost:9971/dah-estimate.html?view=t1', { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3500)); // 1.5초 뒤 도는 업무처리 카드 함수까지 지나가게
  const m = await page.evaluate(() => ({ pub: document.body.classList.contains('public-view-mode'), gate: (() => { const g = document.getElementById('est-auth-gate'); return !!g && getComputedStyle(g).display !== 'none'; })() }));
  ok('느린 망(4G): 공개 보기 모드로 열리고 로그인 화면이 안 뜸', m.pub && !m.gate, JSON.stringify(m));
  ok('느린 망(4G): 화면 오류(JS)가 0건', errs.length === 0, errs.join(' ; '));
  // N-114④: 공개 링크 한 곳만이 아니라 같은 속도로 '견적서 로그인 화면'과 '대시보드 로그인 화면'도 열어 화면 오류 0을 확인(오류가 생기면 어느 화면인지 이름이 나옴)
  for (const [nm, url] of [['견적서 편집(로그인) 화면', 'http://localhost:9971/dah-estimate.html'], ['대시보드 로그인 화면', 'http://localhost:9971/dah-dashboard.html']]) {
    const pg = await browser.newPage(); await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const pe = []; pg.on('pageerror', e => pe.push(String(e.message).slice(0, 140)));
    await pg.setRequestInterception(true);
    pg.on('request', req => { const u = req.url(); if (u.includes('supabase.co') || u.includes('script.google.com')) return req.abort(); req.continue(); });
    const c2 = await pg.target().createCDPSession(); await c2.send('Network.enable');
    await c2.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 0.75 * 1024 * 1024 / 8 });
    await pg.goto(url, { waitUntil: 'load', timeout: 90000 }).catch(e => pe.push('열기 실패: ' + e.message.slice(0, 60)));
    await new Promise(r => setTimeout(r, 3500));
    ok('느린 망(4G): ' + nm + ' — 화면 오류(JS)가 0건', pe.length === 0, pe.join(' ; '));
    await pg.close();
  }
  await browser.close(); server.kill && server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 전부 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
