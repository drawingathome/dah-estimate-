// tests/month-close-check.js
// 2026-10-10(선혜님 - 성과매출은 지난달 숫자가 안 바뀌어야 한다): 월 마감 저장 → 이후 고객 데이터를 고쳐도 마감한 달 숫자는 그대로,
// 이번 달은 마감 대상 아님, 직원은 마감값을 불러오지 않음(마스터 전용), 마감 뒤 차이가 화면에 보임.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27144;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  const reqs = { getClose: 0, post: [], patch: [] };
  const H = { 'Access-Control-Allow-Origin': '*' };
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url(); const method = req.method();
    if (url.includes('supabase.co')) {
      if (method === 'OPTIONS') { req.respond({ status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' }, H) }); return; }
      if (url.includes('/rest/v1/app_settings') && url.includes('staff_emails')) { req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([{ value: {} }]) }); return; }
      if (url.includes('/auth/v1/token') && req.postData()) {
        let b = {}; try { b = JSON.parse(req.postData()); } catch (e) {}
        if (url.includes('grant_type=refresh_token')) { req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ access_token: 'test-refreshed-token', refresh_token: 'test-refreshed-refresh', expires_in: 3600, user: { id: 'test-fake-uuid' } }) }); return; }
        if (b.password === 'TEST_OK_PW') { req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ access_token: 'test-fake-token', refresh_token: 'test-fake-refresh', expires_in: 3600, user: { id: 'test-fake-uuid', email: b.email } }) }); return; }
        req.respond({ status: 400, contentType: 'application/json', headers: H, body: JSON.stringify({ error_description: 'Invalid login credentials' }) }); return;
      }
      if (url.includes('/monthly_close')) {
        if (method === 'GET') { reqs.getClose++; req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' }); return; }
        let body = {}; try { body = JSON.parse(req.postData()); } catch (e) {}
        if (method === 'POST') { reqs.post.push(body); req.respond({ status: 201, contentType: 'application/json', headers: H, body: JSON.stringify([Object.assign({ closed_at: new Date().toISOString() }, body)]) }); return; }
        if (method === 'PATCH') { reqs.patch.push(body); req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([body]) }); return; }
      }
      req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
  });
  await page.setViewport({ width: 390, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 600));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }
  ok('0. 마스터 로그인 시 마감값(monthly_close)을 서버에서 불러옴', reqs.getClose >= 1, 'GET ' + reqs.getClose + '회');

  // 지난달 키와 이번달 키
  const keys = await page.evaluate(() => {
    var d = new Date(); var p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return { cur: curMonthKeyLocal(), last: p.getFullYear() + '-' + String(p.getMonth() + 1).padStart(2, '0'), lastDay: p.getFullYear() + '-' + String(p.getMonth() + 1).padStart(2, '0') + '-10' };
  });

  // 1) 지난달에 100만원 입금된 고객 → 성과매출 100만원
  await page.evaluate((k) => {
    saveCustomers([{ id: 9501, clientName: '마감시험고객', phone: '01000009501', stage: '선금결제', staffName: '마스터', date: k.lastDay,
      price: 2000000, depositAmount: 1000000, depositDate: k.lastDay, balanceAmount: 0 }]);
  }, keys);
  const live1 = await page.evaluate((k) => getMonthPerformanceRevenue(loadCustomers(), k.last), keys);
  ok('1. 마감 전에는 지금 데이터로 계산(성과매출 1,000,000)', Math.round(live1) === 1000000, String(live1));

  // 2) 마감하기 → POST 저장 + 메모리 반영
  await page.evaluate((k) => { closeMonthNow(k.last); }, keys);
  await new Promise(r => setTimeout(r, 600));
  const post = reqs.post[0];
  ok('2. 마감하면 서버에 해당 월·성과매출 1,000,000이 저장됨', !!post && post.month === keys.last && Math.round(post.perf_revenue) === 1000000 && Math.round(post.revenue) === 1000000, JSON.stringify(post && { m: post.month, p: post.perf_revenue }));
  ok('2-1. 담당자별 값도 함께 저장됨', !!post && post.by_staff && post.by_staff['마스터'] && Math.round(post.by_staff['마스터'].rev) === 1000000, JSON.stringify(post && post.by_staff));

  // 3) 고객 데이터를 고쳐도 마감한 달은 그대로
  await page.evaluate((k) => {
    saveCustomers([{ id: 9501, clientName: '마감시험고객', phone: '01000009501', stage: '선금결제', staffName: '마스터', date: k.lastDay,
      price: 3000000, depositAmount: 2500000, depositDate: k.lastDay, balanceAmount: 0 }]);
  }, keys);
  const after = await page.evaluate((k) => ({
    frozen: getMonthPerformanceRevenue(loadCustomers(), k.last),
    liveNow: getMonthPerformanceRevenue(loadCustomers(), k.last, true),
    rev: getMonthRevenue(loadCustomers(), k.last),
    staff: getMonthStaffPerformance(loadCustomers(), k.last)
  }), keys);
  ok('3. [핵심] 마감 뒤 고객 금액을 고쳐도 지난달 성과매출은 1,000,000 그대로', Math.round(after.frozen) === 1000000, String(after.frozen));
  ok('3-1. 마감값을 무시하고 계산하면 바뀐 현재값(2,500,000)이 나옴(차이 확인용)', Math.round(after.liveNow) === 2500000, String(after.liveNow));
  ok('3-2. 입금 합계·담당자별도 마감값 유지', Math.round(after.rev) === 1000000 && Math.round(after.staff['마스터'].rev) === 1000000, JSON.stringify(after));

  // 4) 화면: 월 마감 카드에 마감됨 + 차이 표시
  await page.evaluate(() => { renderMonthClosePanel(); });
  const panel = await page.evaluate((k) => {
    var rows = Array.from(document.querySelectorAll('#chart-monthclose .month-close-row'));
    var row = rows.find(r => r.textContent.indexOf(k.last) !== -1);
    return { n: rows.length, text: row ? row.textContent : '', shown: document.getElementById('chart-card-monthclose').style.display !== 'none' };
  }, keys);
  ok('4. 월 마감 카드가 마스터에게 6개월 표시됨', panel.shown && panel.n === 6, JSON.stringify({ n: panel.n, shown: panel.shown }));
  ok('4-1. 마감된 달은 "🔒 마감됨"과 현재 계산과의 차이(+1,500,000원)가 보임', panel.text.indexOf('마감됨') !== -1 && panel.text.indexOf('1,500,000') !== -1, panel.text);

  // 5) 다시 마감 → PATCH
  await page.evaluate((k) => { closeMonthNow(k.last); }, keys);
  await new Promise(r => setTimeout(r, 600));
  ok('5. 이미 마감된 달을 다시 마감하면 PATCH로 갱신(현재 계산 2,500,000 저장)', reqs.patch.length === 1 && Math.round(reqs.patch[0].perf_revenue) === 2500000, JSON.stringify(reqs.patch[0] && reqs.patch[0].perf_revenue));

  // 6) 이번 달은 마감값이 있어도 무시(진행 중인 달은 항상 실시간)
  const curIgnored = await page.evaluate((k) => {
    window._monthClose[k.cur] = { month: k.cur, revenue: 1, perf_revenue: 1, by_staff: {} };
    return getClosedMonth(k.cur) === null;
  }, keys);
  ok('6. 이번 달은 마감 대상이 아니라 마감값이 있어도 무시됨', curIgnored);

  // 7) 직원은 마감값을 불러오지 않고 카드도 안 보임
  const before = reqs.getClose;
  const staffRes = await page.evaluate(() => {
    currentUser = { name: '오지은 실장', role: 'staff' };
    window._monthClose = {};
    loadMonthClose(function () {});
    renderMonthClosePanel();
    return { hidden: document.getElementById('chart-card-monthclose').style.display === 'none' };
  });
  await new Promise(r => setTimeout(r, 300));
  ok('7. 직원 화면은 마감값 요청을 안 보내고 월 마감 카드를 숨김', reqs.getClose === before && staffRes.hidden, JSON.stringify({ requests: reqs.getClose - before, hidden: staffRes.hidden }));

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 && jsErrors.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');
  await browser.close(); server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
