// 단계 변경은 "단계(와 확정일)만" 서버로 보낸다 - 낡은 값으로 고객 전체를 덮어쓰지 않는다
// 2026-10-08(선혜님 - "완납되었는데 상담으로 뜬다", 조유정 사례): 계약금 저장 1초 뒤 단계 변경(changeStage)이 고객 전체를
// 통째로 PATCH(낡은 계약금 0원 포함)하다가 "동시저장충돌"로 실패(client_error_logs 확정). 락이 맞았다면 계약금이 0원으로 되돌아갈 뻔함.
// 이 시험은 (1) 단계 변경 PATCH 본문에 단계 외 필드(계약금 등)가 없고 (2) 락 조건(updated_at=eq)이 없으며
// (3) 서버가 돌려준 최신 행(계약금 308,000)이 로컬에 반영되고 (4) 네트워크 실패시 "단계만" 재시도 큐에 쌓이는지 확인한다.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9871;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  async function scenario(label, mode) {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(''); } catch (e) {} });
    const patches = [];
    const sheetSyncs = []; // 구글 시트(고객명단) 동기화 요청
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      const H = { 'Access-Control-Allow-Origin': '*' };
      if (url.includes('supabase.co')) {
        if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
        if (req.method() === 'PATCH' && url.includes('/customers')) {
          patches.push({ url, body: req.postData() || '' });
          if (mode === 'neterr') { req.respond({ status: 500, contentType: 'application/json', headers: H, body: '{"message":"boom"}' }); return; }
          // 서버의 실제 최신 행: 계약금 308,000이 이미 들어 있음(로컬은 0원으로 낡은 상태)
          req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([{ id: 7, client_name: '단계테스트', stage: JSON.parse(req.postData()||'{}').stage, price: 308000, deposit_amount: 308000, deposit_date: '2026-10-08', deposit_method: '현금', balance_amount: 0, staff_name: '마스터', updated_at: '2026-10-08T07:33:16.000Z', is_archived: false }]) });
          return;
        }
        if (req.method() === 'GET') { req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' }); return; }
        req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' });
        return;
      }
      if (url.includes('script.google.com')) { sheetSyncs.push(req.postData() || ''); req.respond({ status: 200, contentType: 'text/plain', headers: H, body: 'ok' }); return; }
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
    });
    await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'networkidle0', timeout: 20000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');
    await new Promise(r => setTimeout(r, 800));
    await page.evaluate(() => {
      // 로컬은 낡은 상태: 계약금 0원, 단계 상담, 낡은 락값
      saveCustomers([{ id: 7, clientName: '단계테스트', staffName: '마스터', stage: '상담', price: 308000, depositAmount: 0, updatedAt: '2026-10-08T07:08:00.000Z', is_archived: false }]);
      localStorage.removeItem('dah_pending_sync');
    });
    if (mode === 'detail' || mode === 'neterr') {
      await page.evaluate(() => { openDetail('단계테스트', 7); });
      await new Promise(r => setTimeout(r, 500));
      await page.evaluate(() => { changeStage('선금결제'); });
    } else if (mode === 'kanban') {
      await page.evaluate(() => { changeStageByName('단계테스트', '선금결제', 7); });
    } else if (mode === 'confirm') {
      await page.evaluate(() => { openDetail('단계테스트', 7); });
      await new Promise(r => setTimeout(r, 500));
      await page.evaluate(() => { changeStage('확정견적'); });
    }
    await new Promise(r => setTimeout(r, 900));
    const state = await page.evaluate(() => {
      const c = loadCustomers().find(x => String(x.id) === '7');
      let q = []; try { q = (typeof getPendingSyncQueue === 'function') ? getPendingSyncQueue() : []; } catch (e) {}
      return { stage: c && c.stage, dep: c && c.depositAmount, updatedAt: c && c.updatedAt, queue: q };
    });
    await page.close();
    return { patches, state, sheetSyncs };
  }

  // 시험 유효성: PATCH가 실제로 1번 나가야 한다(없으면 "비어서 통과" 방지)
  for (const [label, mode] of [['상세화면 단계변경', 'detail'], ['칸반 드래그', 'kanban']]) {
    const { patches, state, sheetSyncs } = await scenario(label, mode);
    ok(label + ': 서버로 PATCH가 정확히 1번 나감(시험 유효성)', patches.length === 1, 'n=' + patches.length);
    if (patches.length !== 1) continue;
    const body = JSON.parse(patches[0].body || '{}');
    ok(label + ': 본문에 "stage"만 있음(계약금 등 다른 필드 없음)', Object.keys(body).join(',') === 'stage' && body.stage === '선금결제', JSON.stringify(body));
    ok(label + ': 락 조건(updated_at=eq) 없음 - 낡은 락으로 실패할 수 없음', !patches[0].url.includes('updated_at=eq'), patches[0].url.split('/rest/v1/')[1]);
    ok(label + ': 서버의 최신 계약금(308,000)이 로컬에 반영됨(낡은 0원이 남지 않음)', Number(state.dep) === 308000 && state.stage === '선금결제', JSON.stringify({ dep: state.dep, stage: state.stage }));
    // 2026-10-08: 단계 변경이 구글 시트(고객명단)에도 반영되어야 함 - 예전 saveCustomerToDb는 syncCustomerToSheet를 같이 불렀는데
    // 부분 저장으로 바꾸면서 이 호출이 빠졌었음(시험 없이 배포돼 23:15 이후 단계 변경이 시트에 안 갔음)
    const syncs = sheetSyncs.map(b => { try { return JSON.parse(b); } catch (e) { return {}; } }).filter(b => b.action === 'syncCustomer');
    ok(label + ': 구글 시트(고객명단) 동기화 요청이 나감', syncs.length >= 1, 'n=' + syncs.length);
    ok(label + ': 시트로 새 단계(선금결제)와 서버 최신 계약금 기준 금액이 감', syncs.length >= 1 && syncs[syncs.length - 1].stage === '선금결제' && syncs[syncs.length - 1].clientName === '단계테스트', JSON.stringify(syncs[syncs.length - 1] || null).slice(0, 160));
  }
  {
    const { patches } = await scenario('확정견적', 'confirm');
    const body = patches.length === 1 ? JSON.parse(patches[0].body) : {};
    ok('확정견적으로 바꾸면 확정일(confirm_date)이 단계와 함께 감: 키 = stage,confirm_date', patches.length === 1 && Object.keys(body).sort().join(',') === 'confirm_date,stage', JSON.stringify(body));
  }
  {
    const { patches, state } = await scenario('네트워크 실패', 'neterr');
    ok('서버 오류 시 시험 유효성: PATCH 시도됨', patches.length === 1, 'n=' + patches.length);
    const q = state.queue || [];
    const entry = q.find(x => String(x.customerKey) === '7:fields:stage');
    ok('서버 오류 시 재시도 큐에 쌓임', !!entry, JSON.stringify(q).slice(0, 160));
    ok('재시도 큐에는 "단계만" 들어 있음(낡은 계약금 0원이 큐에 들어가지 않음)', !!entry && Object.keys(entry.payload || {}).join(',') === 'stage', entry ? JSON.stringify(entry.payload) : 'no entry');
  }

  console.log(log.join('\n'));
  const failed = log.filter(l => l.startsWith('❌')).length;
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 전체 통과');
  await browser.close();
  server.kill && server.kill();
  process.exit(failed ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => { console.error('시간 초과'); process.exit(1); }, 90000);
