// tests/customer-doc-discount-detail-check.js
// 2026-11-28 N-225(선혜님 '할인을 제일 많이 보는데' → '그러자'): 고객용 견적서에 할인이 항목별(쿠폰명·추가 할인·끝자리 조정)로 보이고,
// 항목 합이 할인 합계와 다르면 합계 한 줄만 보이는지(금액이 틀려 보이지 않게). 한계: 가짜 행으로 보는 시험, 실제 인쇄 모양은 눈 확인 필요.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
let fail = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const dir = path.resolve(__dirname, '..'); const server = await startServer(dir, 9951); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (u.startsWith('http://localhost')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('supabase.co')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' });
    req.abort(); });
  await page.goto('http://localhost:9951/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900)); await loginAs(page, 'master'); await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(() => {
    window._estEditState = window._estEditState || {};
    function rows(html) { var t = document.createElement('div'); t.innerHTML = html; return Array.from(t.querySelectorAll('table.pv-sum-table tr')).map(function(tr){ return tr.textContent.replace(/\s+/g, ' ').trim(); }); }
    var out = {};
    var ob = document.getElementById('other-body'); var tr = document.createElement('tr');
    tr.innerHTML = '<td><input class="other-price" value="625000"><input class="other-qty" value="1"></td>'; ob.appendChild(tr);
    // 쿠폰 15% + 직접 68,650 → 항목별(합계 + 두 줄 + 끝자리 조정은 절사 발생 시)
    document.getElementById('coupon-list').innerHTML = '<input type="checkbox" class="coupon-check" checked data-type="pct" data-value="15" data-name="인테리어 업체" data-id="c1">';
    document.getElementById('discount').value = '68650'; calcTotal();
    out.multi = rows(buildCustomerHTML());
    // 쿠폰만(절사 없음 되도록 절사 안 함) → 한 줄 + 사유
    document.getElementById('discount').value = ''; document.getElementById('trunc-mode').value = 'none'; calcTotal();
    out.single = rows(buildCustomerHTML());
    // 안전장치: 항목 합이 합계와 다르면 합계 한 줄만
    window._estEditState.lastDiscountBreakdown = [{ label: '인테리어 업체 15%', amount: 1 }];
    out.guard = rows(buildCustomerHTML());
    return out;
  });
  const j = a => JSON.stringify(a);
  ok('1. 쿠폰+직접 할인이면 합계 한 줄 아래에 항목별 줄(쿠폰명·추가 할인)이 나옴(내부 용어 "직접입력" 없음)', r.multi.some(x => /^할인-/.test(x)) && r.multi.some(x => /인테리어 업체 15%/.test(x)) && r.multi.some(x => /추가 할인/.test(x)) && !r.multi.some(x => /직접입력/.test(x)), j(r.multi));
  ok('2. 항목이 하나면 한 줄에 사유가 붙음("할인 · 인테리어 업체 15%")', r.single.some(x => /할인 · 인테리어 업체 15%/.test(x)), j(r.single));
  ok('3. 항목 합이 합계와 다르면 합계 한 줄만(안전장치)', r.guard.filter(x => /^할인/.test(x)).length === 1 && !r.guard.some(x => /인테리어/.test(x)), j(r.guard));
  console.log(errs.length ? '❌ JS 에러: ' + errs.join('; ') : '✅ JS 에러 없음'); if (errs.length) fail++;
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
