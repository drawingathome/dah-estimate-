// tests/doc-pdf-print-check.js
// 2026-11-05(H-37 2차 남은 항목): ①PDF 사이즈 선택창이 폰·태블릿·PC 화면 안에 다 들어오고 버튼이 눌리는지 ②공개 링크를 인쇄 화면(@media print)으로 바꿨을 때
// 옆으로 넘치지 않고 견적서가 보이는지 ③카톡 공유와 같은 방식(html2pdf)으로 실제 PDF 파일이 만들어지는지(PDF 머리말·용량·페이지 수).
// 한계: 가짜 견적(시험가), 실제 폰의 공유창/인쇄 미리보기는 못 봄. ③은 공개 보기 문서를 편집 화면 상태로 풀어 캡처(공개 링크 자체에는 PDF 저장 버튼이 없음).
const path = require('path'), fs = require('fs');
const { launchBrowser, startServer } = require('./_helpers');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
const ROOT = path.resolve(__dirname, '..');
const items = [];
['1층 거실', '1층 안방', '2층 자녀방'].forEach((s, k) => items.push({ type: 'curtain', space: s, displayName: '글램 아이보리 중간지 (난연 인증 제품)', mw: String(200 + k * 20), mh: '264', pnum: '4', price: 45000, amt: '180,000원', pleatType: '나비주름형', openType: '양개형', hemType: '8cm' }));

async function mk(browser, vp, url) {
  const page = await browser.newPage(); await page.setViewport(vp);
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (req.method() === 'OPTIONS' && u.includes('supabase.co')) return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('/rpc/get_public_estimate')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify([{ customer_name: '시험가', phone: '01090000001', staff_name: '장선혜', estimate_status: 'ga', install_date: '2026-11-13', line_items: items }]) });
    if (u.includes('logo.png')) return req.respond({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(ROOT, 'logo.png')) });
    if (u.includes('supabase.co') || u.includes('script.google.com')) return req.abort(); req.continue(); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  return { page, errs };
}
(async () => {
  const server = await startServer(ROOT, 9972); const browser = await launchBrowser();
  const URL = 'http://localhost:9972/dah-estimate.html';
  // ① PDF 사이즈 선택창 (편집 화면)
  for (const [vn, vp] of [['폰 390px', { width: 390, height: 844, isMobile: true, hasTouch: true }], ['태블릿 768px', { width: 768, height: 1024 }], ['PC 1280px', { width: 1280, height: 900 }]]) {
    const { page, errs } = await mk(browser, vp, URL);
    await new Promise(r => setTimeout(r, 1500));
    const r = await page.evaluate(() => {
      if (typeof _openPdfModalNow !== 'function') return { noFn: true };
      _openPdfModalNow();
      const box = document.getElementById('pdf-size-box'); if (!box) return { noBox: true };
      const b = box.getBoundingClientRect(); const vw = window.innerWidth, vh = window.innerHeight;
      const btns = [...document.querySelectorAll('.pdf-modal-cancel, .pdf-modal-confirm')].map(x => x.getBoundingClientRect());
      const inView = (q) => q.left >= -0.5 && q.right <= vw + 0.5 && q.top >= -0.5 && q.bottom <= vh + 0.5 && q.width > 20 && q.height > 20;
      selectPdfOpt('a4'); const a4 = document.getElementById('pdf-opt-a4').classList.contains('selected') && !document.getElementById('pdf-opt-fit').classList.contains('selected');
      closePdfModal(); const closed = !document.getElementById('pdf-size-modal').classList.contains('open');
      return { boxIn: inView(b), btnsIn: btns.length === 2 && btns.every(inView), a4, closed, hscroll: document.documentElement.scrollWidth > vw + 1, box: [Math.round(b.left), Math.round(b.right), Math.round(b.top), Math.round(b.bottom), vw, vh].join(',') };
    });
    ok(vn + ' · PDF 사이즈 선택 함수가 있음', !r.noFn && !r.noBox, JSON.stringify(r));
    if (!r.noFn && !r.noBox) { ok(vn + ' · 선택창이 화면 안에 다 들어옴', r.boxIn, r.box); ok(vn + ' · 취소/저장 버튼이 화면 안에 있음', r.btnsIn); ok(vn + ' · A4 선택이 바뀌고 취소로 닫힘', r.a4 && r.closed); ok(vn + ' · 가로로 밀리지 않음', !r.hscroll); }
    ok(vn + ' · 화면 오류(JS) 없음', errs.length === 0, errs.join(';'));
    await page.close();
  }
  // ② 공개 링크 인쇄 화면
  {
    const { page, errs } = await mk(browser, { width: 794, height: 1123 }, URL + '?view=t1');
    await page.waitForFunction(() => { var c = document.getElementById('public-view-container'); return c && /견적서/.test(c.textContent || ''); }, { timeout: 15000 }).catch(() => {});
    await page.emulateMediaType('print'); await new Promise(r => setTimeout(r, 600));
    const p = await page.evaluate(() => {
      const c = document.getElementById('public-view-container'); const t = c.querySelector('.pv-prod-table'); const vw = document.documentElement.clientWidth;
      // 견적서 표의 네 모서리 안쪽·가운데 5곳을 실제로 찍어서, 그 자리에 보이는 요소가 견적서 안의 것인지(다른 것이 위에 겹쳐 있지 않은지) 확인
      const tr = t ? t.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
      const pts = t ? [[tr.left + 6, tr.top + 6], [tr.left + tr.width - 6, tr.top + 6], [tr.left + 6, tr.top + tr.height - 6], [tr.left + tr.width - 6, tr.top + tr.height - 6], [tr.left + tr.width / 2, tr.top + tr.height / 2]] : [];
      const covered = pts.filter(([x, y]) => { if (y < 0 || y > window.innerHeight) return false; const el = document.elementFromPoint(x, y); return !el || !c.contains(el); }).map(([x, y]) => Math.round(x) + ',' + Math.round(y));
      const fixedVisible = covered;
      return { shown: !!t && c.offsetHeight > 200, over: document.documentElement.scrollWidth > vw + 1, sw: document.documentElement.scrollWidth, vw, fixedVisible };
    });
    ok('인쇄 화면: 공개 견적서가 보임', p.shown, JSON.stringify(p));
    ok('인쇄 화면: 가로로 넘치지 않음(A4 폭 794px 기준)', !p.over, JSON.stringify(p));
    ok('인쇄 화면: 견적서 표 위 5곳에 다른 요소가 겹쳐 있지 않음', p.fixedVisible.length === 0, p.fixedVisible.join(' / '));
    ok('인쇄 화면: 화면 오류(JS) 없음', errs.length === 0, errs.join(';'));
    await page.emulateMediaType('screen');
    // ③ 실제 PDF 만들기 (카톡 공유와 같은 html2pdf 방식)
    await page.addScriptTag({ url: '/html2pdf.bundle.min.js' });
    const pdf = await page.evaluate(async () => {
      // html2pdf는 임시 영역을 body 아래에 만드는데, 공개 보기 모드는 body 아래 다른 요소를 전부 숨겨서 빈 PDF가 됨 → 카톡 공유가 실제로 일어나는 편집 화면과 같게 모드를 풀고 캡처
      document.body.classList.remove('public-view-mode'); const pc = document.getElementById('public-view-container'); pc.style.display = 'block';
      const el = document.querySelector('#public-view-container .pv-wrap') || pc;
      const h = Math.max(200, Math.ceil(el.scrollHeight * 25.4 / 96) + 5);
      const blob = await html2pdf().set({ margin: 0, image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: [190.5, h], orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] } }).from(el).outputPdf('blob');
      const buf = new Uint8Array(await blob.arrayBuffer()); const head = String.fromCharCode.apply(null, buf.slice(0, 5));
      const txt = new TextDecoder('latin1').decode(buf); const pages = (txt.match(/\/Type\s*\/Page[^s]/g) || []).length;
      return { size: blob.size, head, pages, h };
    }).catch(e => ({ err: String(e.message).slice(0, 120) }));
    ok('PDF 만들기: 오류 없이 파일이 만들어짐', !pdf.err, pdf.err);
    if (!pdf.err) { ok('PDF 만들기: PDF 형식(머리말 %PDF)이고 용량이 10KB 이상', pdf.head === '%PDF-' && pdf.size > 10000, JSON.stringify(pdf)); ok('PDF 만들기: 견적서 1장 안에 담김(페이지 1)', pdf.pages === 1, JSON.stringify(pdf)); }
    await page.close();
  }
  await browser.close(); server.kill && server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 전부 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
