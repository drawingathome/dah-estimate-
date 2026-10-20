// tests/blind-opt-numeric-auto-check.js
// 2026-10-20(윤세현 사례): 블라인드 "옵션" 칸(이름 칸)에 숫자만 넣으면 "옵션추가금"으로 자동 이동·합계 반영, 글자 옵션은 그대로 두는지.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 9968;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(); if (u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) req.continue(); else if (u.includes('supabase.co')) { const h = { 'Access-Control-Allow-Origin': '*' }; req.respond({ status: 200, headers: h, contentType: 'application/json', body: '[]' }); } else req.abort(); });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(() => {
    document.getElementById('blind-body').innerHTML = '';
    addBlindRow();
    const tr = document.querySelector('#blind-body tr:last-child');
    tr.querySelector('.blind-kind').value = '롤스크린';
    tr.querySelector('.bmw').value = '100'; tr.querySelector('.bmh').value = '200';
    const pr = tr.querySelector('.blind-price'); pr.value = '90000'; pr.setAttribute('data-raw', '90000');
    calcBlindRow(pr);
    const before = tr.querySelector('.bamt').textContent;
    const opt = tr.querySelector('.blind-opt');
    opt.value = '타공형'; opt.dispatchEvent(new Event('change', { bubbles: true }));
    const textKept = opt.value === '타공형' && !tr.querySelector('.blind-extra').value;
    opt.value = '20,000원'; opt.dispatchEvent(new Event('change', { bubbles: true }));
    const svc = [...document.querySelectorAll('#svc-body tr')].map(t => [t.querySelector('.svc-kind')?.value, t.querySelector('.svc-content')?.value, (t.querySelector('.sprice')?.getAttribute('data-raw') || t.querySelector('.sprice')?.value)]);
    // 여러 줄 + 서로 다른 표기 + 같은 줄 재입력 시 이중 가산 없음 + 합계(총액) 반영
    const totalOf = () => Number(String((document.getElementById('final-total') || document.querySelector('.grand-total, #grand-total') || {}).textContent || '').replace(/[^0-9]/g, '')) || 0;
    const t0 = totalOf();
    document.getElementById('blind-body').innerHTML = ''; document.getElementById('svc-body').innerHTML = '';
    const mk = (v) => { addBlindRow(); const t = document.querySelector('#blind-body tr:last-child'); t.querySelector('.blind-kind').value = '롤스크린'; t.querySelector('.bmw').value = '100'; t.querySelector('.bmh').value = '200'; const p = t.querySelector('.blind-price'); p.value = '90000'; p.setAttribute('data-raw', '90000'); calcBlindRow(p); const o = t.querySelector('.blind-opt'); o.value = v; o.dispatchEvent(new Event('change', { bubbles: true })); return t; };
    const t0r = totalOf();
    const a = mk('10000'), b = mk('20,000'), c2 = mk('50000원'), d = mk('타공형');
    const t1 = totalOf();
    const svc2 = [...document.querySelectorAll('#svc-body tr')].map(t => (t.querySelector('.sprice')?.getAttribute('data-raw') || t.querySelector('.sprice')?.value));
    const o2 = a.querySelector('.blind-opt'); o2.value = '30000'; o2.dispatchEvent(new Event('change', { bubbles: true }));
    const svc3 = [...document.querySelectorAll('#svc-body tr')].map(t => (t.querySelector('.sprice')?.getAttribute('data-raw') || t.querySelector('.sprice')?.value));
    const multi = { svc2, svc3, t0r, t1, dOpt: d.querySelector('.blind-opt').value, dExtra: d.querySelector('.blind-extra').value };
    return { multi, svc, before, textKept, optLeft: opt.value, extra: tr.querySelector('.blind-extra').value };
  });
  const num = s => Number(String(s).replace(/[^0-9]/g, '')) || 0;
  let fail = 0;
  const check = (l, c, d) => { if (c) console.log('✅ ' + l); else { console.log('❌ ' + l + ' — ' + JSON.stringify(d)); fail++; } };
  check('글자 옵션(타공형)은 그대로 두고 옵션추가금으로 옮기지 않음', r.textKept, r);
  check('숫자만 넣으면 옵션추가금 칸으로 이동하고 옵션 칸은 비움', r.optLeft === '' && num(r.extra) === 20000, r);
  check('시공 자재에 "옵션 추가금" 2만원 줄이 자동 생성(합계 반영)', r.svc.some(x => num(x[2]) === 20000 && x[1] === '옵션 추가금'), r);
  check('여러 줄(10000 / 20,000 / 50000원)이 합쳐 8만원 한 줄로 생성, 글자 옵션 줄은 그대로', r.multi.svc2.length === 1 && num(r.multi.svc2[0]) === 80000 && r.multi.dOpt === '타공형' && !r.multi.dExtra, r.multi);
  check('같은 줄에 숫자를 다시 넣으면 그 줄 값만 바뀜(1만→3만: 합 8만→10만, 이중 가산 없음)', r.multi.svc3.length === 1 && num(r.multi.svc3[0]) === 100000, r.multi);
  check('자바스크립트 오류 없음', errs.length === 0, errs);
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
