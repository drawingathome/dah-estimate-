// tests/vendor-doc-unified-check.js
// 2026-11-14(N-137 ⑬, 선혜님 '모두 진행해 승인'): 발주서 4종(원단·레일·캔가공소·블라인드)의 상단 항목·용어·고객명 위치·거래처 칸 규칙이 같은지 확인.
// 한계: 문서 생성 함수에 가짜 항목을 넣어 구조를 보는 시험(실제 견적서·인쇄·PDF는 못 봄).
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
    var cats = ['fabric', 'material', 'production', 'blind'], out = {};
    cats.forEach(function(cat) {
      function item(v) { return { space: '거실', product: '상품A', vendor: v, kind: '콤비', size: '120×200', qty: '3마', handle: '우', cordLength: '150', bottomBar: '화이트', comment: '', content: '', fabricInfo: '거래처 A', hemType: '5cm', shapeProcess: true, fabSize: '300×250', orderCategory: cat }; }
      function build(vendor, v) {
        var html = buildVendorDocForOne(vendor, [item(v)], '홍길동', '오지은 실장', null, '2026-11-14', '2026-11-20', '서울 서초구 가공소');
        var box = document.createElement('div'); box.innerHTML = html;
        var info = box.querySelector('table.pv-doc-info');
        var labels = info ? Array.from(info.querySelectorAll('td')).filter(function(td){ return td.style.background; }).map(function(td){ return td.textContent; }) : null;
        var heads = Array.from(box.querySelectorAll('table:not(.pv-doc-info) thead th')).map(function(t){ return t.textContent; });
        return { labels: labels, heads: heads, banner: !!box.querySelector('.pv-unassigned-banner'), vf: !!box.querySelector('.pv-vendor-name-field'), text: box.textContent };
      }
      out[cat] = { done: build('윈텍', '윈텍'), un: build('미지정(' + cat + ')', '') };
    });
    return out;
  });
  const want = ['요청일','도착일','업체명','고객명','발주처','도착장소','담당자'];
  ['fabric','material','production','blind'].forEach(function(cat, i) {
    const d = r[cat].done, u = r[cat].un;
    ok((i+1) + '-1. ' + cat + ': 상단 항목이 4종 공통(요청일/도착일/업체명/고객명 // 발주처/도착장소/담당자)', JSON.stringify(d.labels) === JSON.stringify(want), JSON.stringify(d.labels));
    ok((i+1) + '-2. ' + cat + ': 표 안에 고객·고객명 칸이 없음(상단 고객명으로 통일)', d.heads.indexOf('고객명') === -1 && d.heads.indexOf('고객') === -1, JSON.stringify(d.heads));
    ok((i+1) + '-3. ' + cat + ': 거래처가 정해지면 표 안 거래처 칸·배너 없음, 발주처 수정칸 있음', d.heads.indexOf('거래처') === -1 && !d.banner && d.vf, JSON.stringify(d.heads) + ' banner=' + d.banner);
    ok((i+1) + '-4. ' + cat + ': 미지정이면 경고 배너 있음' + (cat === 'production' ? '' : '·표 안 거래처 칸 있음'), u.banner && (cat === 'production' || u.heads.indexOf('거래처') !== -1), JSON.stringify(u.heads) + ' banner=' + u.banner);
    ok((i+1) + '-5. ' + cat + ': "도착 장소"(띄어쓰기) 표기 없음', d.text.indexOf('도착 장소') === -1);
  });
  console.log(errs.length ? '❌ JS 에러: ' + errs.join('; ') : '✅ JS 에러 없음'); if (errs.length) fail++;
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
