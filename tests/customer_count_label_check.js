const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9999;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const result = await page.evaluate(() => {
    function daysAgo(n) { var d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
    // 2026-09-22(선혜님 - "코드정리 싹 해봐" 요청으로 전수 점검 중 발견):
    // 이 테스트가 검증하던 "활성/보관(isArchived)" 구분 자체가, 그 이후
    // "보관처리(소프트삭제) → 완전삭제 전환" 정책 변경으로 완전히 없어진
    // 개념이었음(is_archived는 이제 "완전삭제 전 소프트삭제"만 의미) -
    // 실제 UI 문구("전체 N명"이 아니라 "N명 (활성 X · 삭제보관 Y)")와
    // 실제 필드명(is_archived)에 맞게 재작성. 활성 3명 + 소프트삭제(완전
    // 삭제 대기) 5명 = 총 8명.
    var custs = [];
    for (var i = 0; i < 3; i++) custs.push({ id: 100+i, clientName: '활성'+i, phone:'010111100'+i, stage:'상담', staffName:'마스터', date: daysAgo(1) });
    for (var i = 0; i < 5; i++) custs.push({ id: 200+i, clientName: '삭제보관'+i, phone:'010222200'+i, stage:'상담', staffName:'마스터', date: daysAgo(1), is_archived: true });
    saveCustomers(custs);
    goTab('search'); renderSearch();
    var labelDefault = document.getElementById('search-count').textContent;

    document.getElementById('show-archived').checked = true;
    renderSearch();
    var labelWithArchived = document.getElementById('search-count').textContent;

    return { labelDefault, labelWithArchived };
  });

  const checks = [
    result.labelDefault.includes('8명') && result.labelDefault.includes('활성 3') && result.labelDefault.includes('삭제보관 5'),
    result.labelWithArchived.includes('8명')
  ];
  console.log('기본(삭제보관 숨김) 라벨:', result.labelDefault);
  console.log('  → "8명 (활성 3 · 삭제보관 5)" 형식으로 구분 표시:', checks[0] ? '✅' : '❌');
  console.log('삭제보관 고객 포함 라벨:', result.labelWithArchived);
  console.log('  → "8명"(구분 없이 합계):', checks[1] ? '✅' : '❌');

  await browser.close();
  process.exit(checks.every(Boolean) ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 20000);
