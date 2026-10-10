// tests/unconfirm-reason-check.js
// 2026-10-10(선혜님 - 수정 중 확정이 풀렸는데 누가/왜 풀었는지 알 수 없었음): 확정 취소 시 사유 선택 필수 +
// 이미 입금이 있으면 경고(막지는 않음) + 누가·언제·왜를 서버 영수증(save_receipts)에 기록.
const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27143;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  const receipts = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url(); const method = req.method();
    const H = { 'Access-Control-Allow-Origin': '*' };
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' }, H) }); return; }
      if (url.includes('/save_receipts') && method === 'POST') { try { receipts.push(JSON.parse(req.postData())); } catch (e) {} req.respond({ status: 201, contentType: 'application/json', headers: H, body: '[]' }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
  });
  await page.setViewport({ width: 1280, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }
  const confirmed = () => page.evaluate(() => !!window._estEditState.estimateConfirmedAt);
  const click = (id) => page.evaluate((i) => { document.getElementById(i).click(); }, id);

  await page.evaluate(() => { document.getElementById('c-name').value = '사유시험'; });

  // 1) 확정 → 확정 취소를 누르면 사유 창이 뜨고, 아직 확정은 유지
  await page.evaluate(() => { window._estLoadedRow = { deposit_amount: 750000, balance_amount: 0, price: 3000000 }; toggleConfirmEstimate(); });
  ok('1. 확정 상태', await confirmed());
  await page.evaluate(() => { toggleConfirmEstimate(); });
  const m1 = await page.evaluate(() => ({ modal: !!document.getElementById('est-unconfirm-modal'), warn: (document.getElementById('est-unconfirm-paid-warn') || {}).textContent || '' }));
  ok('1-1. 확정 취소를 누르면 사유 선택 창이 뜸', m1.modal);
  ok('1-2. 이미 입금이 있으면 입금액(750,000원) 경고가 뜸', m1.warn.indexOf('750,000원') !== -1, m1.warn);
  ok('1-3. 사유를 고르기 전에는 확정이 그대로 유지됨', await confirmed());

  // 2) 사유 없이 확정 취소 → 거부
  await click('est-unconfirm-ok');
  const e2 = await page.evaluate(() => (document.getElementById('est-unconfirm-err') || {}).textContent || '');
  ok('2. 사유를 안 고르면 "이유를 선택" 안내 + 확정 유지', e2.indexOf('이유를 선택') !== -1 && await confirmed(), e2);

  // 3) 기타 + 메모 없음 → 거부
  await page.evaluate(() => { var r = Array.from(document.querySelectorAll('input[name="est-unconfirm-reason"]')).find(i => i.value === '기타'); r.click(); });
  await click('est-unconfirm-ok');
  const e3 = await page.evaluate(() => (document.getElementById('est-unconfirm-err') || {}).textContent || '');
  ok('3. 기타인데 메모가 없으면 거부 + 확정 유지', e3.indexOf('사유를 적어야') !== -1 && await confirmed(), e3);

  // 4) 그대로 두기 → 창 닫히고 확정 유지
  await click('est-unconfirm-cancel');
  ok('4. "그대로 두기"는 창만 닫고 확정 유지', !(await page.evaluate(() => !!document.getElementById('est-unconfirm-modal'))) && await confirmed());

  // 5) 정상 사유 선택 → 확정 해제 + 영수증 기록
  receipts.length = 0;
  await page.evaluate(() => { toggleConfirmEstimate(); var r = Array.from(document.querySelectorAll('input[name="est-unconfirm-reason"]')).find(i => i.value === '금액 오류 수정'); r.click(); });
  await click('est-unconfirm-ok');
  await new Promise(r => setTimeout(r, 800));
  ok('5. 사유를 고르면 확정이 풀림', !(await confirmed()));
  const rc = receipts.find(r => (Array.isArray(r) ? r[0] : r).kind === 'unconfirm');
  const rr = rc && (Array.isArray(rc) ? rc[0] : rc);
  ok('5-1. 서버 영수증에 kind=unconfirm, 사유, 입금액이 기록됨', !!rr && rr.outcome === '금액 오류 수정' && rr.detail && rr.detail.paid_amount === 750000 && rr.detail.reason === '금액 오류 수정', JSON.stringify(rr && { kind: rr.kind, outcome: rr.outcome, paid: rr.detail && rr.detail.paid_amount }));

  // 6) 입금 없는 견적: 경고 없음 + 기타+메모로 해제 가능
  receipts.length = 0;
  await page.evaluate(() => { window._estLoadedRow = { deposit_amount: 0, balance_amount: 0, price: 1000000 }; toggleConfirmEstimate(); toggleConfirmEstimate(); });
  const noWarn = await page.evaluate(() => !document.getElementById('est-unconfirm-paid-warn'));
  ok('6. 입금이 없으면 입금 경고가 안 뜸', noWarn);
  await page.evaluate(() => { var r = Array.from(document.querySelectorAll('input[name="est-unconfirm-reason"]')).find(i => i.value === '기타'); r.click(); document.getElementById('est-unconfirm-memo').value = '고객이 색상 변경 요청'; });
  await click('est-unconfirm-ok');
  await new Promise(r => setTimeout(r, 800));
  const rc2 = receipts.find(r => (Array.isArray(r) ? r[0] : r).kind === 'unconfirm');
  const rr2 = rc2 && (Array.isArray(rc2) ? rc2[0] : rc2);
  ok('6-1. 기타 + 메모로 확정이 풀리고 메모가 기록됨', !(await confirmed()) && !!rr2 && rr2.detail.memo === '고객이 색상 변경 요청', JSON.stringify(rr2 && rr2.detail && rr2.detail.memo));

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 && jsErrors.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');
  await browser.close(); server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
