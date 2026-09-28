// tests/calc-golden-master-check.js
// ══════════════════════════════════════════════════
// 견적서 "계산" 동작 고정(골든마스터) 테스트
//
// 2026-09-28(선혜님 - "밑에 세개를 그러면 놔두는게 베스트야?" → est-product-calc.js는 버그 수정이
// 71번 중 51번 몰린 재발 버그의 중심): 계산 규칙(폭수, 금액, 블라인드 면적, 쿠폰 순차 할인,
// 천 원 절사, 계약금 비율)이 화면 읽기/쓰기와 한 함수 안에 섞여 있어서, 계산만 따로 떼어내
// 안전하게 고치려면 먼저 "지금 계산이 무엇을 하는지"를 기록해둬야 함(특성화 테스트).
// 수백 가지 입력 조합을 실제 화면(DOM)을 통해 돌려서 결과를 기록하고, 이후 코드 구조를 바꿔도
// 기록이 글자 하나까지 같은지 비교함. 저장 동작 기록은 tests/save-golden-master-check.js.
//
// 사용법
//   node tests/calc-golden-master-check.js            → 기록(tests/golden/calc-flow.json)과 비교
//   node tests/calc-golden-master-check.js --update   → 의도적으로 계산을 바꿨을 때만: 기록 갱신
// ══════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const GOLDEN = path.join(__dirname, 'golden', 'calc-flow.json');
const UPDATE = process.argv.includes('--update');
const CORS = { 'Access-Control-Allow-Origin': '*' };

function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach(k => { o[k] = canon(v[k]); }); return o; }
  return v;
}

// 브라우저 안에서 실행되는 시나리오 러너(문자열로 넘김)
const RUNNER = `(() => {
  const T = (id) => { const e = document.getElementById(id); return e ? e.textContent.trim() : null; };
  const V = (id) => { const e = document.getElementById(id); return e ? e.value : null; };
  function resetAll() {
    ['#curtain-body', '#blind-body', '#other-body', '#svc-body'].forEach(sel => document.querySelectorAll(sel + ' tr').forEach(r => r.remove()));
    document.querySelectorAll('.coupon-check').forEach(c => c.remove());
    const d = document.getElementById('discount'); if (d) d.value = '';
    const dt = document.getElementById('discount-type'); if (dt) dt.value = 'won';
    const dep = document.getElementById('deposit-input');
    if (dep) { dep.value = ''; dep.removeAttribute('data-raw'); dep.removeAttribute('data-deposit-source'); }
    window._estEditState = window._estEditState || {};
  }
  function totals() {
    const dep = document.getElementById('deposit-input');
    return [T('sum-curtain'), T('sum-svc'), T('sum-discount'), T('sum-total'), T('sum-perf'), T('sum-deposit-disp'), T('sum-balance-disp'), T('sum-balance'),
      dep ? dep.value : null, (document.getElementById('discount-breakdown') || {}).textContent,
      JSON.stringify(window._estEditState.lastDiscountBreakdown), JSON.stringify(window._estEditState.lastAppliedDiscounts)].join('|');
  }
  function svcRows() {
    return Array.from(document.querySelectorAll('#svc-body tr')).map(tr => [
      (tr.querySelector('.scontent') || tr.querySelector('input[type=text]') || {}).value,
      (tr.querySelector('.sprice') || {}).value, (tr.querySelector('.sqty') || {}).value].join('/')).join(';');
  }
  const setV = (tr, sel, v) => { const e = tr.querySelector(sel); if (e) e.value = v; return e; };
  const out = {};
  out.meta = { locale: Intl.DateTimeFormat().resolvedOptions().locale, sample: (1234567).toLocaleString() };

  // A. 커튼: 가로 × 주름형태 × 세로 × 단가
  out.curtain = {};
  for (const mw of [0, 50, 100, 130, 150, 200, 261, 300, 345, 400, 520])
    for (const pleat of ['민자형', '나비주름형'])
      for (const mh of [0, 240, 250, 270, 290])
        for (const price of [0, 45000, 123456]) {
          resetAll(); addCurtainRow();
          const tr = document.querySelector('#curtain-body tr');
          setV(tr, '.pleat-type', pleat); setV(tr, '.mw', mw); setV(tr, '.mh', mh); setV(tr, '.cprice', price);
          calcCurtainRow(tr.querySelector('.mw'));
          const warn = tr.querySelector('.height-fee-warn');
          out.curtain[[mw, pleat, mh, price].join('|')] = [
            (tr.querySelector('.pnum') || {}).value, (tr.querySelector('.camt') || {}).textContent,
            warn ? warn.textContent + '@' + warn.style.display : 'none', svcRows(), totals()].join(' ## ');
        }
  // A2. 폭수를 직접 고친 뒤(수동) 다른 값을 바꾸면 다시 자동으로 돌아오는지
  out.curtainManual = {};
  for (const manual of [1, 3, 6, 9]) {
    resetAll(); addCurtainRow();
    const tr = document.querySelector('#curtain-body tr');
    setV(tr, '.pleat-type', '나비주름형'); setV(tr, '.mw', 300); setV(tr, '.mh', 240); setV(tr, '.cprice', 45000);
    calcCurtainRow(tr.querySelector('.mw'));
    const a = tr.querySelector('.pnum').value;
    setV(tr, '.pnum', manual); calcCurtainRow(tr.querySelector('.pnum'));
    const b = [tr.querySelector('.pnum').value, tr.querySelector('.camt').textContent, totals()].join(' ## ');
    calcCurtainRow(tr.querySelector('.cprice'));   // 단가만 바꿔도 수동값 유지
    const c = tr.querySelector('.pnum').value;
    setV(tr, '.mw', 310); calcCurtainRow(tr.querySelector('.mw')); // 가로를 바꾸면 자동계산으로 복귀
    out.curtainManual['manual' + manual] = [a, b, c, tr.querySelector('.pnum').value, tr.querySelector('.camt').textContent].join(' ## ');
  }

  // C. 블라인드: 종류 × 가로 × 세로 × 단가
  out.blind = {};
  resetAll(); addBlindRow();
  const kinds = Array.from(document.querySelector('#blind-body tr .blind-kind').options).map(o => o.value);
  out.meta.blindKinds = kinds.join(',');
  for (const kind of kinds)
    for (const bw of [0, 30, 60, 100, 150, 200, 201, 250])
      for (const bh of [0, 40, 100, 200, 260])
        for (const price of [0, 35000, 87654]) {
          resetAll(); addBlindRow();
          const tr = document.querySelector('#blind-body tr');
          setV(tr, '.blind-kind', kind); setV(tr, '.bmw', bw); setV(tr, '.bmh', bh); setV(tr, '.blind-price', price);
          calcBlindRow(tr.querySelector('.bmw'));
          const warn = tr.querySelector('.blind-wide-warn');
          out.blind[[kind, bw, bh, price].join('|')] = [
            (tr.querySelector('.bsqm') || {}).textContent, (tr.querySelector('.bamt') || {}).textContent,
            warn ? warn.style.display : 'none', svcRows(), totals()].join(' ## ');
        }

  // B2. 커튼 폭수 전 구간 훑기: 가로 100~600cm를 1cm씩 × 주름형태 (허용 소수점 같은 "경계" 규칙을 우연에 맡기지 않고 전부 확인)
  out.curtainSweep = {};
  for (const pleat of ['민자형', '나비주름형'])
    for (let mw = 100; mw <= 600; mw++) {
      resetAll(); addCurtainRow();
      const tr = document.querySelector('#curtain-body tr');
      setV(tr, '.pleat-type', pleat); setV(tr, '.mw', mw); setV(tr, '.mh', 240); setV(tr, '.cprice', 10000);
      calcCurtainRow(tr.querySelector('.mw'));
      out.curtainSweep[pleat + '|' + mw] = tr.querySelector('.pnum').value + '/' + tr.querySelector('.camt').textContent;
    }
  // C2. 블라인드 면적 촘촘히: 최소면적이 다른 두 종류(롤스크린 2.0 / 알루미늄 1.5) × 가로 20~260(10단위) × 세로 20~260(10단위)
  out.blindSweep = {};
  for (const kind of ['롤스크린', '알루미늄'])
    for (let bw = 20; bw <= 260; bw += 10)
      for (let bh = 20; bh <= 260; bh += 10) {
        resetAll(); addBlindRow();
        const tr = document.querySelector('#blind-body tr');
        setV(tr, '.blind-kind', kind); setV(tr, '.bmw', bw); setV(tr, '.bmh', bh); setV(tr, '.blind-price', 12345);
        calcBlindRow(tr.querySelector('.bmw'));
        out.blindSweep[kind + '|' + bw + '|' + bh] = tr.querySelector('.bsqm').textContent + '/' + tr.querySelector('.bamt').textContent + '/' + T('sum-total');
      }

  // D. 기타품목 / 서비스 행
  out.other = {}; out.svc = {};
  for (const price of [0, 5000, 33333]) for (const qty of [0, 1, 3]) {
    resetAll(); addOtherItemRow();
    const tr = document.querySelector('#other-body tr');
    setV(tr, '.other-price', price); setV(tr, '.other-qty', qty); calcOtherItemRow(tr.querySelector('.other-price'));
    out.other[price + '|' + qty] = [(tr.querySelector('[class*=amt]') || {}).textContent, totals()].join(' ## ');
    resetAll(); addSvcRow();
    const sr = document.querySelector('#svc-body tr');
    setV(sr, '.sprice', price); setV(sr, '.sqty', qty); calcSvcRow(sr.querySelector('.sprice'));
    out.svc[price + '|' + qty] = [svcRows(), totals()].join(' ## ');
  }

  // E. 할인: 기준금액 × 서비스비 × 쿠폰조합 × 직접입력
  out.discount = {};
  const couponSets = { none: [], won30000: [['won', 30000]], pct10: [['pct', 10]], won50000_pct5: [['won', 50000], ['pct', 5]], pct10_pct5: [['pct', 10], ['pct', 5]], pct5_won50000: [['pct', 5], ['won', 50000]], won999999: [['won', 999999]] };
  const manuals = { none: ['won', ''], won20000: ['won', '20000'], pct7: ['pct', '7'], pct100: ['pct', '100'] };
  for (const base of [0, 1, 7, 333, 999, 1000, 1001, 12345, 89999, 100001, 654321, 1234567, 10000000])
    for (const svc of [0, 150000])
      for (const [cn, cs] of Object.entries(couponSets))
        for (const [mn, mv] of Object.entries(manuals)) {
          resetAll();
          addOtherItemRow(); const tr = document.querySelector('#other-body tr'); setV(tr, '.other-price', base); setV(tr, '.other-qty', 1);
          if (svc) { addSvcRow(); const sr = document.querySelector('#svc-body tr'); setV(sr, '.sprice', svc); setV(sr, '.sqty', 1); }
          cs.forEach((c, i) => {
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'coupon-check'; cb.checked = true;
            cb.dataset.type = c[0]; cb.dataset.value = String(c[1]); cb.dataset.name = '쿠폰' + i; cb.dataset.id = 'c' + i; document.body.appendChild(cb);
          });
          document.getElementById('discount-type').value = mv[0]; document.getElementById('discount').value = mv[1];
          calcTotal();
          out.discount[[base, svc, cn, mn].join('|')] = totals();
        }

  // F. 계약금 비율(커튼/블라인드가 있으면 50%, 없으면 100%) + 직접 정한 계약금은 안 덮어쓰는지
  out.deposit = {};
  for (const kind of ['curtain', 'blind', 'other', 'svc'])
    for (const depSource of ['none', 'real'])
      for (const total of [0, 500000, 1234567]) {
        resetAll();
        if (kind === 'curtain') { addCurtainRow(); const tr = document.querySelector('#curtain-body tr'); setV(tr, '.pleat-type', '민자형'); setV(tr, '.mw', 130); setV(tr, '.mh', 240); setV(tr, '.cprice', total); calcCurtainRow(tr.querySelector('.mw')); }
        if (kind === 'blind') { addBlindRow(); const tr = document.querySelector('#blind-body tr'); setV(tr, '.bmw', 100); setV(tr, '.bmh', 100); setV(tr, '.blind-price', total); calcBlindRow(tr.querySelector('.bmw')); }
        if (kind === 'other') { addOtherItemRow(); const tr = document.querySelector('#other-body tr'); setV(tr, '.other-price', total); setV(tr, '.other-qty', 1); calcOtherItemRow(tr.querySelector('.other-price')); }
        if (kind === 'svc') { addSvcRow(); const sr = document.querySelector('#svc-body tr'); setV(sr, '.sprice', total); setV(sr, '.sqty', 1); calcSvcRow(sr.querySelector('.sprice')); }
        const dep = document.getElementById('deposit-input');
        if (depSource === 'real') { dep.value = '77,000'; dep.dataset.raw = '77000'; dep.dataset.depositSource = 'real'; calcTotal(); }
        out.deposit[[kind, depSource, total].join('|')] = totals();
      }
  return out;
})()`;

function short(x, n = 130) { const t = typeof x === 'string' ? x : JSON.stringify(x); return (t === undefined ? 'undefined' : t).slice(0, n); }
function explainDiff(g, r) {
  const out = [];
  new Set([...Object.keys(g), ...Object.keys(r)]).forEach(group => {
    const gg = g[group], rr = r[group];
    if (JSON.stringify(gg) === JSON.stringify(rr)) return;
    if (gg && rr && typeof gg === 'object' && typeof rr === 'object') {
      const keys = new Set([...Object.keys(gg), ...Object.keys(rr)]);
      const bad = [...keys].filter(k => JSON.stringify(gg[k]) !== JSON.stringify(rr[k]));
      out.push(group + ': ' + bad.length + '개 조합이 다름(전체 ' + keys.size + '개)');
      bad.slice(0, 3).forEach(k => {
        const a = String(gg[k]), b = String(rr[k]);
        const pa = a.split(' ## '), pb = b.split(' ## ');
        let idx = 0; while (idx < Math.max(pa.length, pb.length) && pa[idx] === pb[idx]) idx++;
        out.push('   [' + k + '] ' + (idx < Math.max(pa.length, pb.length) ? (idx + 1) + '번째 항목 기록: ' + short(pa[idx], 110) + ' → 지금: ' + short(pb[idx], 110) : '개수 다름 기록 ' + Object.keys(gg).length + ' / 지금 ' + Object.keys(rr).length));
      });
    } else out.push(group + ' 다름 | 기록: ' + short(gg) + ' | 지금: ' + short(rr));
  });
  return out;
}

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 29400;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url(); const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/auth/v1/token')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_in: 3600, user: { id: 'u', email: 'a@b.c' } }) }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
  });
  await page.setViewport({ width: 1280, height: 1600 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 900));
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 600));
  const result = canon(await page.evaluate(RUNNER));
  await browser.close(); server.kill();
  const counts = Object.fromEntries(Object.entries(result).map(([k, v]) => [k, Object.keys(v).length]));
  console.log('  · 기록한 조합 수:', JSON.stringify(counts), '/ JS에러', jsErrors.length);
  if (jsErrors.length) { console.log('❌ 화면에서 JS 에러 발생:', jsErrors.slice(0, 3).join(' | ')); process.exit(1); }

  if (UPDATE) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, JSON.stringify(result, null, 1));
    console.log('✅ 기록 갱신: ' + GOLDEN + ' (' + Math.round(fs.statSync(GOLDEN).size / 1024) + 'KB)');
    process.exit(0);
  }
  if (!fs.existsSync(GOLDEN)) { console.log('❌ 기록 파일이 없어요. 먼저 --update로 만드세요.'); process.exit(1); }
  const golden = canon(JSON.parse(fs.readFileSync(GOLDEN, 'utf-8')));
  if (JSON.stringify(golden) === JSON.stringify(result)) {
    console.log('✅ 전체 통과(계산 결과 ' + Object.values(counts).reduce((a, b) => a + b, 0) + '개 조합이 기록과 완전히 동일)');
    process.exit(0);
  }
  console.log('❌ 계산 결과가 기록과 다름');
  explainDiff(golden, result).slice(0, 24).forEach(l => console.log('     Δ ' + l));
  console.log('\n❌ 의도한 계산 변경이면 --update, 아니면 코드를 되돌리세요');
  process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
