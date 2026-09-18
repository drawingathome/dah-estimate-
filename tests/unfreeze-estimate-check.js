// tests/unfreeze-estimate-check.js
// 2026-09-18(선혜님 - "이 견적서 다시 살려줘" / "인쇄가 왜이렇게
// 되지??"): 예전 커튼/블라인드 견적서를 "열어서 수정"으로 불러온 뒤
// 침구로 완전히 바꿨는데, 인쇄/저장 시 최신 입력이 아니라 예전에
// "저장 당시 금액 고정"(viewingFrozenEstimate)해둔 스냅샷이 계속
// 적용되던 버그. 품목표(커튼/블라인드/기타) 입력·추가·삭제 어느
// 경로로든 얼림이 자동으로 풀리는지, 그리고 실제 인쇄 결과가 예전
// 스냅샷이 아니라 최신 입력을 반영하는지 종단간 검증.
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 19871 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co') || url.includes('script.google.com')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.setViewport({ width: 390, height: 1200 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  await page.evaluate(() => {
    document.getElementById('c-name').value = '얼림테스트고객';
    window._estEditState.viewingFrozenEstimate = true;
    window._estEditState.lastCalcBreakdown = {
      curtainTotal: 999999, finalTotal: 999999, deposit: 500000, balance: 499999,
      installSubtotal: 0, discount: 0, performanceRevenue: 999999
    };
  });
  const frozenBefore = await page.evaluate(() => window._estEditState.viewingFrozenEstimate);
  ok('0. 재현 조건 확인 - 얼림 상태가 켜져있음(예전 견적서를 불러온 상황)', frozenBefore === true);

  await page.evaluate(() => {
    const tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.mw').value = '300';
    tr.querySelector('.mh').value = '250';
    tr.querySelector('.cprice').value = '100000';
    tr.querySelector('.cprice').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 100));
  const frozenAfterInput = await page.evaluate(() => window._estEditState.viewingFrozenEstimate);
  ok('1. 품목표에 실제 입력이 발생하면 얼림 상태가 자동으로 풀림', frozenAfterInput === false, JSON.stringify(frozenAfterInput));

  await page.evaluate(() => {
    window._estEditState.viewingFrozenEstimate = true;
    addOtherItemRow();
  });
  const frozenAfterAdd = await page.evaluate(() => window._estEditState.viewingFrozenEstimate);
  ok('2. 새 품목 행 추가(기타품목)로도 얼림 상태가 자동으로 풀림', frozenAfterAdd === false, JSON.stringify(frozenAfterAdd));

  await page.evaluate(() => {
    window._estEditState.viewingFrozenEstimate = true;
    var delBtn = document.querySelector('.del-btn');
    if (delBtn) delRow(delBtn);
  });
  const frozenAfterDel = await page.evaluate(() => window._estEditState.viewingFrozenEstimate);
  ok('3. 행 삭제로도 얼림 상태가 자동으로 풀림', frozenAfterDel === false, JSON.stringify(frozenAfterDel));

  await page.evaluate(() => {
    document.getElementById('c-phone').value = '010-1234-5678';
    document.getElementById('c-addr').value = '서울시 종로구';
    document.getElementById('c-region').value = '서울';
    document.getElementById('c-measure-tbd').checked = true;
    document.getElementById('c-install-tbd').checked = true;
    window._estEditState.viewingFrozenEstimate = true;
    window._estEditState.lastCalcBreakdown = { curtainTotal: 999999, finalTotal: 999999, deposit: 999999, balance: 0, installSubtotal: 0, discount: 0, performanceRevenue: 999999 };
    document.querySelectorAll('#curtain-body tr').forEach(tr => tr.remove());
    var priceInput = document.querySelector('#other-body .other-price');
    priceInput.value = '150000';
    priceInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 100));
  const printResult = await page.evaluate(() => {
    printForCustomer();
    return document.getElementById('pv-overlay')?.textContent || '';
  });
  ok('4. 인쇄 결과에 예전 얼려둔 금액(999,999)이 안 보임', !printResult.includes('999,999'));
  ok('5. 인쇄 결과에 방금 입력한 침구 단가(150,000)가 정확히 반영됨', printResult.includes('150,000'));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
