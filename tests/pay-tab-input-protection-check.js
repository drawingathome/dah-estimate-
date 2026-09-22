// tests/pay-tab-input-protection-check.js
// 2026-09-21(선혜님 - "안전하게 해야지" 지시로 신설): 결제탭이 "로컬
// 캐시가 견적서 없음으로 판단하면 서버로 재확인"하는 안전장치(29666b1,
// 김은/황남주 근본 수정) 자체는 좋지만, 그 서버 응답이 도착하는 찰나에
// 사용자가 이미 고객레벨 폴백 폼에 선금/잔금 금액을 입력하기 시작했다면
// 화면이 통째로 다시 그려지며 입력값이 사라질 이론적 위험이 있었음.
// 로컬 캐시 자체는 이미 서버 기준으로 바로잡히므로, 지금 당장 화면을
// 안 바꿔도 다음에 다시 열면 정확하게 나옴 - 입력 중일 땐 재렌더링을
// 건너뛰도록 보강. 검증: 입력 중일 땐 화면이 안 바뀌고 값이 유지되는지,
// 입력 전(아직 손 안 댐)이면 정상적으로 서버 기준으로 갱신되는지.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

function setupNetwork(page, estGetDelayMs) {
  return page.setRequestInterception(true).then(() => {
    page.on('request', (req) => {
      const url = req.url();
      const method = req.method();
      if (url.includes('supabase.co')) {
        if (method === 'OPTIONS') {
          req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } });
          return;
        }
        if (url.includes('/rest/v1/app_settings') && url.includes('staff_emails')) {
          req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ value: {} }]) });
          return;
        }
        if (url.includes('/auth/v1/token') && req.postData()) {
          let body; try { body = JSON.parse(req.postData()); } catch (e) { body = {}; }
          if (body.password === 'TEST_OK_PW') {
            req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ access_token: 'test-fake-token', refresh_token: 'test-fake-refresh', expires_in: 3600, user: { id: 'test-fake-uuid', email: body.email } }) });
          } else {
            req.respond({ status: 400, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error_description: 'Invalid login credentials' }) });
          }
          return;
        }
        if (method === 'GET' && url.includes('/rest/v1/estimates') && url.includes('client_id=eq.')) {
          // 서버엔 실제로 견적서(완납)가 있다고 응답 - 일부러 지연을 줘서
          // "사용자가 입력을 시작한 뒤에" 도착하는 상황을 재현.
          // 2026-09-21(병합 후 재검증 중 발견): 다른 세션이 이 응답의
          // client_id가 요청한 고객과 실제로 일치하는지 검증하는 안전장치를
          // 추가했음(무관한 응답을 진짜로 오인하던 버그 수정) - 이 mock도
          // 고정값이 아니라 요청 URL에서 실제 client_id를 읽어 그대로
          // 돌려줘야 시나리오 2(다른 고객 id)에서도 정확히 매칭됨.
          var reqClientId = decodeURIComponent(url.split('client_id=eq.')[1].split('&')[0]);
          setTimeout(() => {
            req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([
              { id: 'srv-est-1', client_id: Number(reqClientId), client_name: '서버지연테스트', price: 2000000,
                deposit_amount: 1000000, deposit_date: '2026-09-01', deposit_method: '카드', deposit_receipt: true,
                balance_amount: 1000000, balance_date: '2026-09-10', balance_method: '현금', balance_receipt: false,
                contract_status: 'contracted', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }
            ]) });
          }, estGetDelayMs);
          return;
        }
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
        return;
      }
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
    });
  });
}

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 28400;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await setupNetwork(page, 500); // 서버 응답을 500ms 지연
  await page.setViewport({ width: 390, height: 1000 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 시나리오 1: 로컬 캐시엔 견적서 없음(신규 고객처럼 보임), 결제탭 열자마자 입력 시작
  await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([]));
    saveCustomers([{ id: 9700, clientName: '서버지연테스트', phone: '01099990000', stage: '선금결제', staffName: '마스터', price: 2000000 }]);
    openDetail('서버지연테스트', 9700);
  });
  await new Promise(r => setTimeout(r, 200)); // 서버 응답(500ms) 도착 전에 입력 시작
  await page.evaluate(() => {
    var input = document.querySelector('input[placeholder="선금 금액"]');
    input.value = '777777';
    input.focus();
  });
  await new Promise(r => setTimeout(r, 700)); // 서버 응답이 도착하고도 남을 시간 대기
  const afterState = await page.evaluate(() => {
    var input = document.querySelector('input[placeholder="선금 금액"]');
    return { stillExists: !!input, value: input ? input.value : null };
  });
  ok('1. [핵심] 입력 중이던 값(777777)이 서버 재확인 도착 후에도 안 사라지고 유지됨', afterState.value === '777777', JSON.stringify(afterState));

  // 시나리오 2(회귀방지): 아무 입력도 안 하고 그냥 기다리면, 서버 기준으로 정상 갱신됨
  await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([]));
    saveCustomers([{ id: 9701, clientName: '서버지연테스트2', phone: '01099990001', stage: '선금결제', staffName: '마스터', price: 2000000 }]);
    openDetail('서버지연테스트2', 9701);
  });
  await new Promise(r => setTimeout(r, 900)); // 입력 없이 서버 응답 기다림
  const updatedState = await page.evaluate(() => document.body.textContent);
  ok('2. [회귀방지] 입력을 전혀 안 했으면 서버 기준(완납 견적서)으로 정상적으로 다시 그려짐', updatedState.includes('완납') || updatedState.includes('1,000,000'), updatedState.includes('완납'));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
