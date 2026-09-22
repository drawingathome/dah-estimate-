const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9941;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('key=eq.discount_coupons')) {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify([{ value: [{ id: 'c1', name: '입주', type: 'percent', value: 10 }] }]) });
        return;
      }
      if (url.includes('/estimates?id=eq.test-est-choi')) {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify([{
            id: 'test-est-choi', customer_name: '최금희재현', phone: '01099981234', addr: '서울 서초구', price: 3582000, deposit_amount: 750000, balance_amount: 0,
            line_items: [
              { type: 'curtain', space: '거실', mw: 550, mh: 264.5, pnum: 9, price: 185000, displayName: '린 겉커튼', pleatType: '나비주름형', openType: '양개형', hemType: '리드', heightAdjust: '-3', shapeProcess: true },
              { type: 'blind', kind: '롤스크린', space: '거실측면', bmw: 83, bmh: 195, price: 90000, displayName: '울트라 슬림 아이보리 롤 블라인드', opt: '하단 감쌈 (사각)', handle: '기타' },
              { type: 'blind', kind: '롤스크린', space: '거실측면', bmw: 227, bmh: 195, price: 90000, displayName: '울트라 슬림 아이보리 롤 블라인드', opt: '하단 감쌈 (사각)', handle: '기타' }
            ],
            estimate_status: 'ga', confirmed_at: null, client_id: 999, applied_discounts: { coupons: [{ id: 'c1', name: '입주', type: 'percent', value: 10 }] }
          }]) });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.setViewport({ width: 1280, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=test-est-choi&mode=edit`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await loginAs(page, 'master');
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 2500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 최금희 실사례 완전 재현: 할인쿠폰이 적용된 견적서를 loadEstDbId로
  // 불러오면, 할인 복원 과정에서 생기는 "보호 안 된 임시 50%값"에
  // 진짜 계약금(750,000원)이 가려지지 않고 정확히 채워져야 함
  const r1 = await page.evaluate(() => {
    var depInp = document.getElementById('deposit-input');
    return { dep: depInp ? depInp.value : '없음', manualEdit: depInp ? depInp.dataset.manualEdit : null, userTyped: depInp ? depInp.dataset.userTyped : null };
  });
  ok('1. [핵심] 할인쿠폰이 있어도 진짜 계약금(750,000원)이 정확히 채워짐 - 임시 50%값에 안 가려짐', r1.dep.indexOf('750,000') !== -1, JSON.stringify(r1));
  ok('2. 보호 플래그(manualEdit/userTyped)도 정상적으로 켜짐', r1.manualEdit === '1' && r1.userTyped === '1', JSON.stringify(r1));

  // 이어서 품목(블라인드) 삭제 - 아까 신고하신 그 동작
  await page.evaluate(() => {
    var delBtn = document.querySelector('#blind-body tr .del-btn');
    if (delBtn) delBtn.click();
  });
  await new Promise(r => setTimeout(r, 300));
  const r2 = await page.evaluate(() => document.getElementById('deposit-input')?.value);
  ok('3. [핵심] 블라인드 삭제 후에도 계약금 750,000원이 그대로 유지됨(신고하신 증상 재발 안 함)', r2.indexOf('750,000') !== -1, r2);

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 30000);
