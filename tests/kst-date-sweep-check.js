// tests/kst-date-sweep-check.js
// 2026-11-20(N-198, 선혜님 '발주서는 절대 오류가 있으면 안돼서 깐깐하게 찾아봐'): 11-12(N-137 ⑩)에는 발주일·도착일만 한국시간으로 고쳤고,
// 같은 방식(new Date().toISOString().slice(0,10) = 세계표준시 날짜)을 쓰는 곳이 남아 있었음. 한국시간 0~9시에는 하루 전 날짜가 찍힘.
//   1 (동작) 시계를 한국시간 2026-11-20 00:30(=세계표준 11-19 15:30)으로 고정하고 '새 견적서'를 열면 견적일이 2026-11-20  ← 옛 코드는 2026-11-19
//   2 (가드) 소스에 'toISOString().slice(0,10)'(세계표준시 날짜 자르기)가 허용 목록 밖에 없음 — 새로 생기면 실패(같은 실수 재발 방지)
// 허용 목록: 세계표준시끼리 비교라 맞는 곳(dash-customer-alim.js 저장일 비교), 한국시간 계산 도우미가 있는 곳의 대체 경로(dash-refund.js).
const fs = require('fs');
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
(async () => {
  const dir = path.resolve(__dirname, '..');
  let fail = 0;
  const check = (l, c, d) => { if (c) console.log('✅ ' + l); else { console.log('❌ ' + l + ' — ' + JSON.stringify(d)); fail++; } };
  // 2 (가드)
  const ALLOWED = [
    { file: 'dash-customer-alim.js', why: '저장일(updated_at 앞 10자, 세계표준시)과 같은 기준으로 비교' },
    { file: 'dash-customer-estimates.js', why: '+9시간 보정 후 자르는 한국시간 변환(estSavedDateKst)' },
    { file: 'dash-refund.js', why: 'todayStr() 도우미가 없을 때만 쓰는 대체 경로' }
  ];
  const offenders = [];
  fs.readdirSync(dir).filter(f => /^(est|dash|shared)-.*\.js$/.test(f)).forEach(f => {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      if (/toISOString\(\)\.slice\(\s*0\s*,\s*10\s*\)/.test(line) && !/^\s*\/\//.test(line) && !ALLOWED.some(a => a.file === f)) offenders.push(f + ':' + (i + 1));
    });
  });
  check('2 세계표준시 날짜 자르기(toISOString().slice(0,10))가 허용 목록 밖에 없음', offenders.length === 0, offenders);
  // 1 (동작)
  const port = 9990;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const errs = [];
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.evaluateOnNewDocument(() => {
    const RealDate = Date; const fixed = new RealDate('2026-11-19T15:30:00Z').getTime();
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(fixed); else super(...a); } static now() { return fixed; } }
    // @ts-ignore
    window.Date = FakeDate;
  });
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(); if (u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) req.continue(); else if (u.includes('supabase.co')) { const h = { 'Access-Control-Allow-Origin': '*' }; if (req.method() === 'OPTIONS') req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } }); else req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' }); } else req.abort(); });
  await page.setViewport({ width: 1280, height: 1600 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const w = ms => new Promise(r => setTimeout(r, ms));
  await w(900); await loginAs(page, 'master'); await w(800);
  const r = await page.evaluate(() => { newEstimate(); return { cdate: document.getElementById('c-date').value, ymd: dahLocalYmd(), nowIso: new Date().toISOString() }; });
  check('1 한국시간 11-20 00:30에 새 견적서의 견적일이 2026-11-20', r.cdate === '2026-11-20' && r.ymd === '2026-11-20', r);
  check('자바스크립트 오류 없음', errs.length === 0, errs);
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
