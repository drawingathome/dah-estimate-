// tests/vendor-doc-pdf-pc-mobile-check.js
// 2026-11-15 N-173(선혜님 '발주서 파일들이 피씨와 모바일이 차이가 많이 나는데'): 같은 블라인드 발주서를 PC 폭·폰 폭에서 PDF 캡처 조건(폭 720px, pv-pdf-capture)으로 만들었을 때 결과가 같은지,
// 화면 전용 안내 문구가 PDF에 안 찍히는지 확인. 한계: 가짜 서버·제 환경 Chromium의 폰 크기 흉내(실제 아이폰·안드로이드 아님), A4 인쇄 방식은 미확인.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
setTimeout(() => { console.log('timeout'); process.exit(1); }, 150000);
(async () => {
  const server = await startServer(path.resolve(__dirname, '..'), 9955); const browser = await launchBrowser();
  const out = {};
  for (const [label, vp] of [['pc', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 800, isMobile: true, hasTouch: true }]]) {
    const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
      if (u.startsWith('http://localhost')) return req.continue();
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
      if (u.includes('supabase.co')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' });
      req.abort(); });
    await page.setViewport(vp);
    await page.goto('http://localhost:9955/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 900)); await loginAs(page, 'master'); await new Promise(r => setTimeout(r, 800));
    await page.evaluate(() => { var g = document.getElementById('est-auth-gate'); if (g) g.remove(); });
    await page.evaluate(async () => {
      var rows = [['거실','버튼','콤비','120','200','우손','150','화이트','창문 안쪽'],['거실','실크','롤스크린','90','180','좌손','120','블랙','현장확인'],['안방','린넨','콤비','140','210','우손','160','화이트','']];
      rows.forEach(function(d){ addBlindRow(); var tr = document.querySelector('#blind-body tr:last-child');
        tr.querySelector('.space-inp').value = d[0]; tr.querySelector('.b-fabric').value = d[1]; tr.querySelector('.blind-kind').value = d[2];
        tr.querySelector('.bmw').value = d[3]; tr.querySelector('.bmh').value = d[4]; tr.querySelector('.handle-dir').value = d[5];
        tr.querySelector('.b-cord-length').value = d[6]; tr.querySelector('.b-bottom-bar').value = d[7]; tr.querySelector('.b-comment').value = d[8];
        var v = tr.querySelector('.b-vendor'); var o = document.createElement('option'); o.value = o.textContent = '윈텍'; v.appendChild(o); v.value = '윈텍'; });
      printForVendor('blind'); await new Promise(r => setTimeout(r, 900));
    });
    const m = await page.evaluate(() => {
      var sc = document.querySelector('#pv-overlay .pv-order-table-scroll'); var tb = document.querySelector('#pv-overlay .pv-blind-table');
      return { scrollClient: sc && sc.clientWidth, scrollW: sc && sc.scrollWidth, tableW: tb && tb.getBoundingClientRect().width, vw: innerWidth };
    });
    // PDF 캡처와 같은 조건(폭 720px + pv-pdf-capture)으로 이미지 생성
    await page.addScriptTag({ url: '/html2pdf.bundle.min.js' });
    const png = await page.evaluate(async () => {
      var el = document.querySelector('#pv-overlay .pv-wrap') || document.querySelector('#pv-overlay [data-vendor]').parentElement;
      var ow = el.style.width, om = el.style.maxWidth;
      el.style.width = '720px'; el.style.maxWidth = '720px'; el.classList.add('pv-pdf-capture');
      var hint=[...el.querySelectorAll('.print-hide')].map(function(h){return getComputedStyle(h).display}); window._hint=hint; var c = await html2pdf().set({ margin: 0, image: { type: 'jpeg', quality: 0.9 }, html2canvas: { scale: 1, useCORS: true }, jsPDF: { unit: 'mm', format: [190.5, 260], orientation: 'portrait' } }).from(el).toCanvas().get('canvas');
      el.style.width = ow; el.style.maxWidth = om; el.classList.remove('pv-pdf-capture');
      return { hint: window._hint, data: c.toDataURL('image/png'), w: c.width, h: c.height, elTag: el.className };
    });
    out[label + 'Data'] = png.data;
    out[label] = { hint: png.hint, m, pdfW: png.w, pdfH: png.h, el: png.elTag, errs };
    await page.close();
  }
  let fail = 0;
  function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; }
  ok('1. PC(1280)·폰(390)에서 만든 발주서 PDF 캡처의 크기가 같다', out.pc.pdfW === out.mobile.pdfW && out.pc.pdfH === out.mobile.pdfH, out.pc.pdfW + 'x' + out.pc.pdfH + ' vs ' + out.mobile.pdfW + 'x' + out.mobile.pdfH);
  ok('2. 두 이미지가 완전히 같다(상단 정보표 배치 포함)', out.pcData === out.mobileData, 'pixel mismatch');
  ok('3. PDF 캡처 중 화면 전용 안내 문구(.print-hide)가 PC·폰 모두 숨겨진다', out.pc.hint.length > 0 && out.pc.hint.every(h => h === 'none') && out.mobile.hint.every(h => h === 'none'), JSON.stringify([out.pc.hint, out.mobile.hint]));
  ok('4. JS 에러 없음', out.pc.errs.length === 0 && out.mobile.errs.length === 0, JSON.stringify([out.pc.errs, out.mobile.errs]));
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
