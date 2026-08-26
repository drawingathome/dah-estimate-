#!/usr/bin/env node
// tests/estimate-duplicate-blindspot-check.js
// 2026-08-26(선혜님 발견 — 김채은/유경진 견적서 중복 생성 사례) 회귀 테스트
//
// 배경: "오늘 이미 만든 견적이면 PATCH로 이어서 수정"하는 판단이 이 브라우저의
// 로컬 저장소(dah_saved)만 보고 내려지고 있었음 — 그래서 다른 탭/다른 기기에서
// 방금 저장한 걸 이 브라우저가 모르면 그대로 새 견적(POST)을 또 만들어버렸음.
//
// 수정: saveToEstimates()가 POST/PATCH를 결정하기 직전에 서버에 "이 고객,
// 오늘, 아직 안 지워진 견적이 이미 있는지"를 직접 GET으로 확인하도록 변경.
//
// 이 테스트는 "이 탭은 오늘 이미 저장한 적이 없는 것처럼(로컬엔 기록 없음)"
// 시작하되, 서버(GET 응답)에는 이미 오늘자 견적이 있는 것처럼 흉내내서,
// 실제로 새 POST가 아니라 그 기존 레코드로 PATCH가 나가는지 확인한다.
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
  const port = 9701 + Math.floor(Math.random() * 500);
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
      if (url.includes('supabase.co')) {
        if (req.method() === 'OPTIONS') {
          req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } });
          return;
        }
        // 고객 저장(신규/기존 모두) - id를 돌려줘서 window._estSaveCustomerId가 채워지게 함
        if (url.includes('/customers') && (req.method() === 'PATCH' || req.method() === 'POST')) {
          req.respond({ status: req.method() === 'POST' ? 201 : 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[{"id":"test-known-customer-id"}]' });
          return;
        }
        // 신규 저장 사각지대 확인용 GET - "오늘 이미 있음"으로 응답
        if (url.includes('/estimates') && req.method() === 'GET' && url.includes('client_id=eq.')) {
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
      req.continue();
    });

    await page.setViewport({ width: vw, height: 900, isMobile: vw < 500, hasTouch: vw < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate(() => { localStorage.removeItem('dah_customers'); localStorage.removeItem('dah_saved'); });
    await new Promise(r => setTimeout(r, 700));

    console.log('\n[견적서 중복방지 사각지대 검사] ' + file + ' @ ' + label);

    // "다른 탭/기기에서 이미 저장한 적 있는 고객을 불러왔지만, 이 탭의 로컬엔
    // 오늘 저장 기록이 없는" 상황을 흉내냄: 고객 서버ID는 알고 있지만
    // (예: 방문 이력이 있는 기존 고객을 검색해서 불러온 경우) _editingEstDbId는
    // 세팅 안 된(=이 탭 기준으로는 "새로 시작하는 견적"인) 상태.
    await page.evaluate(() => {
      window._estSaveCustomerId = 'test-known-customer-id';
      window._editingEstDbId = null;
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

    check('[' + label + '] 저장 전 서버에 "오늘 이미 있는지" GET으로 확인함', estCheckGetCount >= 1, `GET 확인 호출 ${estCheckGetCount}회`);
    check('[' + label + '] 서버가 기존 견적을 알려주면 새로 생성(POST)하지 않음', estPostCount === 0, `POST ${estPostCount}회 발생함(0회여야 정상)`);
    check('[' + label + '] 대신 기존 레코드로 PATCH함', estPatchCount >= 1 && patchedId === EXISTING_EST_ID, `PATCH ${estPatchCount}회, 대상id=${patchedId}`);

    await page.close();
  }

  // 서버 확인 자체가 실패해도(네트워크 문제) 저장 자체는 막히지 않아야 함(안전장치)
  async function testFailSafeFallback(vw, label) {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(''); } catch (e) {} });
    let estPostCount = 0;
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('supabase.co')) {
        if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
        if (url.includes('/customers') && (req.method() === 'PATCH' || req.method() === 'POST')) { req.respond({ status: req.method() === 'POST' ? 201 : 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[{"id":"test-known-customer-id"}]' }); return; }
        if (url.includes('/estimates') && req.method() === 'GET') { req.abort('failed'); return; } // 확인 요청 자체가 실패
        if (url.includes('/estimates') && req.method() === 'POST') { estPostCount++; req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[{"id":"fallback-created-id"}]' }); return; }
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
        return;
      }
      req.continue();
    });
    await page.setViewport({ width: vw, height: 900, isMobile: vw < 500, hasTouch: vw < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate(() => { localStorage.removeItem('dah_customers'); localStorage.removeItem('dah_saved'); });
    await new Promise(r => setTimeout(r, 700));
    await page.evaluate(() => {
      window._estSaveCustomerId = 'test-known-customer-id';
      window._editingEstDbId = null;
      document.getElementById('c-name').value = '_사각지대폴백테스트고객';
      document.getElementById('c-phone').value = '01044443333';
      const tr = document.querySelector('.row-curtain');
      tr.querySelector('.mw').value = '300'; tr.querySelector('.mw').dispatchEvent(new Event('input'));
      calcCurtainRow(tr.querySelector('.mw'));
      tr.querySelector('.cprice').value = '50000'; calcCurtainRow(tr.querySelector('.cprice'));
    });
    await new Promise(r => setTimeout(r, 300));
    await setupValidSession(page);
    await page.evaluate(() => { saveEstimate(); });
    await new Promise(r => setTimeout(r, 1500));
    check('[' + label + '] 확인요청 자체가 실패해도 저장 흐름이 멈추지 않고 진행됨(fail-safe)', estPostCount >= 1, `POST ${estPostCount}회(1회 이상이어야 정상 - 막히면 안 됨)`);
    await page.close();
  }

  try {
    await testBlindspotFix(1280, 'PC');
    await testBlindspotFix(390, '모바일');
    await testFailSafeFallback(1280, 'PC-확인실패시');
    process.exitCode = failCount === 0 ? 0 : 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
