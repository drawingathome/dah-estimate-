#!/usr/bin/env node
// tests/estimate-save-integrity-check.js
// ══════════════════════════════════════════════════
// 2026-10-06(선혜님 - 김성은님 견적서: "저장 눌렀어, 프린트까지 했는데" 서버엔 없음, "전문업체 기준으로 이런 오류들이 말이 되니"):
// 견적서 화면에 두 가지 약점이 있었음.
//  (1) 서버 저장이 실패해도 항상 "저장됨" 표시(c-name.dataset.saved='1')를 켜서(코드 주석에도 "성공/로컬저장/실패 무관"), 페이지를 나갈 때 경고가 안 떴음
//  (2) 인쇄·PDF가 저장 여부를 확인하지 않아, 서버에 없는 견적서가 종이로 나갔음
// 이제: 서버가 실제로 받았을 때만 저장됨으로 표시, 인쇄·PDF(고객용·실측요청서·발주서가 공유하는 openPdfModal 포함) 전에 저장이 필요하면 먼저 저장하고
// 서버가 받았을 때만 진행, 못 올리면 물어봄.
//
// 감시하는 것(실제 견적서 화면에서 저장 버튼 함수와 인쇄 진입점을 그대로 실행, 서버는 흉내):
//  1) 서버가 받으면 saved 표시가 켜짐 / 서버 오류(500)면 saved 표시가 안 켜짐(예전엔 켜졌음)
//  2) 저장 안 된 새 견적서에서 PDF 인쇄 창을 열면 먼저 저장 요청이 나가고, 서버가 받은 뒤에 창이 열림
//  3) 서버가 못 받으면 "그래도 계속할까요?"를 묻고, 거절하면 창이 안 열림 / 수락하면 열림
//  4) 이미 저장된 견적서는 추가 저장 요청 없이 바로 열림
//  5) 필수항목 확인창에서 취소하면(저장 안 됨) 창이 안 열림
//  6) 아무 입력도 없는 빈 견적서는 저장 없이 바로 열림(불필요한 저장 없음)
//
// 사용법: node tests/estimate-save-integrity-check.js
// ══════════════════════════════════════════════════
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };
const root = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let failed = 0;
function ok(label, cond, detail) { console.log((cond ? '✅ ' : '❌ ') + label + (cond ? '' : ' — ' + (detail || ''))); if (!cond) failed++; }

const FILL = `
  document.getElementById('c-name').value = '무결성고객';
  document.getElementById('c-phone').value = '01012345678';
  document.getElementById('c-addr').value = '서울 서초구';
  document.getElementById('c-measure').value = '2026-10-01';
  document.getElementById('c-install').value = '2026-10-05';
  var tr = document.querySelector('.row-curtain');
  tr.querySelector('.space-inp').value = '거실';
  tr.querySelector('.mw').value = 300; calcCurtainRow(tr.querySelector('.mw'));
  tr.querySelector('.mh').value = 240; calcCurtainRow(tr.querySelector('.mh'));
  tr.querySelector('.cprice').value = 45000; calcCurtainRow(tr.querySelector('.cprice'));
  document.getElementById('c-name').dispatchEvent(new Event('input', { bubbles: true }));
`;

async function open(port, opt) {
  const server = await startServer(root, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const rec = { writes: [], dialogs: [], jsErrors: [] };
  page.on('pageerror', e => rec.jsErrors.push(e.message));
  page.on('dialog', async d => {
    rec.dialogs.push(d.message());
    try { if (/그래도 (저장하시겠어요|계속할까요)/.test(d.message())) { await (/계속할까요/.test(d.message()) ? (opt.confirmContinue ? d.accept() : d.dismiss()) : (opt.missingConfirm === 'cancel' ? d.dismiss() : d.accept())); } else { await d.accept(); } } catch (e) {}
  });
  await page.setRequestInterception(true);
  let estN = 0;
  page.on('request', (req) => {
    const url = req.url(), method = req.method();
    if (!url.includes('supabase.co')) { if (url.startsWith('http://localhost')) req.continue(); else req.abort(); return; }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } }); return; }
    const p = new URL(url).pathname;
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
    if (method !== 'GET' && p.includes('/rest/v1/estimates')) {
      rec.writes.push({ method, kind: 'estimates' });
      if (opt.estimate500) { req.respond({ status: 500, contentType: 'application/json', headers: CORS, body: JSON.stringify({ message: 'server error' }) }); return; }
      estN++;
      req.respond({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 'srv-est-' + estN, updated_at: new Date().toISOString(), ...(Array.isArray(body) ? body[0] : body || {}) }]) }); return;
    }
    if (method !== 'GET' && p.includes('/rest/v1/customers')) {
      rec.writes.push({ method, kind: 'customers' });
      req.respond({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 777, ...(Array.isArray(body) ? body[0] : body || {}) }]) }); return;
    }
    if (p.includes('rpc/check_phone_duplicate')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ exists_flag: false }]) }); return; }
    req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(900);
  await setupValidSession(page);
  await sleep(700);
  return { server, browser, page, rec };
}
const modalOpen = (page) => page.evaluate(() => { const m = document.getElementById('pdf-size-modal'); return !!(m && m.classList.contains('open')); });
const savedFlag = (page) => page.evaluate(() => document.getElementById('c-name').dataset.saved || null);
const closeModal = (page) => page.evaluate(() => { const m = document.getElementById('pdf-size-modal'); if (m) m.classList.remove('open'); });

(async () => {
  // 1-A) 서버가 받음 → saved 켜짐
  {
    const { server, browser, page, rec } = await open(18400, {});
    await page.evaluate(FILL);
    await page.evaluate(() => saveEstimate());
    await sleep(2500);
    ok('1-1. [서버가 받음] 저장됨 표시가 켜짐', (await savedFlag(page)) === '1', 'saved=' + (await savedFlag(page)) + ' writes=' + JSON.stringify(rec.writes));
    ok('1-1b. [서버가 받음] 견적서 저장 요청이 실제로 나감', rec.writes.some(w => w.kind === 'estimates'), JSON.stringify(rec.writes));
    await browser.close(); server.kill();
  }
  // 1-B) 서버 500 → saved 안 켜짐
  {
    const { server, browser, page, rec } = await open(18401, { estimate500: true });
    await page.evaluate(FILL);
    await page.evaluate(() => saveEstimate());
    await sleep(2500);
    ok('1-2. [서버 오류 500] 저장됨 표시가 켜지지 않음(예전엔 켜져서 나갈 때 경고가 안 떴음)', (await savedFlag(page)) === null, 'saved=' + (await savedFlag(page)));
    await browser.close(); server.kill();
  }

  // 2) 저장 안 된 새 견적서 → PDF 창 열기: 저장 먼저, 서버가 받은 뒤 창 열림
  {
    const { server, browser, page, rec } = await open(18402, {});
    await page.evaluate(FILL);
    const before = rec.writes.length;
    await page.evaluate(() => openPdfModal());
    await sleep(2800);
    ok('2-1. [저장 안 된 새 견적서] PDF 창을 열려 하면 먼저 저장 요청이 나감', rec.writes.slice(before).some(w => w.kind === 'estimates'), JSON.stringify(rec.writes.slice(before)));
    ok('2-2. [저장 안 된 새 견적서] 서버가 받은 뒤에 PDF 창이 열림', (await modalOpen(page)) === true);
    ok('2-3. [저장 안 된 새 견적서] 저장 성공 후에는 확인창이 뜨지 않음', !rec.dialogs.some(d => /계속할까요/.test(d)), JSON.stringify(rec.dialogs));
    // 4) 이미 저장됨 → 추가 저장 없이 바로 열림
    await closeModal(page);
    const before2 = rec.writes.length;
    await page.evaluate(() => openPdfModal());
    await sleep(600);
    ok('4-1. [이미 저장된 견적서] 추가 저장 요청 없이 바로 열림', rec.writes.length === before2 && (await modalOpen(page)) === true, JSON.stringify({ added: rec.writes.length - before2 }));
    ok('4-2. JS 에러 없음', rec.jsErrors.length === 0, rec.jsErrors.join('; '));
    await browser.close(); server.kill();
  }

  // 3) 서버가 못 받음 → 묻고, 거절하면 안 열림
  {
    const { server, browser, page, rec } = await open(18403, { estimate500: true, confirmContinue: false });
    await page.evaluate(FILL);
    await page.evaluate(() => openPdfModal());
    await sleep(3000);
    ok('3-1. [서버가 못 받음] "그래도 계속할까요?"를 물어봄', rec.dialogs.some(d => /서버에 저장하지 못했어요/.test(d) && /계속할까요/.test(d)), JSON.stringify(rec.dialogs));
    ok('3-2. [서버가 못 받음 + 거절] PDF 창이 열리지 않음(서버에 없는 서류가 나가지 않음)', (await modalOpen(page)) === false);
    await browser.close(); server.kill();
  }
  {
    const { server, browser, page, rec } = await open(18404, { estimate500: true, confirmContinue: true });
    await page.evaluate(FILL);
    await page.evaluate(() => openPdfModal());
    await sleep(3000);
    ok('3-3. [서버가 못 받음 + 수락] 사용자가 알고 선택했으면 PDF 창이 열림', (await modalOpen(page)) === true, JSON.stringify(rec.dialogs));
    await browser.close(); server.kill();
  }

  // 5) 필수항목 확인창에서 취소 → 안 열림
  {
    const { server, browser, page, rec } = await open(18405, { missingConfirm: 'cancel' });
    await page.evaluate(FILL + `document.getElementById('c-install').value = '';`);
    await page.evaluate(() => openPdfModal());
    await sleep(2200);
    ok('5-1. [필수항목 확인창 취소] 저장이 안 됐으니 PDF 창이 열리지 않음', (await modalOpen(page)) === false && !rec.writes.some(w => w.kind === 'estimates'), JSON.stringify({ writes: rec.writes, dialogs: rec.dialogs }));
    await browser.close(); server.kill();
  }

  // 6) 빈 견적서 → 저장 없이 바로 열림
  {
    const { server, browser, page, rec } = await open(18406, {});
    await page.evaluate(() => openPdfModal());
    await sleep(700);
    ok('6-1. [빈 견적서] 불필요한 저장 없이 바로 열림', rec.writes.length === 0 && (await modalOpen(page)) === true, JSON.stringify(rec.writes));
    await browser.close(); server.kill();
  }

  console.log('\n' + (failed === 0 ? '✅ 전체 통과' : '❌ 실패 ' + failed + '건'));
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
