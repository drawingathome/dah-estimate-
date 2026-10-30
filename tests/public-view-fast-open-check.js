// tests/public-view-fast-open-check.js
// 2026-10-30(선혜님 폰: "링크가 바로 열리지 않고 살짝 시간이 걸린다"): 공개 링크가 서버 요청을 페이지의 모든 파일(약 2MB 글꼴 포함)이
// 다 받아진 뒤(window.load)에야 시작해서, 폰 4G에서는 요청 시작이 약 14초 뒤였음. 글꼴이 아직 안 와도(또는 영영 안 와도) 견적서가 열려야 한다.
const path = require('path'), fs = require('fs');
const { launchBrowser, startServer } = require('./_helpers');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
const ROOT = path.resolve(__dirname, '..');
const ID = '307864ed-3ded-4c9f-bdb5-ed8e1cd5431c';
const items = [{ type: 'curtain', space: '거실', displayName: '시험 원단', mw: '300', mh: '264', pnum: '4', price: 45000, amt: '180,000원', pleatType: '나비주름형', openType: '양개형', hemType: '8cm' }];
(async () => {
  const server = await startServer(ROOT, 9974); const browser = await launchBrowser();
  const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844, isMobile: true });
  let held = 0;
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (/\.woff2?(\?|$)/.test(u)) { held++; return; } // 글꼴 요청을 붙잡아 둠(응답 안 줌) = 느린 망 흉내
    if (req.method() === 'OPTIONS' && u.includes('supabase.co')) return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('/rpc/get_public_estimate')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify([{ customer_name: '시험가', phone: '01090000001', staff_name: '장선혜', estimate_status: 'ga', install_date: '', line_items: items }]) });
    if (u.includes('logo.png')) return req.respond({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(ROOT, 'logo.png')) });
    if (u.includes('supabase.co') || u.includes('script.google.com')) return req.abort(); req.continue(); });
  const t0 = Date.now();
  page.goto('http://localhost:9974/dah-estimate.html?view=' + ID, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  const shown = await page.waitForFunction(() => { var c = document.getElementById('public-view-container'); return !!(c && c.querySelector('.pv-prod-table')); }, { timeout: 6000, polling: 50 }).then(() => true).catch(() => false);
  ok('글꼴 파일이 아직 안 받아진 상태에서도 6초 안에 견적서가 열림', shown, '글꼴 요청 ' + held + '건 대기 중');
  ok('(시험 조건) 글꼴 요청이 실제로 붙잡혀 있었음', held >= 1, String(held));
  console.log('걸린 시간 ms:', Date.now() - t0);
  await browser.close(); server.kill && server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 전부 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
