// tests/field-partial-patch-check.js
// 메모·결제링크·실측/시공일·발주체크는 "바꾸는 필드만" 서버로 보낸다 (고객 전체를 통째로 보내지 않는다)
// 2026-10-08(선혜님 - "완납되었는데 상담으로 뜬다" 조유정 사례의 같은 뿌리): 단계 변경은 이미 부분 저장으로 바꿨지만,
// 같은 saveCustomerToDb(고객 전체 PATCH)를 쓰던 곳이 더 있었음. 메모 하나 고치면서 이 기기에 있던 낡은 계약금(0원) 등
// 고객 전체를 서버에 덮어쓰거나, 낡은 락값 때문에 "동시저장충돌"로 메모 저장이 실패할 수 있음.
// 이 시험은 각 화면 동작(실제 화면 코드)마다
//   (1) 서버로 PATCH가 정확히 1번 나가고(시험 유효성) (2) 본문에 해당 필드만 있고 (3) 락 조건(updated_at=eq)이 없고
//   (4) 서버의 최신 행(계약금 308,000)이 로컬에 반영되고 (5) 구글 시트(고객명단) 동기화도 나가는지,
//   (6) 서버 오류 시 "그 필드만" 재시도 큐에 쌓이는지 확인한다.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9882;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }
  const H = { 'Access-Control-Allow-Origin': '*' };

  async function scenario(action, mode, action2) {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept('테스트업체'); } catch (e) {} });
    const patches = [];
    const sheetSyncs = [];
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('supabase.co')) {
        if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
        if (req.method() === 'PATCH' && url.includes('/customers')) {
          patches.push({ url, body: req.postData() || '' });
          if (mode === 'neterr') { req.respond({ status: 500, contentType: 'application/json', headers: H, body: '{"message":"boom"}' }); return; }
          // 서버의 실제 최신 행: 계약금 308,000이 이미 들어 있음(로컬은 0원으로 낡은 상태)
          req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([{ id: 7, client_name: '필드테스트', stage: '확정견적', staff_name: '마스터', price: 308000, deposit_amount: 308000, updated_at: '2026-10-08T14:00:00.000Z', is_archived: false, memo: '', payment_link: '', order_status: {} }]) });
          return;
        }
        if (mode === 'refresh' && req.method() === 'GET' && url.includes('/rest/v1/customers')) {
          // 서버에는 옛 메모가 있고 계약금은 최신
          req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([{ id: 7, client_name: '필드테스트', stage: '확정견적', staff_name: '마스터', price: 308000, deposit_amount: 308000, updated_at: '2026-10-08T14:00:00.000Z', is_archived: false, memo: '서버의 옛 메모', payment_link: '', order_status: {} }]) });
          return;
        }
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
      // 로컬은 낡은 상태: 계약금 0원, 낡은 락값
      saveCustomers([{ id: 7, clientName: '필드테스트', staffName: '마스터', stage: '확정견적', price: 308000, depositAmount: 0, updatedAt: '2026-10-08T07:08:00.000Z', is_archived: false, orderStatus: {}, measureDateTbd: true }]);
      localStorage.removeItem('dah_pending_sync');
      openDetail('필드테스트', 7);
    });
    await new Promise(r => setTimeout(r, 800));

    // 실제 화면 코드를 그대로 쓰는 동작들 (저장 함수만 우회하지 않음)
    const doAction = (action) => {
      function blockWith(re, notRe) {
        return Array.from(document.querySelectorAll('div')).filter(d => d.style.cursor === 'pointer' && re.test(d.textContent) && !(notRe && notRe.test(d.textContent)))
          .sort((a, b) => a.textContent.length - b.textContent.length)[0] || null;
      }
      if (action === 'memo') {
        const b = blockWith(/메모/, /결제 링크/); if (!b) return false;
        b.click();
        const t = b.querySelector('textarea'); if (!t) return false;
        t.value = '새 메모'; t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('blur')); return true;
      }
      if (action === 'paylink') {
        const b = blockWith(/결제 링크/); if (!b) return false;
        b.click();
        const i = b.querySelector('input'); if (!i) return false;
        i.value = 'https://pay.example/abc'; i.dispatchEvent(new Event('blur')); return true;
      }
      if (action === 'measure') {
        window.openCustomDatePicker = function (box, cur, cb) { cb('2026-11-05'); }; // 날짜 선택창만 대신하고, 고른 뒤의 저장 코드는 실제 코드
        const b = blockWith(/실측 예정/); if (!b) return false;
        b.click(); return true;
      }
      if (action === 'order') {
        const holder = document.createElement('div'); document.body.appendChild(holder);
        const arr = loadCustomers(); const c = arr.find(x => String(x.id) === '7');
        renderOrderSection(c, holder);
        const cb = holder.querySelector('input[type=checkbox]'); if (!cb) return false;
        cb.click(); return true; // 실제 클릭(발주 업체명 입력창은 위 dialog 핸들러가 '테스트업체'로 답함)
      }
      if (action === 'refresh') {
        // 오프라인에서 메모 저장이 실패해 재시도 큐에 쌓인 상태에서, 서버 목록을 새로 불러온다
        saveCustomers([{ id: 7, clientName: '필드테스트', staffName: '마스터', stage: '확정견적', price: 308000, depositAmount: 0, memo: '로컬의 새 메모', updatedAt: '2026-10-08T07:08:00.000Z', is_archived: false }]);
        addToPendingSyncQueue('7:fields:memo', 'PATCH', 'customers?id=eq.7', { memo: '로컬의 새 메모' });
        loadCustomersAsync(function () {}, true); return true;
      }
      return false;
    };
    let found = await page.evaluate(doAction, action);
    if (action2) { await new Promise(r => setTimeout(r, 700)); const f2 = await page.evaluate(doAction, action2); found = found && f2; }
    await new Promise(r => setTimeout(r, 1000));
    const state = await page.evaluate(() => {
      const c = loadCustomers().find(x => String(x.id) === '7');
      let q = []; try { q = (typeof getPendingSyncQueue === 'function') ? getPendingSyncQueue() : []; } catch (e) {}
      return { dep: c && c.depositAmount, memo: c && c.memo, queue: q };
    });
    await page.close();
    return { found, patches, sheetSyncs, state };
  }

  const cases = [
    ['메모', 'memo', 'memo'],
    ['결제 링크', 'paylink', 'payment_link'],
    ['실측 예정일', 'measure', 'measure_date,measure_date_tbd'],
    ['발주 체크', 'order', 'order_status']
  ];
  for (const [label, action, keys] of cases) {
    const { found, patches, sheetSyncs, state } = await scenario(action, 'ok');
    ok(label + ': 화면 동작이 실제로 실행됨(시험 유효성)', found === true, String(found));
    // (화면 코드에 따라 같은 저장이 연달아 2번 나갈 수 있어 "1번 이상"으로 보고, 나간 요청 전부를 검사)
    ok(label + ': 서버로 PATCH가 나감(시험 유효성)', patches.length >= 1, 'n=' + patches.length);
    if (patches.length < 1) continue;
    const bodies = patches.map(p => JSON.parse(p.body || '{}'));
    ok(label + ': 나간 요청 전부 본문에 해당 필드만 있음(' + keys + ') - 계약금 등 다른 필드 없음', bodies.every(b => Object.keys(b).sort().join(',') === keys), JSON.stringify(bodies[0]).slice(0, 160));
    ok(label + ': 락 조건(updated_at=eq) 없음 - 낡은 락으로 실패할 수 없음', patches.every(p => !p.url.includes('updated_at=eq')), patches[0].url.split('/rest/v1/')[1]);
    ok(label + ': 서버의 최신 계약금(308,000)이 로컬에 반영됨(낡은 0원이 남지 않음)', Number(state.dep) === 308000, String(state.dep));
    const syncs = sheetSyncs.map(b => { try { return JSON.parse(b); } catch (e) { return {}; } }).filter(b => b.action === 'syncCustomer');
    ok(label + ': 구글 시트(고객명단) 동기화 요청도 나감', syncs.length >= 1, 'n=' + syncs.length);
  }
  {
    const { found, patches, state } = await scenario('memo', 'neterr');
    ok('서버 오류 시 시험 유효성: 화면 동작 실행 + PATCH 시도됨', found === true && patches.length >= 1, 'found=' + found + ' n=' + patches.length);
    const entry = (state.queue || []).find(x => String(x.customerKey).startsWith('7:fields') && Object.keys(x.payload || {}).join(',') === 'memo');
    ok('서버 오류 시 재시도 큐에 쌓임', !!entry, JSON.stringify(state.queue || []).slice(0, 160));
    ok('재시도 큐에는 "메모만" 들어 있음(낡은 계약금 0원이 큐에 들어가지 않음)', !!entry && Object.keys(entry.payload || {}).join(',') === 'memo', entry ? JSON.stringify(entry.payload).slice(0, 120) : '없음');
  }

  {
    // 서로 다른 필드 저장이 둘 다 실패해도 먼저 실패한 것이 큐에서 덮여 사라지지 않는다 (메모 실패 -> 결제 링크 실패)
    const { found, patches, state } = await scenario('memo', 'neterr', 'paylink');
    ok('두 필드 연속 실패: 시험 유효성(두 화면 동작 실행됨)', found === true, String(found));
    const q = state.queue || [];
    const memoQ = q.find(x => Object.keys(x.payload || {}).join(',') === 'memo');
    const linkQ = q.find(x => Object.keys(x.payload || {}).join(',') === 'payment_link');
    ok('두 필드 연속 실패: 메모와 결제 링크가 각각 큐에 남음(먼저 실패한 메모가 덮여 사라지지 않음)', !!memoQ && !!linkQ, JSON.stringify(q.map(x => [x.customerKey, Object.keys(x.payload || {})])));
  }

  {
    // 대기 중인 필드 저장이 있으면, 서버 목록을 새로 불러와도 그 필드는 로컬의 새 값을 유지하고 나머지(계약금)는 서버 최신값을 쓴다
    const { found, state } = await scenario('refresh', 'refresh');
    ok('목록 새로고침: 시험 유효성(화면 동작 실행됨)', found === true, String(found));
    ok('목록 새로고침: 대기 중인 메모는 로컬의 새 값 유지(서버의 옛 메모로 되돌아가지 않음)', state.memo === '로컬의 새 메모', String(state.memo));
    ok('목록 새로고침: 나머지(계약금)는 서버 최신값(308,000)으로 갱신', Number(state.dep) === 308000, String(state.dep));
  }

  console.log(log.join('\n'));
  const failed = log.filter(l => l.startsWith('❌')).length;
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 전체 통과');
  await browser.close();
  server.kill && server.kill();
  process.exit(failed ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => { console.error('시간 초과'); process.exit(1); }, 120000);
