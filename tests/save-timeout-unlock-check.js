// tests/save-timeout-unlock-check.js
// 2026-09-21(선혜님 - "니가 한 자료 계속 똑같은 문제가 생기지 무조건
// 원인 찾아!!" - 민소아 견적서: 실제 서버 DB(estimate_history,
// client_error_logs)를 직접 조회해도 토요일 저장 시도의 흔적이
// 전혀 없던 두 번째 재발("인테리어오월"에 이어)로 원인 조사 중 발견):
// xhr.onload/onerror 콜백이 브라우저 사정으로(탭이 백그라운드로
// 전환되며 요청이 멈추는 등, 오지은 실장님 태블릿 사례와 같은 유형)
// 영원히 한 번도 안 불리면, 저장 버튼이 disabled 상태로 영구히 남아
// 그 이후의 모든 저장 시도가 "if (btn.disabled) return;"에서 로그도
// 없이 조용히 씹히는 치명적인 경로가 있었음 - 이게 정확히 "저장완료가
// 안 뜬 게 아니라 아예 아무 반응도 없이 서버에 흔적 자체가 안 남는"
// 증상과 일치함. 서버 요청에 15초 타임아웃을 걸어 강제로 실패
// 처리해서 버튼이 절대 영구히 잠기지 않게 함 + 저장의 각 단계
// (검증/확인창/세션갱신/서버응답/타임아웃)를 전부 진단 로그(로컬+
// 서버 client_error_logs)로 남겨서, 다음에 또 이런 일이 생기면
// 정확히 어느 단계에서 멈췄는지 100% 확인 가능하게 함.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27700;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

  // 고객/견적서 저장 요청 둘 다 절대 응답 안 함(영원히 pending) - 백그라운드 전환 등으로
  // xhr.onload/onerror가 한 번도 안 불리는 상황을 재현
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/customers') && (method === 'POST' || method === 'PATCH')) { return; } // 응답 안 줌(무한 대기)
      if (url.includes('/customers') && url.includes('select=addr')) { req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ addr: '서울시 강남구', measure_date: null, install_date: null, deposit_amount: 0 }]) }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  await page.setViewport({ width: 390, height: 1000 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await setupValidSession(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));

  await page.evaluate(() => {
    document.getElementById('c-name').value = '타임아웃테스트';
    document.getElementById('c-phone').value = '010-1111-2222';
    document.getElementById('c-addr').value = '서울시 강남구';
    document.getElementById('c-measure-tbd').checked = true;
    document.getElementById('c-install-tbd').checked = true;
    const tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.mw').value = '200'; tr.querySelector('.mh').value = '200';
    tr.querySelector('.cprice').value = '500000';
    calcCurtainRow(tr.querySelector('.cprice'));
  });
  const before = await page.evaluate(() => document.getElementById('btn-save-estimate')?.disabled);
  ok('0. 저장 전 버튼이 비활성화 상태가 아님(재현 조건)', before === false, 'before=' + before);

  await page.evaluate(() => { saveEstimate(); });
  await new Promise(r => setTimeout(r, 16000)); // 실제 타임아웃(15000ms) 발동 대기

  const afterTimeout = await page.evaluate(() => document.getElementById('btn-save-estimate')?.disabled);
  ok('1. [핵심] 서버 응답이 영원히 없어도(타임아웃), 저장 버튼이 다시 활성화됨(영구 잠김 방지)', afterTimeout === false, 'afterTimeout=' + afterTimeout);

  // 버튼이 다시 활성화됐으니, 이제 재시도가 실제로 다시 정상 작동하는지(조용히 안 씹히는지) 확인
  const diagLog = await page.evaluate(() => JSON.parse(localStorage.getItem('dah_save_diagnostics')||'[]'));
  const hasTimeoutStage = diagLog.some(l => l.stage.includes('타임아웃'));
  ok('2. 타임아웃 발생이 진단 로그에 정확히 기록됨', hasTimeoutStage, JSON.stringify(diagLog.map(l=>l.stage)));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
