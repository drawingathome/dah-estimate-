#!/usr/bin/env node
// tests/legacy-customer-pay-protection-check.js
// ══════════════════════════════════════════════════
// 2026-10-01(선혜님 - "최금희 외 다른 고객이 문제있는건 확인 가능하니??" 질문으로
// 배포 전 실제 DB 전수조회해서 발견한 긴급 위험): customer-level-pay-sync-check.js
// 수정(견적서 합계를 customers에 동기화)을 배포하기 전, 실제 운영 DB를 전수조회해
// 보니 2026-09-21 구조전환 이전 고객 수십 명이 "견적서엔 입금기록 0, customers
// 레벨에만 거액 입금"으로 남아있었음(신화경/현은지/허서진 등 과거 사고 이력 고객들
// 다수 포함) - 이들이 나중에 새 견적서를 받고 거기에 결제를 입력하면, 동기화
// 로직이 "그 고객의 견적서 합계"(새 견적서 하나뿐이라 작음)로 customers를 그대로
// 덮어써서 과거 거액 입금기록을 통째로 지워버릴 뻔했음.
//
// 수정(2026-10-01 당시): Math.max(새로 합산한 견적서 합계, 기존 customers 값)로
// 절대 기존 값보다 작아지지 않도록 방어.
//
// 2026-10-02(선혜님 - "이민선/김현정 결제했는데 상담에 뜨니, 쌍둥이 함수도 찾고
// 앞으로 이런 버그 안생기게 하는 방향도 찾아" 요청으로 구조 변경): 위 보호 로직
// 자체가 JS 코드에서 DB 트리거(sync_customer_payment_from_estimates, GREATEST
// 로직 그대로 이전됨)로 옮겨감. 이 브라우저 테스트(모킹된 서버 응답)로는 실제
// Postgres 트리거 동작까지 검증할 수 없으므로, 여기서는 "JS가 더 이상 customers를
// 직접 PATCH하지 않는지"만 확인 - GREATEST 보호 로직 자체는 Supabase에서 실제
// 데이터로 직접 재현해 별도로 검증함(이 파일 상단 참고 커밋 메시지).
//
// 사용법: node tests/legacy-customer-pay-protection-check.js
// ══════════════════════════════════════════════════
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 28200;
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
      // 핵심: 이 고객(client_id=502)과 연결된 견적서는 입금기록이 전혀 없음(레거시 고객에
      // 새 견적서를 막 추가한 상황 흉내) - 이번에 그 새 견적서에 계약금 10만원만 입력함
      if (req.method() === 'GET' && u.pathname.includes('/rest/v1/estimates') && u.search.includes('client_id=eq.502') && u.search.includes('select=deposit_amount')) {
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([
          { deposit_amount: 100000, balance_amount: 0 } // 방금 입력한 신규 견적서 하나뿐
        ]) });
        return;
      }
      if (req.method() === 'PATCH' && u.pathname.includes('/rest/v1/estimates') && u.search.includes('id=eq.est-new')) {
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 'est-new', updated_at: new Date().toISOString() }]) });
        return;
      }
      if (req.method() === 'PATCH' && u.pathname.includes('/rest/v1/customers') && u.search.includes('id=eq.502')) {
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
        return;
      }
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

  // 레거시 고객: customers 레벨엔 과거 거액 입금(허서진 실사례와 동일한 규모)이 있지만
  // 견적서 쪽엔 입금기록이 전혀 없음(2026-09-21 이전 구조로 저장된 상태)
  await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([
      { id: 'est-new', clientId: 502, clientName: '레거시고객', price: 300000, date: '2026-10-01',
        depositAmount: 0, depositDate: '', depositMethod: '', depositReceipt: false,
        balanceAmount: 0, balanceDate: '', balanceMethod: '', balanceReceipt: false }
    ]));
    saveCustomers([{ id: 502, clientName: '레거시고객', phone: '01099998888', stage: '시공준비중', staffName: '마스터', price: 2000000, depositAmount: 500000, balanceAmount: 1697000 }]);
    openDetail('레거시고객', 502);
  });
  await new Promise(r => setTimeout(r, 600));

  await page.evaluate(() => {
    const forms = document.querySelectorAll('input[placeholder="선금 금액"]');
    const firstForm = forms[0];
    firstForm.value = '100000';
    firstForm.dispatchEvent(new Event('input', { bubbles: true }));
    const dateInputs = firstForm.closest('div').parentElement.querySelectorAll('input[type="date"]');
    if (dateInputs.length) dateInputs[dateInputs.length - 1].value = '2026-10-01';
    const saveBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('선금 저장'));
    saveBtns[0].click();
  });
  await new Promise(r => setTimeout(r, 1200));

  const custPatch = reqLog.find(r => r.method === 'PATCH' && r.path.includes('/rest/v1/customers') && r.path.includes('id=eq.502'));
  ok('1. [구조변경] customers로 JS의 직접 PATCH가 더 이상 안 나감(보호 로직이 DB 트리거 GREATEST로 이전됨)', !custPatch, JSON.stringify(custPatch));

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
