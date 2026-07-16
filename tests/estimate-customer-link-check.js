#!/usr/bin/env node
// tests/estimate-customer-link-check.js
// 견적서 저장시 발생하던 두 가지 버그의 회귀 테스트
//
// 2026-07-16 발견 (미해결로 남겨뒀던 "고객불러오기 텍스트 겹침" 버그를 다시 파다가 원인 확인):
// 1) 견적서를 저장할 때마다 로컬 dah_customers 매칭 기준이 "견적서번호"였는데, 이 번호는
//    저장할 때마다 달라질 수 있어서, 같은 고객이 가견적→확정견적처럼 여러 번 저장하면
//    매번 새로운 고객 레코드가 로컬에 쌓였다. Supabase 쪽도 항상 POST(신규생성)만 했음.
// 2) 그 결과 실제로 동명이인처럼 보이는 중복 데이터가 쌓였고, 견적이력(dah_saved)도
//    이름으로만 매칭되어 있어서 동명이인/중복레코드 간에 서로의 견적정보가 섞여 표시됐다.
//    이게 "고객불러오기 목록에서 이름/전화번호 텍스트가 겹쳐 보이던" 버그의 실제 원인으로 추정됨.
//
// 수정: 이름+전화번호로 기존 로컬 고객을 찾아 재사용(중복 생성 방지), Supabase도
// 기존 id 있으면 PATCH 없으면 POST, 견적이력(dah_saved)에 clientId를 함께 저장해
// 견적이력 조회도 이름 대신 고객 고유번호 기준으로 하도록 변경.
//
// 사용법: node tests/estimate-customer-link-check.js dah-estimate.html

const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node estimate-customer-link-check.js <dah-estimate.html경로>');
    process.exit(1);
  }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9601 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let failCount = 0;
  function check(label, condition, detail) {
    if (condition) { console.log(`  ✅ ${label}`); }
    else { console.log(`  ❌ ${label} — ${detail}`); failCount++; }
  }

  try {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(''); } catch (e) {} });
    let postCount = 0, patchCount = 0;
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('supabase.co')) {
        if (req.method() === 'OPTIONS') {
          req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } });
          return;
        }
        if (url.includes('/customers') && req.method() === 'POST') {
          postCount++;
          req.respond({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 'test-fake-uuid-001' }]) });
          return;
        }
        if (url.includes('/customers') && req.method() === 'PATCH') {
          patchCount++;
          req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
          return;
        }
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
        return;
      }
      req.continue();
    });

    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));

    console.log('\n[견적서-고객 연결 검사] ' + file);

    // 같은 고객으로 두 번 저장(가견적 → 확정견적으로 견적번호가 바뀌는 상황을 흉내냄)
    await page.evaluate(() => {
      document.getElementById('c-name').value = '회귀테스트중복방지고객';
      document.getElementById('c-phone').value = '01099998888';
      const tr = document.querySelector('.row-curtain');
      tr.querySelector('.mw').value = '300'; tr.querySelector('.mw').dispatchEvent(new Event('input'));
      calcCurtainRow(tr.querySelector('.mw'));
      tr.querySelector('.cprice').value = '50000'; calcCurtainRow(tr.querySelector('.cprice'));
    });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => { saveEstimate(); });
    await new Promise(r => setTimeout(r, 1000));
    const countAfterFirst = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_customers') || '[]').length);

    await page.evaluate(() => {
      setStatus('final');
      document.getElementById('c-no').value = 'DAH-REGTEST-DIFFERENT-NO';
      saveEstimate();
    });
    await new Promise(r => setTimeout(r, 1000));
    const countAfterSecond = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_customers') || '[]').length);

    check('같은 고객을 다른 견적번호로 두 번 저장해도 로컬 고객 레코드가 중복 생성되지 않음', countAfterFirst === countAfterSecond, `1차저장 후=${countAfterFirst}건, 2차저장 후=${countAfterSecond}건 (같아야 정상)`);
    check('두 번째 저장은 신규생성(POST)이 아니라 기존고객 업데이트(PATCH)로 처리됨', patchCount >= 1, `POST=${postCount}회, PATCH=${patchCount}회`);

    // 동명이인(다른 id)의 견적이력이 서로 섞이지 않는지
    await page.evaluate(() => {
      localStorage.setItem('dah_customers', JSON.stringify([
        { id: 'regtest-A', clientName: '회귀테스트동명이인', phone: '01011110000', createdAt: new Date().toISOString() },
        { id: 'regtest-B', clientName: '회귀테스트동명이인', phone: '01022220000', createdAt: new Date(Date.now() - 1000).toISOString() }
      ]));
      localStorage.setItem('dah_saved', JSON.stringify([
        { id: 'regest-A', no: 'DAH-REGA', clientName: '회귀테스트동명이인', clientId: 'regtest-A', price: 1000000, status: 'ga' },
        { id: 'regest-B', no: 'DAH-REGB', clientName: '회귀테스트동명이인', clientId: 'regtest-B', price: 2000000, status: 'ga' }
      ]));
      openCustomerLoad();
    });
    await new Promise(r => setTimeout(r, 500));
    const items = await page.evaluate(() => Array.from(document.querySelectorAll('.cust-load-item')).map(el => el.textContent));
    const itemA = items.find(t => t.includes('01011110000'));
    const itemB = items.find(t => t.includes('01022220000'));
    check('동명이인 A의 견적이력에 본인 금액(1,000,000원)만 표시됨', !!itemA && itemA.includes('1,000,000') && !itemA.includes('2,000,000'), `실제=${itemA}`);
    check('동명이인 B의 견적이력에 본인 금액(2,000,000원)만 표시됨', !!itemB && itemB.includes('2,000,000') && !itemB.includes('1,000,000'), `실제=${itemB}`);

    process.exitCode = failCount === 0 ? 0 : 1;
    await page.close();
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
