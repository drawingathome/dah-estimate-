#!/usr/bin/env node
// tests/customer-level-pay-sync-check.js
// ══════════════════════════════════════════════════
// 2026-10-01(선혜님 - 최금희 고객 "컴퓨터에서는 결제완료, 아이패드에서는
// 미수금" 신고): 2026-09-21에 "결제를 견적서 단위로 관리"하도록 바꾸면서,
// savePayData()가 est(견적서)가 있으면 customers 테이블의 deposit_amount/
// balance_amount를 영원히 안 건드리게 됐었음(estimates PATCH 후 바로 return) -
// 홈화면 카드(getUnpaidAmount)는 여전히 이 고객레벨 값에 기대는 로컬 캐시
// 로직을 쓰고 있어서, 서버의 진짜 소스(customers)가 낡은 채로 남아 기기마다
// (그 견적서를 로컬에 캐시해둔 기기인지에 따라) 다른 결과를 보여주고 있었음.
// 실제 DB로 재현·확인: 최금희 - price 2,985,000 / 견적서엔 잔금 2,235,000까지
// 전부 입금(완납)인데 customers.balance_amount는 0으로 그대로 남아있었음.
//
// 수정: 견적서 PATCH 성공 후, 이 고객(client_id)의 보관 안 된 모든 견적서의
// 입금 합계를 서버에서 다시 집계해 customers에도 반영 - 여러 견적서를 가진
// 고객도 정확하게 안전함(이번 견적서 하나로 덮어쓰지 않고 항상 합계로).
//
// 이 테스트는 실제 "잔금 저장" 버튼을 클릭하는 실제 UI 흐름으로 검증함
// (savePayData는 클로저라 직접 호출이 안 되므로, 로직을 수동 재현하는 대신
// 반드시 실제 클릭 경로로 검증).
//
// 주의(이 테스트 작성 중 실수로 겪은 것): blockRealNetwork()는 일반 PATCH를
// 처리 안 하고 req.abort()로 떨어뜨리므로, blockRealNetwork와 별도의 커스텀
// page.on('request') 핸들러를 "같이" 쓰면 한 요청에 양쪽이 각각 respond/abort를
// 시도해 puppeteer가 "Request is already handled!"로 죽음 - 반드시 필요한
// mock 전부를 하나의 핸들러 안에 모아 작성할 것(blockRealNetwork를 쓰지 않음).
//
// 사용법: node tests/customer-level-pay-sync-check.js
// ══════════════════════════════════════════════════
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 28100;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

  const reqLog = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      const u = new URL(url);
      reqLog.push({ method: req.method(), path: u.pathname + u.search, body: req.postData() });
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/auth/v1/token')) {
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ access_token: 'test-fake-token', refresh_token: 'test-fake-refresh', expires_in: 3600, user: { id: 'test-fake-uuid', email: 'test@test.com' } }) });
        return;
      }
      if (u.pathname.includes('/rest/v1/app_settings')) {
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ value: {} }]) });
        return;
      }
      if (req.method() === 'GET' && u.pathname.includes('/rest/v1/estimates') && u.search.includes('client_id=eq.501') && u.search.includes('select=deposit_amount')) {
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([
          { deposit_amount: 750000, balance_amount: 0 },
          { deposit_amount: 300000, balance_amount: 300000 }
        ]) });
        return;
      }
      if (req.method() === 'PATCH' && u.pathname.includes('/rest/v1/estimates') && u.search.includes('id=eq.est-A')) {
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 'est-A', updated_at: new Date().toISOString() }]) });
        return;
      }
      if (req.method() === 'PATCH' && u.pathname.includes('/rest/v1/customers') && u.search.includes('id=eq.501')) {
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
        return;
      }
      // 그 외 나머지(초기 로딩용 전체조회 등)는 전부 빈 배열로 안전하게 응답
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });

  await page.setViewport({ width: 390, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([
      { id: 'est-A', clientId: 501, clientName: '최금희', price: 2985000, date: '2026-09-22',
        depositAmount: 750000, depositDate: '2026-09-22', depositMethod: '현금', depositReceipt: true,
        balanceAmount: 0, balanceDate: '', balanceMethod: '', balanceReceipt: false },
      { id: 'est-B', clientId: 501, clientName: '최금희', price: 600000, date: '2026-09-25',
        depositAmount: 300000, depositDate: '2026-09-25', depositMethod: '카드', depositReceipt: true,
        balanceAmount: 300000, balanceDate: '2026-09-28', balanceMethod: '카드', balanceReceipt: true }
    ]));
    saveCustomers([{ id: 501, clientName: '최금희', phone: '01011112222', stage: '시공준비중', staffName: '마스터', price: 2985000, depositAmount: 750000, balanceAmount: 0 }]);
    openDetail('최금희', 501);
  });
  await new Promise(r => setTimeout(r, 600));

  await page.evaluate(() => {
    const forms = document.querySelectorAll('input[placeholder="잔금 금액"]');
    const firstForm = forms[0];
    firstForm.value = '2235000';
    firstForm.dispatchEvent(new Event('input', { bubbles: true }));
    const dateInputs = firstForm.closest('div').parentElement.querySelectorAll('input[type="date"]');
    if (dateInputs.length) dateInputs[dateInputs.length - 1].value = '2026-10-01';
    const saveBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('잔금 저장'));
    saveBtns[0].click();
  });
  await new Promise(r => setTimeout(r, 1200));

  const estPatch = reqLog.find(r => r.method === 'PATCH' && r.path.includes('estimates') && r.path.includes('id=eq.est-A'));
  ok('1. 잔금 저장시 est-A로 정확히 PATCH됨', !!estPatch, JSON.stringify(estPatch));
  const estPatchBody = estPatch ? JSON.parse(estPatch.body) : {};
  ok('2. PATCH 본문에 정확한 잔금(2235000)이 담김', Number(estPatchBody.balance_amount) === 2235000, JSON.stringify(estPatchBody));

  const sumGet = reqLog.find(r => r.method === 'GET' && r.path.includes('/rest/v1/estimates') && r.path.includes('client_id=eq.501') && r.path.includes('select=deposit_amount'));
  ok('3. [핵심] est 저장 성공 후, 이 고객의 전체 견적서 합계를 다시 조회함(customers 동기화 전 단계)', !!sumGet, JSON.stringify(sumGet));

  const custPatch = reqLog.find(r => r.method === 'PATCH' && r.path.includes('/rest/v1/customers') && r.path.includes('id=eq.501'));
  ok('4. [핵심] customers 테이블에도 PATCH가 나감(2026-09-21 이후 처음 - 이게 빠져서 기기마다 다르게 보이던 원인)', !!custPatch, JSON.stringify(custPatch));
  const custPatchBody = custPatch ? JSON.parse(custPatch.body) : {};
  ok('5. customers PATCH 본문에 전체 견적서 합계(deposit=1,050,000 / balance=300,000)가 정확히 담김', Number(custPatchBody.deposit_amount) === 1050000 && Number(custPatchBody.balance_amount) === 300000, JSON.stringify(custPatchBody));

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
