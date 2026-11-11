// 2026-11-12(N-137 ⑩): 발주일·도착일·쿠폰 기간이 한국시간 0~9시에 하루 전으로 계산되던 문제. 시계를 한국시간 11-12 00:30(=UTC 11-11 15:30)으로 고정해 확인한다.
const path = require('path'), fs = require('fs');
const { launchBrowser, startServer } = require('./_helpers');
const ROOT = path.resolve(__dirname, '..');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
(async () => {
  for (const f of ['est-doc-vendor.js', 'est-utils.js']) ok(f + ' 에 UTC 날짜 변환(toISOString().slice) 없음', !/toISOString\(\)\.slice\(0,\s*10\)/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  const server = await startServer(ROOT, 9975); const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url(); if (u.includes('supabase.co') || u.includes('script.google.com') || u.includes('kakao') || u.includes('daum')) return r.abort(); r.continue(); });
  await page.evaluateOnNewDocument(() => { const R = Date; const fixed = R.parse('2026-11-11T15:30:00Z'); window.Date = class extends R { constructor(...a) { if (a.length === 0) super(fixed); else super(...a); } static now() { return fixed; } }; });
  await page.goto('http://localhost:9975/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(() => ({ utc: new Date().toISOString().slice(0, 10), has: typeof dahLocalYmd === 'function', kst: typeof dahLocalYmd === 'function' ? dahLocalYmd() : null }));
  ok('시험 전제: 같은 순간 UTC 날짜는 11-11(하루 전)', r.utc === '2026-11-11', r.utc);
  ok('dahLocalYmd()가 한국시간 날짜(2026-11-12)를 돌려줌', r.has && r.kst === '2026-11-12', JSON.stringify(r));
  await browser.close(); server.close && server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
