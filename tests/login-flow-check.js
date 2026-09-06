#!/usr/bin/env node
// tests/login-flow-check.js
// 2026-07-19 발견: 모바일에서 마스터/스태프 로그인 확인 버튼이 화면 밖으로
// 밀려나서 클릭 자체가 안 되는 버그가 있었음(flex:1인 비밀번호 입력창에
// min-width:0이 없어서, flexbox 기본 최소크기 특성 때문에 옆의 고정폭
// 버튼을 화면 밖으로 밀어냄). 로그인은 앱 전체의 "관문"이라 이게 깨지면
// 다른 모든 기능이 무의미해지는데, 정작 하루 종일 다른 화면들만 모바일로
// 검증하고 로그인 자체는 실제 터치로 검증한 적이 없었음.
//
// 이 테스트는 로그인 확인 버튼이 "화면 안에 있고, 정확히 자기 자신이
// 클릭되며, 실제로 로그인이 성공하는지"를 모바일/PC 둘 다 자동으로 감시한다.
//
// 사용법: node tests/login-flow-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node login-flow-check.js <dah-dashboard.html경로>');
    process.exit(1);
  }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9901 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let failCount = 0;
  function check(label, condition, detail) {
    if (condition) { console.log(`  ✅ ${label}`); }
    else { console.log(`  ❌ ${label} — ${detail}`); failCount++; }
  }

  console.log('\n[로그인 흐름 검사] ' + file);

  async function testLogin(width, label) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', (req) => { const u = req.url(); if (u.includes('supabase.co') || u.includes('script.google.com')) { req.abort(); return; } if (u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); } });
    await page.setViewport({ width, height: 844, isMobile: width < 500, hasTouch: width < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));

    // 마스터 로그인 버튼 클릭 -> 비밀번호 입력창 노출
    await page.evaluate(() => { document.getElementById('btn-master-login').click(); });
    await new Promise(r => setTimeout(r, 300));
    await page.type('#master-pw-input', 'dah2012');

    // 확인 버튼이 실제로 화면 안에 있고, 그 좌표를 클릭했을 때 정말 자기 자신이 클릭되는지 확인
    // (문법검사나 존재여부 확인만으로는 "화면 밖으로 밀려남" 버그를 못 잡음 — 실제 좌표 기반 검증 필수)
    const btnCheck = await page.evaluate(() => {
      const btn = document.getElementById('btn-master-confirm');
      const r = btn.getBoundingClientRect();
      const elAtPoint = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        withinViewport: r.left >= 0 && r.right <= window.innerWidth,
        isTargetElement: elAtPoint === btn
      };
    });
    check(`[${label}] 마스터 로그인 확인버튼이 화면 안에 있음`, btnCheck.withinViewport, '버튼이 뷰포트 밖으로 밀려남 — flex 자식 min-width 확인 필요');
    check(`[${label}] 마스터 확인버튼 좌표 클릭시 정확히 그 버튼이 클릭됨(다른 요소에 가려지지 않음)`, btnCheck.isTargetElement, '해당 좌표를 클릭해도 다른 요소가 클릭됨');

    // 실제로 클릭 -> 로그인 성공까지 확인
    await page.evaluate(() => { document.getElementById('btn-master-confirm').click(); });
    await new Promise(r => setTimeout(r, 500));
    const loginResult = await page.evaluate(() => (typeof currentUser !== 'undefined' && currentUser) ? currentUser.role : 'none');
    check(`[${label}] 마스터 비밀번호 입력 후 실제로 로그인 성공함`, loginResult === 'master', `결과=${loginResult}`);
    check(`[${label}] 로그인 과정에서 JS 런타임 에러 없음`, errors.length === 0, JSON.stringify(errors));

    await page.close();
  }

  await testLogin(390, '모바일');
  await testLogin(1400, 'PC');

  process.exitCode = failCount === 0 ? 0 : 1;
  await browser.close();
  server.kill();
}

run().catch(err => { console.error(err); process.exit(1); });
