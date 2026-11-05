// tests/zero-price-save-check.js
// N-127(2026-11-05, 선혜님 "0원을 막을 필요는 없을 것 같다"): 무상 지원 줄에 단가 0을 직접 적으면 저장·인쇄가 통과하고,
// 빈칸(실수로 단가를 빼먹음)은 계속 막히는지 확인. 한계: 가짜 화면 검사이며 실제 기기·실제 견적은 못 봄.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
let fail = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const dir = path.resolve(__dirname, '..'); const server = await startServer(dir, 9983); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (u.startsWith('http://localhost')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('supabase.co')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' });
    req.abort(); });
  await page.goto('http://localhost:9983/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900)); await loginAs(page, 'master'); await new Promise(r => setTimeout(r, 800));
  const run = (rows) => page.evaluate((rows) => {
    document.getElementById('c-name').value = '시험가'; const ph = document.getElementById('c-phone'); if (ph) ph.value = '010-9000-0001';
    document.getElementById('curtain-body').innerHTML = '';
    rows.forEach(x => { addCurtainRow(); const tr = document.querySelector('#curtain-body tr:last-child');
      tr.querySelector('.space-inp').value = x.space; tr.querySelector('.c-display-name').value = '글램';
      tr.querySelector('.mw').value = '200'; tr.querySelector('.mh').value = '264';
      const p = tr.querySelector('.cprice');
      if (x.price !== null) { p.value = Number(x.price).toLocaleString(); p.setAttribute('data-raw', String(x.price)); }
      calcCurtainRow(p); });
    window._lastValidationFailReason = '';
    return { valid: validateEstimate(), reason: window._lastValidationFailReason };
  }, rows);
  let r = await run([{ space: '거실', price: 45000 }, { space: '안방', price: 0 }]);
  ok('유상 1줄 + 단가 0 직접 입력 1줄 → 저장 검사 통과', r.valid === true, JSON.stringify(r));
  r = await run([{ space: '거실', price: 45000 }, { space: '안방', price: null }]);
  ok('단가를 비워둔 줄은 여전히 차단(단가누락)', r.valid === false && /단가누락/.test(r.reason), JSON.stringify(r));
  r = await run([{ space: '안방', price: 0 }]);
  ok('모든 줄이 0원(전부 무상)이어도 막지 않음', r.valid === true, JSON.stringify(r));
  r = await run([]);
  ok('아무 줄도 없으면 여전히 차단(제품 금액 0개)', r.valid === false, JSON.stringify(r));
  r = await page.evaluate(() => { document.getElementById('curtain-body').innerHTML = ''; addCurtainRow(); window._lastValidationFailReason = ''; return { valid: validateEstimate(), reason: window._lastValidationFailReason }; });
  ok('빈 줄 하나만 있으면 여전히 차단', r.valid === false, JSON.stringify(r));
  ok('화면 오류(JS) 없음', errs.length === 0, errs.join(';'));
  await browser.close(); server.close && server.close();
  console.log(fail ? '❌ 실패 ' + fail + '건' : '✅ 모두 통과'); process.exit(fail ? 1 : 0);
})();
