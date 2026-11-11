// 2026-11-11(선혜님 캡처): 견적서를 저장한 직후 인쇄(미리보기)하면 '저장 완료! (DB+로컬)' 알림 글자가 문서 위에 찍힘.
// 알림(#toast)은 화면에 고정(fixed)된 요소인데 @media print 규칙이 숨기지 않았기 때문. 인쇄 모드에서 알림이 안 보여야 한다.
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');
const ROOT = path.resolve(__dirname, '..');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
(async () => {
  const server = await startServer(ROOT, 9974); const browser = await launchBrowser();
  for (const f of ['dah-estimate.html', 'dah-dashboard.html']) {
    const page = await browser.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 100)));
    await page.setRequestInterception(true);
    page.on('request', r => { const u = r.url(); if (u.includes('supabase.co') || u.includes('script.google.com') || u.includes('kakao') || u.includes('daum')) return r.abort(); r.continue(); });
    await page.goto('http://localhost:9974/' + f, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 800));
    await page.evaluate(() => { showToast('저장 완료! (DB+로컬)'); }); await new Promise(r => setTimeout(r, 500));
    const screen = await page.evaluate(() => { const t = document.getElementById('toast'); const s = getComputedStyle(t); return { d: s.display, o: s.opacity, vis: t.getBoundingClientRect().width > 0 }; });
    ok(f + ' 화면에서는 알림이 보임(시험 전제)', screen.d !== 'none' && screen.vis && Number(screen.o) > 0, JSON.stringify(screen));
    await page.emulateMediaType('print');
    const pr = await page.evaluate(() => { const t = document.getElementById('toast'); const s = getComputedStyle(t); return { d: s.display, vis: t.getBoundingClientRect().width > 0 }; });
    ok(f + ' 인쇄 모드에서는 알림이 안 보임', pr.d === 'none' || !pr.vis, JSON.stringify(pr));
    await page.close();
  }
  await browser.close(); server.close && server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
