#!/usr/bin/env node
// tests/recent-addr-chip-filter-check.js
// ══════════════════════════════════════════════════
// 2026-10-02(선혜님 - "검색을 항상 눌러서 적은거야 그냥 적을 수가 없지" / "이거는 일반적으로
// 모두 그렇잖아" 지적으로 재조사해 발견): dah-customer-add.js의 "최근 주소" 칩이 과거에
// 저장된 주소를 클릭 한 번으로 재사용하게 해주는데, 한 번 짧게(도로명주소 없이) 저장된
// 주소가 같은 단지의 다음 고객 등록시 칩으로 다시 뜨고, 그걸 클릭하면 그 짧은 값이 그대로
// 복제·전파됨 - readOnly(직접 타이핑 차단)는 이 경로를 전혀 못 막음(타이핑이 아니라
// 프로그램적으로 값을 채우는 길이라서). 트리니원 단지에 사흘 연속 3명이 똑같이 깨진
// 패턴으로 등록된 것이 이 경로로 설명됨.
//
// 수정: 도로명주소의 필수요소(로/길, 또는 시/도 이름)가 전혀 없는 과거 주소는 애초에
// 칩 후보에서 제외 - 재전파 자체를 막음.
//
// 사용법: node tests/recent-addr-chip-filter-check.js
// ══════════════════════════════════════════════════
const { launchBrowser, startServer, loginAs } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };

(async () => {
  const port = 35000;
  const server = await startServer('/home/claude/dah-repo', port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch(e){} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({status:204, headers:{...CORS,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'*'}}); return; }
      req.respond({status:200, contentType:'application/json', headers:CORS, body:'[]'});
      return;
    }
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  // 정상주소 2건 + 깨진주소(트리니원처럼 도로명 없는) 2건을 섞어서 고객목록에 넣음
  await page.evaluate(() => {
    saveCustomers([
      { id: 901, clientName: '정상1', addr: '서울 서초구 신반포로 20 101동 101호' },
      { id: 902, clientName: '깨짐1', addr: '트리니원 111동 2304호' },
      { id: 903, clientName: '정상2', addr: '경기 과천시 별양로 11 204동 1704호' },
      { id: 904, clientName: '깨짐2', addr: '반포자이 138동 1504호' }
    ]);
  });
  await page.evaluate(() => { openAdd(null); });
  await new Promise(r => setTimeout(r, 500));

  const chips = await page.evaluate(() => Array.from(document.querySelectorAll('#add-addr-recent button')).map(b => b.title));
  console.log('최근주소 칩 후보:', JSON.stringify(chips));

  console.log('JS 에러:', jsErrors.length === 0 ? '없음' : jsErrors.join('; '));
  await browser.close(); server.kill();
  const ok = chips.includes('서울 서초구 신반포로 20 101동 101호') &&
             chips.includes('경기 과천시 별양로 11 204동 1704호') &&
             !chips.includes('트리니원 111동 2304호') &&
             !chips.includes('반포자이 138동 1504호') &&
             jsErrors.length === 0;
  console.log('\n' + (ok ? '✅ 정상주소만 칩 후보에 남고, 깨진 과거주소는 제외됨' : '❌ 문제 있음'));
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
