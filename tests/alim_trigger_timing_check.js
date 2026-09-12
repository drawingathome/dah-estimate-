const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9882;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  const r = await page.evaluate(() => {
    var now = new Date();
    function iso(daysOffset) { var d = new Date(now); d.setDate(d.getDate() + daysOffset); return d.toISOString().slice(0,10); }
    function out(cond) { return !!cond; }

    var results = {};

    // 1) 방문일이 10일 뒤 → tA(방문전날) 아직 안 뜸
    var c1 = { id:1, stage:'방문예약', date: iso(10) };
    results.tenDaysAway = !isAlimDueNow('tA_visit_dday', c1, null, now);

    // 2) 방문일이 내일 → tA 떠야 함
    var c2 = { id:2, stage:'방문예약', date: iso(1) };
    results.tomorrow = isAlimDueNow('tA_visit_dday', c2, null, now);

    // 3) 방문일이 오늘(당일 급행예약) → tA 즉시 떠야 함(D-1 기다리지 않음)
    var c3 = { id:3, stage:'방문예약', date: iso(0) };
    results.today = isAlimDueNow('tA_visit_dday', c3, null, now);

    // 4) 이미 그 날짜로 보냈으면 다시 안 뜸
    var sent4 = { forDate: iso(1) };
    var c4 = { id:4, stage:'방문예약', date: iso(1) };
    results.alreadySentSameDate = !isAlimDueNow('tA_visit_dday', c4, sent4, now);

    // 5) 재예약으로 날짜가 바뀌면(이전엔 보냈지만 다른 날짜였음) 다시 떠야 함
    var sent5 = { forDate: iso(15) }; // 예전 날짜로 이미 보냈었음
    var c5 = { id:5, stage:'방문예약', date: iso(1) }; // 재예약으로 내일로 변경됨
    results.rescheduled = isAlimDueNow('tA_visit_dday', c5, sent5, now);

    // 6) 방금 생성된 고객(createdAt=지금) → 설문지 아직 안 뜸
    var c6 = { id:6, stage:'방문예약', createdAt: now.toISOString() };
    results.justCreated = !isAlimDueNow('t01_survey', c6, null, now);

    // 7) 1시간 전 생성 → 설문지 떠야 함
    var oneHourAgo = new Date(now.getTime() - 61*60*1000);
    var c7 = { id:7, stage:'방문예약', createdAt: oneHourAgo.toISOString() };
    results.oneHourAgo = isAlimDueNow('t01_survey', c7, null, now);

    // 8) 상담 3일 지났지만 이미 선금결제 단계(결제완료) → 팔로업 안 떠야 함(재확인)
    var c8 = { id:8, stage:'선금결제', date: iso(-5) };
    results.alreadyPaidNoFollowup = !isAlimDueNow('t04_followup', c8, null, now);

    // 9) 상담 3일 지났고 아직 가견적 단계(미결제) → 팔로업 떠야 함
    var c9 = { id:9, stage:'가견적', date: iso(-3) };
    results.unpaidFollowup = isAlimDueNow('t04_followup', c9, null, now);

    // 10) 즉시성 항목(t00 등)은 기존처럼 안 보냈으면 바로 뜸
    var c10 = { id:10, stage:'방문예약' };
    results.immediateItemStillWorks = isAlimDueNow('t00_reservation', c10, null, now);

    return results;
  });

  ok('1. 방문 10일 전 → 전날안내 아직 안뜸', r.tenDaysAway);
  ok('2. 방문 내일 → 전날안내 뜸', r.tomorrow);
  ok('3. 당일 급행예약 → D-1 안기다리고 즉시 뜸', r.today);
  ok('4. 같은 날짜로 이미 보냄 → 중복 안뜸', r.alreadySentSameDate);
  ok('5. 재예약으로 날짜변경 → 다시 뜸(자동 리셋)', r.rescheduled);
  ok('6. 방금생성 → 설문지 아직 안뜸(30분 대기)', r.justCreated);
  ok('7. 1시간전 생성 → 설문지 뜸', r.oneHourAgo);
  ok('8. 이미 결제한 단계 → 팔로업 안뜸(재확인 원칙)', r.alreadyPaidNoFollowup);
  ok('9. 미결제 3일경과 → 팔로업 뜸', r.unpaidFollowup);
  ok('10. 즉시성 항목(t00)은 기존 방식 그대로 작동', r.immediateItemStillWorks);

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
