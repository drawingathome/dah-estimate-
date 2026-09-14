const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9886;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 실제 스크린샷에서 나온 형식 그대로(개인정보는 예시로 변경)
  const sampleText = `정은희
신규예약

예약자
정은희
전화번호
010-7452-1077
예약번호
1350690750
예약유형
일반
이메일
eunhi76@naver.com

예약내역

상품
드로잉엣홈 반포 상담예약
이용일시
2026. 9. 17.(목) 오전 11:00
유입경로
네이버 플레이스 - 업체명 검색`;

  await page.evaluate(() => { openAdd(); });
  await new Promise(r => setTimeout(r, 300));

  let r = await page.evaluate((text) => {
    document.getElementById('add-naver-paste').value = text;
    parseNaverReservationPaste();
    return {
      name: document.getElementById('add-name').value,
      phone: document.getElementById('add-phone').value,
      date: document.getElementById('add-date').value,
      memo: document.getElementById('add-memo').value
    };
  }, sampleText);

  ok('1. 이름 자동추출', r.name === '정은희', r.name);
  ok('2. 전화번호 자동추출', r.phone === '010-7452-1077', r.phone);
  ok('3. 날짜 자동추출(YYYY-MM-DD)', r.date === '2026-09-17', r.date);
  ok('4. 방문시간이 메모에 기록됨', r.memo.indexOf('오전 11:00') !== -1, r.memo);

  // 붙여넣은 내용이 없을 때 안내
  r = await page.evaluate(() => {
    document.getElementById('add-naver-paste').value = '';
    var toastMsgs = [];
    window.showToast = function(m) { toastMsgs.push(m); };
    parseNaverReservationPaste();
    return toastMsgs;
  });
  ok('5. 빈 값일 때 안내 문구', r.some(m => m.indexOf('없어요') !== -1), JSON.stringify(r));

  // 형식이 다른(못 알아보는) 텍스트일 때 안내
  r = await page.evaluate(() => {
    document.getElementById('add-naver-paste').value = '알 수 없는 형식의 텍스트입니다';
    var toastMsgs = [];
    window.showToast = function(m) { toastMsgs.push(m); };
    document.getElementById('add-name').value = '';
    document.getElementById('add-phone').value = '';
    parseNaverReservationPaste();
    return { toastMsgs: toastMsgs, name: document.getElementById('add-name').value };
  });
  ok('6. 못 알아보는 텍스트는 안내만 하고 기존 값 안 건드림', r.toastMsgs.some(m => m.indexOf('못 찾았어요') !== -1) && r.name === '');

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
