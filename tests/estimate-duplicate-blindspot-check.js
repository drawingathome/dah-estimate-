#!/usr/bin/env node
// tests/estimate-duplicate-blindspot-check.js
// 2026-08-26(선혜님 발견 — 김채은/유경진 견적서 중복 생성 사례)에서 시작된 회귀 테스트.
//
// 2026-09-30(선혜님 - "하자", "전문업체서는 어떻게 하니" 요청으로 방향이 완전히 반대로
// 바뀜): 위 2026-08-26 수정("오늘 이미 저장된 견적이 있으면 PATCH로 합침")이, 실제로는
// "실수로 중복 저장"과 "의도적으로 두 번째 견적서를 만드는 것"을 구분 못 해서 후자까지
// 하나로 합쳐버리는 훨씬 심각한 문제였음을 실제 재현(노지경 고객에게 견적서 4개를 연속
// 생성했더니 서버엔 항상 1개만 남는 것을 직접 확인)으로 발견 - 그 안전장치 자체를 제거함.
// "실수로 중복 저장"은 이미 client_idempotency_key + DB 유니크 제약이 더 정확하게 막고
// 있어서 이 안전장치는 애초에 불필요했음(est-sync-queue.js의 "데이터 유실보다 가끔
// 중복행이 훨씬 나은 선택" 원칙과 동일 적용).
//
// 이 테스트는 이제 정반대를 검증함: 서버에 "오늘 이미 저장된 견적"이 있는 것처럼 응답해도,
// 그걸 확인하는 GET 자체를 안 보내고 항상 새 POST로 저장되며, 기존 레코드를 PATCH로
// 덮어쓰지 않는지.
//
// 사용법: node tests/estimate-duplicate-blindspot-check.js dah-estimate.html

const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');

const EXISTING_EST_ID = 'existing-today-est-id-999';

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node estimate-duplicate-blindspot-check.js <dah-estimate.html경로>');
    process.exit(1);
  }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 19701 + Math.floor(Math.random() * 500); // 2026-09-13: 10080(크롬 제한 포트) 회피 위해 10000 상향
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let failCount = 0;
  function check(label, condition, detail) {
    if (condition) { console.log(`  ✅ ${label}`); }
    else { console.log(`  ❌ ${label} — ${detail}`); failCount++; }
  }

  async function testBlindspotFix(vw, label) {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(''); } catch (e) {} });
    let estPostCount = 0, estPatchCount = 0, estCheckGetCount = 0;
    let patchedId = null;

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if ((url.includes('supabase.co') || url.includes('script.google.com'))) {
        if (req.method() === 'OPTIONS') {
          req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } });
          return;
        }
        // 고객 저장(신규/기존 모두) - id를 돌려줘서 window._estEditState.estSaveCustomerId가 채워지게 함
        if (url.includes('/customers') && (req.method() === 'PATCH' || req.method() === 'POST')) {
          req.respond({ status: req.method() === 'POST' ? 201 : 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[{"id":"test-known-customer-id"}]' });
          return;
        }
        // 2026-09-30: 원래 이 안전장치(오늘 이미 있는지 확인하는 GET, select=id,updated_at +
        // updated_at=gte. 특징)만 정확히 카운트 - "다른 견적서 합계" 조회(select=id,price,
        // performance_revenue, est-save-stages.js:_saveStage_customers)는 이 안전장치와
        // 무관한 별개의 정상 기능이라 여기 안 섞이게 구분.
        if (url.includes('/estimates') && req.method() === 'GET' && url.includes('client_id=eq.') && url.includes('updated_at=gte.')) {
          estCheckGetCount++;
          req.respond({
            status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify([{ id: EXISTING_EST_ID, updated_at: new Date().toISOString() }])
          });
          return;
        }
        if (url.includes('/estimates') && req.method() === 'PATCH') {
          estPatchCount++;
          if (url.includes('id=eq.' + EXISTING_EST_ID)) patchedId = EXISTING_EST_ID;
          req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
          return;
        }
        if (url.includes('/estimates') && req.method() === 'POST') {
          estPostCount++;
          req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[{"id":"should-not-be-created"}]' });
          return;
        }
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
        return;
      }
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
    });

    await page.setViewport({ width: vw, height: 900, isMobile: vw < 500, hasTouch: vw < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate(() => { localStorage.removeItem('dah_customers'); localStorage.removeItem('dah_saved'); });
    await new Promise(r => setTimeout(r, 700));

    console.log('\n[견적서 중복방지 사각지대 검사] ' + file + ' @ ' + label);

    // "다른 탭/기기에서 이미 저장한 적 있는 고객을 불러왔지만, 이 탭의 로컬엔
    // 오늘 저장 기록이 없는" 상황을 흉내냄: 고객 서버ID는 알고 있지만
    // (예: 방문 이력이 있는 기존 고객을 검색해서 불러온 경우) window._estEditState.editingEstDbId는
    // 세팅 안 된(=이 탭 기준으로는 "새로 시작하는 견적"인) 상태.
    await page.evaluate(() => {
      window._estEditState.estSaveCustomerId = 'test-known-customer-id';
      window._estEditState.editingEstDbId = null;
      document.getElementById('c-name').value = '_사각지대테스트고객';
      document.getElementById('c-phone').value = '01055559999';
      const tr = document.querySelector('.row-curtain');
      tr.querySelector('.mw').value = '300'; tr.querySelector('.mw').dispatchEvent(new Event('input'));
      calcCurtainRow(tr.querySelector('.mw'));
      tr.querySelector('.cprice').value = '50000'; calcCurtainRow(tr.querySelector('.cprice'));
    });
    await new Promise(r => setTimeout(r, 300));
    await setupValidSession(page);
    await page.evaluate(() => { saveEstimate(); });
    await new Promise(r => setTimeout(r, 1500));

    check('[' + label + '] 서버에 "오늘 이미 있는지" 확인하는 GET을 더 이상 보내지 않음(그 안전장치 자체를 제거했으므로)', estCheckGetCount === 0, `GET 확인 호출 ${estCheckGetCount}회(0회여야 정상)`);
    check('[' + label + '] [핵심] 서버에 오늘자 견적이 있어도 항상 새로 생성(POST)됨 - 의도적인 두 번째 견적서가 조용히 합쳐지지 않음', estPostCount === 1, `POST ${estPostCount}회 발생함(1회여야 정상)`);
    check('[' + label + '] 기존 레코드를 PATCH로 덮어쓰지 않음', estPatchCount === 0 && patchedId === null, `PATCH ${estPatchCount}회, 대상id=${patchedId}(둘 다 없어야 정상)`);

    await page.close();
  }

  try {
    await testBlindspotFix(1280, 'PC');
    await testBlindspotFix(390, '모바일');
    process.exitCode = failCount === 0 ? 0 : 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
