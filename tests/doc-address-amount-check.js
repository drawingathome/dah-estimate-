// tests/doc-address-amount-check.js
// 2026-10-26(N-15): 고객용 견적서 / 실측 의뢰서 / 시공 의뢰서 세 문서가 "같은 화면 데이터"로 만들어질 때
// 주소(기본+상세)·연락처·고객명·총액이 서로 같은지 확인한다. (공간 순서는 doc-space-order-check.js가 이미 시험)
// 한계: 가짜 서버·Chromium 환경의 시험이다. 실제 고객 데이터·Edge 화면 확인은 아님.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 9979;
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
  const res = await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; return !!e; };
    const found = { name: set('c-name', '시험고객'), phone: set('c-phone', '010-1234-5678'), addr: set('c-addr', '서울 서초구 반포대로 123'), addr2: set('c-addr2', '101동 1502호') };
    document.getElementById('curtain-body').innerHTML = '';
    document.getElementById('blind-body').innerHTML = '';
    ['거실', '안방'].forEach(sp => { addCurtainRow(); const tr = document.querySelector('#curtain-body tr:last-child'); tr.querySelector('.space-inp').value = sp; tr.querySelector('.mw').value = 300; calcCurtainRow(tr.querySelector('.mw')); tr.querySelector('.mh').value = 240; calcCurtainRow(tr.querySelector('.mh')); tr.querySelector('.cprice').value = 10000; calcCurtainRow(tr.querySelector('.cprice')); const dn = tr.querySelector('.c-display-name'); if (dn) dn.value = '커튼'; const fb = tr.querySelector('.c-fabric'); if (fb) fb.value = '원단A'; });
    try { if (typeof calcAll === 'function') calcAll(); else if (typeof updateSummary === 'function') updateSummary(); } catch (e) {}
    const text = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' '); };
    const cu = text(buildCustomerHTML()), me = text(buildRequestHTML('measure', '')), ins = text(buildRequestHTML('install', ''));
    const total = (document.getElementById('sum-total') || {}).textContent || '';
    return { found, cu, me, ins, total };
  });
  ok('시험 준비: 고객명·연락처·주소·상세주소 칸을 모두 찾음', Object.values(res.found).every(Boolean), JSON.stringify(res.found));
  const A = '서울 서초구 반포대로 123', D = '101동 1502호';
  ok('고객용 견적서: 기본주소+상세주소', res.cu.includes(A) && res.cu.includes(D));
  ok('실측 의뢰서: 기본주소+상세주소', res.me.includes(A) && res.me.includes(D));
  ok('시공 의뢰서: 기본주소+상세주소', res.ins.includes(A) && res.ins.includes(D));
  ok('세 문서 모두 연락처 표시', [res.cu, res.me, res.ins].every(t => t.includes('010-1234-5678') || t.includes('01012345678')));
  ok('세 문서 모두 고객명 표시', [res.cu, res.me, res.ins].every(t => t.includes('시험고객')));
  const totNum = (res.total.replace(/[^0-9]/g, '') | 0);
  ok('화면 총액이 0보다 큼(시험이 의미 있음)', totNum > 0, res.total);
  ok('고객용 견적서에 화면 총액이 그대로 표시', totNum > 0 && res.cu.replace(/,/g, '').includes(String(totNum)), res.total);
  ok('JS 에러 없음', errs.length === 0, errs.join(' | '));
  await browser.close(); server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 모두 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
