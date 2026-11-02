// tests/font-subset-check.js (N-69 ③) — 글꼴 나누기: 자주 쓰는 글자 파일(작음)을 먼저 쓰고, 없는 글자만 전체 글꼴을 받는다.
// 확인: ①두 화면 CSS 모두 같은 구성 ②작은 파일이 충분히 작고 글자 2,350자+영숫자 포함 ③같은 글자가 원본 글꼴과 픽셀 단위로 동일하게 그려짐(두께 400·700)
//       ④자주 쓰는 글자만 있는 화면은 전체 글꼴(2MB)을 요청하지 않음 ⑤드문 글자(샾·뷁)는 전체 글꼴로 정상 표시 ⑥역검증: 작은 파일을 못 읽으면(404) 전체 글꼴로 대체되어 글자가 깨지지 않음
const fs = require('fs'); const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');
const ROOT = path.resolve(__dirname, '..');
const log = []; const ok = (l, c, d) => log.push((c ? '✅' : '❌') + ' ' + l + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : ''));
const faceRe = /@font-face\s*\{[^}]*\}/g;
function faces(css) { return (css.match(faceRe) || []).filter(f => /Pretendard Variable/.test(f)); }
(async () => {
  const cssFiles = ['dash-styles.css', 'est-styles.css'];
  const cssText = {};
  for (const f of cssFiles) {
    cssText[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const fc = faces(cssText[f]);
    ok(f + ': 글꼴 선언 2개(전체 → 공통 순서)', fc.length === 2 && /pretendard-variable\.woff2/.test(fc[0]) && !/unicode-range/.test(fc[0]) && /pretendard-common\.woff2/.test(fc[1]) && /unicode-range/.test(fc[1]), fc.map(x => x.slice(0, 80)));
  }
  ok('두 화면 CSS의 글꼴 선언이 같음', JSON.stringify(faces(cssText['dash-styles.css'])) === JSON.stringify(faces(cssText['est-styles.css'])));
  const small = fs.statSync(path.join(ROOT, 'pretendard-common.woff2')).size, full = fs.statSync(path.join(ROOT, 'pretendard-variable.woff2')).size;
  ok('공통 글꼴 파일이 전체의 40% 이하', small < full * 0.4, { small, full });
  // unicode-range 안에 필수 글자가 있는지
  const ur = (faces(cssText['dash-styles.css'])[1].match(/unicode-range:\s*([^;]+);/) || [])[1] || '';
  const inRange = cp => ur.split(',').some(t => { const m = t.trim().match(/^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/i); if (!m) return false; const a = parseInt(m[1], 16), b = m[2] ? parseInt(m[2], 16) : a; return cp >= a && cp <= b; });
  const mustHave = '가나다라마바사아자차카타파하원 0123456789 abcXYZ ,.:;()[]/-~₩%+·'.split('').filter(c => c !== ' ');
  ok('필수 글자(한글 자주 쓰는 글자·숫자·영문·기호)가 공통 범위에 있음', mustHave.every(c => inRange(c.codePointAt(0))), mustHave.filter(c => !inRange(c.codePointAt(0))));
  ok('드문 글자(샾·뷁)는 공통 범위 밖(전체 글꼴로 표시)', !inRange('샾'.codePointAt(0)) && !inRange('뷁'.codePointAt(0)));

  const port = 9983; const server = await startServer(ROOT, port); const browser = await launchBrowser();
  const page = await browser.newPage(); await page.setViewport({ width: 600, height: 400, deviceScaleFactor: 1 });
  const reqs = []; page.on('request', r => reqs.push(r.url()));
  await page.goto(`http://localhost:${port}/manifest.json`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const rangeStr = ur;
  await page.evaluate((rangeStr) => {
    const st = document.createElement('style');
    st.textContent = `
      @font-face{font-family:'T-orig';font-weight:45 920;src:url('/pretendard-variable.woff2') format('woff2-variations');}
      @font-face{font-family:'T-new';font-weight:45 920;src:url('/pretendard-variable.woff2') format('woff2-variations');}
      @font-face{font-family:'T-new';font-weight:45 920;src:url('/pretendard-common.woff2') format('woff2-variations');unicode-range:${rangeStr};}
      #ft-wrap{position:fixed;left:0;top:0;background:#fff;z-index:2147483647;padding:8px}
      .ft{font-size:20px;line-height:30px;color:#000;width:560px;white-space:nowrap}`;
    document.head.appendChild(st);
    const w = document.createElement('div'); w.id = 'ft-wrap'; document.body.appendChild(w);
  }, rangeStr);
  const shot = async (family, text, weight) => {
    await page.evaluate((family, text, weight) => { const w = document.getElementById('ft-wrap'); w.innerHTML = '<div class="ft" id="ft" style="font-family:\'' + family + '\',serif;font-weight:' + weight + '">' + text + '</div>'; }, family, text, weight);
    await page.evaluate(() => document.fonts.ready); await new Promise(r => setTimeout(r, 400));
    return (await page.screenshot({ clip: { x: 0, y: 0, width: 600, height: 60 } })).toString('base64');
  };
  const COMMON = '드로잉엣홈 고객 견적서 선금 잔금 1,540,000원 2026-11-02 ABC xyz (확정) [가견적]';
  for (const wt of [400, 700]) {
    const a = await shot('T-orig', COMMON, wt); const b = await shot('T-new', COMMON, wt);
    ok('자주 쓰는 글자: 원본 글꼴과 픽셀 동일(두께 ' + wt + ')', a === b);
  }
  // ④ 자주 쓰는 글자만 → 전체 글꼴 요청 없음 (T-new 첫 사용 시점부터 센다)
  reqs.length = 0;
  await page.evaluate(() => { document.fonts.clear && 0; });
  const page2 = await browser.newPage(); const reqs2 = []; page2.on('request', r => reqs2.push(r.url()));
  await page2.goto(`http://localhost:${port}/manifest.json`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page2.evaluate((rangeStr) => {
    const st = document.createElement('style');
    st.textContent = `@font-face{font-family:'T2';font-weight:45 920;src:url('/pretendard-variable.woff2?t2') format('woff2-variations');}
      @font-face{font-family:'T2';font-weight:45 920;src:url('/pretendard-common.woff2?t2') format('woff2-variations');unicode-range:${rangeStr};}`;
    document.head.appendChild(st);
    const d = document.createElement('div'); d.id = 'x'; d.style.cssText = "font-family:'T2',serif;font-size:20px"; d.textContent = '드로잉엣홈 고객 견적서 선금 잔금 1,540,000원'; document.body.appendChild(d);
  }, rangeStr);
  await page2.evaluate(() => document.fonts.ready); await new Promise(r => setTimeout(r, 800));
  ok('④ 자주 쓰는 글자만 있는 화면은 공통 글꼴만 요청(전체 2MB 요청 없음)', reqs2.some(u => /pretendard-common\.woff2\?t2/.test(u)) && !reqs2.some(u => /pretendard-variable\.woff2\?t2/.test(u)), reqs2.filter(u => /woff2/.test(u)));
  await page2.evaluate(() => { document.getElementById('x').textContent += ' 샾뷁'; });
  await page2.evaluate(() => document.fonts.ready); await new Promise(r => setTimeout(r, 800));
  ok('⑤ 드문 글자(샾·뷁)가 나오면 그때 전체 글꼴을 요청', reqs2.some(u => /pretendard-variable\.woff2\?t2/.test(u)), reqs2.filter(u => /woff2/.test(u)));
  const a2 = await shot('T-orig', '샾뷁 고객', 400); const b2 = await shot('T-new', '샾뷁 고객', 400);
  ok('드문 글자 포함 문장도 원본과 픽셀 동일', a2 === b2);
  await page2.close();
  // ⑥ 역검증: 공통 파일이 404여도 전체 글꼴로 글자가 정상(깨지지 않음)
  const page3 = await browser.newPage(); await page3.setViewport({ width: 600, height: 400 });
  await page3.setRequestInterception(true);
  page3.on('request', r => (/pretendard-common\.woff2/.test(r.url()) ? r.respond({ status: 404, body: '' }) : r.continue()));
  await page3.goto(`http://localhost:${port}/manifest.json`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page3.evaluate((rangeStr) => {
    const st = document.createElement('style');
    st.textContent = `@font-face{font-family:'T3';font-weight:45 920;src:url('/pretendard-variable.woff2') format('woff2-variations');}
      @font-face{font-family:'T3';font-weight:45 920;src:url('/pretendard-common.woff2') format('woff2-variations');unicode-range:${rangeStr};}
      #ft-wrap{position:fixed;left:0;top:0;background:#fff;z-index:2147483647;padding:8px}.ft{font-size:20px;line-height:30px;color:#000;width:560px;white-space:nowrap}`;
    document.head.appendChild(st); const w = document.createElement('div'); w.id = 'ft-wrap'; w.innerHTML = '<div class="ft" id="ft" style="font-family:\'T3\',serif">' + '드로잉엣홈 고객 견적서 선금 잔금 1,540,000원' + '</div>'; document.body.appendChild(w);
  }, rangeStr);
  await page3.evaluate(() => document.fonts.ready); await new Promise(r => setTimeout(r, 800));
  const w3 = await page3.evaluate(() => document.getElementById('ft').getBoundingClientRect().width);
  ok('⑥ 공통 파일을 못 읽어도(404) 글자가 사라지지 않음(폭이 정상 문장 폭)', w3 > 200, w3);
  console.log(log.join('\n')); await browser.close(); server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 120000);
