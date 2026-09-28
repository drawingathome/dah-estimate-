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
  // G. 레일 자동 계산 (autoUpdateRail): 지역 선택 × 가로 구간 × 공간 이름
  //    (지역이 비어 있으면 레일 행을 안 만들고 기존 것도 지움). data-rail-src 등의 값(행 번호표)은 실행 순서에
  //    따라 달라져서 기록하지 않고, "있다/없다"만 기록함.
  const regionSel = document.getElementById('c-region');
  const regions = Array.from(regionSel.options).map(o => o.value);
  out.meta.regions = regions.join(',');
  function svcFull() {
    return Array.from(document.querySelectorAll('#svc-body tr')).map(tr => {
      const g = (s) => tr.querySelector(s);
      const pr = g('.sprice');
      return [tr.hasAttribute('data-rail-src') ? 'R' : '-', tr.hasAttribute('data-railcost-src') ? 'C' : '-', tr.hasAttribute('data-install-base') ? 'I' : '-', tr.dataset.manualOverride ? 'M' : '-',
        (g('.svc-kind') || {}).value, (g('.svc-space') || {}).value, (g('.svc-content') || {}).value, pr ? pr.value : null, pr ? pr.getAttribute('data-raw') : null, (g('.sqty') || {}).value].join('/');
    }).join(' ; ');
  }
  function setRegion(v) { regionSel.value = v; }
  out.rail = {};
  for (const region of regions)
    for (const mw of [0, 20, 29, 30, 31, 59, 60, 61, 90, 91, 120, 121, 150, 151, 180, 181, 200, 299, 300, 301, 400, 590, 600, 601, 700])
      for (const space of ['', '거실']) {
        resetAll(); setRegion(region); addCurtainRow();
        const tr = document.querySelector('#curtain-body tr');
        setV(tr, '.space-inp', space); setV(tr, '.pleat-type', '나비주름형'); setV(tr, '.mw', mw); setV(tr, '.mh', 240); setV(tr, '.cprice', 45000);
        calcCurtainRow(tr.querySelector('.mw'));
        out.rail[[region || '(빈)', mw, space || '(빈)'].join('|')] = [svcFull(), totals()].join(' ## ');
      }
  // G2. 가로를 바꾸면 같은 행이 갱신되는지(중복 생성 안 됨) / 수동으로 고친 단가는 유지되는지 / 지역을 비우면 지워지는지
  out.railEdit = {};
  for (const region of regions.filter(r => r !== '')) {
    resetAll(); setRegion(region); addCurtainRow();
    const tr = document.querySelector('#curtain-body tr');
    setV(tr, '.space-inp', '안방'); setV(tr, '.pleat-type', '나비주름형'); setV(tr, '.mw', 150); setV(tr, '.mh', 240); setV(tr, '.cprice', 45000);
    calcCurtainRow(tr.querySelector('.mw'));
    const s1 = svcFull();
    setV(tr, '.mw', 310); calcCurtainRow(tr.querySelector('.mw'));
    const s2 = svcFull(); const cnt2 = document.querySelectorAll('#svc-body tr').length;
    // 레일 행의 단가를 수동으로 고친 상태(manualOverride)에서 가로를 다시 바꿈
    const railRow = document.querySelector('#svc-body [data-rail-src]'); const costRow = document.querySelector('#svc-body [data-railcost-src]');
    // 진짜 사람이 단가를 입력하는 것과 같게: input 이벤트 → 화면의 oninput(fmtPrice + markSvcManualOverride)이 실행됨
    // (수량을 1로 고정하고 문구에 "✏️직접수정"을 붙이는 실제 동작까지 포함해서 기록)
    if (railRow) { const pi = railRow.querySelector('.sprice'); pi.value = '2000'; pi.dispatchEvent(new Event('input', { bubbles: true })); }
    if (costRow) { const pi = costRow.querySelector('.sprice'); pi.value = '30000'; pi.dispatchEvent(new Event('input', { bubbles: true })); }
    setV(tr, '.mw', 450); calcCurtainRow(tr.querySelector('.mw'));
    const s3 = svcFull();
    setRegion(''); calcCurtainRow(tr.querySelector('.mw'));
    out.railEdit[region] = [s1, s2, cnt2, s3, svcFull(), totals()].join(' ## ');
  }
  // G3. 커튼 두 줄(공간 다름): 줄마다 레일 행/시공비 행이 따로 생기는지, 한 줄을 지우면
  out.railMulti = {};
  for (const region of regions.filter(r => r !== '')) {
    resetAll(); setRegion(region);
    addCurtainRow(); addCurtainRow();
    const trs = document.querySelectorAll('#curtain-body tr');
    [['거실', 300], ['안방', 180]].forEach((v, i) => { setV(trs[i], '.space-inp', v[0]); setV(trs[i], '.pleat-type', '민자형'); setV(trs[i], '.mw', v[1]); setV(trs[i], '.mh', 240); setV(trs[i], '.cprice', 30000); calcCurtainRow(trs[i].querySelector('.mw')); });
    const both = svcFull();
    const delBtn = trs[0].querySelector('button[onclick*="delRow"]') || trs[0].querySelector('.del-btn') || trs[0].querySelector('button');
    if (delBtn) delRow(delBtn);
    out.railMulti[region] = [both, svcFull(), totals()].join(' ## ');
  }
  // H. 지역별 실측비/시공비 자동 추가 (autoAddSvcFee): 요금 설정(기본/직접 등록/0원) × 지역 × '기타' 금액 × 커튼·블라인드 유무
  //    (지역을 나중에 골라도 커튼 레일/블라인드 시공비가 빠지지 않아야 함 - 2026-08-14 사건)
  function svcFull2() {
    return Array.from(document.querySelectorAll('#svc-body tr')).map(tr => {
      const g = (q) => tr.querySelector(q); const pr = g('.sprice');
      return [tr.getAttribute('data-svc-type') || '-', tr.hasAttribute('data-rail-src') ? 'R' : '-', tr.hasAttribute('data-railcost-src') ? 'C' : '-',
        tr.getAttribute('data-install-base') || '-', tr.dataset.manualOverride ? 'M' : '-', (g('.svc-kind') || {}).value, (g('.svc-content') || {}).value,
        pr ? pr.value : null, pr ? pr.getAttribute('data-raw') : null, (g('.sqty') || {}).value].join('/');
    }).join(' ; ');
  }
  const regionPrice = document.getElementById('c-region-price');
  function hintState() { return [(document.getElementById('region-hint') || {}).textContent, regionPrice.style.display].join('@'); }
  function setFees(v) { if (v === null) localStorage.removeItem('dah_region_fees'); else localStorage.setItem('dah_region_fees', JSON.stringify(v)); }
  const feeSets = { 기본: null, 직접등록: { '서울': { '실측비': 45000, '시공비': 55000 } }, 서울0원: { '서울': { '실측비': 0, '시공비': 0 }, '경기': { '실측비': 70000, '시공비': 90000 } },
    // 하나만 0인 경우("시공 없음" 판단은 둘 다 0일 때만 - 단위 테스트가 먼저 잡아서 발견한 기록의 구멍)
    서울실측만0: { '서울': { '실측비': 0, '시공비': 50000 } }, 서울시공만0: { '서울': { '실측비': 40000, '시공비': 0 } } };
  out.regionFee = {};
  for (const [fn, fees] of Object.entries(feeSets))
    for (const region of ['', '서울', '경기', '기타'])
      for (const custom of ['', '0', '35000'])
        for (const withCurtain of [false, true])
          for (const withBlind of [false, true]) {
            resetAll(); setFees(fees); regionSel.value = ''; regionPrice.value = '';
            if (withCurtain) { addCurtainRow(); const tr = document.querySelector('#curtain-body tr'); setV(tr, '.space-inp', '거실'); setV(tr, '.pleat-type', '민자형'); setV(tr, '.mw', 200); setV(tr, '.mh', 240); setV(tr, '.cprice', 30000); calcCurtainRow(tr.querySelector('.mw')); }
            if (withBlind) { addBlindRow(); const tr = document.querySelector('#blind-body tr'); setV(tr, '.blind-kind', '롤스크린'); setV(tr, '.bmw', 100); setV(tr, '.bmh', 150); setV(tr, '.blind-price', 30000); calcBlindRow(tr.querySelector('.bmw')); }
            regionSel.value = region; regionPrice.value = custom; autoAddSvcFee();
            out.regionFee[[fn, region || '(빈)', custom || '(빈)', withCurtain ? '커튼' : '-', withBlind ? '블라인드' : '-'].join('|')] = [svcFull2(), hintState(), totals()].join(' ## ');
          }
  setFees(null);
  // H2. 수동으로 고친 실측비/시공비는 지역을 바꿔도 유지되는지
  out.regionFeeManual = {};
  for (const [a, b] of [['서울', '경기'], ['경기', '서울'], ['서울', '기타'], ['서울', '']]) {
    resetAll(); setFees(null); regionPrice.value = '20000';
    regionSel.value = a; autoAddSvcFee();
    const rows = document.querySelectorAll('#svc-body [data-svc-type]');
    rows.forEach((r, i) => { const pi = r.querySelector('.sprice'); pi.value = String(111000 + i * 1000); pi.dispatchEvent(new Event('input', { bubbles: true })); });
    const s1 = svcFull2();
    regionSel.value = b; autoAddSvcFee();
    out.regionFeeManual[a + '→' + b] = [s1, svcFull2(), hintState(), totals()].join(' ## ');
  }
  // H3. 지역을 계속 바꿔도 행이 쌓이지 않는지
  out.regionFeeSwitch = {};
  resetAll(); setFees(null); regionPrice.value = '30000';
  const steps = [];
  for (const r of ['서울', '경기', '기타', '', '서울', '서울', '경기']) { regionSel.value = r; autoAddSvcFee(); steps.push(r + ':' + document.querySelectorAll('#svc-body tr').length + ':' + totals().split('|')[3]); }
  out.regionFeeSwitch.steps = steps.join(' > ');
  // I. 블라인드 옵션추가금 (recalcBlindOptionExtras) + 블라인드 시공비(autoAddBlindSvc)
  //    여러 줄의 옵션추가금 합산, 옵션 이름 표시, 0원이면 행 자체가 사라지는지, 수동 수정 유지, 복사시 재계산(2026-08-28 사건)
  function svcFull3() {
    return Array.from(document.querySelectorAll('#svc-body tr')).map(tr => {
      const g = (q) => tr.querySelector(q); const pr = g('.sprice');
      return [tr.getAttribute('data-svc-type') || '-', tr.dataset.manualOverride ? 'M' : '-', (g('.svc-kind') || {}).value,
        (g('.svc-content') || {}).value, pr ? pr.value : null, (g('.sqty') || {}).value].join('/');
    }).join(' ; ');
  }
  function addBlindWith(space, extra, opt) {
    addBlindRow();
    const tr = document.querySelector('#blind-body tr:last-child');
    setV(tr, '.space-inp', space); setV(tr, '.blind-kind', '알루미늄'); setV(tr, '.bmw', 100); setV(tr, '.bmh', 100); setV(tr, '.blind-price', 20000);
    setV(tr, '.blind-extra', extra); setV(tr, '.blind-opt', opt);
    calcBlindRow(tr.querySelector('.bmw'));
    return tr;
  }
  out.blindOption = {};
  for (const region of ['', '서울'])
    for (const extras of [[0, ''], [5000, '전동'], [5000, ''], [0, '전동'], [3000, 'A'], [3000, 'A'], [3000, 'A'], [3000, 'B']])
      ; // (아래 실제 조합은 여러 줄 케이스라 별도로 구성)
  const optionCases = {
    '없음': [], '하나_전동5000': [[5000, '전동']], '문구없이_5000': [[5000, '']], '0원_문구있음': [[0, '전동']],
    '두줄_같은옵션': [[3000, 'A'], [3000, 'A']], '두줄_다른옵션': [[3000, 'A'], [2000, 'B']], '세줄_일부0원': [[3000, 'A'], [0, ''], [1000, 'B']], '0원인데_이름있음': [[3000, 'A'], [0, 'C']],
  };
  for (const region of ['', '서울'])
    for (const [caseName, rows] of Object.entries(optionCases)) {
      resetAll(); regionSel.value = region;
      rows.forEach(([extra, opt], i) => addBlindWith('공간' + i, extra, opt));
      if (rows.length === 0) { addBlindRow(); const tr = document.querySelector('#blind-body tr'); setV(tr, '.bmw', 100); setV(tr, '.bmh', 100); setV(tr, '.blind-price', 20000); calcBlindRow(tr.querySelector('.bmw')); }
      out.blindOption[[region || '(빈)', caseName].join('|')] = [svcFull3(), totals()].join(' ## ');
    }
  // I2. 옵션추가금을 수동으로 고치면 유지되는지 / 블라인드를 더 추가해도 수동값 유지되는지
  out.blindOptionManual = {};
  resetAll(); regionSel.value = '서울'; addBlindWith('거실', 5000, '전동');
  const extraRow = document.querySelector('#svc-body [data-svc-type="옵션추가금"]');
  { const pi = extraRow.querySelector('.sprice'); pi.value = '99000'; pi.dispatchEvent(new Event('input', { bubbles: true })); }
  const m1 = svcFull3();
  addBlindWith('안방', 2000, '전동');
  out.blindOptionManual.after_add = [m1, svcFull3()].join(' ## ');
  // I3. 블라인드 시공비: 개수별, 지역 없음, 수동 수정 유지, 개수가 바뀌어도 수동값은 그대로
  out.blindInstall = {};
  for (const region of ['', '서울']) for (const count of [1, 2, 3]) {
    resetAll(); regionSel.value = region;
    for (let i = 0; i < count; i++) { addBlindRow(); const tr = document.querySelector('#blind-body tr:last-child'); setV(tr, '.bmw', 100); setV(tr, '.bmh', 100); setV(tr, '.blind-price', 10000); calcBlindRow(tr.querySelector('.bmw')); }
    out.blindInstall[[region || '(빈)', count].join('|')] = [svcFull3(), totals()].join(' ## ');
  }
  resetAll(); regionSel.value = '서울'; addBlindWith('거실', 0, '');
  const installRow = document.querySelector('#svc-body [data-svc-type="블라인드시공"]');
  { const pi = installRow.querySelector('.sprice'); pi.value = '55000'; pi.dispatchEvent(new Event('input', { bubbles: true })); }
  const i1 = svcFull3();
  addBlindWith('안방', 0, '');
  out.blindInstall.manual_after_add = [i1, svcFull3()].join(' ## ');
  // I4. 블라인드 행 복사(2026-08-28 사건): 옵션추가금이 있는 행을 복사하면 합계가 2배로 반영되는지
  out.blindCopy = {};
  resetAll(); regionSel.value = '서울'; const orig = addBlindWith('거실', 4000, '전동');
  const before = svcFull3();
  const copyBtn = orig.querySelector('button[onclick*="copyBlindRow"]') || Array.from(orig.querySelectorAll('button')).find(b => (b.getAttribute('onclick') || '').includes('copy'));
  if (copyBtn) copyBlindRow(copyBtn);
  out.blindCopy.result = [before, svcFull3(), totals()].join(' ## ');
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
