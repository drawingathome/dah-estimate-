// tests/customer-doc-svc-lines-sum-check.js
// 2026-10-20(윤세현 사례): 고객용 견적서의 "시공 자재/서비스" 줄들의 합이 화면의 시공 소계와 항상 같아야 함.
// 예전엔 "내용" 칸이 빈 줄(금액만 있는 부자재·시공추가비)이 고객용 문서에서 통째로 빠졌음.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 9967;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(); if (u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) req.continue(); else if (u.includes('supabase.co')) { const h = { 'Access-Control-Allow-Origin': '*' }; if (req.method() === 'OPTIONS') req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } }); else req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' }); } else req.abort(); });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(() => {
    document.getElementById('svc-body').innerHTML = '';
    const rows = [
      ['실측비', '', '서울 실측비', 40000, 1], ['시공비', '', '서울 시공비', 50000, 1], ['시공비', '', '블라인드 시공비 (45개)', 10000, 45],
      ['레일', '1층 주방', '조절레일(타공형) 12자', 1600, 12], ['전동', '거실', '전동모터', 650000, 2],
      // 내용이 빈 줄 3개(윤세현 실제 모양): 금액만 있음
      ['부자재', '현장 아시바', '', 500000, 1], ['부자재', '옵션 추가비', '', 320000, 1], ['시공비', '전동+시공추가비', '', 1000000, 1]
    ];
    rows.forEach(x => {
      addSvcRow();
      const tr = document.querySelector('#svc-body tr:last-child');
      tr.querySelector('.svc-kind').value = x[0];
      tr.querySelector('.svc-space').value = x[1];
      tr.querySelector('.svc-content').value = x[2];
      tr.querySelector('.sprice').value = x[3].toLocaleString(); tr.querySelector('.sprice').setAttribute('data-raw', String(x[3]));
      tr.querySelector('.sqty').value = String(x[4]);
      calcSvcRow(tr.querySelector('.sprice'));
    });
    const total = rows.reduce((s, x) => s + x[3] * x[4], 0);
    const html = buildCustomerHTML();
    const t = document.createElement('div'); t.innerHTML = html;
    const tables = [...t.querySelectorAll('table.pv-prod-table')];
    const svcT = tables.find(tb => /실측 \+ 시공비|레일|전동 및 부자재|기타 옵션/.test(tb.textContent) && /품목/.test(tb.textContent) && !/제품/.test(tb.querySelector('thead') ? tb.querySelector('thead').textContent : ''));
    const lines = svcT ? [...svcT.querySelectorAll('tbody tr')].map(tr => [tr.children[0].textContent.trim(), parseInt(tr.children[1].textContent.replace(/[^0-9]/g, ''), 10) || 0]) : [];
    return { total, lines, sum: lines.reduce((s, l) => s + l[1], 0) };
  });
  let fail = 0;
  const check = (l, c, d) => { if (c) console.log('✅ ' + l); else { console.log('❌ ' + l + ' — ' + JSON.stringify(d)); fail++; } };
  check('고객용 문서 시공 줄들의 합 = 시공 항목 전체 합계', r.lines.length > 0 && r.sum === r.total, r);
  const mi = r.lines.find(l => l[0] === '실측 + 시공비');
  check('내용 없이 추가한 시공비 100만원이 "실측 + 시공비"에 포함(40,000+50,000+450,000+1,000,000)', mi && mi[1] === 1540000, r.lines);
  const mo = r.lines.find(l => l[0] === '전동 및 부자재');
  check('내용 없는 부자재 82만원이 "전동 및 부자재"(전동 130만원 + 82만원)에 포함', mo && mo[1] === 2120000, r.lines);
  check('자바스크립트 오류 없음', errs.length === 0, errs);
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
