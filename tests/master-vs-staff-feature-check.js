#!/usr/bin/env node
// tests/master-vs-staff-feature-check.js
// 2026-08-26: 오늘 만든 3가지 기능(견적서 중복방지/설치기사 자동입력/의뢰서 편집)을
// "실장 로그인"뿐 아니라 "마스터 로그인" 기준으로도 PC+모바일 재검증.
// est app은 dash-dashboard.html과 달리 이메일 하나로 로그인하고, 로그인 후
// staff_emails 매핑 조회 결과로 role이 master/staff로 갈림 - 그 조회까지
// 실제로 거치는 진짜 로그인 플로우로 테스트함(설정 shortcut 아님).

const { launchBrowser, startServer } = require('./_helpers');

const MASTER_EMAIL = 'master-check@dah-test.local';
const STAFF_EMAIL = 'staff-check@dah-test.local';
const STAFF_NAME = '_역할검증실장';

async function loginEstApp(page, role) {
  const email = role === 'master' ? MASTER_EMAIL : STAFF_EMAIL;
  await page.waitForSelector('#est-auth-email', { timeout: 8000 });
  await page.evaluate((em) => { document.getElementById('est-auth-email').value = em; }, email);
  await page.evaluate(() => { document.getElementById('est-auth-pw').value = 'TEST_OK_PW'; });
  await page.evaluate(() => { document.getElementById('est-auth-btn').click(); });
  await new Promise(r => setTimeout(r, 1200)); // staff_emails 조회 콜백까지 대기
  const roleResult = await page.evaluate(() => window._estCurrentUser && window._estCurrentUser.role);
  return roleResult;
}

function mockRoute(req, url) {
  if (req.method() === 'OPTIONS') {
    req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } });
    return true;
  }
  if (url.includes('/auth/v1/token') && req.postData()) {
    let body; try { body = JSON.parse(req.postData()); } catch (e) { body = {}; }
    if (body.password === 'TEST_OK_PW') {
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600, user: { id: 'uid', email: body.email } }) });
    } else {
      req.respond({ status: 400, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
    }
    return true;
  }
  if (url.includes('staff_emails')) {
    req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify([{ value: { [STAFF_NAME]: STAFF_EMAIL } }]) });
    return true;
  }
  if (url.includes('/customers') && (req.method() === 'PATCH' || req.method() === 'POST')) {
    req.respond({ status: req.method() === 'POST' ? 201 : 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[{"id":"role-check-customer-id"}]' });
    return true;
  }
  if (url.includes('/estimates') && req.method() === 'GET' && url.includes('client_id=eq.')) {
    req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[{"id":"role-check-existing-est","updated_at":"2026-08-26T00:00:00Z"}]' });
    return true;
  }
  if (url.includes('vendor_list')) {
    req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify([{ value: [{ name: '역할검증설치기사', categories: ['install'], phone: '010-9999-0000' }] }]) });
    return true;
  }
  req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
  return true;
}

async function testRoleAndViewport(role, vw, label, port) {
  const server = await startServer(__dirname + '/..', port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(d.defaultValue()); } catch (e) {} });
  let estPostCount = 0, estPatchCount = 0;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if ((url.includes('supabase.co') || url.includes('script.google.com'))) {
      if (url.includes('/estimates') && req.method() === 'PATCH') estPatchCount++;
      if (url.includes('/estimates') && req.method() === 'POST') estPostCount++;
      mockRoute(req, url);
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.setViewport({ width: vw, height: 900, isMobile: vw < 500, hasTouch: vw < 500 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));

  const findings = [];
  const actualRole = await loginEstApp(page, role);
  if (actualRole !== role) findings.push(`역할 판별 실패: 기대=${role}, 실제=${actualRole}`);

  // 고객/견적 내용 입력
  await page.evaluate(() => {
    document.getElementById('c-name').value = '_역할검증고객';
    document.getElementById('c-phone').value = '010-1234-5678';
    document.querySelector('.space-inp').value = '거실';
    const tr = document.querySelector('.row-curtain');
    tr.querySelector('.mw').value = '300'; tr.querySelector('.mw').dispatchEvent(new Event('input'));
    calcCurtainRow(tr.querySelector('.mw'));
    tr.querySelector('.cprice').value = '50000'; calcCurtainRow(tr.querySelector('.cprice'));
  });
  await new Promise(r => setTimeout(r, 300));

  // 1) 견적서 중복방지: 서버가 "오늘 이미 있음"이라 하면 PATCH로 전환되는지
  await page.evaluate(() => { window._estSaveCustomerId = 'role-check-customer-id'; window._editingEstDbId = null; });
  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 1200));
  if (estPostCount > 0) findings.push(`[중복방지] 새로 생성(POST)됨(0이어야 정상) POST=${estPostCount}`);
  if (estPatchCount < 1) findings.push(`[중복방지] 기존 레코드로 PATCH 안 됨`);

  // 2) 설치기사 자동입력
  await page.evaluate(() => { printRequest('measure'); });
  await new Promise(r => setTimeout(r, 600));
  const instName = await page.evaluate(() => document.getElementById('c-installer-name')?.value);
  const instPhone = await page.evaluate(() => document.getElementById('c-installer-phone')?.value);
  if (instName !== '역할검증설치기사' || instPhone !== '010-9999-0000') {
    findings.push(`[설치기사자동입력] 실패 - 이름="${instName}" 연락처="${instPhone}"`);
  }

  // 3) 의뢰서 편집 가능 여부
  const editableExists = await page.evaluate(() => {
    const el = document.getElementById('pv-request-editable');
    return !!el && el.getAttribute('contenteditable') === 'true';
  });
  if (!editableExists) findings.push(`[의뢰서편집] contenteditable 영역이 없음`);

  await browser.close();
  server.kill();
  return findings;
}

(async () => {
  const combos = [
    ['master', 1400, 'PC', 9931],
    ['master', 390, '모바일', 9932],
    ['staff', 1400, 'PC', 9933],
    ['staff', 390, '모바일', 9934],
  ];
  let allFindings = [];
  for (const [role, vw, label, port] of combos) {
    const tag = `${role === 'master' ? '마스터' : '실장'}-${label}`;
    const findings = await testRoleAndViewport(role, vw, label, port);
    if (findings.length === 0) {
      console.log(`✅ [${tag}] 3가지 기능 전부 정상`);
    } else {
      console.log(`❌ [${tag}] 문제 발견:`);
      findings.forEach(f => console.log('   - ' + f));
      allFindings.push(...findings.map(f => `[${tag}] ${f}`));
    }
  }
  console.log('\n========================================');
  if (allFindings.length === 0) {
    console.log('✅ 마스터/실장 × PC/모바일 4개 조합 전부 통과');
  } else {
    console.log('🔴 총 ' + allFindings.length + '건 문제 발견');
  }
  console.log('========================================');
  process.exit(allFindings.length ? 1 : 0);
})();
