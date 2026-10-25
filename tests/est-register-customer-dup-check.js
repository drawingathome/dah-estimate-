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
  ok('4. JS 에러 없음', jsErrors.length === 0, jsErrors.join(';'));
  log.forEach(l => console.log(l));
  await browser.close(); server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
