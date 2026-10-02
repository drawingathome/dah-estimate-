#!/usr/bin/env node
// tests/public-estimate-view-narrowed-check.js
// ══════════════════════════════════════════════════
// 2026-10-01(선혜님 - "전문가입장에서도 보라니깐 놔둬도 될 정도이니??" 지적으로 재점검):
// est-public-view.js(알림톡으로 보내는 "견적서 공개보기" 링크)가 예전엔 estimates 테이블
// 전체를 "id=eq.특정값"으로 필터링해서 요청했는데, 실제 서버 권한은 "조건 없이 전체 테이블을
// 봐도 된다"(anon, qual=true)로 열려 있어서, 계약금/잔금/내부메모까지 포함한 전체 데이터가
// anon 공개 키 하나로 통째로 긁힐 수 있는 구조였음.
//
// 수정: Postgres 함수 get_public_estimate(uuid)를 신설 - 딱 1건, 딱 필요한 6개 필드만
// 돌려주고, 테이블 전체 SELECT 정책(estimates_public_view)은 완전히 제거. 클라이언트도
// 이 함수(rpc)를 호출하도록 교체.
//
// 이 테스트는 클라이언트 코드가 실제로 새 rpc 엔드포인트를 호출하고, 화면이 정상적으로
// 렌더링되는지(기능이 안 깨졌는지)를 검증. DB 쪽 보안 검증(테이블 직접접근 차단,
// 랜덤 ID 거부, 필드 제한)은 2026-10-01 Supabase MCP로 직접 재현해 이미 확인 완료 -
// 여기서는 운영 DB 접근이 불가능한 이 로컬 테스트 환경 특성상 클라이언트 쪽 회귀만 감시.
//
// 사용법: node tests/public-estimate-view-narrowed-check.js
// ══════════════════════════════════════════════════
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 32100;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  const reqLog = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      const u = new URL(url);
      reqLog.push({ method: req.method(), path: u.pathname, body: req.postData() });
      if (u.pathname.includes('/rest/v1/rpc/get_public_estimate')) {
        const body = JSON.parse(req.postData() || '{}');
        if (body.p_id === 'test-uuid-123') {
          req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{
            customer_name: '테스트고객', phone: '010-1111-2222', staff_name: '마스터',
            install_date: '2026-10-15', estimate_status: 'final',
            line_items: [{ type: 'curtain', displayName: '테스트커튼', price: 100000, amt: '100,000원', space: '거실' }]
          }]) });
        } else {
          req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
        }
        return;
      }
      // 옛날 방식(테이블 직접 조회)으로의 회귀를 감시 - 이 경로로는 절대 요청이 안 나가야 함
      if (u.pathname.includes('/rest/v1/estimates') && req.method() === 'GET') {
        reqLog.push({ method: 'OLD_TABLE_DIRECT_ACCESS', path: u.pathname + u.search });
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html?view=test-uuid-123`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  const rpcCall = reqLog.find(r => r.path.includes('rpc/get_public_estimate'));
  ok('1. 새 rpc 함수(get_public_estimate)를 호출함', !!rpcCall, JSON.stringify(rpcCall));

  const oldDirectAccess = reqLog.find(r => r.method === 'OLD_TABLE_DIRECT_ACCESS');
  ok('2. [회귀감시] 옛날 방식(테이블 전체 직접 GET 조회)으로는 절대 안 돌아감', !oldDirectAccess, JSON.stringify(oldDirectAccess));

  const nameShown = await page.evaluate(() => document.getElementById('c-name')?.value);
  const phoneShown = await page.evaluate(() => document.getElementById('c-phone')?.value);
  ok('3. 화면에 고객명이 정확히 채워짐', nameShown === '테스트고객', nameShown);
  ok('4. 화면에 전화번호가 정확히 채워짐', phoneShown === '010-1111-2222', phoneShown);

  const bodyLen = await page.evaluate(() => document.getElementById('public-view-container')?.innerHTML.length || 0);
  ok('5. 공개보기 문서가 실제로 렌더링됨', bodyLen > 0, '길이=' + bodyLen);

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
