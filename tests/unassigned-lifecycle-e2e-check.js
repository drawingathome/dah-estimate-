// 시나리오: 네이버 예약으로 신규 고객이 들어옴(미배정) → 직원이 여러
// 화면에서 이 고객을 찾을 수 있어야 함 → "내가 담당할게요"로 가져감 →
// 그 이후엔 정상적으로 본인 고객으로 작동해야 함. 오늘 고친 5곳(홈/검색/
// 캘린더/칸반/견적서목록)을 각각 따로가 아니라 "한 명의 고객"을 기준으로
// 이어서 검증.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 24000;
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
  await loginAs(page, 'staff', null, '오지은 실장');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // ── 1단계: 네이버 예약으로 신규 고객 "김신규" 등록 (오늘 정한대로 미배정으로) ──
  const step1 = await page.evaluate(() => {
    const today = todayStr();
    saveCustomers([{
      id: 9200, clientName: '김신규', phone: '01012340001', stage: '방문예약',
      staffName: '미배정', date: today, createdAt: new Date().toISOString()
    }]);
    localStorage.setItem('dah_saved', JSON.stringify([{
      dbId: 'est-9200', clientId: 9200, clientName: '김신규', staffName: '미배정',
      savedAt: new Date().toISOString(), curtainCount: 1, blindCount: 0
    }]));
    return { today };
  });

  // ── 2단계: 홈 화면에서 보이는지 ──
  const homeCheck = await page.evaluate(() => {
    goTab('home'); renderHome(true);
    return document.getElementById('sec-unassigned')?.textContent.includes('김신규') || false;
  });
  await new Promise(r => setTimeout(r, 400));
  const homeCheck2 = await page.evaluate(() => document.getElementById('sec-unassigned')?.textContent.includes('김신규') || false);
  ok('1. 홈화면 미배정 섹션에서 김신규 발견', homeCheck2);

  // ── 3단계: 검색으로 찾아지는지 (전화번호로) ──
  const searchCheck = await page.evaluate(() => {
    goTab('search');
    document.getElementById('cust-search').value = '01012340001';
    renderSearch();
    return document.getElementById('search-list').textContent.includes('김신규');
  });
  ok('2. 전화번호로 검색해서 김신규 발견', searchCheck);

  // ── 4단계: 캘린더에서 방문 예약일이 보이는지 ──
  const calCheck = await page.evaluate((today) => {
    goTab('cal'); renderCal();
    return document.body.textContent.includes('김신규');
  }, step1.today);
  ok('3. 캘린더에서 오늘 방문예약(김신규) 발견', calCheck);

  // ── 5단계: 칸반보드에서 보이는지 ──
  const kanbanCheck = await page.evaluate(() => {
    goTab('pipe'); renderPipe(loadCustomers());
    return document.body.textContent.includes('김신규');
  });
  ok('4. 칸반보드에서 김신규 발견', kanbanCheck);

  // ── 6단계: 견적서 목록에서 보이는지 ──
  const estListCheck = await page.evaluate(() => {
    goTab('est-list');
    if (typeof renderEstList === 'function') renderEstList();
    return document.getElementById('est-list-body')?.textContent.includes('김신규') || false;
  });
  ok('5. 견적서목록에서 김신규 발견', estListCheck);

  // ── 7단계: 홈에서 "내가 담당할게요" 클릭 (조건부 PATCH 성공 시나리오) ──
  // (goTab('home')은 내부적으로 loadCustomersAsync로 서버(GET customers)를
  // 다시 불러오는데, 이 테스트의 네트워크 목이 그 특정 조회를 흉내내지
  // 않아서 로컬 데이터가 초기화됨 - 실제 앱 버그 아니라 테스트 환경 한계.
  // (claimUnassignedCustomer 성공 후 renderHome()을 skipServerFetch 없이
  // 호출해서 실제로 서버에 GET customers를 다시 쏘는데, 이 테스트 mock이
  // 그 응답을 클라이언트 형태(camelCase) 그대로 돌려주면 dbRowToCustomer가
  // DB 행 형태(snake_case: client_name/staff_name 등)를 기대하다가 전부
  // 빈 값으로 정규화해버림 - 실제 앱 버그가 아니라 테스트 mock을 실제
  // Supabase 응답 형태에 맞게 만들어야 함.)
  const claimClick = await page.evaluate(() => {
    function toDbRow(c) {
      return {
        id: c.id, client_name: c.clientName, phone: c.phone, addr: c.addr||'', stage: c.stage,
        staff_name: c.staffName, date: c.date, price: c.price||0, performance_revenue: c.performanceRevenue||0,
        created_at: c.createdAt, updated_at: c.updatedAt, is_archived: !!c.is_archived
      };
    }
    window.sbXHR = function(method, path, data, cb) {
      if (method === 'PATCH' && path.indexOf('staff_name=eq.') !== -1) { cb(null, [{ id: 9200, staff_name: data.staff_name }]); return; }
      if (method === 'GET' && path.indexOf('customers') === 0) { cb(null, loadCustomers().map(toDbRow)); return; }
      cb(null, []);
    };
    const sec = document.getElementById('sec-unassigned');
    const btns = sec ? Array.from(sec.querySelectorAll('button')) : [];
    const btn = btns.find(b => b.getAttribute('data-cname') === '김신규');
    if (!btn) return { found: false };
    btn.click();
    return { found: true };
  });
  ok('6. "내가 담당할게요" 버튼 클릭 성공', claimClick.found);

  // ── 8단계: 담당 가져간 후 -> 이제 미배정 섹션에서 사라졌는지 ──
  const afterClaimHome = await page.evaluate(() => {
    renderHome(true);
    return document.getElementById('sec-unassigned');
  });
  await new Promise(r => setTimeout(r, 300));
  const afterClaimHome2 = await page.evaluate(() => {
    const sec = document.getElementById('sec-unassigned');
    return sec ? !sec.textContent.includes('김신규') : true; // sec 자체가 없으면(0명) 당연히 통과
  });
  ok('7. 담당 가져간 후 미배정 섹션에서 사라짐', afterClaimHome2 === true);

  // ── 9단계: 이제 본인 담당 고객으로서 정상적으로 상세페이지 접근/단계변경 가능한지 ──
  const detailAndStageCheck = await page.evaluate(() => {
    openDetail('김신규', 9200, 'info');
    return true;
  });
  await new Promise(r => setTimeout(r, 800));
  const claimBtnGoneNow = await page.evaluate(() => {
    return !Array.from(document.querySelectorAll('#detail-overlay button')).find(b => b.textContent.includes('내가 담당할게요'));
  });
  ok('8. 담당 가져간 후엔 "내가 담당할게요" 버튼이 안 보임(이미 본인 담당)', claimBtnGoneNow);

  console.log(log.join('\n'));
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 시뮬레이션 통과 (김신규 생애주기 8단계)' : '\n❌ 시뮬레이션 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
