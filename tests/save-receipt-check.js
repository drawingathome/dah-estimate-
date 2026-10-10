#!/usr/bin/env node
// tests/save-receipt-check.js
// ══════════════════════════════════════════════════
// 2026-10-06(선혜님 - "너 희안하게 원인을 찾을 생각을 안하는거 같다 / 어떻게 하면 니가 오류를 찾을 수 있을까를 고민해봐"):
// 서버에는 "저장 결과"만 남고 "그때 화면에서 일어난 일"이 어디에도 없어서, 9/23 김성은님 견적서(서버에 안 감)나 8/6 08:59 할인 변화 같은 일을 매번
// 추측으로 풀어야 했음. 견적서 화면이 저장·열기·인쇄 때마다 화면 상태를 save_receipts 표에 영수증으로 남긴다.
//
// 감시하는 것(실제 견적서 화면을 열어 실제 함수를 실행, 서버는 흉내):
//  1) 저장 성공: 시작/성공 영수증이 순서대로 남고, 화면 금액·기기·로그인·앱 버전이 들어 있음
//  2) 서버 저장 실패: 'failed' 영수증이 남음
//  3) 영수증 서버가 죽어도 저장은 정상 성공, 영수증은 이 기기에 보관되고 서버가 살아나면 다시 전송됨(오프라인이었던 때의 증거도 나중에 도착)
//  4) 검증에서 막힌 저장(이름 없음): 'invalid' 영수증
//  5) 견적서를 열었을 때 저장된 금액과 화면 금액이 다르면 'mismatch' 영수증 + 경고(오늘 김성은님: 저장 7,968,000원 vs 열면 7,544,000원)
//  6) 불러온 견적서가 없으면 열기 영수증은 없음(불필요한 기록 없음)
//  7) 인쇄·PDF: 저장 필요 여부와 결과가 'print' 영수증으로 남음
//
// 사용법: node tests/save-receipt-check.js
// ══════════════════════════════════════════════════
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };
const root = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let failed = 0;
function ok(label, cond, detail) { console.log((cond ? '✅ ' : '❌ ') + label + (cond ? '' : ' — ' + (detail || ''))); if (!cond) failed++; }

const FILL = `
  document.getElementById('c-name').value = '영수증고객';
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

// 김성은님 견적서(오늘 실제로 "열면 금액이 달라지던" 행)와 같은 모양
function buildReopenRows() {
  const blinds = [['거실', '133', '260', '롤스크린', 75000, '(솜피전동) 시어 롤 블라인드', '262,500원'], ['거실', '133', '260', '롤스크린', 75000, '(솜피전동) 시어 롤 블라인드', '262,500원'], ['거실', '133', '260', '롤스크린', 75000, '(솜피전동) 시어 롤 블라인드', '262,500원'],
    ['거실 맞은편', '133', '195', '롤스크린', 75000, '(솜피전동) 시어 롤 블라인드', '195,000원'], ['거실 맞은편', '133', '195', '롤스크린', 75000, '(솜피전동) 시어 롤 블라인드', '195,000원'], ['거실 맞은편', '133', '195', '롤스크린', 75000, '(솜피전동) 시어 롤 블라인드', '195,000원'],
    ['안방', '170', '264', '롤스크린', 75000, '시어 롤 블라인드', '337,500원'], ['안방', '170', '264', '롤스크린', 75000, '(솜피 전동) 롤 블라인드', '337,500원'],
    ['거실 옆방(서재)', '170', '264', '허니콤', 125000, '린넨 허니콤 블라인드 (폭 2.5센치)', '562,500원'], ['주방', '130', '150', '알루미늄', 66000, '크림색 알루미늄 블라인드 (274번)', '132,000원'],
    ['욕실', '160', '50', '알루미늄', 66000, '크림색 알루미늄 블라인드 (274번)', '99,000원'], ['욕실', '160', '100', '알루미늄', 66000, '크림색 알루미늄 블라인드 (274번)', '105,600원']];
  const li = [{ mh: '264', mw: '284', amt: '740,000원', pnum: '4', type: 'curtain', color: '', price: 185000, space: '방2 (게스트룸)', fabric: '', vendor: '', hemType: '리드', yardage: '', openType: '양개형', pleatType: '민자형', railVendor: '', displayName: '우디 속커튼', heightAdjust: '-3', shapeProcess: true, fabricUnitPrice: '' }];
  blinds.forEach(([sp, w, h, k, p, n, a]) => li.push({ amt: a, bmh: h, bmw: w, opt: '', kind: k, type: 'blind', color: '', extra: 0, price: p, space: sp, fabric: '', handle: '기타', vendor: '', comment: '', bottomBar: '', cordLength: '', displayName: n }));
  li.push({ qty: '1', kind: '전동', type: 'svc', price: 4000000, space: '', content: '전동 및 부자재', autoType: '' });
  li.push({ qty: '1', kind: '실측비', type: 'svc', price: 40000, space: '', content: '서울 실측비', autoType: 'measure' });
  li.push({ qty: '1', kind: '시공비', type: 'svc', price: 475000, space: '', content: '서울 시공비 ✏️직접수정', autoType: 'install' });
  li.push({ qty: '12', kind: '시공비', type: 'svc', price: 10000, space: '', content: '블라인드 시공비 (12개)', autoType: 'install' });
  li.push({ qty: '1', kind: '레일', type: 'svc', price: 16000, space: '', content: '레일', autoType: 'rail' });
  const est = { id: '939ce05f-78a0-43b8-848e-d0386534cccc', created_at: '2026-10-06T08:20:00', updated_at: '2026-10-06T09:50:00+00:00', date: '2026-10-07', memo: '', phone: '010-4627-8743', price: 7968000, space: '방2 (게스트룸)', branch: '반포점', region: '서울', product: '우디 속커튼', client_id: 226, cust_type: 'new', line_items: li, staff_name: '마스터', is_archived: false, install_date: '', customer_name: '김성은', contract_status: 'pending', estimate_status: 'ga',
    price_breakdown: { balance: 3984000, deposit: 3984000, discount: 369600, finalTotal: 7968000, discountDetail: [{ label: '직접입력 10%', amount: 368660 }, { label: '끝자리 절사', amount: 940 }], installSubtotal: 4651000, productSubtotal: 3686600, performanceRevenue: 3317000 },
    install_date_tbd: true, measure_date_tbd: false, applied_discounts: { manual: { type: 'pct', value: 10, amount: 368660 }, coupons: [] }, performance_revenue: 3317000 };
  const cust = { id: 226, addr: '서울 서초구 신반포로 20 트리니원 107동 804호', date: '2026-09-23', memo: '', phone: '010-4627-8743', price: 7968000, stage: '상담', branch: '반포점', staff_name: '마스터', addr_detail: '트리니원 107동 804호', client_name: '김성은', is_archived: false, measure_date: '2026-10-07', install_date_tbd: true, measure_date_tbd: false };
  return { est, cust };
}

async function open(port, opt, url) {
  const server = await startServer(root, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const state = { receipts: [], receiptsFail: !!opt.receiptsFail, estimate500: !!opt.estimate500, jsErrors: [] };
  const rows = opt.reopen ? buildReopenRows() : null;
  page.on('pageerror', e => state.jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('dah_auth_session', JSON.stringify({ access_token: 'test-fake-token', refresh_token: 'r', expires_at: Date.now() + 3600000, user_id: 'u', email: 'test@drawingathome.co.kr' })); });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url(), method = req.method();
    if (!u.includes('supabase.co')) { if (u.startsWith('http://localhost')) req.continue(); else req.abort(); return; }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } }); return; }
    const p = new URL(u).pathname; let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
    const ok2 = (b, s = 200) => req.respond({ status: s, contentType: 'application/json', headers: CORS, body: JSON.stringify(b) });
    if (method === 'POST' && p.includes('/rest/v1/save_receipts')) {
      if (state.receiptsFail) { ok2({ message: 'receipt server down' }, 500); return; }
      state.receipts.push(body); ok2([], 201); return;
    }
    if (rows && method === 'GET' && p.includes('/rest/v1/customers')) { ok2([rows.cust]); return; }
    if (rows && method === 'GET' && p.includes('/rest/v1/estimates')) { ok2([rows.est]); return; }
    if (method !== 'GET' && p.includes('/rest/v1/estimates')) {
      if (state.estimate500) { ok2({ message: 'server error' }, 500); return; }
      ok2([{ id: 'srv-est-1', updated_at: new Date().toISOString(), ...(Array.isArray(body) ? body[0] : body || {}) }], method === 'POST' ? 201 : 200); return;
    }
    if (method !== 'GET' && p.includes('/rest/v1/customers')) { ok2([{ id: 777, ...(Array.isArray(body) ? body[0] : body || {}) }], method === 'POST' ? 201 : 200); return; }
    if (p.includes('rpc/check_phone_duplicate')) { ok2([{ exists_flag: false }]); return; }
    ok2([]);
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html${url || ''}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(opt.reopen ? 600 : 1000);
  return { server, browser, page, state };
}
const kinds = (st, kind) => st.receipts.filter(r => r && r.kind === kind);

(async () => {
  // 1) 저장 성공
  {
    const { server, browser, page, state } = await open(18500, {});
    await page.evaluate(FILL); await page.evaluate(() => saveEstimate()); await sleep(3000);
    const saves = kinds(state, 'save');
    ok('1-1. [저장 성공] 시작 → 성공 영수증이 순서대로 남음', saves.map(r => r.outcome).join(',') === 'start,server', JSON.stringify(saves.map(r => r.outcome)));
    const last = saves[saves.length - 1] || {};
    ok('1-2. [저장 성공] 영수증에 고객명·로그인·앱 버전·기기가 들어 있음', last.customer_name === '영수증고객' && last.user_email === 'test@drawingathome.co.kr' && !!last.app_version && /online=/.test(last.device || ''), JSON.stringify({ n: last.customer_name, e: last.user_email, v: last.app_version, d: last.device }));
    const snap = (last.detail || {}).snapshot || {};
    const startSnap = ((saves[0] || {}).detail || {}).snapshot || {};
    ok('1-3. [저장 성공] 화면에 보인 금액·지역·시공 자재 줄이 기록됨', typeof snap.total === 'string' && snap.total.length > 0 && Array.isArray(snap.svc_rows), JSON.stringify({ t: snap.total }));
    // 새 견적서를 저장하면 서버가 받은 직후 앱이 수정 모드로 바뀌는 게 설계(est-save-stages.js:500) - 그래서 "새로 만든 저장인지"는 시작 영수증의 path로, 저장 후 상태는 끝 영수증의 path로 구분
    ok('1-3b. [저장 성공] 시작 영수증은 path=new(새로 만드는 저장), 끝 영수증은 path=edit(서버가 받은 뒤 수정 모드로 전환됨)', startSnap.path === 'new' && snap.path === 'edit', JSON.stringify({ start: startSnap.path, end: snap.path }));
    ok('1-4. JS 에러 없음', state.jsErrors.length === 0, state.jsErrors.join('; '));
    await browser.close(); server.kill();
  }
  // 2) 서버 저장 실패
  {
    const { server, browser, page, state } = await open(18501, { estimate500: true });
    await page.evaluate(FILL); await page.evaluate(() => saveEstimate()); await sleep(3000);
    ok('2-1. [서버 저장 실패] "failed" 영수증이 남음', kinds(state, 'save').some(r => r.outcome === 'failed'), JSON.stringify(kinds(state, 'save').map(r => r.outcome)));
    await browser.close(); server.kill();
  }
  // 3) 영수증 서버가 죽어도 저장은 성공 + 기기에 보관 + 다시 전송
  {
    const { server, browser, page, state } = await open(18502, { receiptsFail: true });
    await page.evaluate(FILL); await page.evaluate(() => saveEstimate()); await sleep(3200);
    const saved = await page.evaluate(() => document.getElementById('c-name').dataset.saved || null);
    ok('3-1. [영수증 서버 장애] 그래도 저장은 정상 성공(저장됨 표시)', saved === '1', 'saved=' + saved);
    const q1 = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_receipt_queue') || '[]').length);
    ok('3-2. [영수증 서버 장애] 영수증이 이 기기에 보관됨', q1 >= 2, 'queue=' + q1);
    state.receiptsFail = false;
    await page.evaluate(() => estFlushReceiptQueue()); await sleep(1800);
    const q2 = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_receipt_queue') || '[]').length);
    ok('3-3. [서버가 살아남] 보관된 영수증이 다시 전송되어 서버에 도착하고 보관함이 비워짐', q2 === 0 && state.receipts.length >= 2 && state.receipts.every(r => (r.detail || {}).resent === true), 'queue=' + q2 + ' received=' + state.receipts.length);
    await browser.close(); server.kill();
  }
  // 4) 검증에서 막힘
  {
    const { server, browser, page, state } = await open(18503, {});
    await page.evaluate(FILL + `document.getElementById('c-name').value = '';`); await page.evaluate(() => saveEstimate()); await sleep(2500);
    ok('4-1. [검증에서 막힘] "invalid" 영수증이 남음(저장 시도가 있었다는 증거)', kinds(state, 'save').some(r => r.outcome === 'invalid'), JSON.stringify(kinds(state, 'save').map(r => r.outcome)));
    await browser.close(); server.kill();
  }
  // 5) 열었을 때 금액 불일치(오늘 김성은님 사례)
  {
    const { server, browser, page, state } = await open(18504, { reopen: true }, '?loadEstDbId=939ce05f-78a0-43b8-848e-d0386534cccc');
    await page.evaluate(() => { const o = window.showToast; window.__toasts = []; window.showToast = function (m) { window.__toasts.push(String(m)); return o.apply(this, arguments); }; });
    await sleep(6500);
    const opens = kinds(state, 'open');
    ok('5-1. [열기] 열자마자 열기 영수증이 남음', opens.length === 1, JSON.stringify(opens.map(r => r.outcome)));
    const o = opens[0] || {};
    ok('5-2. [열기] 저장 7,968,000원인데 화면 금액이 다르면 "mismatch"로 기록(저장·화면 금액 둘 다 담김)', o.outcome === 'mismatch' && (o.detail || {}).stored_price === 7968000 && (o.detail || {}).shown_total > 0 && (o.detail || {}).shown_total !== 7968000, JSON.stringify({ out: o.outcome, d: o.detail && { s: o.detail.stored_price, h: o.detail.shown_total } }));
    const toasts = await page.evaluate(() => window.__toasts || []);
    ok('5-3. [열기] 저장하기 전에 확인하라는 경고가 화면에 뜸', toasts.some(t => /저장된 금액/.test(t) && /달라요/.test(t)), JSON.stringify(toasts));
    ok('5-4. [열기] 불러온 견적서의 일정·할인 정보가 영수증에 남음(원인 분석용)', (o.detail || {}).stored_install_tbd === true && !!(o.detail || {}).stored_manual_discount, JSON.stringify({ t: (o.detail || {}).stored_install_tbd, m: (o.detail || {}).stored_manual_discount }));
    await browser.close(); server.kill();
  }
  // 6) 불러온 견적서 없음 → 열기 영수증 없음
  {
    const { server, browser, page, state } = await open(18505, {});
    await sleep(5000);
    ok('6-1. [새 견적서] 불러온 견적서가 없으면 열기 영수증은 없음', kinds(state, 'open').length === 0, JSON.stringify(state.receipts.map(r => r.kind)));
    await browser.close(); server.kill();
  }
  // 7) 인쇄·PDF
  {
    const { server, browser, page, state } = await open(18506, {});
    await page.evaluate(FILL);
    await page.evaluate(() => openPdfModal()); await sleep(3200);
    await page.evaluate(() => { const m = document.getElementById('pdf-size-modal'); if (m) m.classList.remove('open'); });
    await page.evaluate(() => openPdfModal()); await sleep(1200);
    const pr = kinds(state, 'print').map(r => r.outcome);
    ok('7-1. [인쇄·PDF] 저장이 필요했던 첫 시도는 "saved-then-proceed", 이미 저장된 두 번째는 "direct"', pr.join(',') === 'saved-then-proceed,direct', JSON.stringify(pr));
    await browser.close(); server.kill();
  }

  console.log('\n' + (failed === 0 ? '✅ 전체 통과' : '❌ 실패 ' + failed + '건'));
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
