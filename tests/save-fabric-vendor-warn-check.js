// tests/save-fabric-vendor-warn-check.js
// 2026-11-15 N-165 P2: 견적서 저장 때 원단명이 있는데 원단 거래처가 빈 커튼 행이 있으면 확인창에 함께 알려 주는지(막지는 않음).
// 한계: 가짜 서버·확인창을 바꿔치기한 시험. 실제 화면 문구는 눈 확인 필요.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
let fail = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const dir = path.resolve(__dirname, '..'); const server = await startServer(dir, 9957); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (u.startsWith('http://localhost')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('supabase.co')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' });
    req.abort(); });
  await page.goto('http://localhost:9957/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900)); await loginAs(page, 'master'); await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(() => {
    function row(space, fabric, vendor) { addCurtainRow(); var tr = document.querySelector('#curtain-body tr:last-child');
      tr.querySelector('.space-inp').value = space; tr.querySelector('.c-fabric').value = fabric; tr.querySelector('.c-vendor').value = vendor; }
    document.querySelectorAll('#curtain-body tr').forEach(function(t){ t.remove(); });
    row('거실', '린넨', ''); row('안방', '벨벳', '디테라'); row('', '쉬폰', ''); row('주방', '', '');
    var out = { list: estFabricVendorMissingSpaces() };
    var msgs = []; window.confirm = function(m){ msgs.push(String(m)); return false; };
    document.getElementById('c-name').value = '시험고객';
    try { saveEstimate(); } catch (e) { out.err = String(e); }
    out.msgs = msgs;
    return out;
  });
  ok('1. 원단명은 있는데 거래처가 빈 행만 골라냄(거실, 3번째 행 / 안방·빈 원단 행 제외)', JSON.stringify(r.list) === JSON.stringify(['거실', '3번째 행']), JSON.stringify(r.list));
  ok('2. 저장 확인창에 "원단 거래처(거실, 3번째 행)"가 함께 안내됨', r.msgs.some(m => m.indexOf('원단 거래처(거실, 3번째 행)') >= 0), JSON.stringify(r.msgs));
  ok('3. 거래처를 모두 채우면 이 안내가 빠짐', await page.evaluate(() => { document.querySelectorAll('#curtain-body .c-vendor').forEach(function(i){ i.value = '디테라'; }); return estFabricVendorMissingSpaces().length === 0; }));
  console.log(errs.length ? '❌ JS 에러: ' + errs.join('; ') : '✅ JS 에러 없음'); if (errs.length) fail++;
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
