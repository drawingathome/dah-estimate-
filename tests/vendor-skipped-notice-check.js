// tests/vendor-skipped-notice-check.js
// 2026-11-14(N-137 ⑦): 캔가공소(제작)·레일 발주서가 조건 때문에 만들어지지 않을 때, 서류에서 조용히 사라지지 않고 이유를 알려 주는지 확인.
// 한계: 가짜 거래처 목록·커튼 한 줄로 발주서 문서 문자열을 보는 시험. 실제 화면 모양은 선혜님 눈 확인 필요.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
let fail = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const dir = path.resolve(__dirname, '..'); const server = await startServer(dir, 9945); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (u.startsWith('http://localhost')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('supabase.co')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' });
    req.abort(); });
  await page.goto('http://localhost:9945/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900)); await loginAs(page, 'master'); await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(() => {
    document.getElementById('curtain-body').innerHTML = ''; addCurtainRow();
    var tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.c-fabric').value = '이븐 아이보리'; tr.querySelector('.space-inp').value = '거실';
    tr.querySelector('.mw').value = '300'; tr.querySelector('.mh').value = '250';
    var region = document.getElementById('c-region');
    var regionVal = Array.from(region.options).map(function(o){ return o.value; }).filter(Boolean)[0];
    function run(prodVendors, regionValue, filter) {
      window._dahVendorListRaw = [{ name: '디테라', categories: ['fabric'] }, { name: '목성', categories: ['material'] }].concat(prodVendors.map(function(n){ return { name: n, categories: ['production'] }; }));
      region.value = regionValue;
      return buildVendorHTML('', {}, {}, filter);
    }
    var none = run([], regionVal), one = run(['캔가공소'], regionVal), two = run(['캔가공소', '제작B'], regionVal), noRegion = run(['캔가공소'], ''), prodOnlyEmpty = run([], regionVal, 'production');
    return { none: none, one: one, two: two, noRegion: noRegion, prodOnlyEmpty: prodOnlyEmpty, collectedSkipped: (function(){ window._dahVendorListRaw = []; return collectVendorGroups().skipped; })() };
  });
  ok('1. 제작 거래처 0곳이면 "캔가공소(제작) 발주서가 만들어지지 않았어요" 안내(지금 0곳)', r.none.indexOf('캔가공소(제작) 발주서가 만들어지지 않았어요') >= 0 && r.none.indexOf('지금 0곳') >= 0);
  ok('2. 제작 거래처 2곳이어도 안내(지금 2곳)', r.two.indexOf('캔가공소(제작) 발주서가 만들어지지 않았어요') >= 0 && r.two.indexOf('지금 2곳') >= 0);
  ok('3. 제작 거래처가 정확히 1곳이면 제작 안내 없음', r.one.indexOf('캔가공소(제작) 발주서가 만들어지지 않았어요') === -1);
  ok('4. 지역이 비면 "레일 발주서가 만들어지지 않았어요" 안내, 지역이 있으면 없음', r.noRegion.indexOf('레일 발주서가 만들어지지 않았어요') >= 0 && r.one.indexOf('레일 발주서가 만들어지지 않았어요') === -1);
  ok('5. 제작 발주서만 열었는데 제작이 없으면 빈 화면에도 이유가 나옴', r.prodOnlyEmpty.indexOf('캔가공소(제작) 발주서가 만들어지지 않았어요') >= 0 && r.prodOnlyEmpty.indexOf('발주가 필요한 항목이 없어요') >= 0);
  ok('6. 안내는 인쇄에 안 찍힘(print-hide)', r.none.indexOf('class="print-hide"') >= 0);
  ok('7. 수집 결과에 skipped 정보가 있음', r.collectedSkipped && typeof r.collectedSkipped.production === 'boolean');
  console.log(errs.length ? '❌ JS 에러: ' + errs.join('; ') : '✅ JS 에러 없음'); if (errs.length) fail++;
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
