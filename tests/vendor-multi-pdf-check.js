// tests/vendor-multi-pdf-check.js
// 2026-11-14(N-137 ①): 발주서에 거래처가 여러 곳이면 PDF가 거래처마다 하나씩 만들어지는지, 한 곳이면 기존 동작(새 탭)이 그대로인지 확인.
// 한계: html2pdf(PDF 만드는 외부 도구)는 가짜로 바꿔 '몇 번, 어떤 이름으로, 어떤 문서에 대해' 불렸는지만 본다. 실제 PDF 모양·다운로드는 선혜님 눈 확인 필요.
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
  const r = await page.evaluate(async () => {
    function item(v) { return { space: '거실', product: '상품A', vendor: v, kind: '콤비', size: '120×200', qty: '3마', handle: '우', cordLength: '', bottomBar: '', comment: '', orderCategory: 'blind' }; }
    function setup(vendors) {
      var old = document.getElementById('pv-overlay'); if (old) old.remove();
      var ov = document.createElement('div'); ov.id = 'pv-overlay';
      var nav = document.createElement('div'); nav.className = 'print-hide'; nav.textContent = '발주서'; ov.appendChild(nav);
      vendors.forEach(function(v) { var d = document.createElement('div'); d.innerHTML = buildVendorDocForOne(v, [item(v)], '홍/길:동', '오지은 실장', null, '2026-11-14', '', ''); ov.appendChild(d); });
      document.body.appendChild(ov);
      return ov.querySelectorAll('.pv-wrap');
    }
    var calls = [], downloads = [], opened = 0;
    window.html2pdf = function() { var o = {}; var w = { set: function(opt) { o.opt = opt; return w; }, from: function(el) { o.el = el; return w; },
      outputPdf: function() { calls.push({ filename: o.opt.filename, vendor: o.el.getAttribute('data-vendor') }); return Promise.resolve(new Blob(['x'], { type: 'application/pdf' })); } }; return w; };
    var origClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function() { downloads.push(this.download); };
    window.open = function() { opened++; return { closed: false, location: {}, close: function(){} }; };
    window.showToast = function() {};
    var cn = document.getElementById('c-name'); if (cn) cn.value = '홍/길:동';
    // 1) 거래처 2곳
    var b2 = setup(['윈텍', '덱스터']);
    confirmPdfPrint_fitAsCanvas(b2[0]);
    await new Promise(function(r) { setTimeout(r, 600); });
    var multi = { calls: calls.slice(), downloads: downloads.slice(), opened: opened };
    // 2) 거래처 1곳 — 기존 동작(새 탭) 유지
    calls.length = 0; downloads.length = 0; opened = 0;
    var b1 = setup(['윈텍']);
    confirmPdfPrint_fitAsCanvas(b1[0]);
    await new Promise(function(r) { setTimeout(r, 600); });
    var single = { calls: calls.slice(), downloads: downloads.slice(), opened: opened };
    HTMLAnchorElement.prototype.click = origClick;
    return { multi: multi, single: single };
  });
  ok('1. 거래처 2곳이면 PDF가 2번 만들어짐(거래처별 1개씩)', r.multi.calls.length === 2, JSON.stringify(r.multi.calls));
  ok('2. 파일 이름 = 고객명_발주서_거래처명.pdf (금지문자 치환)', JSON.stringify(r.multi.downloads) === JSON.stringify(['홍_길_동_발주서_윈텍.pdf', '홍_길_동_발주서_덱스터.pdf']), JSON.stringify(r.multi.downloads));
  ok('3. 각 PDF는 해당 거래처 문서 하나만 대상으로 함', r.multi.calls.length === 2 && r.multi.calls[0].vendor === '윈텍' && r.multi.calls[1].vendor === '덱스터', JSON.stringify(r.multi.calls));
  ok('4. 여러 거래처 경로는 빈 새 탭을 열지 않음', r.multi.opened === 0, String(r.multi.opened));
  ok('5. 거래처 1곳이면 기존 동작 유지(새 탭 1개, 다운로드 없음)', r.single.opened === 1 && r.single.downloads.length === 0 && r.single.calls.length === 1, JSON.stringify(r.single));
  console.log(errs.length ? '❌ JS 에러: ' + errs.join('; ') : '✅ JS 에러 없음'); if (errs.length) fail++;
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
