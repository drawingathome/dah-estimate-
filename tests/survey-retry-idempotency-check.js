#!/usr/bin/env node
// tests/survey-retry-idempotency-check.js
// ══════════════════════════════════════════════════
// 2026-09-30(선혜님 - "위 버그들의 쌍둥이 함수 찾아" 요청으로 견적서(est-sync-queue.js)에서
// 고친 "재시도에 idempotency key가 없던" 문제와 정확히 같은 클래스를 survey-app.js에서도
// 발견): 설문 재시도(retryPendingSurveys)가 idempotency key 없이 payload를 그대로
// 재전송하고 있었음 - 페이지를 열 때마다 자동 재시도되는 구조(useEffect)라, 같은 기기에서
// 같은 설문 링크를 여러 탭으로 열어두면 같은 설문이 중복 제출될 위험. 또한 서버가 중복을
// 거부(409)해도 그걸 "실패"로 오판해서 재시도 큐에서 영원히 안 빠지는 문제도 함께 있었음.
//
// 수정: 제출(submit) 시점에 client_idempotency_key를 payload에 포함(재시도는 이 payload를
// 그대로 재사용하므로 자동으로 같은 키 유지), 409 응답을 "이미 저장됨"으로 정상 처리,
// 같은 탭 안에서 재시도 함수가 겹쳐 실행되지 않도록 진행중 플래그 추가.
//
// 이 테스트는 "같은 기기의 두 탭에서 동시에 재시도가 걸려도 실제로 1건만 저장되고 양쪽
// 큐가 정상적으로 비워지는지"를 검증. 발견시 주의: 가짜 서버의 중복판정 로직에
// client_idempotency_key가 없는(undefined) 경우를 "중복"으로 섞어 세면 안 됨(실제 DB의
// UNIQUE 제약은 NULL끼리 중복으로 안 쳐줌) - 반드시 값이 있을 때만 비교할 것.
//
// 사용법: node tests/survey-retry-idempotency-check.js
// ══════════════════════════════════════════════════
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };

(async () => {
  const port = 26000;
  const server = await startServer(path.resolve(__dirname, '..'), port);
  const browser = await launchBrowser();
  let postedKeys = [];
  let dbRows = [];

  async function openTab() {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('supabase.co')) {
        if (req.method() === 'OPTIONS') { req.respond({status:204, headers:{...CORS,'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Access-Control-Allow-Headers':'*'}}); return; }
        const u = new URL(url);
        if (u.pathname.includes('/rest/v1/surveys') && req.method() === 'POST') {
          const body = JSON.parse(req.postData()||'{}');
          const dup = body.client_idempotency_key && dbRows.find(r => r.client_idempotency_key === body.client_idempotency_key);
          if (dup) { req.respond({status:409, contentType:'application/json', headers:CORS, body:'{}'}); return; }
          postedKeys.push(body.client_idempotency_key);
          dbRows.push(body);
          req.respond({status:201, contentType:'application/json', headers:CORS, body:'[]'});
          return;
        }
        req.respond({status:200, contentType:'application/json', headers:CORS, body:'[]'});
        return;
      }
      if (url.startsWith('http://localhost')) req.continue(); else req.abort();
    });
    await page.goto(`http://localhost:${port}/survey.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 800));
    return page;
  }

  // 1번째 탭: 설문 작성 후 제출(네트워크 실패 흉내 - 실제로는 성공 응답을 주되, 로컬에도 pending을 강제로 심어서 "실패했다 치고 재시도 걸리는 상황" 재현)
  const page1 = await openTab();
  await page1.evaluate(() => {
    localStorage.setItem('dah_survey_pending_v1', JSON.stringify([
      { payload: { client_name: '테스트고객', phone: '01011112222', client_idempotency_key: 'fixed-test-key-001' }, savedAt: new Date().toISOString() }
    ]));
  });

  // 2번째 탭: 같은 기기, 같은 설문 링크를 또 열어서(복사했을 때처럼) 동시에 재시도가 걸리는 상황
  const page2 = await openTab();
  await page2.evaluate(() => {
    localStorage.setItem('dah_survey_pending_v1', JSON.stringify([
      { payload: { client_name: '테스트고객', phone: '01011112222', client_idempotency_key: 'fixed-test-key-001' }, savedAt: new Date().toISOString() }
    ]));
  });

  // 두 탭에서 거의 동시에 재시도 트리거
  await Promise.all([
    page1.evaluate(() => retryPendingSurveys()),
    page2.evaluate(() => retryPendingSurveys())
  ]);
  await new Promise(r => setTimeout(r, 1500));

  console.log('실제로 서버에 저장된 횟수:', postedKeys.length, '(1이어야 정상 - 중복 제출 안 됨)');
  console.log('dbRows:', dbRows.length);

  const q1 = await page1.evaluate(() => JSON.parse(localStorage.getItem('dah_survey_pending_v1')||'[]'));
  const q2 = await page2.evaluate(() => JSON.parse(localStorage.getItem('dah_survey_pending_v1')||'[]'));
  console.log('탭1 재시도 큐 상태:', q1.length, '/ 탭2:', q2.length, '(둘 다 0이어야 정상)');

  await browser.close(); server.kill();
  const ok = postedKeys.length === 1 && dbRows.length === 1 && q1.length === 0 && q2.length === 0;
  console.log('\n' + (ok ? '✅ 두 탭 동시 재시도해도 중복 제출 안 됨' : '❌ 중복 제출 발생!'));
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
