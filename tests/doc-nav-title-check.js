// tests/doc-nav-title-check.js
// 2026-10-29(H-37): 서류 미리보기 상단 막대의 제목이 폰(390px)에서 "발.."처럼 잘리지 않는지 — 고객용 견적서·실측/시공요청서·발주서 모두.
const { launchBrowser, startServer, loginAs } = require('./_helpers');
const path = require('path'), fs = require('fs');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
const ROOT = path.resolve(__dirname, '..');
const DOCS = [['고객용 견적서', 'printForCustomer()'], ['실측요청서', "printRequest('measure',true)"], ['시공요청서', "printRequest('install',true)"], ['발주서', 'printForVendor()']];
(async () => {
  const server = await startServer(ROOT, 9964); const browser = await launchBrowser();
  for (const [vn, vp] of [['폰 390px', { width: 390, height: 844, isMobile: true, hasTouch: true }], ['PC 1280px', { width: 1280, height: 900 }]]) {
    for (const [dn, call] of DOCS) {
      const page = await browser.newPage(); await page.setViewport(vp);
      page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
      await page.setRequestInterception(true);
      page.on('request', req => { const u = req.url(); if (u.startsWith('http://localhost')) req.continue(); else if (u.includes('supabase.co')) { const h = { 'Access-Control-Allow-Origin': '*' }; if (req.method() === 'OPTIONS') req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } }); else req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' }); } else if (u.includes('logo.png')) req.respond({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(ROOT, 'logo.png')) }); else req.abort(); });
      await page.goto('http://localhost:9964/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 1200)); await loginAs(page, 'master'); await new Promise(r => setTimeout(r, 800));
      await page.evaluate((call) => {
        document.getElementById('c-name').value = '시험가'; document.getElementById('c-phone').value = '010-9000-0001'; document.getElementById('c-addr').value = '서울 시험로 1';
        document.getElementById('curtain-body').innerHTML = ''; document.getElementById('blind-body').innerHTML = '';
        for (let k = 0; k < 3; k++) { addCurtainRow(); const tr = document.querySelector('#curtain-body tr:last-child'); tr.querySelector('.space-inp').value = '거실'; tr.querySelector('.mw').value = '300'; calcCurtainRow(tr.querySelector('.mw')); tr.querySelector('.mh').value = '264'; calcCurtainRow(tr.querySelector('.mh')); tr.querySelector('.cprice').value = 45000; calcCurtainRow(tr.querySelector('.cprice')); const d = tr.querySelector('.c-display-name'); if (d) d.value = '시험 원단'; const f = tr.querySelector('.c-fabric'); if (f) f.value = '시험 원단'; }
        try { calcTotal(); } catch (e) {}
        const g = document.getElementById('est-auth-gate'); if (g) g.style.display = 'none';
        eval(call);
      }, call);
      await new Promise(r => setTimeout(r, 1200));
      const m = await page.evaluate(() => {
        const ov = document.getElementById('pv-overlay'); if (!ov) return { none: true };
        const nav = ov.querySelector('.print-hide'); if (!nav) return { none: true };
        const lab = [...nav.querySelectorAll('span')][0];
        const btns = [...nav.querySelectorAll('button')];
        const vw = document.documentElement.clientWidth;
        return { label: lab ? lab.textContent : '', truncated: lab ? lab.scrollWidth > lab.clientWidth + 1 : false, btnOut: btns.some(b => b.getBoundingClientRect().right > vw + 1) };
      });
      ok(vn + ' · ' + dn + ' — 서류 창이 열림', !m.none);
      if (!m.none) { ok(vn + ' · ' + dn + ' — 상단 막대 제목("' + m.label + '")이 잘리지 않음', !m.truncated); ok(vn + ' · ' + dn + ' — 상단 막대 버튼이 화면 밖으로 나가지 않음', !m.btnOut); }
      await page.close();
    }
  }
  await browser.close(); server.kill ? server.kill() : null;
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 전부 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
