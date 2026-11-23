const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9957;
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
      if (url.includes('key=eq.discount_coupons_none')) {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify([{ value: [{ id: 'c1', name: '입주', type: 'percent', value: 10 }] }]) });
        return;
      }
      if (url.includes('/estimates?id=eq.test-est-choi')) {
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify([{
            id: 'test-est-choi', customer_name: '시험나재현', phone: '01099981234', addr: '서울 서초구', price: 3582000, deposit_amount: 750000, balance_amount: 0,
            line_items: [
              { type: 'curtain', space: '거실', mw: 550, mh: 264.5, pnum: 9, price: 185000, displayName: '린 겉커튼', pleatType: '나비주름형', openType: '양개형', hemType: '리드', heightAdjust: '-3', shapeProcess: true },
              { type: 'blind', kind: '롤스크린', space: '거실측면', bmw: 83, bmh: 195, price: 90000, displayName: '울트라 슬림 아이보리 롤 블라인드', opt: '하단 감쌈 (사각)', handle: '기타' },
              { type: 'blind', kind: '롤스크린', space: '거실측면', bmw: 227, bmh: 195, price: 90000, displayName: '울트라 슬림 아이보리 롤 블라인드', opt: '하단 감쌈 (사각)', handle: '기타' }
            ],
            estimate_status: 'ga', confirmed_at: null, client_id: 999, applied_discounts: { coupons: [], manual: { type: 'won', value: 123 }, truncMode: 'none' }
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

  // N-210 끝자리 처리 선택(선혜님 '끝자리 절사가 무조건이라 끝자리 맞추기 어려울 때가 있어'):
  // 저장된 truncMode='none' 견적을 열면 select가 복원되고 절사 없이 계산돼야 하며,
  // 모드를 바꾸면 합계가 1,000원/100원/없음 단위로 달라지고, 기본(k)일 땐 저장 형태에 truncMode가 없어야 함.
  const num = s => parseInt(String(s).replace(/[^0-9-]/g, ''), 10) || 0;
  const st = () => page.evaluate(() => ({ mode: document.getElementById('trunc-mode') && document.getElementById('trunc-mode').value, total: document.getElementById('sum-total').textContent, saved: JSON.parse(JSON.stringify(window._estEditState.lastAppliedDiscounts || {})) }));
  const setMode = async (m) => { await page.evaluate((m) => { var s = document.getElementById('trunc-mode'); s.value = m; s.dispatchEvent(new Event('change')); }, m); await new Promise(r => setTimeout(r, 400)); return st(); };
  const a = await st();
  ok('1. [핵심] 저장된 truncMode=none 견적을 열면 select가 "절사 안 함"으로 복원됨', a.mode === 'none', JSON.stringify(a));
  ok('2. 절사 안 함이면 합계가 1,000원 단위가 아님(끝자리 그대로)', num(a.total) % 1000 !== 0, a.total);
  ok('3. 저장용 값에 truncMode=none이 들어감', a.saved.truncMode === 'none', JSON.stringify(a.saved));
  const h = await setMode('h');
  ok('4. 100원 단위 절사면 합계가 100의 배수이고 1,000의 배수는 아님', num(h.total) % 100 === 0 && num(h.total) % 1000 !== 0, h.total);
  ok('5. 100원 단위 절사의 저장값 truncMode=h', h.saved.truncMode === 'h', JSON.stringify(h.saved));
  const k = await setMode('k');
  ok('6. 기본(1,000원 절사)이면 합계가 1,000의 배수', num(k.total) % 1000 === 0, k.total);
  ok('7. 기본이면 저장값에 truncMode가 없음(기존 견적 저장 형태 그대로)', k.saved.truncMode === undefined, JSON.stringify(k.saved));
  ok('8. 세 모드 합계 순서: 절사없음 ≥ 100원 ≥ 1,000원', num(a.total) >= num(h.total) && num(h.total) >= num(k.total), [a.total, h.total, k.total].join(' / '));
  // 옛 견적(truncMode 없음)을 복원하면 기본값으로 돌아가야 함
  await page.evaluate(() => { restoreAppliedDiscounts({ coupons: [], manual: null }, undefined, function(){}); });
  await new Promise(r => setTimeout(r, 500));
  const o = await st();
  ok('9. truncMode 없는 옛 견적을 복원하면 기본(1,000원 절사)으로 돌아감', o.mode === 'k', JSON.stringify(o));

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
