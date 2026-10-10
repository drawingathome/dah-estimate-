// tests/pay-per-estimate-check.js
// 2026-09-21(선혜님 - "견적서 두건의 합계를 챙기면 변수가 생길꺼 같은데
// 따로 해야지" → "그럼 언제 하라는거지??????"로 지금 진행 지시): 결제
// (선금/잔금)를 고객 레벨(customers 테이블)이 아니라 견적서 각각
// (estimates 테이블)에 저장하도록 구조 전환 - 실제 인보이스/청구
// 시스템처럼 결제는 항상 청구서(견적서) 하나에 속해야 "이 결제가
// 어느 것 것인지" 애매함이 근본적으로 사라짐. estimates 테이블에
// deposit_amount 등 8개 컬럼 신설, renderPaySection(c, payBody, est)
// 의 3번째 인자로 견적서를 받아 그 견적서 기준으로 표시/저장하고,
// est가 없으면(신규 고객) 예전처럼 고객 레벨 폴백 유지. 검증: 노지경
// 님과 동일 조건(견적서 2건, 각각 다른 결제)으로 재현해 카드가
// 각각 독립적으로 표시되고, 저장시 customers가 아니라 정확한
// estimates?id=eq.X로 PATCH되는지, 신규 고객은 회귀 없이 폴백되는지.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 28000;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 노지경(9401) - 견적서 2건, 각각 다른 결제 상태
  await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([
      { id: 'est-A', clientId: 9401, clientName: '노지경', price: 6479000, date: '2026-09-15',
        depositAmount: 3200000, depositDate: '2026-09-15', depositMethod: '현금', depositReceipt: true,
        balanceAmount: 0, balanceDate: '', balanceMethod: '', balanceReceipt: false },
      { id: 'est-B', clientId: 9401, clientName: '노지경', price: 620000, date: '2026-09-21',
        depositAmount: 0, depositDate: '', depositMethod: '', depositReceipt: false,
        balanceAmount: 0, balanceDate: '', balanceMethod: '', balanceReceipt: false }
    ]));
    saveCustomers([{ id: 9401, clientName: '노지경', phone: '01011112222', stage: '선금결제', staffName: '마스터', price: 7099000 }]);
    openDetail('노지경', 9401);
  });
  await new Promise(r => setTimeout(r, 500));

  const state = await page.evaluate(() => {
    const payBody = document.getElementById('detail-pay-body') || document.getElementById('pay-body');
    return { text: payBody ? payBody.textContent : document.body.textContent };
  });
  ok('1. 견적서 2건 각각의 "결제 관리" 섹션이 화면에 다 나옴(견적서 라벨 2개)', (state.text.match(/결제 관리/g) || []).length === 2, (state.text.match(/결제 관리/g) || []).length);
  ok('2. 첫 견적서(6,479,000원)의 선금(3,200,000원)이 정확히 그 카드에 표시됨', state.text.includes('3,200,000') && state.text.includes('6,479,000'));
  ok('3. 두 번째 견적서(620,000원)는 결제 입력 전 상태(선금 폼)로 별도 표시됨', state.text.includes('620,000'));
  ok('4. 더 이상 "합계 결제" 안내(옛 방식)가 없음', !state.text.includes('합계') || !state.text.includes('7,099,000') );

  // 두 번째 견적서(est-B)에 잔금을 입력해서 저장 -> estimates 테이블로 PATCH 가는지 확인
  let capturedPatchUrl = null, capturedPatchBody = null;
  await page.evaluate(() => {
    window.sbXHR_orig = window.sbXHR;
    window.__capturedCalls = [];
    window.sbXHR = function(method, path, data, cb) {
      window.__capturedCalls.push({ method, path, data });
      if (method === 'PATCH') { cb(null, [{ id: 1, updated_at: new Date().toISOString() }]); return; }
      window.sbXHR_orig(method, path, data, cb);
    };
  });
  await page.evaluate(() => {
    const forms = document.querySelectorAll('input[placeholder="선금 금액"]');
    // 두 번째 견적서(est-B, 아직 미입력) 폼의 선금 입력칸에 값 입력
    const secondForm = forms[forms.length - 1];
    secondForm.value = '620000';
    const dateInputs = secondForm.closest('div').parentElement.querySelectorAll('input[type="date"]');
    if (dateInputs.length) dateInputs[dateInputs.length-1].value = '2026-09-21';
    const saveBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('선금 저장'));
    saveBtns[saveBtns.length - 1].click();
  });
  await new Promise(r => setTimeout(r, 500));

  const calls = await page.evaluate(() => window.__capturedCalls);
  const patchCall = calls.find(c => c.method === 'PATCH' && c.path.includes('estimates?id=eq.est-B'));
  ok('5. [핵심] 두 번째 견적서에 결제 저장시, customers가 아니라 estimates?id=eq.est-B로 정확히 PATCH됨', !!patchCall, JSON.stringify(calls.map(c=>c.method+' '+c.path)));
  ok('6. PATCH 본문에 정확한 선금 금액(620000)이 담김', patchCall && patchCall.data && Number(patchCall.data.deposit_amount) === 620000, JSON.stringify(patchCall && patchCall.data));

  // 회귀방지: 견적서 0건인 신규 고객은 예전처럼 고객 레벨 폴백 정상 작동
  await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([]));
    saveCustomers([{ id: 9402, clientName: '신규고객', phone: '01033334444', stage: '가견적', staffName: '마스터' }]);
    openDetail('신규고객', 9402);
  });
  await new Promise(r => setTimeout(r, 500));
  const noEstState = await page.evaluate(() => document.body.textContent);
  ok('7. [회귀방지] 견적서 0건인 신규 고객도 결제 관리 섹션이 정상적으로 하나 뜸(예전 폴백)', (noEstState.match(/결제 관리/g) || []).length === 1);

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
