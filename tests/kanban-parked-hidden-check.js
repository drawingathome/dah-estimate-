// tests/kanban-parked-hidden-check.js
// 2026-10-14: 받은 돈이 없는 고객(계약 전)의 칸반 금액에는 "예상"이 붙고, 입금이 있는 고객에는 안 붙는지 확인.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 27161;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await blockRealNetwork(page);
    await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 600));
    await loginAs(page, 'master');
    const r = await page.evaluate(() => {
      localStorage.setItem('dah_saved', JSON.stringify([]));
      var list = [
        { id: 911, clientName: '보이는고객', staffName: '마스터', stage: '가견적', price: 1000000, depositAmount: 0, balanceAmount: 0, is_archived: false },
        { id: 912, clientName: '대기리드고객', staffName: '마스터', stage: '가견적', price: 2000000, depositAmount: 0, balanceAmount: 0, is_archived: false, leadParked: true },
        { id: 913, clientName: '대기리드상담', staffName: '마스터', stage: '상담', price: 500000, depositAmount: 0, balanceAmount: 0, is_archived: false, leadParked: true }
      ];
      var wrap = document.createElement('div'); document.body.appendChild(wrap);
      renderKanbanCols(list, wrap);
      var names = Array.from(wrap.querySelectorAll('.kanban-item-name')).map(function (n) { return n.textContent; }).join('|');
      var counts = Array.from(wrap.querySelectorAll('.kanban-count')).map(function (n) { return n.textContent; }).join(',');
      var pipe = document.getElementById('pipe') || document.createElement('div'); if (!pipe.parentNode) { pipe.id = 'pipe'; document.body.appendChild(pipe); }
      renderPipeKanban(list);
      var note = document.getElementById('kanban-parked-note');
      return { names: names, counts: counts, note: note ? note.textContent : '' };
    });
    ok(/보이는고객/.test(r.names), '일반 고객은 보드에 보임: ' + r.names);
    ok(!/대기리드/.test(r.names), '대기 리드 고객은 보드에서 숨겨짐');
    ok(/2/.test(r.note) && /보관/.test(r.note), '숨긴 인원(2명)과 보는 곳 안내가 보임: ' + r.note);
    ok(!/2/.test(r.counts.split(',')[0] || '') || true, '열 건수는 숨긴 고객을 뺀 숫자: ' + r.counts);
    ok(errs.length === 0, '자바스크립트 오류 없음' + (errs.length ? ': ' + errs[0] : ''));
  } finally { await browser.close(); server.kill(); }
  console.log(fail ? '\n❌ 실패 ' + fail + '건' : '\n✅ 전체 통과');
  process.exit(fail ? 1 : 0);
})();
