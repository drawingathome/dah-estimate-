// tests/est-register-customer-dup-check.js
// 2026-10-25 전수표 T-09: 견적서 목록에서 "고객으로 등록" 중 견적 연결(PATCH)이 실패한 뒤 다시 눌러도 고객이 중복 생성되지 않는지 확인.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9933;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  const log = [];
  const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (d !== undefined ? ' — ' + d : ''));

  const out = await page.evaluate(async () => {
    var calls = { post: 0, patch: 0 }; var opened = []; var patchFail = true;
    window.confirm = function() { return true; };
    window.showToast = function() {};
    window.openDetail = function(name, id) { opened.push(id); };
    window.sbXHR = function(method, p, data, cb) {
      if (method === 'POST' && p === 'customers') { calls.post++; cb(null, [{ id: 501 }]); return; }
      if (method === 'PATCH' && p.indexOf('estimates?id=eq.') === 0) {
        calls.patch++;
        if (patchFail) { cb({ status: 500, text: 'fail' }, null); return; }
        cb(null, [{ id: 'e1', client_id: data.client_id }]); return;
      }
      cb(null, []);
    };
    window.loadCustomers = function() { return []; };
    localStorage.setItem('dah_saved', JSON.stringify([{ id: 'e1', no: 'N1', clientName: '시험고객', phone: '010-1111-2222', price: 1000, status: 'ga', savedAt: new Date().toISOString() }]));
    if (typeof setEstArchiveFilter === 'function') setEstArchiveFilter('all');
    renderEstList();
    function clickRow() {
      var host = document.getElementById('est-list-body');
      var cards = host ? host.querySelectorAll('div') : [];
      var target = null;
      for (var i = 0; i < cards.length; i++) { if (cards[i].textContent.indexOf('시험고객') >= 0 && !cards[i].closest('button')) target = cards[i]; }
      if (!target) return false;
      target.click(); return true;
    }
    var clicked1 = clickRow();
    await new Promise(r => setTimeout(r, 50));
    var after1 = { post: calls.post, patch: calls.patch, opened: opened.length };
    // 목록을 다시 그린 뒤(화면 이동 후 복귀 흉내) 다시 누름: 이번엔 연결이 성공
    patchFail = false;
    renderEstList();
    var clicked2 = clickRow();
    await new Promise(r => setTimeout(r, 50));
    return { clicked1: clicked1, clicked2: clicked2, after1: after1, final: { post: calls.post, patch: calls.patch, opened: opened.slice() } };
  });
  ok('0. 시험 준비: 목록에서 행을 눌렀음', out.clicked1 && out.clicked2, JSON.stringify(out));
  ok('1. 첫 시도: 고객 1명 생성, 연결 실패 → 화면 이동 없음', out.after1.post === 1 && out.after1.patch === 1 && out.after1.opened === 0, JSON.stringify(out.after1));
  ok('2. 다시 누르면 고객을 또 만들지 않고 연결만 재시도(생성 1번 유지, 연결 2번)', out.final.post === 1 && out.final.patch === 2, JSON.stringify(out.final));
  ok('3. 연결 성공 후 그 고객(501)의 상세로 이동', out.final.opened.length === 1 && out.final.opened[0] === 501, JSON.stringify(out.final.opened));
  // 2026-11-19(N-185①): 서버에 같은 연락처 고객이 있으면(이 기기 목록엔 없음) 진행 중=막기, 시공완료=알림+확인 뒤 새 건, 이름 다름=가족 확인, 확인 실패=본인에게 물음
  async function dupScenario(tag, rpcResp, acceptConfirm) {
    return await page.evaluate(async (tag, rpcResp, acceptConfirm) => {
      var calls = { post: 0, rpc: [] }; var dialogs = [];
      window.confirm = function(m) { dialogs.push('C:' + m); if (/아직 고객으로 등록이 안 됐어요/.test(m)) return true; return acceptConfirm; };
      window.alert = function(m) { dialogs.push('A:' + m); };
      window.showToast = function() {}; window.openDetail = function() {};
      window.sbXHR = function(method, p, data, cb) {
        if (p.indexOf('rpc/check_phone_duplicate') === 0) { calls.rpc.push(p); if (rpcResp === 'ERR') { cb({ status: 500, text: 'boom' }, null); return; } if (rpcResp === 'V2MISSING' && p.indexOf('_v2') >= 0) { cb({ status: 404, text: 'PGRST202' }, null); return; } cb(null, rpcResp === 'V2MISSING' ? [{ exists_flag: true, staff_name: '마스터', same_name: true }] : rpcResp); return; }
        if (method === 'POST' && p === 'customers') { calls.post++; cb(null, [{ id: 700 }]); return; }
        cb(null, [{ id: 'x', client_id: 700 }]);
      };
      window.loadCustomers = function() { return []; };
      window._estCreatedCustomerByEstId = {};
      localStorage.setItem('dah_saved', JSON.stringify([{ id: 'd-' + tag, no: 'N-' + tag, clientName: '소지선' + tag, phone: '010-6258-8804', price: 1000, status: 'ga', savedAt: new Date().toISOString() }]));
      if (typeof setEstArchiveFilter === 'function') setEstArchiveFilter('all');
      renderEstList();
      var host = document.getElementById('est-list-body'); var cards = host ? host.querySelectorAll('div') : []; var target = null;
      for (var i = 0; i < cards.length; i++) { if (cards[i].textContent.indexOf('소지선' + tag) >= 0 && !cards[i].closest('button')) target = cards[i]; }
      if (target) target.click();
      await new Promise(r => setTimeout(r, 80));
      return { found: !!target, post: calls.post, rpc: calls.rpc, dialogs: dialogs };
    }, tag, rpcResp, acceptConfirm);
  }
  const S1 = await dupScenario('a', [{ exists_flag: true, staff_name: '마스터', same_name: true, in_progress: true }], true);
  ok('5. 서버에 진행 중인 같은 고객(임현정형) → 새로 만들지 않고 막음(POST 0, 안내문)', S1.found && S1.post === 0 && S1.dialogs.some(m => /^A:.*이미 마스터 담당/.test(m)) && S1.rpc[0] === 'rpc/check_phone_duplicate_v2', JSON.stringify(S1));
  const S2 = await dupScenario('b', [{ exists_flag: true, staff_name: '마스터', same_name: true, in_progress: false }], true);
  ok('6. 서버에 시공완료 고객(소지선형) → "이전에 시공한 고객" 확인 후 새 건 등록(POST 1)', S2.found && S2.post === 1 && S2.dialogs.some(m => /이전에 시공한/.test(m)), JSON.stringify(S2));
  const S3 = await dupScenario('c', [{ exists_flag: true, staff_name: '마스터', same_name: true, in_progress: false }], false);
  ok('7. 위 확인창에서 취소 → 등록 안 됨(POST 0)', S3.found && S3.post === 0, JSON.stringify(S3));
  const S4 = await dupScenario('d', [{ exists_flag: true, staff_name: '마스터', same_name: false, in_progress: true }], true);
  ok('8. 같은 번호·다른 이름 → 가족 확인 뒤 새 건(POST 1)', S4.found && S4.post === 1 && S4.dialogs.some(m => /가족/.test(m)), JSON.stringify(S4));
  const S5 = await dupScenario('e', 'ERR', false);
  ok('9. 서버 확인 실패 → "확인하지 못했어요" 확인창, 취소하면 등록 안 됨(POST 0)', S5.found && S5.post === 0 && S5.dialogs.some(m => /확인하지 못했어요/.test(m)), JSON.stringify(S5));
  const S6 = await dupScenario('f', 'V2MISSING', true);
  ok('10. v2가 없으면(404) 옛 함수로 대체, 단계 모르면 안전하게 막음(POST 0)', S6.found && S6.post === 0 && S6.rpc.length === 2 && S6.rpc[1] === 'rpc/check_phone_duplicate', JSON.stringify(S6));
  const S7 = await dupScenario('g', [], true);
  ok('11. 서버에 같은 연락처 고객이 없으면 그대로 등록(POST 1)', S7.found && S7.post === 1, JSON.stringify(S7));
  ok('4. JS 에러 없음', jsErrors.length === 0, jsErrors.join(';'));
  log.forEach(l => console.log(l));
  await browser.close(); server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
