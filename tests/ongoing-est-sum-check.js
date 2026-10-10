// tests/ongoing-est-sum-check.js
// 2026-09-19(선혜님 - "노지경님 견적서가 1개였는데 내가 한개를 더
// 넣었어... 2건에 대한 건 없고 이거뿐이야" → "진행중인 견적도 두
// 견적서 합계로 보여드릴까요?" → "그래야지"): 고객상세 화면 상단의
// "진행중인 견적" 요약이 이 고객의 견적서가 여러 건이어도 항상
// "가장 최근 것 하나"만 보여주고 있었음(앞서 고친 매출 계산
// 기준금액과는 별개의, 로컬 dah_saved 기반 표시). openDetail()이
// 이미 loadEstimatesAsync()로 서버 최신 목록을 받아온 뒤에만 화면을
// 그리므로, 최신 것 하나 대신 전체 합계로 바꿔도 데이터 신뢰성 문제
// 없음 - 노지경님과 정확히 같은 조건(견적서 2건, 합계 6,479,000원/
// 17품목)으로 재현 검증.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27200;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 노지경 고객(9401) - 서버에 견적서 2건(100만원/8품목, 5,479,000원/9품목 → 합계 6,479,000원/17품목)
  await page.evaluate(() => {
    window.sbXHR = function(method, path, data, cb) {
      if (method === 'GET' && path.indexOf('estimates?select=*') === 0) {
        cb(null, [
          { id: 'est-A', client_id: 9401, customer_name: '노지경', price: 1000000, performance_revenue: 950000, line_items: new Array(8).fill({}), estimate_status: 'ga', date: '2026-09-10' },
          { id: 'est-B', client_id: 9401, customer_name: '노지경', price: 5479000, performance_revenue: 5200000, line_items: new Array(9).fill({}), estimate_status: 'ga', date: '2026-09-19' }
        ]);
        return;
      }
      cb(null, []);
    };
    saveCustomers([{ id: 9401, clientName: '노지경', phone: '01089130078', stage: '선금결제', staffName: '마스터', price: 620000, performanceRevenue: 600000 }]);
    openDetail('노지경', 9401);
  });
  await new Promise(r => setTimeout(r, 700));

  const result = await page.evaluate(() => {
    var text = document.body.textContent;
    return {
      hasSumAmount: text.indexOf('6,479,000원') !== -1,
      hasOldLatestOnly: text.indexOf('5,479,000원') !== -1 && text.indexOf('6,479,000원') === -1,
      hasItemSum: text.indexOf('17개 품목') !== -1,
      hasEstCount: text.indexOf('견적서 2건') !== -1,
      cntBadge: document.getElementById('dtab-est-cnt')?.textContent
    };
  });
  ok('1. "진행중인 견적"이 최신 것 하나(5,479,000원)가 아니라 두 견적서 합계(6,479,000원)로 표시됨', result.hasSumAmount && !result.hasOldLatestOnly, JSON.stringify(result));
  ok('2. 품목 수도 합산되어 "17개 품목"으로 표시됨', result.hasItemSum, JSON.stringify(result));
  ok('3. "견적서 2건"이라는 안내도 표시됨', result.hasEstCount, JSON.stringify(result));
  ok('4. 이력탭 배지("2건")와 진행중인 견적 건수가 서로 일치함(같은 데이터 소스)', result.cntBadge === '2건', 'cntBadge=' + result.cntBadge);

  // 회귀방지: 견적서가 1건뿐인 고객은 "견적서 N건" 문구 없이 예전처럼 심플하게 표시
  await page.evaluate(() => {
    window.sbXHR = function(method, path, data, cb) {
      if (method === 'GET' && path.indexOf('estimates?select=*') === 0) {
        cb(null, [{ id: 'est-C', client_id: 9402, customer_name: '단건고객', price: 800000, performance_revenue: 800000, line_items: new Array(5).fill({}), estimate_status: 'ga', date: '2026-09-19' }]);
        return;
      }
      cb(null, []);
    };
    saveCustomers([{ id: 9402, clientName: '단건고객', phone: '01011112222', stage: '가견적', staffName: '마스터' }]);
    openDetail('단건고객', 9402);
  });
  await new Promise(r => setTimeout(r, 700));
  const singleResult = await page.evaluate(() => document.body.textContent);
  ok('5. [회귀방지] 견적서 1건뿐인 고객은 "견적서 N건" 문구가 안 붙고 800,000원만 정상 표시됨', singleResult.indexOf('800,000원') !== -1 && singleResult.indexOf('견적서 1건') === -1);

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
