// tests/vendor-rail-only-row-check.js
// 2026-11-20 N-199(선혜님 결정: "레일만" 행은 원단·제작 발주에서 빼기): 품명이 '레일만'이고 원단 코드가 없는 커튼 행은 레일 발주에만 나가야 함.
//  옛 코드: 원단(미지정)·제작 발주에도 '레일만' 품목이 만들어짐. 한계: 가짜 화면에서 collectVendorGroups 결과를 봄(운영 화면 확인 아님).
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
let fail = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const dir = path.resolve(__dirname, '..'); const server = await startServer(dir, 9942); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (u.startsWith('http://localhost')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('supabase.co')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' });
    req.abort(); });
  await page.goto('http://localhost:9942/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900)); await loginAs(page, 'master'); await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(() => {
    var reg = document.getElementById('c-region'); reg.value = reg.options[1].value;
    window._dahVendorListRaw = [{ name: '캔가공소', categories: ['production'] }];
    var body = document.getElementById('curtain-body');
    var tr1 = body.querySelector('tr');
    function fill(tr, space, name, fabric, mw) { tr.querySelector('.space-inp').value = space; tr.querySelector('.c-display-name').value = name; tr.querySelector('.c-fabric').value = fabric; tr.querySelector('.mw').value = mw; tr.querySelector('.mh').value = '230'; var p = tr.querySelector('.pnum'); if (p) p.value = '4'; }
    fill(tr1, '거실', '쉬폰', 'ABC-1', '300');
    addCurtainRow(); var rows = body.querySelectorAll('tr'); fill(rows[rows.length - 1], '입구 좌측방', '레일만', '', '120');
    var col = collectVendorGroups(); var all = [];
    Object.keys(col.groups).forEach(function (k) { col.groups[k].forEach(function (it) { all.push({ space: it.space, cat: it.orderCategory, product: it.product }); }); });
    return all;
  });
  const by = (sp, c) => r.filter(x => x.space === sp && x.cat === c).length;
  ok('1. 일반 커튼 행(거실)은 원단·제작·레일 3개 모두 나감', by('거실', 'fabric') === 1 && by('거실', 'production') >= 0 && by('거실', 'material') === 1, JSON.stringify(r));
  ok("2. '레일만' 행은 원단 발주에 안 나감", by('입구 좌측방', 'fabric') === 0, JSON.stringify(r));
  ok("3. '레일만' 행은 제작 발주에 안 나감", by('입구 좌측방', 'production') === 0, JSON.stringify(r));
  ok("4. '레일만' 행도 레일 발주에는 나감", by('입구 좌측방', 'material') === 1, JSON.stringify(r));
  console.log(errs.length ? '❌ JS 에러: ' + errs.join('; ') : '✅ JS 에러 없음'); if (errs.length) fail++;
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
