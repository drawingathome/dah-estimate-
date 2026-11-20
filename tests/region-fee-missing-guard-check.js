// tests/region-fee-missing-guard-check.js
// 2026-11-20(N-195, 선혜님 '오월 실장님' 건): 지역은 서울인데 실측비·시공비 행이 빠진 견적이 경고 없이 저장됨.
// 원인(증거: 저장 관측 기록 save_receipts) — 저장 때의 '실측비·시공비 행 없음' 경고가, 블라인드/레일 '시공비' 행을 지역 행으로 잘못 세어 꺼져 있었음.
// 검증(고치기 전엔 실패해야 하는 시험 — 되돌려보기 대상):
//   1 지역 서울 + 블라인드 6개: 지역 행(실측 40,000·시공 50,000)이 있고 경고 없음(회귀 방지)
//   2 지역 행만 지우면(블라인드 시공비 행은 남음) 빠짐으로 판정 + 화면에 경고와 '자동으로 넣기' 버튼  ← 옛 코드는 빠짐을 못 잡음
//   3 '자동으로 넣기' 누르면 실측 40,000·시공 50,000 행이 다시 생기고 경고가 사라지며 합계가 맞음
//   4 직접 넣은 시공비 행(레일만 시공 등)은 지역 행으로 인정(거짓 경고 없음)
//   5 지역을 비우면(시공 안 함) 경고 없음
//   6 저장 관측 요약(estSvcState)의 has_fee_row가 블라인드 시공비 행만 있을 때 false
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 9983;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const errs = [];
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(); if (u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) req.continue(); else if (u.includes('supabase.co')) { const h = { 'Access-Control-Allow-Origin': '*' }; if (req.method() === 'OPTIONS') req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } }); else req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' }); } else req.abort(); });
  await page.setViewport({ width: 1280, height: 1600 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 800));
  const w = ms => new Promise(r => setTimeout(r, ms));
  let fail = 0;
  const check = (l, c, d) => { if (c) console.log('✅ ' + l); else { console.log('❌ ' + l + ' — ' + JSON.stringify(d)); fail++; } };
  const state = () => page.evaluate(() => ({
    rows: [...document.querySelectorAll('#svc-body tr')].map(t => (t.getAttribute('data-svc-type') || (t.hasAttribute('data-rail-src') ? 'rail' : t.hasAttribute('data-railcost-src') ? 'railcost' : '수동')) + '=' + (t.querySelector('.sprice')?.getAttribute('data-raw') || t.querySelector('.sprice')?.value)),
    missing: estMissingInstallRows(),
    hint: document.getElementById('region-hint').textContent,
    btn: !!document.getElementById('region-fee-readd'),
    hasFee: estSvcState().has_fee_row,
    total: (document.getElementById('sum-svc')?.textContent || '').replace(/[^0-9]/g, '')
  }));
  await page.evaluate(() => {
    document.getElementById('blind-body').innerHTML = '';
    for (let i = 0; i < 6; i++) { addBlindRow(); const t = document.querySelector('#blind-body tr:last-child'); t.querySelector('.blind-kind').value = '알루미늄'; t.querySelector('.bmw').value = '100'; t.querySelector('.bmh').value = '200'; const p = t.querySelector('.blind-price'); p.value = '88000'; p.setAttribute('data-raw', '88000'); calcBlindRow(p); }
    const el = document.getElementById('c-region'); el.value = '서울'; el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await w(400);
  let s = await state();
  check('1 지역 서울 + 블라인드 6개: 지역 행이 있고 경고 없음', s.rows.includes('실측비=40000') && s.rows.includes('시공비=50000') && !s.missing && !s.btn && s.hasFee, s);
  // 지역 행만 삭제 (블라인드 시공비 행은 남김)
  await page.evaluate(() => { document.querySelectorAll('#svc-body tr[data-svc-type="실측비"], #svc-body tr[data-svc-type="시공비"]').forEach(tr => delSvcRow(tr.querySelector('button') || tr.firstElementChild)); });
  await w(300);
  s = await state();
  check('2 지역 행만 지우면 빠짐으로 판정 + 화면 경고·버튼', s.rows.length === 1 && s.missing === true && s.btn && /빠져/.test(s.hint), s);
  check('6 블라인드 시공비 행만 있으면 저장 관측 has_fee_row=false', s.hasFee === false, s);
  await page.evaluate(() => document.getElementById('region-fee-readd').click());
  await w(400);
  s = await state();
  check('3 자동으로 넣기: 실측 40,000·시공 50,000 복구, 경고 사라짐, 합계 150,000', s.rows.includes('실측비=40000') && s.rows.includes('시공비=50000') && !s.missing && !s.btn && /실측 40,000원/.test(s.hint) && s.total === '150000', s);
  // 4 직접 넣은 시공비 행은 지역 행으로 인정
  await page.evaluate(() => { document.querySelectorAll('#svc-body tr[data-svc-type="실측비"], #svc-body tr[data-svc-type="시공비"]').forEach(tr => delSvcRow(tr.querySelector('button') || tr.firstElementChild)); addSvcRow(); const tr = document.querySelector('#svc-body tr:last-child'); tr.querySelector('.svc-kind').value = '시공비'; tr.querySelector('.svc-content').value = '직접 입력 시공비'; const p = tr.querySelector('.sprice'); p.value = '50000'; p.setAttribute('data-raw', '50000'); calcSvcRow(p); });
  await w(300);
  s = await state();
  check('4 직접 넣은 시공비 행은 인정(거짓 경고 없음)', !s.missing && !s.btn, s);
  await page.evaluate(() => { const el = document.getElementById('c-region'); el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await w(300);
  s = await state();
  check('5 지역을 비우면(시공 안 함) 경고 없음', !s.missing && !s.btn, s);
  check('자바스크립트 오류 없음', errs.length === 0, errs);
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
