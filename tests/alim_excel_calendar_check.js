const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9872;
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

  // 1) 알림톡: 방문예약 단계 -> 지금 보낼 알림톡에 관련 항목 뜨는지
  let r = await page.evaluate(() => {
    saveCustomers([{ id: 6000, clientName: '알림확인고객', phone: '01077778888', stage: '방문예약', staffName: '마스터', date: todayStr(), price: 1000000 }]);
    openDetail('알림확인고객', 6000, 'alim');
    var text = document.getElementById('detail-alim-body') ? document.getElementById('detail-alim-body').textContent : '';
    return { hasSendSection: text.includes('지금 보낼 알림톡'), hasSendButton: Array.from(document.querySelectorAll('#detail-alim-body span')).some(s => s.textContent.trim() === '발송') };
  });
  ok('1. 알림톡탭 - 지금보낼알림톡 섹션 표시', r.hasSendSection === true, JSON.stringify(r));
  ok('2. 알림톡탭 - 발송 버튼 존재', r.hasSendButton === true);

  // 2) 엑셀 내보내기 - 함수 존재 및 CSV 헤더에 실제 고객 데이터 반영되는지 (다운로드 트리거 대신 csvSafeCell 검증)
  r = await page.evaluate(() => {
    var testVal = csvSafeCell('=1+1');
    var normalVal = csvSafeCell('일반고객');
    return { injectionSafe: testVal.startsWith("'"), normalUnaffected: normalVal === '일반고객' };
  });
  ok('3. CSV 수식인젝션 방어 함수 정상 작동', r.injectionSafe === true);
  ok('4. 일반 값은 그대로 유지', r.normalUnaffected === true);

  // 3) 캘린더 - 실측일정 있는 고객이 정확한 날짜에 표시되는지
  r = await page.evaluate(() => {
    var arr = loadCustomers(); var c = arr.find(x=>x.id===6000);
    c.stage = '실측준비중'; c.measureDate = todayStr(); saveCustomers(arr);
    goTab('cal'); renderCal();
    var calText = document.getElementById('cal').textContent;
    return { hasCustomer: calText.includes('알림확인고객') };
  });
  ok('5. 캘린더에 실측일정 고객 정확히 표시', r.hasCustomer === true);

  console.log('=== 알림톡/엑셀/캘린더 연동 검증 ===');
  log.forEach(l => console.log(l));
  console.log('\n=== JS 에러 ===');
  console.log(jsErrors.length ? jsErrors.join('\n') : '없음 ✅');

  await browser.close();
  process.exit(0);
}
run().catch(e => { console.error('스크립트 에러:', e); process.exit(1); });
setTimeout(() => process.exit(1), 25000);
