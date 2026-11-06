// tests/vendor-order-guard-check.js
// 2026-11-07 N-138: 발주서 오발주 안전장치 — 거래처 미지정·블라인드 사이즈/손잡이 비어 있음·품명 비어 있음은 막고(getVendorOrderBlockers),
// 새 블라인드 줄의 손잡이 기본값은 '선택'(좌손 자동 선택 금지). 한계: 판정 함수와 줄 기본값을 보는 시험이며 버튼 클릭 흐름(확인창)은 관찰하지 못함.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
let fail = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const dir = path.resolve(__dirname, '..'); const server = await startServer(dir, 9940); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (u.startsWith('http://localhost')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('supabase.co')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' });
    req.abort(); });
  await page.goto('http://localhost:9940/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900)); await loginAs(page, 'master'); await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(() => {
    function it(o) { return Object.assign({ space: '거실', product: '버튼', size: '120×200', handle: '우손잡이', orderCategory: 'blind', vendor: '윈텍' }, o || {}); }
    var okRes = getVendorOrderBlockers({ '윈텍': [it()] });
    var unassigned = getVendorOrderBlockers({ '미지정(블라인드)': [it({ vendor: '' })] });
    var noSize = getVendorOrderBlockers({ '윈텍': [it({ size: '—' })] });
    var noHandle = getVendorOrderBlockers({ '윈텍': [it({ handle: '—' })] });
    var noName = getVendorOrderBlockers({ '윈텍': [it({ product: '—' })] });
    var rail = getVendorOrderBlockers({ '덱스터': [it({ orderCategory: 'material', size: '—', handle: '—' })] });
    var before = document.querySelectorAll('#blind-body tr').length;
    addBlindRow();
    var rows = document.querySelectorAll('#blind-body tr'); var sel = rows[rows.length - 1].querySelector('.handle-dir');
    return { okErr: okRes.errors, un: unassigned.errors, ns: noSize.errors, nh: noHandle.errors, nn: noName.errors, rail: rail.errors,
      handleVal: sel ? sel.value : null, firstOpt: sel ? sel.options[0].textContent : null, added: rows.length > before };
  });
  ok('1. 정상 발주서는 막히지 않음', r.okErr.length === 0, JSON.stringify(r.okErr));
  ok('2. 거래처 미지정이면 막힘', r.un.length >= 1 && r.un[0].indexOf('거래처') !== -1, JSON.stringify(r.un));
  ok('3. 블라인드 사이즈가 비면 막힘', r.ns.some(e => e.indexOf('사이즈') !== -1), JSON.stringify(r.ns));
  ok('4. 블라인드 손잡이가 비면 막힘', r.nh.some(e => e.indexOf('손잡이') !== -1), JSON.stringify(r.nh));
  ok('5. 품명이 비면 막힘', r.nn.some(e => e.indexOf('품명') !== -1), JSON.stringify(r.nn));
  ok('6. 레일·자재는 사이즈·손잡이가 없어도 막지 않음(블라인드 전용 점검)', r.rail.length === 0, JSON.stringify(r.rail));
  ok('7. 새 블라인드 줄의 손잡이 기본값은 "선택"(빈 값)', r.added && r.handleVal === '' && r.firstOpt === '선택', JSON.stringify([r.handleVal, r.firstOpt]));
  console.log(errs.length ? '❌ JS 에러: ' + errs.join('; ') : '✅ JS 에러 없음'); if (errs.length) fail++;
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
