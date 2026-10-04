// tests/rail-only-check.js
// 2026-09-18(선혜님 - "레일만 시공하려는건데" / "그럼 청구는 되지만
// 실측이나 시공에서 안뜨잖아" / "전문업체 입장에서 보면 어때??" -
// 커튼 판매 없이 레일만 시공하는 실제 업무 시나리오): 레일·시공비·
// 기타 표(svc-body)에 "위치" 칸을 신설해서, 여기 직접 추가한 항목도
// 실측/시공 의뢰서에 정확히 나오게 함. 이 과정에서 td 순서에 의존하던
// 기존 자동생성 로직(레일/레일시공비/옵션추가금/블라인드시공/실측비/
// 시공비, 총 5곳 33줄)을 전부 클래스명 기반으로 재작성 - 컬럼이 나중에
// 또 바뀌어도 안 깨지게. 기존 커튼 자동레일 흐름이 여전히 정상
// 작동하는지(회귀방지)부터 확인한 뒤, 레일만 시공 신규 시나리오가
// 실측/시공 의뢰서·청구 셋 다에 정확히 반영되는지 검증.
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 26800;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
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

  // ── 1. 기존 커튼 흐름(자동 레일생성)이 여전히 정상 작동하는지(회귀방지) ──
  await page.evaluate(() => {
    document.getElementById('c-name').value = '커튼정상테스트';
    document.getElementById('c-phone').value = '010-1234-5678';
    document.getElementById('c-addr').value = '서울시 강남구';
    document.getElementById('c-region').value = '서울';
    const tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.space-inp').value = '거실';
    tr.querySelector('.c-display-name').value = '거실커튼';
    tr.querySelector('.mw').value = '300'; tr.querySelector('.mh').value = '250';
    tr.querySelector('.cprice').value = '100000';
    calcCurtainRow(tr.querySelector('.cprice'));
  });
  await new Promise(r => setTimeout(r, 300));
  const regressionCheck = await page.evaluate(() => {
    const railRow = document.querySelector('#svc-body [data-rail-src]');
    return {
      railContent: railRow?.querySelector('.svc-content')?.value,
      railSpace: railRow?.querySelector('.svc-space')?.value,
      railPrice: railRow?.querySelector('.sprice')?.dataset.raw
    };
  });
  ok('0. [회귀방지] 커튼 입력시 레일이 자동생성되고 위치가 정확히 채워짐', regressionCheck.railSpace === '거실' && regressionCheck.railContent.includes('조절레일') && regressionCheck.railPrice === '1600', JSON.stringify(regressionCheck));

  // 실측/시공 의뢰서에 "거실"이 정상적으로 나오는지(자동생성 레일 포함 커튼 흐름)
  const measureDoc1 = await page.evaluate(() => { printRequest('measure', true); return document.getElementById('pv-overlay')?.textContent || ''; });
  ok('1. [회귀방지] 커튼 자동레일 흐름 - 실측의뢰서에 "거실"이 정상적으로 나옴', measureDoc1.includes('거실'), measureDoc1.slice(0, 200));
  await page.evaluate(() => { document.getElementById('pv-overlay')?.remove(); });

  // ── 2. 새 기능: "레일만 시공"(커튼 판매 없음) - svc-body에 직접 위치+레일 추가 ──
  await page.evaluate(() => {
    addSvcRow();
    const rows = document.querySelectorAll('#svc-body tr');
    const tr = rows[rows.length - 1];
    tr.querySelector('.svc-kind').value = '레일';
    tr.querySelector('.svc-space').value = '안방';
    tr.querySelector('.svc-content').value = '12자 조절레일(타공형)';
    tr.querySelector('.sprice').value = '30000';
    calcSvcRow(tr.querySelector('.sprice'));
  });
  await new Promise(r => setTimeout(r, 300));

  // 실측 의뢰서에 "안방"(레일만) 항목이 나오는지
  const measureDoc2 = await page.evaluate(() => { printRequest('measure', true); return document.getElementById('pv-overlay')?.textContent || ''; });
  ok('2. 레일만 시공 - 실측의뢰서에 "안방"이 새로 나옴', measureDoc2.includes('안방'), measureDoc2.slice(0, 300));
  await page.evaluate(() => { document.getElementById('pv-overlay')?.remove(); });

  // 시공 의뢰서에도 "안방"(레일) 항목이 나오는지
  const installDoc = await page.evaluate(() => { printRequest('install', true); return document.getElementById('pv-overlay')?.textContent || ''; });
  ok('3. 레일만 시공 - 시공의뢰서에 "안방"과 "레일"이 정확히 나옴', installDoc.includes('안방') && installDoc.includes('레일') && installDoc.includes('12자 조절레일'), installDoc.slice(0, 400));
  await page.evaluate(() => { document.getElementById('pv-overlay')?.remove(); });

  // 견적서(청구)에는 여전히 정상적으로 금액이 반영되는지
  const custDoc = await page.evaluate(() => { printForCustomer(); return document.getElementById('pv-overlay')?.textContent || ''; });
  ok('4. 견적서(청구)에도 레일만 항목의 금액(30,000원)이 정확히 반영됨', custDoc.includes('30,000'), custDoc.match(/[\d,]+원/g)?.slice(-8));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
