// tests/target-total-check.js
// 2026-11-28 N-224(선혜님 '최종 금액으로 맞추기 만들자'): 화면에서 목표 금액을 넣고 '맞추기'를 누르면 직접입력 할인(원)이 자동 계산돼 최종 금액이 목표가 되는지.
// 손계산: 제품 625,000 + 시공비 137,400 = 762,400. 쿠폰 없이 600,000 → 직접입력 162,400. 인테리어 15% 쿠폰 체크 상태로 600,000 → 직접입력 80,765
// (원 할인이 먼저 빠지고 남은 금액에 15%: 80,765 + round(544,235×0.15)=81,635 → 합 162,400). 목표가 더 높으면 안내만 하고 할인칸은 안 바뀜.
// 한계: 가짜 서버·가짜 행으로 보는 시험(실제 견적서 화면 눈 확인 필요).
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
let fail = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const dir = path.resolve(__dirname, '..'); const server = await startServer(dir, 9949); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (u.startsWith('http://localhost')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('supabase.co')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' });
    req.abort(); });
  await page.goto('http://localhost:9949/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900)); await loginAs(page, 'master'); await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(() => {
    window._estEditState = window._estEditState || {};
    var toasts = []; window.showToast = function(m){ toasts.push(m); };
    var ob = document.getElementById('other-body'); var tr = document.createElement('tr');
    tr.innerHTML = '<td><input class="other-price" value="625000"><input class="other-qty" value="1"></td>'; ob.appendChild(tr);
    var sb = document.getElementById('svc-body'); var sr = document.createElement('tr');
    sr.innerHTML = '<td><input class="sprice" value="137400"><input class="sqty" value="1"></td>'; sb.appendChild(sr);
    calcTotal();
    var out = {}; out.base = document.getElementById('sum-total').textContent;
    function run(target) { document.getElementById('target-total').value = String(target); toasts.length = 0; applyTargetTotal(); return { total: document.getElementById('sum-total').textContent, disc: document.getElementById('discount').value, type: document.getElementById('discount-type').value, toast: toasts[0] || '' }; }
    out.a = run(600000);                    // 쿠폰 없음
    // 쿠폰 15% 체크(가짜)
    var cl = document.getElementById('coupon-list'); cl.innerHTML = '<input type="checkbox" class="coupon-check" checked data-type="pct" data-value="15" data-name="인테리어 업체" data-id="c1">'; 
    document.getElementById('discount').value = '999'; calcTotal();
    out.b = run(600000);                    // 쿠폰 15% 유지
    out.bDisc = document.getElementById('sum-discount').textContent;
    var before = document.getElementById('discount').value;
    out.c = run(900000);                    // 목표가 더 높음 → 안 바뀜
    out.cSame = before === document.getElementById('discount').value;
    out.d = run(0);                        // 잘못된 입력
    return out;
  });
  ok('1. 쿠폰 없이 최종 600,000 → 직접입력 162,400원·최종 600,000원', r.a.disc === '162400' && r.a.type === 'won' && r.a.total === '600,000원', JSON.stringify(r.a));
  ok('2. 쿠폰 15% 체크 상태로 600,000 → 직접입력 80,765원(기존 999 덮어씀)·최종 600,000원', r.b.disc === '80765' && r.b.total === '600,000원', JSON.stringify(r.b) + r.bDisc);
  ok('3. 안내 문구에 맞춘 금액이 나옴', /600,000원/.test(r.a.toast) && /162,400원/.test(r.a.toast), r.a.toast);
  ok('4. 목표가 더 높으면 할인칸은 안 바뀌고 안내만(올릴 수 없음)', r.cSame === true && /올릴 수 없어요/.test(r.c.toast), JSON.stringify(r.c));
  ok('5. 0원 입력은 안내만', /입력해 주세요/.test(r.d.toast), r.d.toast);
  console.log(errs.length ? '❌ JS 에러: ' + errs.join('; ') : '✅ JS 에러 없음'); if (errs.length) fail++;
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
