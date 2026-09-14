const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9899;
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

  // 황남주 사례 재현: 시공준비중 단계, 8번(일정확정)이 지금 할 일로 뜨는 상황
  await page.evaluate(() => {
    saveCustomers([{ id: 7001, clientName: 'UX테스트고객', phone: '01077770000', stage: '시공준비중', staffName: '마스터', installDate: '2026-09-20' }]);
    openDetail('UX테스트고객', 7001, 'alim');
  });
  await new Promise(res => setTimeout(res, 500));

  // 0) 2026-09-14(선혜님 지시 - "아코디언을 완전히 접어서 버튼 뒤로"):
  // "전체 이력 보기" 버튼 하나만 보이고, 10개 단계 목록 자체가 안 보여야 함
  let r0 = await page.evaluate(() => {
    var body = document.getElementById('detail-alim-body');
    var text = body.textContent;
    return { hasToggleBtn: text.indexOf('전체 이력 보기') !== -1, hasStageListVisible: text.indexOf('방문예약 (발송') !== -1 && (function(){
      var els = Array.from(body.querySelectorAll('div')).filter(function(d){ return d.textContent.trim().indexOf('방문예약 (발송') === 0; });
      return els.length > 0 && getComputedStyle(els[0].parentElement).display !== 'none';
    })() };
  });
  ok('0-1. "전체 이력 보기" 버튼이 있음', r0.hasToggleBtn);
  r0 = await page.evaluate(() => {
    var toggle = Array.from(document.querySelectorAll('#detail-alim-body div')).find(function(d){
      return d.children.length === 2 && d.children[0].tagName === 'SPAN' && d.children[0].textContent.trim() === '전체 이력 보기';
    });
    var listWrap = toggle ? toggle.nextElementSibling : null;
    return { closedByDefault: listWrap ? getComputedStyle(listWrap).display === 'none' : null };
  });
  ok('0-2. 목록이 기본적으로 완전히 숨겨져 있음', r0.closedByDefault === true, JSON.stringify(r0));

  r0 = await page.evaluate(() => {
    var toggle = Array.from(document.querySelectorAll('#detail-alim-body div')).find(function(d){
      return d.children.length === 2 && d.children[0].tagName === 'SPAN' && d.children[0].textContent.trim() === '전체 이력 보기';
    });
    toggle.click();
    var listWrap = toggle.nextElementSibling;
    return { openedAfterClick: getComputedStyle(listWrap).display !== 'none', hasStageNames: listWrap.textContent.indexOf('방문예약 (발송') !== -1 };
  });
  ok('0-3. 버튼 클릭하면 10개 단계 목록이 펼쳐짐', r0.openedAfterClick && r0.hasStageNames, JSON.stringify(r0));

  let r = await page.evaluate(() => {
    var body = document.getElementById('detail-alim-body');
    var text = body ? body.textContent : '';
    // "시공준비중" 헤더 찾기
    var headers = Array.from(body.querySelectorAll('div')).filter(function(d) {
      return d.textContent.indexOf('시공준비중') === 0 || (d.children.length && d.children[0] && d.children[0].textContent.indexOf('시공준비중') !== -1);
    });
    return { fullText: text.slice(0, 1500) };
  });
  ok('1. "발송" 이라는 설명이 단계 옆 숫자에 붙어있음', r.fullText.indexOf('(발송 ') !== -1, r.fullText.match(/\(발송[^)]*\)/g));

  // 2) 모든 아코디언이 기본적으로 접혀있는지(펼쳐진 body가 하나도 없어야 함)
  r = await page.evaluate(() => {
    var body = document.getElementById('detail-alim-body');
    var master = Array.from(body.querySelectorAll('div')).find(function(d){
      return d.children.length === 2 && d.children[0].tagName === 'SPAN' && d.children[0].textContent.trim() === '전체 이력 보기';
    });
    var stageListWrap = master ? master.nextElementSibling : null;
    var openBodies = 0;
    if (stageListWrap) {
      Array.from(stageListWrap.children).forEach(function(child) {
        if (child.style.display === 'block') openBodies++;
      });
    }
    return openBodies;
  });
  ok('2. 마스터 토글을 열어도, 그 안의 10개 단계는 개별적으로 여전히 다 접혀있음', r === 0, '펼쳐진 개수=' + r);

  // 2026-09-14(선혜님 지시로 "지금 보낼 알림톡" 핀 박스를 소통탭에서
  // 아예 제거함 - 정보탭 한 곳에만 남김): 이제 소통탭엔 그 박스 자체가
  // 없어야 하고, 같은 항목이 여러 단계에 "공통"으로 배정돼 여러 아코디언에
  // 나오는 건 정상(예: "실측·시공·AS 공통" 항목) - 중복 제거 대상이 아님.
  r = await page.evaluate(() => {
    var body = document.getElementById('detail-alim-body');
    return body.textContent.indexOf('📌 지금 보낼 알림톡') === -1;
  });
  ok('3. 소통탭에 "지금 보낼 알림톡" 핀 박스가 더 이상 없음(정보탭에만 남김)', r === true);

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
