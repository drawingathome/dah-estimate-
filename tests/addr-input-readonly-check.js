#!/usr/bin/env node
// tests/addr-input-readonly-check.js
// ══════════════════════════════════════════════════
// 2026-10-02(선혜님 - 김현정 고객 사례 "주소 왜 여전히 안되냐 너 확인한거 맞다면서!!"):
// 2026-10-01에 "주소 상세분리 문제"의 근본원인을 견적서가 고객 정보를 "불러올 때" 정규식으로
// 쪼개던 로직(splitAddrDetail)으로 지목하고 제거했는데, 실제 DB로 직접 재현하니 그 수정 배포
// *이후*에 새로 생성된 고객(김현정, 10/2 새벽)도 똑같이 "반포자이 138동 1504호"처럼 도로명주소
// 없이 저장돼 있었음 - 즉 "불러오기 때 쪼개짐"은 추측이었고, 진짜 원인은 "저장하는 단계" 자체에
// 있었음이 뒤늦게 DB 실측으로 드러남.
//
// 실제 원인: dah-estimate.html(견적서 앱)의 주소 입력칸(c-addr)은 대시보드 고객추가 모달의
// 주소칸(add-addr, readOnly + 클릭시 자동 주소검색)과 달리 readOnly가 아니어서, 직원이 "검색"
// 버튼을 누르지 않고 직접 자유 텍스트("반포자이 138동 1504호" 같은, 정식 도로명주소가 아닌
// 형태)를 타이핑할 수 있었음 - 애초에 올바른 형식의 주소가 입력될 기회 자체가 없었던 것.
//
// 수정: c-addr을 readOnly로 바꾸고, 클릭하면 자동으로 카카오 주소검색이 열리게 함(대시보드
// 고객추가 모달과 동일한 방식으로 통일) - 직접 타이핑으로 자유 텍스트를 입력할 길 자체를 막음.
//
// 사용법: node tests/addr-input-readonly-check.js
// ══════════════════════════════════════════════════
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 13100;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.includes('daumcdn.net')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  const isReadonly = await page.evaluate(() => document.getElementById('c-addr').readOnly);
  ok('1. c-addr이 readOnly임(대시보드 고객추가 모달과 동일하게)', isReadonly === true, 'readOnly=' + isReadonly);

  await page.focus('#c-addr');
  await page.keyboard.type('직접입력시도_반포자이138동1504호');
  const valueAfterTyping = await page.evaluate(() => document.getElementById('c-addr').value);
  ok('2. [핵심] readOnly라서 직접 타이핑으로 자유 텍스트를 입력할 수 없음', valueAfterTyping === '', JSON.stringify(valueAfterTyping));

  const calledOpenKakao = await page.evaluate(() => {
    window.__called = false;
    const orig = window.openKakaoAddr;
    window.openKakaoAddr = function (...args) { window.__called = true; return orig.apply(this, args); };
    document.getElementById('c-addr').click();
    return new Promise(r => setTimeout(() => r(window.__called), 300));
  });
  ok('3. 주소칸 클릭시 카카오 주소검색(openKakaoAddr)이 자동으로 연결됨', calledOpenKakao === true);

  // 프로그램적으로 값을 세팅하는 기존 "불러오기" 경로는 readOnly와 무관하게 여전히 작동해야 함
  const programmaticSet = await page.evaluate(() => {
    document.getElementById('c-addr').value = '서울 서초구 신반포로 20';
    return document.getElementById('c-addr').value;
  });
  ok('4. [회귀감시] readOnly라도 JS가 값을 세팅하는 기존 불러오기 경로는 그대로 작동함', programmaticSet === '서울 서초구 신반포로 20', programmaticSet);

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
