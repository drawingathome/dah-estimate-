#!/usr/bin/env node
// tests/customer-price-sum-fail-protection-check.js
// ══════════════════════════════════════════════════
// 2026-10-01(선혜님 - "최금희 외 다른 고객이 문제있는건 확인 가능하니?? 쌍둥이 함수
// 모두 확인해" 요청으로 발견): est-save-stages.js:_saveStage_customers가 "이 고객의
// 다른 견적서 합계"를 조회해서 customers.price/performance_revenue에 반영하는데,
// 그 조회가 네트워크 오류/HTTP 에러/파싱 실패로 실패하면 "다른 견적서 금액=0"으로
// 간주해서 이번 견적서 금액만으로 서버값을 덮어쓰고 있었음 - 여러 견적서를 가진
// 고객의 과거 누적 금액이 조회 실패 한 번으로 통째로 사라질 위험(dash-customer-pay.js의
// deposit/balance 동기화에서 발견한 것과 같은 클래스).
//
// 수정: 조회 실패시 price/performance_revenue 필드 자체를 payload에서 빼서(undefined),
// 기존 서버값을 건드리지 않음 - "합계를 몰라서 0으로 간주"보다 "몰라서 안 건드림"이 항상
// 안전함.
//
// 사용법: node tests/customer-price-sum-fail-protection-check.js
// ══════════════════════════════════════════════════
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 29300;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  const reqLog = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      const u = new URL(url);
      // 핵심: "다른 견적서 합계 조회"가 500으로 실패하는 상황 재현(기존 고객 수정모드)
      if (req.method() === 'GET' && u.pathname.includes('/rest/v1/estimates') && u.search.includes('client_id=eq.501') && u.search.includes('select=id,price,performance_revenue')) {
        req.respond({ status: 500, contentType: 'application/json', headers: CORS, body: '{}' });
        return;
      }
      if (req.method() === 'GET' && u.pathname.includes('/rest/v1/customers') && u.search.includes('id=eq.501')) {
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 501, client_name: '테스트고객', phone: '01011112222', price: 500000, performance_revenue: 400000, updated_at: new Date().toISOString() }]) });
        return;
      }
      if (u.pathname.includes('/rest/v1/customers') && req.method() === 'PATCH') {
        const body = JSON.parse(req.postData() || '{}');
        reqLog.push({ method: 'PATCH', path: u.pathname + u.search, body });
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 501, updated_at: new Date().toISOString() }]) });
        return;
      }
      if (u.pathname.includes('/rest/v1/estimates') && req.method() === 'POST') {
        req.respond({ status: 201, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 'new-est', updated_at: new Date().toISOString() }]) });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadCustId=501`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900));
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 900));
  await page.evaluate(() => {
    window._estEditState.estSaveCustomerId = 501;
    const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
    if (!document.getElementById('c-name').value) set('c-name', '테스트고객');
    if (!document.getElementById('c-phone').value) set('c-phone', '01011112222');
    set('c-addr', '경기 과천시'); set('c-measure', '2026-10-05'); set('c-install', '2026-10-15');
    if (document.querySelectorAll('#curtain-body tr').length === 0) addCurtainRow();
    const tr = document.querySelector('#curtain-body tr');
    const priceEl = tr.querySelector('.cprice'); priceEl.value = '100000'; priceEl.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof fmtPriceBlur === 'function') fmtPriceBlur(priceEl);
    const mw = tr.querySelector('.mw'); mw.value = '200'; mw.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof calcCurtainRow === 'function') calcCurtainRow(mw);
    if (typeof calcTotal === 'function') calcTotal();
  });
  await page.evaluate(() => { saveEstimate(); }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  const custPatch = reqLog.find(r => r.method === 'PATCH');
  const ok1 = !!custPatch;
  const ok2 = custPatch && !('price' in custPatch.body);
  const ok3 = custPatch && !('performance_revenue' in custPatch.body);
  console.log((ok1 ? '✅' : '❌') + ' 1. 고객 저장 PATCH가 나감', JSON.stringify(custPatch));
  console.log((ok2 ? '✅' : '❌') + ' 2. [핵심] 합계조회 실패시 price 필드 자체가 안 들어감(기존 서버값 보존)');
  console.log((ok3 ? '✅' : '❌') + ' 3. [핵심] 합계조회 실패시 performance_revenue 필드 자체가 안 들어감(기존 서버값 보존)');

  await browser.close();
  server.kill();
  const ok = ok1 && ok2 && ok3;
  console.log('\n' + (ok ? '전체 통과' : '실패'));
  process.exit(ok ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
