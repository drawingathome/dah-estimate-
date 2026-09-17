// tests/presence-banner-check.js
// 2026-09-17(선혜님 - "내가 마스터인데 이런 글이 왜뜨지??" / "전문업체도
// 이런식으로 하니??"): 동시열람 감지가 "본인의 다른 탭/기기"와 "진짜
// 다른 사람"을 구분 못 하고 전부 "OO님도 보고 있어요"로 표시하던 문제.
// 구글독스/노션처럼 이름(계정) 기준으로 구분해서 문구를 다르게 보여주는지
// 검증. 실시간 채널 동기화 자체(Supabase Presence)는 실제 웹소켓 연결이
// 필요해 이 샌드박스에서 재현 불가 - renderPresenceBanner()의 문구
// 분기 로직만 직접 호출해서 검증(가장 실제 버그가 있었던 부분).
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 19871 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  await page.evaluate(() => {
    saveCustomers([{ id: 9700, clientName: '배너테스트', phone: '01000000097', stage: '상담', date: todayStr() }]);
    openDetail('배너테스트', 9700, 'info');
  });
  await new Promise(r => setTimeout(r, 800));

  // 케이스 1: 진짜 다른 사람(오지은 실장)만 있는 경우 - 기존 문구 유지
  const case1 = await page.evaluate(() => {
    renderPresenceBanner(['오지은 실장'], 0);
    return document.getElementById('presence-warning-banner')?.textContent;
  });
  ok('1. 진짜 다른 사람만 있으면 "OO님도 보고 있어요" 문구', case1 && case1.includes('오지은 실장님도 지금 이 고객을 보고 있어요'), case1);
  ok('1-1. 진짜 다른 사람 케이스엔 "본인의 다른 탭" 문구가 안 섞임', case1 && !case1.includes('다른 탭이나 기기'), case1);

  // 케이스 2: 본인의 다른 탭/기기만 있는 경우(선혜님이 실제로 겪은 상황) - 새 문구
  const case2 = await page.evaluate(() => {
    renderPresenceBanner([], 1);
    return document.getElementById('presence-warning-banner')?.textContent;
  });
  ok('2. 본인의 다른 세션만 있으면 "다른 탭이나 기기" 문구(마치 남처럼 안 보임)', case2 && case2.includes('다른 탭이나 기기에서도 이 화면을 보고 계세요'), case2);
  ok('2-1. 본인 세션 케이스엔 "OO님도 보고 있어요"(남 취급) 문구가 안 나옴', case2 && !case2.includes('님도 지금 이 고객을 보고 있어요'), case2);

  // 케이스 3: 둘 다 있는 경우 - 두 문구 다 보임
  const case3 = await page.evaluate(() => {
    renderPresenceBanner(['오지은 실장'], 1);
    return document.getElementById('presence-warning-banner')?.textContent;
  });
  ok('3. 다른 사람 + 본인 다른세션 둘 다 있으면 두 문구 다 표시됨', case3 && case3.includes('오지은 실장님도') && case3.includes('다른 탭이나 기기'), case3);

  // 케이스 4: 아무도 없으면 배너 자체가 안 뜸(회귀 없음)
  const case4 = await page.evaluate(() => {
    renderPresenceBanner([], 0);
    return !!document.getElementById('presence-warning-banner');
  });
  ok('4. 아무도 없으면 배너가 안 뜸(기존 동작 유지)', case4 === false);

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
