// savePayData → changeStage 연쇄 호출시 락값(updatedAt) 동기화 검증
// 2026-09-08(선혜님 지적 - "너가 이런데이터를 만들기만 하고 방치한게
// 꽤 되는걸로 아는데!??"로 실제 client_error_logs를 확인하다 발견):
// 9/6에 "savePayData의 PATCH가 끝난 뒤에만 changeStage가 실행되도록
// 순서 보장"으로 고쳤다고 배포했는데, savePayData의 PATCH 성공 후
// 로컬스토리지 락값(updatedAt) 갱신을 빠뜨려서, 순서는 보장돼도
// changeStage가 여전히 낡은 락값으로 시도해 "동시저장충돌"로 실패하는
// 사고가 실제로 재발함(오늘, 손현영 고객, client_error_logs id 20).
// 순서 보장 테스트(9/6에 이미 있음)만으로는 이 버그를 못 잡았음 -
// "락값이 실제로 최신으로 전달되는지"까지 확인하는 이 테스트를 추가.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9870;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let anyFail = false;

  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(''); } catch (e) {} });

  let patchCount = 0;
  let secondPatchLockValue = null;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/customers') && req.method() === 'PATCH') {
      patchCount++;
      if (patchCount === 2) {
        secondPatchLockValue = url.includes('updated_at=eq.') ? decodeURIComponent(url.split('updated_at=eq.')[1]) : null;
      }
    }
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      const body = req.postData() || '';
      if (req.method() === 'PATCH' && body.includes('deposit_amount')) {
        // 첫 PATCH(선금저장)는 서버가 새 updated_at을 응답 - 이게 로컬에
        // 반영돼야 두번째 PATCH(changeStage)가 이 값을 쓸 수 있음.
        req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 1, updated_at: '2026-09-08T12:00:00.000Z' }]) });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 1, updated_at: '2026-09-08T12:00:01.000Z' }]) });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });

  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 800));

  await page.evaluate(() => {
    saveCustomers([{ id: 1, clientName: '락값테스트', staffName: '마스터', stage: '확정견적', price: 1000000, updatedAt: '2026-09-08T11:00:00.000Z', is_archived: false }]);
    openDetail('락값테스트', 1);
  });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => { switchDetailTab('pay'); });
  await new Promise(r => setTimeout(r, 300));

  await page.evaluate(() => {
    var amtInput = document.querySelector('input[placeholder="잔금 금액"]');
    amtInput.value = '500000';
    amtInput.dispatchEvent(new Event('input'));
    var dateInput = amtInput.parentElement.querySelector('input[type="date"]');
    if (dateInput) { dateInput.value = '2026-09-08'; dateInput.dispatchEvent(new Event('change')); }
  });
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => {
    var btns = Array.from(document.querySelectorAll('button'));
    var saveBtn = btns.find(b => b.textContent.includes('잔금 저장'));
    if (saveBtn) saveBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const ok = patchCount === 2 && secondPatchLockValue === '2026-09-08T12:00:00.000Z';
  console.log(ok ? '✅' : '❌', 'savePayData 성공 후 로컬 락값이 갱신되어 changeStage가 최신 락값으로 저장 시도함',
    JSON.stringify({ patchCount, secondPatchLockValue }));
  if (!ok) anyFail = true;

  await browser.close();
  process.exit(anyFail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 25000);
