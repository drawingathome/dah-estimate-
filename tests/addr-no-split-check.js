#!/usr/bin/env node
// tests/addr-no-split-check.js
// ══════════════════════════════════════════════════
// 2026-10-01(선혜님 - 이민선 고객 사례 "실제 도로명주소를 넣었는데 상세주소만
// 저렇게 보이는거야"): 고객/설문 데이터를 불러와 c-addr에 채우는 "이미 합쳐진
// 텍스트를 정규식으로 추측해서 쪼갠다"는 방식(splitAddrDetail)이 2026-09-22에
// 이미 "세 번 재발한 근본 원인"으로 결론나서 고객 추가 화면은 다른 방식으로
// 바꿨는데, 이 함수를 쓰던 나머지 4곳(est-customer-load.js, est-survey.js,
// dah-estimate.html 2곳)이 그대로 남아 네 번째로 재발함 - 아파트 단지명 등
// 패턴에 안 맞는 주소를 만나면 도로명주소가 통째로 사라지는 정보손실이 있었음.
//
// 해결: 쪼개려는 시도 자체를 없애고, 전체 주소 문자열을 그대로 c-addr에 넣음
// (정보 손실 없음이 항상 더 안전). splitAddrDetail 함수 자체도 완전히 제거함.
//
// 이 테스트는 (1) splitAddrDetail이 더 이상 존재하지 않는지, (2) 패턴에 안
// 맞는 특이 주소(아파트 단지명+숫자-숫자 등)를 고객 불러오기로 넣었을 때
// 한 글자도 안 잘리고 c-addr에 전체가 그대로 들어가는지를 검증.
//
// 사용법: node tests/addr-no-split-check.js
// ══════════════════════════════════════════════════
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };

const log = [];
function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9938;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.setRequestInterception(true);
  const weirdAddr = '서울 서초구 신반포로 20 트리니원 112-1804'; // 2026-09-22 주석에 등장한 "패턴에 안 맞던" 실사례
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      const u = new URL(url);
      if (u.pathname.includes('/rest/v1/customers')) {
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 501, client_name: '이민선', phone: '010-4493-3135', addr: weirdAddr, updated_at: new Date().toISOString() }]) });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html?loadCustId=501`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900));
  await setupValidSession(page);
  await new Promise(r => setTimeout(r, 900));

  const hasFn = await page.evaluate(() => typeof splitAddrDetail);
  ok('1. splitAddrDetail 함수 자체가 완전히 제거됨(다시는 호출처가 안 생기도록)', hasFn === 'undefined', '타입=' + hasFn);

  const addrVal = await page.evaluate(() => document.getElementById('c-addr')?.value);
  ok('2. 패턴에 안 맞는 특이 주소도 한 글자도 안 잘리고 전체가 그대로 c-addr에 들어감', addrVal === weirdAddr, JSON.stringify(addrVal));

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
