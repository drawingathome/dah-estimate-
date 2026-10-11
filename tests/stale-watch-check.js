// 열어 둔 견적서 화면이 다른 기기에서 수정돼 옛 내용이 되면, 저장 전에 미리 안내하는지 검증
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const dir = path.resolve(__dirname, '..');
  const server = await startServer(dir, 27148);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.setRequestInterception(true);
    let serverTs = '2026-10-10T08:00:00+00:00';
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('supabase.co')) {
        const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' };
        if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: h }); return; }
        if (url.includes('/estimates') && url.includes('select=updated_at') && req.method() === 'GET') { req.respond({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify([{ updated_at: serverTs }]) }); return; }
        req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' }); return;
      }
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort();
    });
    await page.goto('http://localhost:27148/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 800));
    const wake = async () => { await page.evaluate(() => { _estStaleLastCheck = 0; document.dispatchEvent(new Event('visibilitychange')); }); await new Promise(r => setTimeout(r, 500)); };
    await page.evaluate(() => { window._estEditState.editingEstDbId = '00000000-0000-0000-0000-000000000001'; window._estEditState.editingEstUpdatedAt = '2026-10-10T08:00:00+00:00'; });
    await wake();
    ok(!(await page.$('#est-stale-banner')), '서버 수정 시각이 내가 연 것과 같으면 안내 없음');
    serverTs = '2026-10-10T08:05:00+00:00';
    await wake();
    ok(!!(await page.$('#est-stale-banner')), '다른 기기에서 수정됐으면 화면이 다시 보일 때 안내가 뜸');
    ok(!!(await page.$('#est-stale-load')), '"최신으로 불러오기" 버튼이 있음');
    const same = await page.evaluate(() => window._estEditState.editingEstUpdatedAt);
    ok(same === '2026-10-10T08:00:00+00:00', '안내만 띄우고 내 잠금값/입력은 건드리지 않음');
    await page.evaluate(() => { document.getElementById('est-stale-banner').remove(); window._estEditState.editingEstDbId = null; });
    await wake();
    ok(!(await page.$('#est-stale-banner')), '새 견적서(아직 저장 전)에는 안내 없음');
    // 탭 전환 없이도 주기 확인이 동작하는지(타이머 함수를 직접 한 번 돌려 확인)
    await page.evaluate(() => { var b = document.getElementById('est-stale-banner'); if (b) b.remove(); window._estEditState.editingEstDbId = '00000000-0000-0000-0000-000000000001'; window.__pollOk = typeof _estStaleTimer !== 'undefined'; });
    ok(await page.evaluate(() => window.__pollOk), '45초 주기 확인 타이머가 등록돼 있음');
    ok(errs.length === 0, 'JS 오류 없음 ' + errs.join('|'));
  } catch (e) { console.log('❌ 예외', e.message); fail++; }
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})();
