const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9877;
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

  // 1) 13개 존재 + 고아 키 없음
  let r = await page.evaluate(() => {
    var total = Object.keys(ALIM_META).length;
    var refSet = new Set();
    Object.keys(STAGE_ALIM).forEach(function(s) { STAGE_ALIM[s].forEach(function(k) { refSet.add(k); }); });
    OTHER_ALIM_KEYS.forEach(function(k) { refSet.add(k); });
    var orphans = Object.keys(ALIM_META).filter(function(k) { return !refSet.has(k); });
    return { total: total, orphans: orphans };
  });
  ok('1. ALIM_META 13개', r.total === 13, 'total=' + r.total);
  ok('2. 고아 키 없음', r.orphans.length === 0, JSON.stringify(r.orphans));

  // 2) 각 단계별로 A/B/C/D 상황추정이 그럴듯하게 되는지 (실측준비중 단계 → 방문유형=실측)
  r = await page.evaluate(() => {
    var c1 = { clientName:'테스트1', stage:'실측준비중', measureDate:'2026-09-20', installDate:'2026-09-30', price:1000000, depositAmount:500000 };
    var out1 = fillAlimTemplate(ALIM_META.tA_visit_dday.template, c1);
    var c2 = { clientName:'테스트2', stage:'잔금결제', price:1000000, depositAmount:500000, installDate:'2026-10-01' };
    var out2 = fillAlimTemplate(ALIM_META.tC_payment.template, c2);
    var out3 = fillAlimTemplate(ALIM_META.tB_schedule_confirm.template, c2);
    return {
      visitTypeOk: out1.indexOf('내일 실측 예정이에요') !== -1,
      amountTypeOk: out2.indexOf('잔금 안내드릴게요') !== -1,
      amountValueOk: out2.indexOf('500,000원') !== -1,
      scheduleTypeOk: out3.indexOf('시공 일정을 확정') !== -1
    };
  });
  ok('3. 실측준비중 단계 → 방문유형 자동으로 "실측"', r.visitTypeOk === true);
  ok('4. 잔금결제 단계 → 금액유형 자동으로 "잔금"', r.amountTypeOk === true);
  ok('5. 잔금 금액 계산(총액-계약금) 정확', r.amountValueOk === true);
  ok('6. 잔금결제 단계 → 일정유형 자동으로 "시공"', r.scheduleTypeOk === true);

  // 3) #{공간} 빈 값일 때 중복 공백 없이 자연스럽게
  r = await page.evaluate(() => {
    var withSpace = fillAlimTemplate(ALIM_META.t04_followup.template, { clientName:'테스트3', space:'거실' });
    var noSpace = fillAlimTemplate(ALIM_META.t04_followup.template, { clientName:'테스트4' });
    return {
      withSpaceOk: withSpace.indexOf('거실 상담 이후') !== -1,
      noSpaceOk: noSpace.indexOf('  ') === -1 && noSpace.indexOf('님, 상담') !== -1
    };
  });
  ok('7. #{공간} 있을 때 자연스럽게 삽입', r.withSpaceOk === true);
  ok('8. #{공간} 없을 때 중복공백 없이 처리', r.noSpaceOk === true);

  // 4) 버튼 필드가 필요한 4개 항목에 실제로 존재하는지(문서상 약속한 4개)
  r = await page.evaluate(() => {
    return {
      t00: !!ALIM_META.t00_reservation.button,
      t01: !!ALIM_META.t01_survey.button,
      t11: !!ALIM_META.t11_after_install.button,
      tC: !!ALIM_META.tC_payment.button
    };
  });
  ok('9. 버튼 4개(0,1,11,C) 전부 정의됨', r.t00 && r.t01 && r.t11 && r.tC);

  // 5) 알림톡 탭 렌더링 시 에러 없이 뜨는지(실제 UI 스모크)
  await page.evaluate(() => {
    saveCustomers([{ id: 8001, clientName: '통합13테스트', phone: '01088880000', stage: '가견적', staffName: '마스터', date: todayStr() }]);
    openDetail('통합13테스트', 8001, 'alim');
  });
  await new Promise(res => setTimeout(res, 500));
  r = await page.evaluate(() => {
    var text = document.getElementById('detail-alim-body') ? document.getElementById('detail-alim-body').textContent : '';
    return { hasA: text.indexOf('방문 전날 안내') !== -1, hasOther: text.indexOf('취소·기타') !== -1 };
  });
  ok('10. 알림톡 탭에 통합항목(A) 정상 노출', r.hasA === true);
  ok('11. 취소·기타 카테고리 정상 노출', r.hasOther === true);

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
