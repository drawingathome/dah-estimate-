// tests/customer-doc-mobile-layout-check.js
// 2026-10-29(N-49, 선혜님 폰 캡처): 고객용 가견적서가 폰(390px)에서 ① 표의 폭·단가·금액 칸이 화면 밖으로 잘려 보이지 않고
// ② 제목(가견적서)이 사업자 주소 글줄과 겹치고 ③ 화면 구석 버전표시가 본문 글씨 위에 겹치고 ④ 상단 막대 제목이 "가…"로 잘렸음.
// PC(1280px)에서는 정상이어야 하므로 두 화면을 같은 기준으로 검사한다.
const { launchBrowser, startServer, loginAs } = require('./_helpers');
const path = require('path'), fs = require('fs');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const server = await startServer(ROOT, 9962); const browser = await launchBrowser();
  for (const [label, vp] of [['PC 1280px', { width: 1280, height: 900 }], ['폰 390px', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    const page = await browser.newPage(); await page.setViewport(vp);
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await page.setRequestInterception(true);
    page.on('request', req => {
      const u = req.url();
      if (u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) req.continue();
      else if (u.includes('supabase.co')) { const h = { 'Access-Control-Allow-Origin': '*' }; if (req.method() === 'OPTIONS') req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } }); else req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' }); }
      else if (u.includes('logo.png')) req.respond({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(ROOT, 'logo.png')) });
      else req.abort();
    });
    await page.goto('http://localhost:9962/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1200)); await loginAs(page, 'master'); await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => {
      document.getElementById('c-name').value = '시험가'; document.getElementById('c-phone').value = '010-9000-0001'; document.getElementById('c-addr').value = '서울 서초구 시험로 1';
      document.getElementById('curtain-body').innerHTML = ''; document.getElementById('blind-body').innerHTML = '';
      [['거실', '450', '264', '글램 아이보리 중간지'], ['거실', '450', '264', '시소코 아이보리 속커튼'], ['안방', '400', '264', '젤리연베이지 2배 민자형']].forEach(r => {
        addCurtainRow(); const tr = document.querySelector('#curtain-body tr:last-child');
        tr.querySelector('.space-inp').value = r[0]; tr.querySelector('.mw').value = r[1]; calcCurtainRow(tr.querySelector('.mw'));
        tr.querySelector('.mh').value = r[2]; calcCurtainRow(tr.querySelector('.mh')); tr.querySelector('.cprice').value = 45000; calcCurtainRow(tr.querySelector('.cprice'));
        const dn = tr.querySelector('.c-display-name'); if (dn) dn.value = r[3];
      });
      if (typeof calcTotal === 'function') calcTotal();
      printForCustomer();
      const g = document.getElementById('est-auth-gate'); if (g) g.style.display = 'none';
    });
    await new Promise(r => setTimeout(r, 1200));
    const m = await page.evaluate(() => {
      const ov = document.getElementById('pv-overlay'); const vw = document.documentElement.clientWidth;
      const rect = e => e ? e.getBoundingClientRect() : null;
      const t = ov.querySelector('.pv-prod-table'); const th = [...t.querySelectorAll('thead th')]; const last = th[th.length - 1];
      const scroll = t.closest('.pv-table-scroll');
      const lastR = rect(last), scR = rect(scroll);
      const title = rect(ov.querySelector('.pv-doc-title')), sup = rect(ov.querySelector('.pv-supplier-line'));
      const supText = (() => { const rg = document.createRange(); rg.selectNodeContents(ov.querySelector('.pv-supplier-line')); const rs = [...rg.getClientRects()]; return Math.max.apply(null, rs.map(x => x.right)); })();
      const overlap = title && sup && !(title.top >= sup.bottom - 1 || title.left >= supText + 12);
      const badge = document.getElementById('dah-build-badge'); const bR = rect(badge); const bVisible = badge && getComputedStyle(badge).display !== 'none' && bR.width > 0;
      const tr = [...ov.querySelectorAll('.pv-wrap table, #pv-overlay table')];
      let badgeHitsText = false;
      if (bVisible) { const els = [...ov.querySelectorAll('td, th, .pv-cell-sub')]; badgeHitsText = els.some(e => { const r = rect(e); return !(bR.right <= r.left || bR.left >= r.right || bR.bottom <= r.top || bR.top >= r.bottom); }); }
      const navLabel = [...ov.querySelectorAll('.print-hide span')].find(s => /견적서/.test(s.textContent));
      return {
        vw, tableW: Math.round(t.getBoundingClientRect().width), scrollW: Math.round(scR.width),
        lastHeadRight: Math.round(lastR.right), scrollRight: Math.round(scR.right), lastHead: last.textContent.trim(),
        lastHeadVisible: lastR.right <= scR.right + 1, overlap, bVisible, badgeHitsText,
        navTruncated: navLabel ? navLabel.scrollWidth > navLabel.clientWidth + 1 : null,
        docOverflow: document.documentElement.scrollWidth > vw + 1
      };
    });
    console.log(label, JSON.stringify(m));
    ok(label + ' — 표 마지막 칸(금액)이 화면 안에 보임(옆으로 밀지 않아도)', m.lastHead === '금액' && m.lastHeadVisible, JSON.stringify(m));
    ok(label + ' — 표가 보이는 영역보다 넓지 않음', m.tableW <= m.scrollW + 1, m.tableW + ' > ' + m.scrollW);
    ok(label + ' — 제목(가견적서)이 사업자 주소 글줄 바로 옆에 붙어 있지 않음(아래로 내려가거나 12px 이상 띄움)', !m.overlap);
    ok(label + ' — 미리보기가 열려 있는 동안 버전표시가 문서 위에 겹쳐 보이지 않음', !m.bVisible && !m.badgeHitsText);
    ok(label + ' — 상단 막대 제목이 잘리지 않음', m.navTruncated === false, String(m.navTruncated));
    ok(label + ' — 문서 전체가 옆으로 삐져나가지 않음', !m.docOverflow);
    await page.close();
  }
  await browser.close(); server.kill ? server.kill() : server.close && server.close();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 전부 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
