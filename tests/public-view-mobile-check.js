// tests/public-view-mobile-check.js
// 2026-10-29(H-37 2차): 알림톡으로 고객에게 가는 공개 링크(?view=)의 폰(390px) 화면에서 금액 칸이 스크롤 안내(그림자·화살표)에 가려지지 않는지.
// 폰에서는 폭·단가 칸을 숨겨 표가 칸에 다 들어가므로 "옆으로 밀면 더 있다"는 안내가 있으면 안 된다. PC는 원래대로 정상이어야 한다.
const path = require('path'), fs = require('fs');
const { launchBrowser, startServer } = require('./_helpers');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
const ROOT = path.resolve(__dirname, '..');
const items = [];
['1층 거실', '1층 안방', '2층 자녀방'].forEach((s, k) => items.push({ type: 'curtain', space: s, displayName: '글램 아이보리 중간지 (난연 인증 제품)', mw: String(200 + k * 20), mh: '264', pnum: '4', price: 45000, amt: '180,000원', pleatType: '나비주름형', openType: '양개형', hemType: '8cm' }));
(async () => {
  const server = await startServer(ROOT, 9966); const browser = await launchBrowser();
  for (const [vn, vp] of [['폰 390px', { width: 390, height: 844, isMobile: true, hasTouch: true }], ['PC 1280px', { width: 1280, height: 900 }]]) {
    const page = await browser.newPage(); await page.setViewport(vp);
    await page.setRequestInterception(true);
    page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
      if (req.method() === 'OPTIONS' && u.includes('supabase.co')) return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
      if (u.includes('/rpc/get_public_estimate')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify([{ customer_name: '시험가', phone: '01090000001', staff_name: '장선혜', estimate_status: 'ga', install_date: '2026-11-13', line_items: items }]) });
      if (u.includes('logo.png')) return req.respond({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(ROOT, 'logo.png')) });
      if (u.includes('supabase.co') || u.includes('script.google.com')) return req.abort(); req.continue(); });
    await page.goto('http://localhost:9966/dah-estimate.html?view=t1', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() => { var c = document.getElementById('public-view-container'); return c && /견적서/.test(c.textContent || ''); }, { timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1200));
    const m = await page.evaluate(() => {
      const c = document.getElementById('public-view-container'); const w = c.querySelector('.pv-table-scroll-wrap'); const sc = c.querySelector('.pv-table-scroll');
      const after = getComputedStyle(w, '::after'); const t = c.querySelector('.pv-prod-table');
      const th = [...t.querySelectorAll('thead th')].filter(x => x.offsetParent); const last = th[th.length - 1];
      return { rendered: !!t, hintShown: after.display !== 'none' && after.content !== 'none' && parseFloat(after.opacity) > 0 && !w.classList.contains('scrolled-end'),
        tableFits: t.getBoundingClientRect().width <= sc.getBoundingClientRect().width + 1, last: last.textContent.trim() };
    });
    ok(vn + ' · 공개 링크 문서가 그려짐', m.rendered);
    ok(vn + ' · 마지막 칸은 금액', m.last === '금액', m.last);
    if (vn.startsWith('폰')) { ok(vn + ' · 표가 칸에 다 들어감', m.tableFits); ok(vn + ' · 금액 칸을 가리는 스크롤 안내(그림자·화살표)가 없음', !m.hintShown); }
    await page.close();
  }
  await browser.close(); server.kill && server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 전부 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
