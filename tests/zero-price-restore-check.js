// N-212b (2026-11-26, 조은창 사례): 단가 0원으로 저장된 줄(무상·'레일만' 줄)을 다시 열면 단가 칸이 빈칸이 돼
// '단가누락'(커튼 N번째 항목의 단가가 비어있어요)으로 저장·확정이 막혔다. 0도 복원돼야 한다.
// 옛 코드: 0이 거짓값이라 복원 생략 → 빈칸 → 검증 실패. 대조군: 빈칸으로 저장된(진짜 누락) 줄은 그대로 막혀야 함.
// 한계: 가짜 서버 시험이며 운영 화면 확인이 아님.
const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession } = require('./_helpers');
const H = { 'Access-Control-Allow-Origin': '*' };
const cur = (space, mw, price, dn) => ({ type: 'curtain', space, mw, mh: '', pnum: '5', price, amt: '', displayName: dn, pleatType: '', openType: '', hemType: '', heightAdjust: '', shapeProcess: '' });
const mk = (id, items) => ({ id, client_id: 790, customer_name: '시험영가격', phone: '01090003001', addr: '서울 강남구 역삼로 1', addr_detail: '3층', region: '서울', price: 100000, deposit_amount: 0, balance_amount: 0, estimate_status: 'ga', is_archived: false, created_at: '2026-11-26T01:00:00Z', updated_at: '2026-11-26T02:00:00Z', price_breakdown: { svcRowsSaved: true }, applied_discounts: { manual: null, coupons: [] }, line_items: items });
const EST = {
  'z-0': mk('z-0', [cur('응접실', '280', 100000, '라나 05'), cur('응접실', '310', 0, '레일만'), cur('응접실', '410', 0, '레일만')]),
  'z-blank': mk('z-blank', [cur('응접실', '280', 100000, '라나 05'), cur('응접실', '310', '', '이름만')]),
};
async function run() {
  const port = 9959; const server = await startServer(path.resolve(__dirname, '..'), port); const browser = await launchBrowser();
  const page = await browser.newPage(); const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message)); page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } });
      let m = url.match(/\/estimates\?id=eq\.([^&]+)/);
      if (m && EST[decodeURIComponent(m[1])]) return req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([EST[decodeURIComponent(m[1])]]) });
      return req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' });
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
  });
  await page.setViewport({ width: 1280, height: 1400 });
  const log = []; const ok = (l, c, d) => log.push((c ? '✅' : '❌') + ' ' + l + (d !== undefined ? ' — ' + d : ''));
  async function open(id) {
    await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=${id}&mode=edit`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500)); await loginAs(page, 'master'); await setupValidSession(page);
    await new Promise(r => setTimeout(r, 5000));
    return page.evaluate(() => {
      var prices = [...document.querySelectorAll('#curtain-body tr')].map(r => (r.querySelector('.cprice') || {}).value);
      var okv = validateEstimate(); return { prices, ok: okv, reason: window._lastValidationFailReason || null };
    });
  }
  const a = await open('z-0');
  ok('1. [핵심] 단가 0원으로 저장된 줄을 열면 단가 칸에 0이 복원됨', a.prices.filter(p => p === '0').length === 2, JSON.stringify(a.prices));
  ok('2. 그래서 검증이 단가누락으로 막히지 않음', !(a.reason || '').startsWith('단가누락'), JSON.stringify(a));
  const b = await open('z-blank');
  ok('3. 대조군: 진짜 빈칸(단가 미입력) 줄은 그대로 단가누락으로 막힘', (b.reason || '').startsWith('단가누락'), JSON.stringify(b));
  console.log(log.join('\n')); console.log('JS 에러:', jsErrors.length ? jsErrors.slice(0, 3).join(' | ') : '없음');
  await browser.close(); server.close();
  const fail = log.filter(l => l.startsWith('❌')).length; if (fail) { console.log('\n❌ ' + fail + '개 실패'); process.exit(1); } console.log('\n✅ 모든 항목 통과');
}
run().catch(e => { console.error(e); process.exit(1); });
