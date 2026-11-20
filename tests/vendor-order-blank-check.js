// tests/vendor-order-blank-check.js
// 2026-11-20 N-199(선혜님 '발주서는 절대 오류가 있으면 안돼서'): 제작(캔가공소) 발주의 가로×세로·폭수가 비었거나, 레일 발주의 가로가 비어 '레일'(자 수 없음)만 나가는 발주서를 막는다.
//  옛 코드: 제작 사이즈 '—'·폭수 '—'·레일 자 수 없음이어도 errors가 비어 그대로 인쇄/완료됨.
// 한계: 판정 함수와 실제 행(collectVendorGroups)에서 항목이 빈칸으로 만들어지는지를 본다. 버튼 클릭 흐름(확인창)은 관찰하지 못함.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
let fail = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const dir = path.resolve(__dirname, '..'); const server = await startServer(dir, 9941); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (u.startsWith('http://localhost')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('supabase.co')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' });
    req.abort(); });
  await page.goto('http://localhost:9941/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900)); await loginAs(page, 'master'); await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(() => {
    function prod(o) { return Object.assign({ space: '거실', product: '쉬폰', size: '300×230', qty: '4폭', orderCategory: 'production', vendor: '캔가공소' }, o || {}); }
    function rail(o) { return Object.assign({ space: '거실', product: '10자 조절레일(타공형)', size: '—', qty: '1개', orderCategory: 'material', vendor: '목성' }, o || {}); }
    var pOk = getVendorOrderBlockers({ '캔가공소': [prod()] }).errors;
    var pNoSize = getVendorOrderBlockers({ '캔가공소': [prod({ size: '—' })] }).errors;
    var pNoPnum = getVendorOrderBlockers({ '캔가공소': [prod({ qty: '—' })] }).errors;
    var rOk = getVendorOrderBlockers({ '목성': [rail()] }).errors;
    var rNoW = getVendorOrderBlockers({ '목성': [rail({ product: '조절레일(타공형)' })] }).errors;
    // 실제 행에서: 가로를 비운 커튼 행 → 레일 항목이 '자 수 없음'으로 만들어지는지(= 판정이 이걸 잡아야 함)
    document.getElementById('c-region').value = document.getElementById('c-region').options[1] ? document.getElementById('c-region').options[1].value : '';
    var tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.space-inp').value = '거실'; tr.querySelector('.c-display-name').value = '쉬폰'; tr.querySelector('.mw').value = ''; tr.querySelector('.mh').value = '230';
    var col = collectVendorGroups(); var blk = getVendorOrderBlockers(col.groups).errors;
    return { pOk: pOk, pNoSize: pNoSize, pNoPnum: pNoPnum, rOk: rOk, rNoW: rNoW, region: document.getElementById('c-region').value, blk: blk };
  });
  ok('1. 제작 사이즈·폭수가 있으면 막히지 않음', r.pOk.length === 0, JSON.stringify(r.pOk));
  ok('2. 제작 사이즈(가로×세로)가 비면 막힘', r.pNoSize.some(e => e.indexOf('사이즈') !== -1), JSON.stringify(r.pNoSize));
  ok('3. 제작 폭수가 비면 막힘', r.pNoPnum.some(e => e.indexOf('폭수') !== -1), JSON.stringify(r.pNoPnum));
  ok('4. 레일에 자 수가 있으면 막히지 않음', r.rOk.length === 0, JSON.stringify(r.rOk));
  ok('5. 레일에 자 수가 없으면(가로 비어 있음) 막힘', r.rNoW.some(e => e.indexOf('가로') !== -1), JSON.stringify(r.rNoW));
  ok('6. 실제 행: 가로를 비운 커튼 행은 발주서 점검에서 막힘(시공 지역 선택된 상태)', r.region !== '' && r.blk.some(e => e.indexOf('가로') !== -1 || e.indexOf('사이즈') !== -1), JSON.stringify(r));
  console.log(errs.length ? '❌ JS 에러: ' + errs.join('; ') : '✅ JS 에러 없음'); if (errs.length) fail++;
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
