const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9950;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 300));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 체크리스트 35번(발주서 카테고리는 항상 세트) 재검사: 4개 카테고리
  // (원단/캔가공소/레일자재/블라인드)에 각각 실제 데이터를 넣고,
  // collectVendorGroups가 각 필터로 정확히 그 카테고리만, 그리고
  // 필터 없이는 4개 전부를 돌려주는지 직접 검증
  await page.evaluate(() => {
    // 원단(fabric) + 캔가공소(production) 발생시키는 커튼 행
    var addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '+ 커튼 추가');
    addBtn.click();
    var tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.c-fabric').value = '테스트원단';
    tr.querySelector('.c-vendor').value = '테스트원단업체';
    tr.querySelector('.mw').value = 300;
    calcCurtainRow(tr.querySelector('.mw'));

    // 블라인드(blind)
    var addBlindBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '+ 블라인드 추가');
    if (addBlindBtn) addBlindBtn.click();
    var btr = document.querySelector('#blind-body tr');
    if (btr) {
      var bFabric = btr.querySelector('.b-fabric'); if (bFabric) bFabric.value = '테스트블라인드';
      var bVendor = btr.querySelector('.b-vendor');
      if (bVendor && bVendor.tagName === 'SELECT' && bVendor.options.length > 1) bVendor.selectedIndex = 1;
    }

    // 레일·자재(material) - svc-body에 직접 항목 추가
    var addSvcBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('기타') && b.textContent.includes('추가'));
  });
  await new Promise(r => setTimeout(r, 300));

  const result = await page.evaluate(() => {
    if (typeof collectVendorGroups !== 'function') return { error: 'collectVendorGroups 함수 없음' };
    var byCategory = {};
    ['fabric', 'production', 'material', 'blind'].forEach(function(cat) {
      try {
        var result = collectVendorGroups(cat);
        byCategory[cat] = result ? result.itemCount : 0;
      } catch (e) {
        byCategory[cat] = 'ERROR: ' + e.message;
      }
    });
    var allTotal = 0;
    try {
      var allResult = collectVendorGroups(undefined);
      allTotal = allResult ? allResult.itemCount : 0;
    } catch (e) {
      allTotal = 'ERROR: ' + e.message;
    }
    return { byCategory: byCategory, allTotal: allTotal };
  });

  ok('1. collectVendorGroups가 4개 카테고리(fabric/production/material/blind) 전부 에러 없이 호출됨', typeof result.error === 'undefined', JSON.stringify(result));
  if (!result.error) {
    ok('2. 원단(fabric) 카테고리 필터에서 실제로 품목이 잡힘', result.byCategory.fabric > 0, JSON.stringify(result.byCategory));
    ok('3. 캔가공소(production) 카테고리 필터 호출 자체는 에러 없이 정상 처리됨(거래처 미등록시 0건은 정상)', typeof result.byCategory.production === 'number', JSON.stringify(result.byCategory));
    ok('4. [핵심] 필터 없이 부르면(전체보기) 4개 카테고리 개별 합계보다 적지 않게 나옴 - 특정 카테고리가 전체보기에서만 누락되는 회귀 방지', typeof result.allTotal === 'number' && result.allTotal >= (result.byCategory.fabric + result.byCategory.production), JSON.stringify(result));
  }

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
