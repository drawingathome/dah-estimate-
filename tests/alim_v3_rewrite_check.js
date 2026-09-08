const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9873;
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

  // 1) 값이 전부 채워진 고객 기준: 22개 템플릿 전부 치환 후 '#{' 잔존(치환 누락) 없어야 함
  let r = await page.evaluate(() => {
    var c = {
      id: 7001, clientName: '알림v3검증고객', phone: '01099990000', stage: '확정견적', staffName: '마스터',
      date: '2026-09-01', measureDate: '2026-09-05', installDate: '2026-09-15',
      depositAmount: 500000, balanceAmount: 500000, paymentLink: 'https://pay.example.com/abc'
    };
    var unresolved = [];
    var missingKeys = [];
    Object.keys(ALIM_META).forEach(function(k) {
      var out = fillAlimTemplate(ALIM_META[k].template, c);
      if (out.indexOf('#{') !== -1) unresolved.push(k);
    });
    return { total: Object.keys(ALIM_META).length, unresolved: unresolved };
  });
  ok('1. ALIM_META 22개 항목 존재', r.total === 22, 'total=' + r.total);
  ok('2. 값이 있을 때 모든 템플릿에서 #{변수} 치환 누락 없음', r.unresolved.length === 0, JSON.stringify(r.unresolved));

  // 2) 값이 하나도 없는 신규 고객: 결제링크 미입력 안내문이 나오는지(빈 문자열 발송 방지)
  r = await page.evaluate(() => {
    var c = { id: 7002, clientName: '알림v3빈값고객', phone: '01099990001', stage: '가견적', staffName: '마스터' };
    var out = fillAlimTemplate(ALIM_META.t43_deposit_card.template, c);
    return { hasPlaceholder: out.indexOf('결제링크 미등록') !== -1, hasUnresolved: out.indexOf('#{') !== -1 };
  });
  ok('3. 결제링크 미입력 시 안내문구로 대체(빈칸 발송 방지)', r.hasPlaceholder === true);
  ok('4. 빈값 고객도 #{} 치환 누락 없음', r.hasUnresolved === false);

  // 3) 고아 키 없음: ALIM_META의 모든 키가 STAGE_ALIM 또는 OTHER_ALIM_KEYS 어딘가에 존재
  r = await page.evaluate(() => {
    var refSet = new Set();
    Object.keys(STAGE_ALIM).forEach(function(s) { STAGE_ALIM[s].forEach(function(k) { refSet.add(k); }); });
    OTHER_ALIM_KEYS.forEach(function(k) { refSet.add(k); });
    var orphans = Object.keys(ALIM_META).filter(function(k) { return !refSet.has(k); });
    return { orphans: orphans };
  });
  ok('5. 고아 알림톡 항목 없음(전부 화면에 노출됨)', r.orphans.length === 0, JSON.stringify(r.orphans));

  // 4) 알림톡 탭에 '취소·기타' 카테고리가 실제로 렌더링되는지(신규 카테고리)
  // openDetail은 loadEstimatesAsync 콜백 이후에 실제 렌더링을 하므로, 연 뒤 한 틱 기다렸다가 읽는다.
  await page.evaluate(() => {
    saveCustomers([{ id: 7003, clientName: '알림탭확인고객', phone: '01099990002', stage: '가견적', staffName: '마스터', date: todayStr() }]);
    openDetail('알림탭확인고객', 7003, 'alim');
  });
  await new Promise(res => setTimeout(res, 500));
  r = await page.evaluate(() => {
    var text = document.getElementById('detail-alim-body') ? document.getElementById('detail-alim-body').textContent : '';
    return { hasOtherCategory: text.indexOf('취소·기타') !== -1, hasAsItem: text.indexOf('AS 접수 확인') !== -1 };
  });
  ok('6. "취소·기타" 카테고리 렌더링됨', r.hasOtherCategory === true);
  ok('7. 18번 AS 접수 확인 문구가 화면에 노출됨', r.hasAsItem === true);

  // 5) 결제링크 입력란: 클릭 시 input이 뜨는지(저장 자체는 서버 왕복이라 이 테스트에서는 UI만 확인)
  await page.evaluate(() => {
    closeDetail();
    openDetail('알림탭확인고객', 7003, 'info');
  });
  await new Promise(res => setTimeout(res, 500));
  r = await page.evaluate(() => {
    // 배경색(#FFFBF5)만으로는 '메모' 편집 카드와 겹쳐서 잘못 잡힘 — 결제링크 고유
    // 텍스트('결제링크')까지 함께 확인해 정확히 그 카드만 골라냄
    var blocks = Array.from(document.querySelectorAll('#detail-body div'));
    var linkBlock = blocks.find(function(b) {
      return b.style.backgroundColor === 'rgb(255, 251, 245)' && b.textContent.indexOf('결제링크') !== -1;
    });
    if (!linkBlock) return { found: false };
    linkBlock.click();
    var input = linkBlock.querySelector('input');
    return { found: true, hasInput: !!input };
  });
  ok('8. 결제링크 블록 존재', r.found === true);
  ok('9. 결제링크 클릭 시 입력창 표시', r.hasInput === true);

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
