// tests/svc-rows-persist-check.js
// 2026-10-08(선혜님 — 조유정 견적 "시공비 이상하네 … 여러번 말했어"):
// 자동으로 생기는 시공 행(실측비·시공비·블라인드시공·레일)을 저장 때 DB에서 빼고
// "다시 열 때 재계산으로 만든다"는 구조가 근본 원인이었음.
//   - 저장된 견적 65건 중 62건(95%)이 합계엔 시공비가 있는데 행은 DB에 없었음
//   - 다시 열면 재계산 행이 직접 추가한 행 위에 또 얹혀 중복(308,000 → 398,000)
// 새 계약: 자동 행도 전부 저장하고(autoType + override 표시), price_breakdown.svcRowsSaved=true
//          표식이 있는 견적은 열 때 재계산 없이 저장된 행 그대로 복원한다.
//          지역/제품을 사용자가 바꾸는 순간부터는 예전처럼 자동 재계산한다.
// 검증(고치기 전엔 실패해야 하는 시험들 — 되돌려보기 검증 대상):
//   1 저장: 자동 행 3종이 line_items에 들어감 + 표식
//   2 저장↔복원: 열어도 행/합계 동일
//   3 직접 추가한 "실측 시공비" 행이 있어도 중복 없음 (조유정 재현)
//   4 사용자가 행을 모두 지운 상태로 저장 → 열어도 안 되살아남
//   5 열린 뒤 사용자가 지역을 바꾸면 자동 재계산 유지(회귀 방지)
//   6 표식 없는 예전 견적은 예전 방식 그대로(회귀 방지)
//   7 성과매출은 시공비 행과 무관(제품비−할인)
const path = require('path');
const { launchBrowser, startServer, setupRealisticLogin } = require('./_helpers');

const H = { 'Access-Control-Allow-Origin': '*' };
const BLINDS = [
  { amt: '99,000원', bmh: '18', bmw: '123', opt: '', kind: '알루미늄', type: 'blind', color: '', extra: 0, price: 66000, space: '욕실', fabric: '', handle: '기타', vendor: '', comment: '', bottomBar: '', cordLength: '', displayName: '크림색 (274번) 심플리시티' },
  { amt: '99,000원', bmh: '76', bmw: '146', opt: '', kind: '알루미늄', type: 'blind', color: '', extra: 0, price: 66000, space: '욕실', fabric: '', handle: '우손', vendor: '', comment: '', bottomBar: '', cordLength: '', displayName: '크림색 (274번) 끈형' }
];

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27710;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }
  const jsErrors = [];

  // 열어볼 견적 한 건을 서버 대신 돌려주는 가짜 DB
  const served = { row: null, saved: null };
  async function newPage() {
    const page = await browser.newPage();
    page.on('pageerror', e => jsErrors.push(e.message));
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url(); const method = req.method();
      if (url.includes('supabase.co')) {
        if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
        if (url.includes('/rest/v1/estimates') && method === 'GET' && served.row) { req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([served.row]) }); return; }
        if (url.includes('/rest/v1/estimates') && (method === 'POST' || method === 'PATCH')) {
          served.saved = JSON.parse(req.postData() || '{}');
          req.respond({ status: 201, contentType: 'application/json', headers: H, body: JSON.stringify([{ id: 'svc-persist-est', updated_at: new Date().toISOString() }]) }); return;
        }
        if (url.includes('/rest/v1/customers') && method === 'GET') { req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([{ id: 1000, client_name: '시공행테스트', phone: '010-1111-2222', addr: '서울시 서초구', stage: '상담', is_archived: false }]) }); return; }
        req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' }); return;
      }
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
    });
    await setupRealisticLogin(page);
    await page.setViewport({ width: 1280, height: 1600 });
    return page;
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const readSvc = page => page.evaluate(() => ({
    region: document.getElementById('c-region').value,
    rows: Array.from(document.querySelectorAll('#svc-body tr')).map(r => ({ t: r.getAttribute('data-svc-type') || '', c: r.querySelector('.svc-content')?.value || '', p: (r.querySelector('.sprice')?.value || '').replace(/,/g, ''), q: r.querySelector('.sqty')?.value || '' })),
    svcSum: (document.getElementById('sum-svc')?.textContent || '').replace(/[^0-9-]/g, ''),
    total: (document.getElementById('sum-total')?.textContent || '').replace(/[^0-9-]/g, ''),
    perf: (document.getElementById('sum-perf')?.textContent || '').replace(/[^0-9-]/g, '')
  }));
  function estRow(lineItems, bd, extra) {
    return Object.assign({
      id: 'svc-persist-est', client_id: 1000, customer_name: '시공행테스트', phone: '010-1111-2222', addr: '서울시 서초구', region: '서울',
      estimate_status: 'ga', line_items: lineItems, applied_discounts: { manual: null, coupons: [] }, price_breakdown: bd,
      price: bd ? bd.finalTotal : 0, updated_at: new Date().toISOString(), created_at: new Date().toISOString(), is_archived: false
    }, extra || {});
  }
  async function openSaved(row) {
    served.row = row;
    const page = await newPage();
    await page.goto(`http://localhost:${port}/dah-estimate.html?loadEstDbId=svc-persist-est&mode=edit`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await wait(2500);
    return page;
  }

  // ── 1·7. 저장: 새 견적(서울 + 블라인드 2개) → 자동 행 3종이 저장되는가
  served.row = null;
  const p1 = await newPage();
  await p1.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await wait(1200);
  await p1.evaluate(() => {
    document.getElementById('c-name').value = '시공행테스트'; document.getElementById('c-phone').value = '010-1111-2222'; document.getElementById('c-addr').value = '서울시 서초구';
    const s = document.getElementById('c-region'); s.value = '서울'; s.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('c-measure-tbd').checked = true; document.getElementById('c-install-tbd').checked = true;
    addBlindRow(); addBlindRow();
    document.querySelectorAll('#blind-body tr').forEach((tr, i) => {
      tr.querySelector('.space-inp').value = '욕실'; tr.querySelector('.bmw').value = i ? '146' : '123'; tr.querySelector('.bmh').value = i ? '76' : '18';
      tr.querySelector('.blind-price').value = '66000'; calcBlindRow(tr.querySelector('.bmw'));
    });
  });
  await wait(500);
  const form1 = await readSvc(p1);
  const items1 = await p1.evaluate(() => collectLineItems().filter(i => i.type === 'svc').map(i => ({ autoType: i.autoType, price: i.price, qty: i.qty, override: i.override })));
  const types1 = items1.map(i => i.autoType).sort().join(',');
  ok('1-0 [재현조건] 화면에는 실측비/시공비/블라인드시공 3행이 있음', form1.rows.length === 3, JSON.stringify(form1.rows));
  ok('1 저장 대상(line_items)에 자동 행 3종(measure,install,blindInstall)이 모두 들어감', types1 === 'blindInstall,install,measure', types1 || '(없음 — 자동 행은 저장에서 제외되고 있음)');
  ok('1-b 자동 행은 override:false(사용자가 안 고친 값)로 표시됨', items1.length === 3 && items1.every(i => i.override === false), JSON.stringify(items1));
  await p1.evaluate(() => { saveEstimate(); });
  await wait(2000);
  const bdSaved = served.saved && served.saved.price_breakdown;
  ok('1-c 저장 요청의 price_breakdown에 svcRowsSaved 표식이 있음', !!(bdSaved && bdSaved.svcRowsSaved === true), bdSaved ? JSON.stringify(bdSaved).slice(0, 200) : '저장 요청 없음');
  const savedItems = served.saved && served.saved.line_items;
  const savedTotal = served.saved && served.saved.price_breakdown && served.saved.price_breakdown.finalTotal;
  ok('7 성과매출 = 제품비−할인 (시공비 행과 무관, 시공비 110,000원이 섞이지 않음)', !!bdSaved && bdSaved.performanceRevenue === bdSaved.productSubtotal - bdSaved.discount && bdSaved.installSubtotal === 110000, bdSaved ? JSON.stringify(bdSaved) : '저장 요청 없음');
  await p1.close();

  // ── 2. 저장된 그대로 다시 열기 (방금 저장된 요청을 그대로 서버 응답으로 사용)
  if (savedItems && bdSaved) {
    const p2 = await openSaved(estRow(savedItems, bdSaved));
    const r2 = await readSvc(p2);
    ok('2 다시 열어도 시공 행 3개 그대로 (중복·추가 없음)', r2.rows.length === 3, JSON.stringify(r2.rows));
    ok('2-b 시공비 합계가 저장 당시와 같음', String(r2.svcSum) === String(bdSaved.installSubtotal), 'screen=' + r2.svcSum + ' saved=' + bdSaved.installSubtotal);
    ok('2-c 총액이 저장 당시와 같음', String(r2.total) === String(savedTotal), 'screen=' + r2.total + ' saved=' + savedTotal);
    await p2.close();
  } else {
    ok('2 (1단계 저장이 안 돼서 건너뜀)', false, '저장 요청 없음');
  }

  // ── 3. 조유정 재현: 직접 추가한 "실측 시공비 90,000" + 블라인드시공(자동) + 표식
  const joBd = { balance: 0, deposit: 308000, discount: 0, finalTotal: 308000, discountDetail: [], installSubtotal: 110000, productSubtotal: 198000, performanceRevenue: 198000, svcRowsSaved: true };
  const joItems = BLINDS.concat([
    { qty: '1', kind: '시공비', type: 'svc', price: 90000, space: '', content: '실측 시공비', autoType: '', override: false },
    { qty: '2', kind: '시공비', type: 'svc', price: 10000, space: '', content: '블라인드 시공비 (2개)', autoType: 'blindInstall', override: false }
  ]);
  const p3 = await openSaved(estRow(joItems, joBd));
  const r3 = await readSvc(p3);
  ok('3 [조유정] 직접 추가한 실측 시공비가 있어도 자동 실측/시공비가 또 붙지 않음 (총액 308,000원)', r3.total === '308000', 'rows=' + JSON.stringify(r3.rows) + ' total=' + r3.total);
  ok('3-b 시공 행은 저장된 2개 그대로', r3.rows.length === 2, String(r3.rows.length));
  await p3.close();

  // ── 4. 사용자가 시공 행을 모두 지운 채 저장한 견적(표식 있음) → 열어도 안 되살아남
  const noBd = { balance: 0, deposit: 99000, discount: 0, finalTotal: 198000, discountDetail: [], installSubtotal: 0, productSubtotal: 198000, performanceRevenue: 198000, svcRowsSaved: true };
  const p4 = await openSaved(estRow(BLINDS, noBd));
  const r4 = await readSvc(p4);
  ok('4 행을 일부러 모두 지우고 저장한 견적은 열어도 시공 행이 되살아나지 않음', r4.rows.length === 0 && r4.total === '198000', 'rows=' + JSON.stringify(r4.rows) + ' total=' + r4.total);
  // ── 5. 열린 뒤 사용자가 지역을 바꾸면 자동 재계산 유지
  await p4.evaluate(() => { const s = document.getElementById('c-region'); s.value = '경기'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await wait(800);
  const r5 = await readSvc(p4);
  const hasGyeonggi = r5.rows.some(r => r.t === '실측비' && r5.region === '경기') && r5.rows.some(r => r.t === '시공비');
  ok('5 열린 뒤 사용자가 지역을 바꾸면 자동 재계산이 다시 동작함 (회귀 방지)', hasGyeonggi, JSON.stringify(r5.rows));
  await p4.close();

  // ── 6. 표식 없는 예전 견적은 예전 방식 그대로 (회귀 방지)
  const legacyBd = { balance: 0, deposit: 99000, discount: 0, finalTotal: 198000, discountDetail: [], installSubtotal: 0, productSubtotal: 198000, performanceRevenue: 198000 };
  const p6 = await openSaved(estRow(BLINDS, legacyBd));
  const r6 = await readSvc(p6);
  ok('6 표식 없는 예전 견적은 열 때 자동 행을 만들어 줌(예전 동작 유지)', r6.rows.some(r => r.t === '실측비') && r6.rows.some(r => r.t === '시공비'), JSON.stringify(r6.rows));
  await p6.close();

  // ── 8. 입력 도중 자동으로 남는 임시 초안: 자동 행이 초안에도 들어가므로, 불러와도 중복되면 안 됨
  served.row = null;
  const p8 = await newPage();
  await p8.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await wait(1200);
  await p8.evaluate(() => {
    document.getElementById('c-name').value = '시공행테스트'; document.getElementById('c-phone').value = '010-1111-2222'; document.getElementById('c-addr').value = '서울시 서초구';
    const s = document.getElementById('c-region'); s.value = '서울'; s.dispatchEvent(new Event('change', { bubbles: true }));
    addBlindRow(); addBlindRow();
    document.querySelectorAll('#blind-body tr').forEach((tr, i) => { tr.querySelector('.space-inp').value = '욕실'; tr.querySelector('.bmw').value = i ? '146' : '123'; tr.querySelector('.bmh').value = i ? '76' : '18'; calcBlindRow(tr.querySelector('.bmw')); });
    localStorage.setItem('dah_estimate_draft', JSON.stringify({ savedAt: new Date().toISOString(), data: collectFormData() }));
  });
  await wait(300);
  await p8.reload({ waitUntil: 'domcontentloaded' });
  await wait(1500);
  await p8.evaluate(() => { loadDraft(); }); // 화면의 [초안 불러오기] 버튼과 같은 함수(확인창은 자동 수락)
  await wait(1200);
  const r8 = await readSvc(p8);
  ok('8 임시 초안을 불러와도 시공 행이 중복되지 않음 (3개 그대로)', r8.rows.length === 3 && r8.svcSum === '110000', JSON.stringify(r8.rows) + ' sum=' + r8.svcSum);
  await p8.close();

  // ── 9·10. 저장 전 검사: 시공이 있는 지역인데 실측비/시공비 행이 하나도 없으면 저장 전에 물어봄
  served.row = null;
  async function saveAttempt(removeSvc) {
    const pg = await newPage();
    await pg.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await wait(1200);
    const res = await pg.evaluate((removeSvc) => {
      document.getElementById('c-name').value = '시공행테스트'; document.getElementById('c-phone').value = '010-1111-2222'; document.getElementById('c-addr').value = '서울시 서초구';
      document.getElementById('c-measure-tbd').checked = true; document.getElementById('c-install-tbd').checked = true;
      const s = document.getElementById('c-region'); s.value = '서울'; s.dispatchEvent(new Event('change', { bubbles: true }));
      addBlindRow();
      const tr = document.querySelector('#blind-body tr'); tr.querySelector('.space-inp').value = '욕실'; tr.querySelector('.bmw').value = '123'; tr.querySelector('.bmh').value = '100'; tr.querySelector('.blind-price').value = '66000'; calcBlindRow(tr.querySelector('.bmw'));
      if (removeSvc) document.querySelectorAll('#svc-body tr').forEach(r => r.remove());
      calcTotal();
      window.__confirms = []; window.confirm = (m) => { window.__confirms.push(String(m)); return !/시공비|실측비/.test(String(m)); }; // 시공비 경고만 "취소", 다른 확인창은 수락
      saveEstimate();
      return { confirms: window.__confirms };
    }, removeSvc);
    await wait(2500);
    await pg.close();
    return res;
  }
  served.saved = null;
  const c9 = await saveAttempt(true);
  ok('9 서울인데 시공 행이 하나도 없이 저장하려 하면 "시공비" 확인창이 뜸', c9.confirms.some(m => /시공비|실측비/.test(m)), JSON.stringify(c9.confirms));
  ok('9-b 확인창에서 취소하면 서버로 저장 요청이 가지 않음', served.saved === null, served.saved ? '저장요청이 나감' : '요청 없음');
  served.saved = null;
  const c10 = await saveAttempt(false);
  ok('10-b [시험 자체 점검] 시공 행이 있으면 저장 요청이 실제로 서버로 나감 (위 9-b의 "요청 없음"이 우연이 아님을 증명)', !!served.saved, served.saved ? '요청 나감' : '요청 없음 — 시험 흐름이 저장까지 못 감');
  ok('10 시공 행이 정상으로 있으면 시공비 확인창이 뜨지 않음 (불필요한 경고 방지)', !c10.confirms.some(m => /시공비|실측비/.test(m)), JSON.stringify(c10.confirms));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');
  await browser.close();
  server.kill && server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
