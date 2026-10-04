// tests/fabric-vendor-list-check.js
// 2026-09-18(선혜님 - "다 적어도 이렇게 뜨는데 왜 이래 이거 여러번
// 얘기 한거 아니니?????" - 발주서에서 "원단 거래처 칸에 가공소
// 이름이 들어간 항목이 있어요" 경고가 계속 뜨던 문제): 원단 거래처
// 입력칸(.c-vendor)이 원단/블라인드/가공소/부자재가 전부 섞인 통합
// 자동완성 목록(vendor-list)을 그대로 썼었음 - 그래서 원단을 입력할
// 때 자동완성에 "캔가공소" 같은 전혀 다른 거래처가 같이 뜨고, 실수로
// 선택하기 쉬운 구조였음. 경고 배너로 방어만 하고 근본 원인(자동완성
// 자체가 헷갈리게 섞여있음)은 안 고쳐져 있었음 - 원단 전용 목록을
// 새로 만들어서 애초에 헷갈릴 선택지 자체가 안 뜨게 함.
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 26700;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co') || url.includes('script.google.com')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.setViewport({ width: 390, height: 1000 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 1) 커튼 행의 원단거래처(.c-vendor) 입력창이 fabric-vendor-list를 쓰는지
  const curtainInputCheck = await page.evaluate(() => {
    const input = document.querySelector('#curtain-body .c-vendor');
    return { listAttr: input?.getAttribute('list') };
  });
  ok('1. 커튼 원단거래처 입력창이 fabric-vendor-list(원단전용)를 씀', curtainInputCheck.listAttr === 'fabric-vendor-list', JSON.stringify(curtainInputCheck));

  // 2) fabric-vendor-list에 가공소/블라인드/부자재 이름이 전혀 없는지
  const fabricListCheck = await page.evaluate(() => {
    const dl = document.getElementById('fabric-vendor-list');
    return dl ? Array.from(dl.options).map(o => o.value) : null;
  });
  const excluded = ['캔가공소', '윈텍', '덱스터', '헌터더글라스', '솜피', '목성'];
  const leaked = excluded.filter(name => fabricListCheck && fabricListCheck.includes(name));
  ok('2. 원단전용 목록에 가공소/블라인드/부자재 이름이 하나도 안 섞임', leaked.length === 0, JSON.stringify({ fabricListCheck, leaked }));
  ok('3. 원단전용 목록에 실제 원단 거래처는 정상적으로 있음', fabricListCheck && fabricListCheck.includes('예원') && fabricListCheck.includes('디테라'), JSON.stringify(fabricListCheck));

  // 3) 발주정보 입력 팝업에서도 동일하게 fabric-vendor-list를 쓰는지
  await page.evaluate(() => {
    window._dahVendorListRaw = [{ name: '캔가공소', categories: ['production'] }];
    addCurtainRow();
  });
  const popupInputCheck = await page.evaluate(() => {
    openVendorInfoInputModal();
    const modal = document.getElementById('vendor-info-input-modal');
    const input = modal?.querySelector('input[list]');
    return { listAttr: input?.getAttribute('list') };
  });
  ok('4. 발주정보 입력 팝업의 원단거래처 입력창도 fabric-vendor-list를 씀', popupInputCheck.listAttr === 'fabric-vendor-list', JSON.stringify(popupInputCheck));

  // 4) 기존 경고 배너 로직 자체는 여전히 정상 작동하는지(방어선 유지 확인 - 회귀방지)
  await page.evaluate(() => { document.getElementById('vendor-info-input-modal')?.remove(); });
  const bannerStillWorks = await page.evaluate(() => {
    window._dahVendorListRaw = [{ name: '캔가공소', categories: ['production'] }];
    const tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.c-vendor').value = '캔가공소'; // 그래도 누군가 직접 타이핑하면 여전히 잡아야 함
    const issues = getVendorInfoIssues();
    return issues.confusedFabricSpaces;
  });
  ok('5. [회귀방지] 그래도 직접 타이핑해서 넣으면 경고 로직은 여전히 정상 작동함', Array.isArray(bannerStillWorks) && bannerStillWorks.length > 0, JSON.stringify(bannerStillWorks));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
