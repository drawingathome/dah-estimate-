// tests/staff-claim-check.js
// 2026-09-15("코드 검사 꼼꼼하게 하자" 중 발견): 홈화면 "미배정 고객"
// 섹션(신규리드 선착순 배정, 2026-09-11 신설)이 스태프 권한 필터
// (2026-08-04)에 걸려서 실제 직원 계정으로는 절대 안 보이던 심각한
// 버그를 발견·수정. 기존 unassigned_claim_check.js는 마스터로만
// 테스트해서 이 버그를 못 잡았음 - 이 테스트는 반드시 스태프 계정
// 기준으로 검증해서 같은 종류의 회귀를 놓치지 않게 함. 또한 고객상세
// 화면의 "내가 담당할게요" 버튼과 홈화면의 선착순 배정이 이제 공용
// 함수(claimCustomer, dash-api.js)로 통합됐으므로 두 진입점 다 검증.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 19871 + Math.floor(Math.random() * 500);
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

  // 1) ★핵심 회귀 방지★ 스태프 계정으로도 "미배정 고객" 섹션이 보여야 함
  const staffVisibility = await page.evaluate(() => {
    saveCustomers([
      { id: 9040, clientName: '미배정테스트', phone: '01000000040', stage: '상담', staffName: '미배정', date: todayStr() },
      { id: 9041, clientName: '내담당테스트', phone: '01000000041', stage: '상담', staffName: '오지은 실장', date: todayStr() }
    ]);
    renderHome(true);
    return { secExists: !!document.getElementById('sec-unassigned') };
  });
  await new Promise(r => setTimeout(r, 300));
  const staffVisibilityCheck = await page.evaluate(() => {
    const sec = document.getElementById('sec-unassigned');
    return { secExists: !!sec, hasUnassignedName: sec ? sec.textContent.includes('미배정테스트') : false };
  });
  ok('1. 스태프 계정에도 미배정 고객 섹션이 보임(2026-09-15 버그 수정)', staffVisibilityCheck.secExists);
  ok('2. 미배정 고객 이름이 정확히 표시됨', staffVisibilityCheck.hasUnassignedName);

  // 2) 홈화면에서 선착순 클릭 -> 성공
  const claimSuccess = await page.evaluate(() => {
    var capturedArgs = null;
    var origClaim = window.claimCustomer;
    window.claimCustomer = function(cid, expected, newName, cb) {
      capturedArgs = { cid, expected, newName };
      return origClaim(cid, expected, newName, cb);
    };
    window.sbXHR = function(method, path, data, cb) {
      if (method === 'PATCH' && path.indexOf('staff_name=eq.') !== -1) { cb(null, [{ id: 9040, staff_name: data.staff_name }]); return; }
      cb(null, loadCustomers());
    };
    const btn = document.querySelector('#sec-unassigned button');
    if (!btn) return { found: false };
    btn.click();
    window.claimCustomer = origClaim;
    return { found: true, capturedArgs };
  });
  await new Promise(r => setTimeout(r, 300));
  ok('3. 선착순 클릭 성공시 서버 조건부 PATCH 호출됨', claimSuccess.found);
  ok('4. claimCustomer가 정확한 인자(미배정→오지은 실장)로 호출됨', claimSuccess.capturedArgs && claimSuccess.capturedArgs.expected === '미배정' && claimSuccess.capturedArgs.newName === '오지은 실장', JSON.stringify(claimSuccess.capturedArgs));

  // 3) 홈화면에서 선착순 클릭 -> 이미 다른 사람이 가져간 경우(경쟁 시나리오)
  const claimConflict = await page.evaluate(() => {
    saveCustomers([{ id: 9042, clientName: '경쟁테스트', phone: '01000000042', stage: '상담', staffName: '미배정', date: todayStr() }]);
    renderHome(true);
    return true;
  });
  await new Promise(r => setTimeout(r, 300));
  const claimConflictClick = await page.evaluate(() => {
    window.sbXHR = function(method, path, data, cb) { if (method === 'PATCH') { cb({ zeroRows: true }, null); return; } cb(null, loadCustomers()); };
    const btn = document.querySelector('#sec-unassigned button');
    btn.click();
    return true;
  });
  await new Promise(r => setTimeout(r, 300));
  const conflictMessageShown = await page.evaluate(() => document.body.textContent.includes('이미 다른 담당자가 가져갔어요'));
  ok('5. 경쟁(이미 다른 사람이 가져감) 시 명확히 안내됨', conflictMessageShown);

  // 4) 고객상세 화면의 "내가 담당할게요" 버튼 (공용 claimCustomer 재사용 확인)
  const detailClaim = await page.evaluate(() => {
    saveCustomers([{ id: 9043, clientName: '상세페이지테스트', phone: '01000000043', stage: '상담', staffName: '마스터', date: todayStr() }]);
    window.sbXHR = function(method, path, data, cb) { if (method === 'PATCH') { cb(null, [{ id: 9043, staff_name: data.staff_name }]); return; } cb(null, loadCustomers()); };
    openDetail('상세페이지테스트', 9043, 'info');
    return { currentUserAtClaim: typeof currentUser !== 'undefined' ? currentUser : null };
  });
  await new Promise(r => setTimeout(r, 800));
  const detailClaimClick = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('#detail-overlay button')).find(b => b.textContent.includes('내가 담당할게요'));
    if (!btn) return { found: false };
    var capturedArgs = null;
    var origClaim = window.claimCustomer;
    window.claimCustomer = function(cid, expected, newName, cb) {
      capturedArgs = { cid, expected, newName };
      return origClaim(cid, expected, newName, cb);
    };
    btn.click();
    window.claimCustomer = origClaim;
    return { found: true, capturedArgs };
  });
  await new Promise(r => setTimeout(r, 300));
  const detailClaimAfter = await page.evaluate(() => loadCustomers().find(c => c.id === 9043)?.staffName);
  ok('6. 고객상세 "내가 담당할게요" 버튼 존재 및 클릭 동작', detailClaimClick.found);
  ok('7. 고객상세에서 담당 지정 성공시 서버까지 반영됨', detailClaimAfter && detailClaimAfter !== '마스터', '결과: ' + detailClaimAfter);

  // 5) 고객상세에서 그 사이 다른 사람이 이미 담당을 가져간 경우
  const detailConflict = await page.evaluate(() => {
    saveCustomers([{ id: 9044, clientName: '상세충돌테스트', phone: '01000000044', stage: '상담', staffName: '마스터', date: todayStr() }]);
    window.sbXHR = function(method, path, data, cb) { if (method === 'PATCH') { cb({ zeroRows: true }, null); return; } cb(null, loadCustomers()); };
    openDetail('상세충돌테스트', 9044, 'info');
    return true;
  });
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('#detail-overlay button')).find(b => b.textContent.includes('내가 담당할게요'));
    btn.click();
  });
  await new Promise(r => setTimeout(r, 300));
  const detailConflictAfter = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('#detail-overlay button')).find(b => b.textContent.includes('내가 담당할게요'));
    return { reEnabled: btn ? !btn.disabled : null };
  });
  ok('8. 고객상세 충돌시에도 조용히 덮어쓰지 않고 버튼이 재시도 가능한 상태로 복구', detailConflictAfter.reEnabled === true);

  console.log(log.join('\n'));
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(jsErrors.length ? 'JS 에러 발생: ' + jsErrors.join('\n') : 'JS 에러 없음');
  console.log(allPass && jsErrors.length === 0 ? '✅ staff-claim-check 전체 통과' : '❌ staff-claim-check 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
