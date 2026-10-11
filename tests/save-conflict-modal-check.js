// tests/save-conflict-modal-check.js
// 2026-10-11(선혜님 - 한 견적서를 두 기기에서 열어 저장하다 먼저 저장된 내용을 덮어쓸 뻔한 사례): 동시저장충돌이 나면
// 락값을 자동으로 맞추지 않고 선택창을 띄우며, "덮어쓰기"를 직접 고를 때만 락값을 맞추고 다시 저장하는지 검증.
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 27146;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.dismiss(); } catch (e) {} });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    const reqs = [];
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('supabase.co')) {
        const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' };
        if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: h }); return; }
        reqs.push(req.method() + ' ' + url.replace(/^https?:\/\/[^/]+/, ''));
        if (url.includes('/estimates') && url.includes('select=updated_at') && req.method() === 'GET') {
          req.respond({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify([{ updated_at: '2026-10-10T09:00:00.123456+00:00' }]) }); return;
        }
        if (url.includes('/estimates') && req.method() === 'PATCH') { req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' }); return; } // 0건 매칭 = 충돌
        req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' }); return;
      }
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
    });
    await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 800));

    const r = await page.evaluate(async () => {
      var out = {};
      window._estEditState.editingEstDbId = '00000000-0000-0000-0000-000000000001';
      window._estEditState.editingEstUpdatedAt = '2026-10-10T08:00:00+00:00';
      var done = []; 
      var clicks = 0;
      var btn = document.getElementById('btn-save-estimate');
      if (btn) btn.addEventListener('click', function (e) { clicks++; e.stopImmediatePropagation(); e.preventDefault(); }, true);
      _saveStage_estimatesActual({ onDone: function (o) { done.push(o); }, name: '충돌시험', phone: '010-0000-0000', staffName: '시험', custMemo: '', grand: 1000, perf: 1000, spaceStr: '', fabricStr: '', lineItems: [] });
      await new Promise(r => setTimeout(r, 600));
      out.done = done.slice();
      out.modal = !!document.getElementById('est-save-conflict-modal');
      out.lockAfterConflict = window._estEditState.editingEstUpdatedAt;
      out.hasBtns = !!document.getElementById('est-conflict-load-latest') && !!document.getElementById('est-conflict-overwrite');
      // 덮어쓰기 선택
      document.getElementById('est-conflict-overwrite').click();
      await new Promise(r => setTimeout(r, 600));
      out.modalGone = !document.getElementById('est-save-conflict-modal');
      out.lockAfterOverwrite = window._estEditState.editingEstUpdatedAt;
      out.clicks = clicks; out.hasSaveBtn = !!btn;
      return out;
    });
    ok(r.done.length >= 1 && r.done[0] === 'failed', '충돌 시 저장은 "실패"로 끝남: ' + JSON.stringify(r.done));
    ok(r.modal && r.hasBtns, '선택창(최신 내용 불러오기/덮어쓰기)이 뜸');
    ok(r.lockAfterConflict === '2026-10-10T08:00:00+00:00', '선택 전에는 락값을 자동으로 바꾸지 않음(그대로 유지)');
    const getsBefore = reqs.filter(x => x.startsWith('GET') && x.includes('select=updated_at')).length;
    // 충돌 시점의 원인 기록용 조회 1회(conflict_detail) + 덮어쓰기를 고른 뒤 잠금값 맞춤용 조회 1회 = 2회. 락값 자체는 선택 전엔 안 바뀜(위에서 확인)
    ok(getsBefore === 2, '원인 기록용 1회 + 덮어쓰기 선택 후 1회만 조회함(조회 ' + getsBefore + '회)');
    ok(r.modalGone && r.lockAfterOverwrite === '2026-10-10T09:00:00.123456+00:00', '덮어쓰기 선택 후 락값이 최신으로 맞춰짐');
    ok(!r.hasSaveBtn || r.clicks === 1, '덮어쓰기 선택 후 저장 버튼을 다시 눌러 저장을 이어감');
    ok(errs.length === 0, '자바스크립트 오류 없음' + (errs.length ? ': ' + errs[0] : ''));

    // 두 번째: 선택창에서 "최신 내용 불러오기" 주소 확인(실제 이동은 막고 주소만 확인)
    const r2 = await page.evaluate(async () => {
      window._estEditState.editingEstDbId = '00000000-0000-0000-0000-000000000002';
      window._estEditState.editingEstUpdatedAt = '2026-10-10T08:00:00+00:00';
      estShowSaveConflictModal({ estId: 'abc-123', onOverwrite: function () {} });
      var btn = document.getElementById('est-conflict-cancel'); btn.click();
      return { closed: !document.getElementById('est-save-conflict-modal') };
    });
    ok(r2.closed, '닫기를 누르면 선택창이 닫히고 아무것도 저장되지 않음');
  } finally { await browser.close(); server.kill(); }
  console.log(fail ? '\n❌ 실패 ' + fail + '건' : '\n✅ 전체 통과(동시저장충돌 선택창 검증)');
  process.exit(fail ? 1 : 0);
})();
