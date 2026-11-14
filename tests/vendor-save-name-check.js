// tests/vendor-save-name-check.js
// 2026-11-14(N-137 ③): 인쇄 중 발주처를 고치면 저장 이름·폴더가 고친 값을 따르는지 확인.
// 한계: 이름을 정하는 함수(_savedVendorName)는 실제로 실행해 보고, 저장 호출이 이 함수를 쓰는지는 소스 문자열로 확인(관찰형). 실제 구글드라이브 저장은 선혜님 확인 필요.
const path = require('path'), fs = require('fs');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
let fail = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const dir = path.resolve(__dirname, '..'); const server = await startServer(dir, 9943); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (u.startsWith('http://localhost')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('supabase.co')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' });
    req.abort(); });
  await page.goto('http://localhost:9943/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900)); await loginAs(page, 'master'); await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(() => {
    function blk(dataVendor, fieldText) {
      var d = document.createElement('div'); d.setAttribute('data-vendor', dataVendor);
      d.innerHTML = '<div class="pv-vendor-name-field">' + fieldText + '</div>'; return d;
    }
    return typeof _savedVendorName !== 'function' ? null : {
      edited: _savedVendorName(blk('미지정(블라인드)', '윈텍')),
      same: _savedVendorName(blk('윈텍', '윈텍')),
      many: _savedVendorName(blk('미지정(원단)', '여러 거래처')),
      empty: _savedVendorName(blk('윈텍', '  ')),
      noField: _savedVendorName((function(){ var d = document.createElement('div'); d.setAttribute('data-vendor', '덱스터'); return d; })())
    };
  });
  ok('1. 함수가 있음', !!r);
  ok('2. 발주처를 고치면 고친 값 사용(미지정 → 윈텍)', r && r.edited === '윈텍', r && r.edited);
  ok('3. 안 고쳤으면 그대로', r && r.same === '윈텍');
  ok("4. '여러 거래처' 표시나 빈 칸이면 처음 이름표 사용", r && r.many === '미지정(원단)' && r.empty === '윈텍', JSON.stringify(r));
  ok('5. 발주처 칸이 없으면 처음 이름표 사용', r && r.noField === '덱스터');
  const src = fs.readFileSync(path.join(dir, 'est-doc-vendor-ui.js'), 'utf8');
  ok('6. 저장 호출이 이 함수를 씀(소스 확인)', /var vendor = _savedVendorName\(vendorBlock\);[^\n]*\n\s*saveDocumentToDrive\(vendorCategory\(vendor\)/.test(src));
  console.log(errs.length ? '❌ JS 에러: ' + errs.join('; ') : '✅ JS 에러 없음'); if (errs.length) fail++;
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
