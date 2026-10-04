const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9921;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.dismiss(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 손현영 사례 재현: 견적금액과 매출기준금액이 같은 경우(2,003,000원 둘 다)
  await page.evaluate(() => {
    saveCustomers([{ id: 9700, clientName: '가격중복테스트', phone: '01033330000', stage: '시공준비중', staffName: '마스터', price: 2003000 }]);
    localStorage.setItem('dah_saved', JSON.stringify([{ id: 9700, no: 'DAH-TEST-01', clientId: 9700, clientName: '가격중복테스트', price: 2003000, itemCount: 6, dbId: 'est-dup-test', savedAt: new Date().toISOString() }]));
    openDetail('가격중복테스트', 9700, 'info');
  });
  await new Promise(res => setTimeout(res, 600));

  let r = await page.evaluate(() => {
    // 2026-09-15: curEstBox("진행중인 견적" 요약박스)와 priceEditRow는
    // 탭 내용(#detail-body) 밖의 상단 고정 영역에 있어서, 정확히 확인
    // 하려면 그 영역 전체(top)를 봐야 함 - detail-current-est의 부모
    // 컨테이너까지 포함해서 검사.
    var topArea = document.getElementById('detail-current-est').closest('div').parentElement;
    var text = topArea.textContent;
    var priceOccurrences = (text.match(/2,003,000원/g) || []).length;
    return { priceOccurrences: priceOccurrences, hasMergedLabel: text.normalize('NFC').indexOf('견적 금액과 동일'.normalize('NFC')) !== -1, debugText: text.slice(0, 400) };
  });
  ok('1. 금액이 같을 때 "2,003,000원"이 딱 한 번만 나옴(예전엔 두 번 중복)', r.priceOccurrences === 1, 'count=' + r.priceOccurrences);
  ok('2. "견적 금액과 동일"이라는 병합 안내가 뜸', r.hasMergedLabel, r.debugText);

  // 버튼 개수 확인: 열어서수정/복사/⋮ 3개만 있어야 함(이력/삭제 버튼이 따로 안 보임)
  r = await page.evaluate(() => {
    var buttons = Array.from(document.querySelectorAll('#detail-body button')).map(b => b.textContent.trim());
    var hasEdit = buttons.includes('열어서 수정');
    var hasCopy = buttons.includes('복사해서 새로 만들기');
    var hasMoreBtn = buttons.some(t => t.indexOf('⋮') !== -1);
    var hasStandaloneHist = buttons.includes('이력');
    var hasStandaloneDel = buttons.some(t => t === '🗑');
    return { hasEdit, hasCopy, hasMoreBtn, hasStandaloneHist, hasStandaloneDel, allButtons: buttons };
  });
  ok('3. 열어서수정/복사/⋮ 버튼이 있음', r.hasEdit && r.hasCopy && r.hasMoreBtn, JSON.stringify(r.allButtons));
  ok('4. "이력"/"🗑" 단독 버튼은 더 이상 안 보임(⋮ 메뉴 안으로 들어감)', !r.hasStandaloneHist && !r.hasStandaloneDel);

  // ⋮ 메뉴 클릭하면 열리고, 안에 이력보기/삭제가 있는지
  r = await page.evaluate(() => {
    var moreBtn = document.querySelector('.est-card-more-btn');
    moreBtn.click();
    var menuText = moreBtn.textContent; // 메뉴 항목이 moreBtn 안에 append돼있음
    return { hasHistItem: menuText.indexOf('이력 보기') !== -1, hasDelItem: menuText.indexOf('삭제') !== -1 };
  });
  ok('5. ⋮ 메뉴 열면 "이력 보기"/"삭제" 항목이 있음', r.hasHistItem && r.hasDelItem, JSON.stringify(r));

  // 다른 곳 클릭하면 메뉴 닫히는지
  await page.evaluate(() => { document.body.click(); });
  await new Promise(res => setTimeout(res, 100));
  r = await page.evaluate(() => {
    var openMenus = document.querySelectorAll('.est-more-menu-open');
    return openMenus.length;
  });
  ok('6. 다른 곳 클릭하면 메뉴가 닫힘', r === 0, 'open menus=' + r);

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 30000);
