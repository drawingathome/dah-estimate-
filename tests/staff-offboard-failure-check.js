// tests/staff-offboard-failure-check.js
// 2026-10-25 전수표 T-12: 담당자 퇴사 이관 중 서버 저장이 실패하면 "완료"로 표시하거나 담당자·로그인을 지우면 안 됨
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9934;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  const log = [];
  const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (d !== undefined ? ' — ' + d : ''));

  const out = await page.evaluate(async () => {
    window.confirm = function() { return true; };
    window.prompt = function(msg, def) { return /메모/.test(msg) ? '인수인계 시험' : (def || '마스터'); };
    var toasts = [];
    window.showToast = function(m) { toasts.push(String(m)); };
    var mode = 'ok';
    window.sbXHR = function(method, p, data, cb) {
      if (method === 'GET' && p.indexOf('customers?staff_name=eq.') === 0) { cb(null, [{ id: 1 }, { id: 2 }]); return; }
      if (method === 'PATCH' && p.indexOf('customers?staff_name=eq.') === 0) {
        if (mode === 'custFail') { cb({ status: 500, text: 'x' }, null); return; }
        cb(null, [{ id: 1 }, { id: 2 }]); return;
      }
      if (method === 'PATCH' && p.indexOf('estimates?staff_name=eq.') === 0) {
        if (mode === 'estFail') { cb({ status: 500, text: 'x' }, null); return; }
        if (mode === 'estZero') { cb({ status: 200, text: '0건', zeroRows: true }, null); return; }
        cb(null, [{ id: 'e1' }]); return;
      }
      cb(null, []);
    };
    async function attempt(m) {
      mode = m; toasts.length = 0;
      localStorage.setItem('dah_staff_list', JSON.stringify(['시험실장']));
      renderSettings();
      var b = Array.prototype.slice.call(document.querySelectorAll('button')).filter(function(x) { return x.textContent.trim() === '퇴사 처리'; })[0];
      if (!b) return { noButton: true };
      b.click();
      await new Promise(r => setTimeout(r, 80));
      return { list: JSON.parse(localStorage.getItem('dah_staff_list') || '[]'), toast: toasts.join('|') };
    }
    return { custFail: await attempt('custFail'), estFail: await attempt('estFail'), estZero: await attempt('estZero'), good: await attempt('ok') };
  });
  const kept = r => !r.noButton && r.list.length === 1 && !/이관 완료/.test(r.toast);
  ok('1. 고객 이관 실패 → 담당자 그대로, "이관 완료" 안 뜸', kept(out.custFail), JSON.stringify(out.custFail));
  ok('2. 견적 이관 실패 → 담당자 그대로, "이관 완료" 안 뜸', kept(out.estFail), JSON.stringify(out.estFail));
  ok('3. 견적이 0건인 담당자는 정상 완료', !out.estZero.noButton && out.estZero.list.length === 0 && /이관 완료/.test(out.estZero.toast), JSON.stringify(out.estZero));
  ok('4. 모두 성공 → 완료', !out.good.noButton && out.good.list.length === 0 && /이관 완료/.test(out.good.toast), JSON.stringify(out.good));
  ok('5. JS 에러 없음', jsErrors.length === 0, jsErrors.join(';'));
  log.forEach(l => console.log(l));
  await browser.close(); server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
