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
// 2026-10-02(선혜님 - "이민선/김현정 결제했는데 상담에 뜨니, 쌍둥이 함수도 찾고
// 앞으로 이런 버그 안생기게 하는 방향도 찾아" 요청으로 구조 변경): 위 "JS가 합계를
// 재계산해서 customers에 PATCH" 방식 자체가, 날짜/수단/영수확인 필드를 깜빡 빠뜨리는
// 새 버그(이민선/김현정 사례)로 이어짐 - 알고보니 똑같은 책임을 지는 DB 트리거
// (sync_customer_payment_from_estimates)가 이미 있었는데 그 트리거도 날짜 관련 필드를
// 안 다루는 같은 결함이 있었음("쌍둥이"). 트리거 쪽을 확장해 DB가 항상 정확히
// 보장하도록 만들고, 이 JS 중복 로직은 완전히 제거함. 그래서 이 테스트의 기대값도
// 바뀜: est PATCH는 여전히 일어나야 하지만(1,2번), customers에 대한 직접 PATCH는
// 이제 "절대 없어야" 정상(3,4번) - 트리거가 DB 레벨에서 전담하는 구조가 유지되는지
// 감시.
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
    const forms = document.querySelectorAll('input[placeholder^="잔금 금액"]');
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
  ok('3. [구조변경] 더 이상 JS가 이 고객의 전체 견적서 합계를 재조회하지 않음(책임이 DB 트리거로 이전됨)', !sumGet, JSON.stringify(sumGet));

  const custPatch = reqLog.find(r => r.method === 'PATCH' && r.path.includes('/rest/v1/customers') && r.path.includes('id=eq.501'));
  ok('4. [구조변경] customers 테이블에 JS의 직접 PATCH가 더 이상 안 나감(DB 트리거가 estimates 변경을 보고 자동 동기화)', !custPatch, JSON.stringify(custPatch));

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
