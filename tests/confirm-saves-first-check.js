// tests/confirm-saves-first-check.js
// 2026-11-20(N-204, 선혜님 '실측 시공비 다 넣고 확정했는데 또 왜 이렇게 뜨니' · '확정을 눌러도 금액이 바뀌는 게 말이 안 돼'):
// 저장된 견적에서 화면을 고친 뒤 '확정'을 누르면, 서버에는 확정 표시·상태만 가고 고친 내용은 저장되지 않으면서 안내는 '확정·저장됐습니다'였음.
// 고친 뒤: ①저장 안 된 수정이 있으면 먼저 저장 → ②서버에 저장된 금액이 화면 합계와 같은지 대조 → ③같을 때만 확정 표시를 보냄.
// 검증(고치기 전엔 1·2·3이 실패해야 하는 시험):
//   1 수정 후 확정: 저장이 확정 표시보다 먼저 실행되고, 그 뒤에 확정 표시가 서버로 감(확정됨)
//   2 저장 실패: 확정 표시를 보내지 않고, 확정 안 됨·잠금 없음
//   3 저장 뒤 서버 금액이 화면 합계와 다름: 확정 표시를 보내지 않고 경고, 확정 안 됨
//   4 수정 없음(저장 불필요): 저장 없이 바로 확정(기존 동작 유지)
const { launchBrowser, startServer, loginAs } = require('./_helpers');
(async () => {
  const port = 9986;
  const server = await startServer(require('path').resolve(__dirname, '..'), port);
  const browser = await launchBrowser();
  const errs = [];
  const events = [];
  let storedPrice = null;
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.exposeFunction('__ev', (s) => { events.push(s); });
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = req.url();
    if (u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) return req.continue();
    if (u.includes('supabase.co')) {
      const h = { 'Access-Control-Allow-Origin': '*' };
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
      if (req.method() === 'PATCH' && u.includes('/rest/v1/estimates?id=eq.')) { events.push('PATCH:' + req.postData()); return req.respond({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify([{ updated_at: '2026-11-20T03:30:00Z', confirmed_at: 'x' }]) }); }
      if (req.method() === 'GET' && u.includes('/rest/v1/estimates?id=eq.')) { events.push('GET-PRICE'); return req.respond({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify([{ price: storedPrice, updated_at: '2026-11-20T03:29:00Z' }]) }); }
      return req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' });
    }
    req.abort();
  });
  await page.setViewport({ width: 1280, height: 1600 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const w = ms => new Promise(r => setTimeout(r, ms));
  await w(900); await loginAs(page, 'master'); await w(800);
  let fail = 0;
  const check = (l, c, d) => { if (c) console.log('✅ ' + l); else { console.log('❌ ' + l + ' — ' + JSON.stringify(d)); fail++; } };
  // 저장은 가짜로 대체: 호출 기록 + 결과(ok/failed)를 시험이 정함
  let saveMode = 'ok';
  await page.evaluate(() => {
    window.saveEstimate = function () {
      window.__ev('SAVE');
      setTimeout(function () {
        const ok = window.__saveMode === 'ok';
        if (ok) { window._estDirty = false; document.getElementById('c-name').dataset.saved = '1'; }
        const cb = window._estAfterSave; window._estAfterSave = null; if (cb) cb(ok ? 'server' : 'failed');
      }, 10);
    };
  });
  const setup = (dirty) => page.evaluate((dirty) => {
    document.getElementById('c-name').value = '시험고객';
    delete document.getElementById('c-name').dataset.saved;
    window._estEditState.editingEstDbId = '6cc505f0-test'; window._estEditState.editingEstUpdatedAt = '2026-11-20T03:00:00Z';
    window._estEditState.estimateConfirmedAt = null; lockEstimateForm(false);
    document.getElementById('svc-body').innerHTML = '';
    addSvcRow(); const tr = document.querySelector('#svc-body tr:last-child'); tr.querySelector('.svc-kind').value = '실측비'; tr.querySelector('.svc-content').value = '서울 실측비';
    const p = tr.querySelector('.sprice'); p.value = '40,000'; p.setAttribute('data-raw', '40000'); p.dispatchEvent(new Event('input', { bubbles: true }));
    window._estDirty = !!dirty;
    return Number(String(document.getElementById('sum-total').textContent).replace(/[^0-9]/g, ''));
  }, dirty);
  const run = async (dirty, mode, stored) => {
    events.length = 0; await page.evaluate((m) => { window.__saveMode = m; }, mode);
    const screenTotal = await setup(dirty);
    storedPrice = stored === 'same' ? screenTotal : stored;
    await page.evaluate(() => toggleConfirmEstimate()); await w(700);
    const st = await page.evaluate(() => ({ confirmed: !!window._estEditState.estimateConfirmedAt, locked: !!document.querySelector('.form-locked, [data-locked="1"]') }));
    return { ev: events.slice(), st, screenTotal };
  };
  let r = await run(true, 'ok', 'same');
  const iSave = r.ev.indexOf('SAVE'), iPatch = r.ev.findIndex(e => e.startsWith('PATCH:'));
  check('1 수정 후 확정: 저장이 먼저, 그 뒤 확정 표시, 확정됨', iSave >= 0 && iPatch > iSave && r.st.confirmed, r);
  r = await run(true, 'failed', 'same');
  check('2 저장 실패: 확정 표시를 보내지 않고 확정 안 됨', r.ev.indexOf('SAVE') >= 0 && !r.ev.some(e => e.startsWith('PATCH:')) && !r.st.confirmed, r);
  r = await run(true, 'ok', 999999999);
  check('3 서버 금액≠화면 합계: 확정 표시를 보내지 않고 확정 안 됨', r.ev.indexOf('SAVE') >= 0 && !r.ev.some(e => e.startsWith('PATCH:')) && !r.st.confirmed, r);
  r = await run(false, 'ok', 'same');
  check('4 수정 없음: 저장 없이 확정(기존 동작)', r.ev.indexOf('SAVE') < 0 && r.ev.some(e => e.startsWith('PATCH:')) && r.st.confirmed, r);
  check('자바스크립트 오류 없음', errs.length === 0, errs);
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
