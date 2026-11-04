// tests/est-delete-preview-check.js
// 2026-11-04(N-94): 견적서 삭제 확인창에 "삭제하면 고객 금액 ○○원이 됩니다(지금 ○○원)"를 서버 계산값으로 미리 보여준다.
//  - 서버가 값을 주면 금액 표시 / 오류·빈 응답이면 예전 안내 문구로 대체(삭제 흐름은 절대 막지 않음)
//  - 취소하면 삭제 콜백이 안 불림, 확인하면 불림
//  - 세 곳의 삭제 버튼이 모두 이 공용 함수를 씀(예전 직접 confirm 금지)
const fs = require('fs');
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };
const json = (o) => JSON.stringify(o);

async function scenario(idx, mode, accept) {
  const dir = path.resolve(__dirname, '..');
  const port = 30800 + idx;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const rec = { dialogs: [], errs: [], called: 0, rpcBodies: [] };
  page.on('pageerror', e => rec.errs.push(e.message));
  page.on('dialog', async d => { rec.dialogs.push(d.message()); try { accept ? await d.accept() : await d.dismiss(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url(); const method = req.method();
    if (!url.includes('supabase.co')) { if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort(); return; }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
    const p = new URL(url).pathname + new URL(url).search;
    if (p.includes('rpc/dah_customer_amounts_after_delete')) {
      try { rec.rpcBodies.push(JSON.parse(req.postData() || 'null')); } catch (e) {}
      if (mode === 'ok') req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: json([{ customer_id: 1, price: 3000000, performance_revenue: 2400000 }]) });
      else if (mode === 'empty') req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
      else req.respond({ status: 500, contentType: 'application/json', headers: CORS, body: json({ message: 'boom' }) });
      return;
    }
    req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
  });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  await page.evaluate(() => { saveCustomers([{ id: 1, clientName: '삭제미리보기', phone: '01011112222', stage: '가견적', staffName: '마스터', price: 5000000 }]); });
  await page.evaluate(() => { window.__called = 0; confirmEstimateDelete('11111111-2222-3333-4444-555555555555', 1, '삭제미리보기 · 5,000,000원', function () { window.__called++; }); });
  await new Promise(r => setTimeout(r, 1200));
  rec.called = await page.evaluate(() => window.__called);
  await browser.close(); server.kill();
  return rec;
}

(async () => {
  const log = []; const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : ''));
  const A = await scenario(1, 'ok', true);
  ok('1. 서버가 값을 주면 삭제 후 금액(3,000,000원)과 현재 금액(5,000,000원)이 확인창에 보임', A.dialogs.length === 1 && A.dialogs[0].indexOf('3,000,000원') !== -1 && A.dialogs[0].indexOf('5,000,000원') !== -1, A.dialogs);
  ok('2. 서버에 견적서 id가 전달됨', A.rpcBodies.length === 1 && A.rpcBodies[0] && A.rpcBodies[0].p_estimate_id === '11111111-2222-3333-4444-555555555555', A.rpcBodies);
  ok('3. 확인을 누르면 삭제 콜백이 1번 불림', A.called === 1, A.called);
  const B = await scenario(2, 'ok', false);
  ok('4. 취소하면 삭제 콜백이 불리지 않음', B.called === 0 && B.dialogs.length === 1, B);
  const C = await scenario(3, 'err', true);
  ok('5. 서버 오류여도 예전 안내 문구로 확인창이 뜨고 삭제 흐름이 이어짐', C.dialogs.length === 1 && C.dialogs[0].indexOf('남은 견적서 기준') !== -1 && C.called === 1, C);
  const D = await scenario(4, 'empty', true);
  ok('6. 빈 응답(플러그 고객 등)이어도 예전 안내 문구로 대체', D.dialogs.length === 1 && D.dialogs[0].indexOf('남은 견적서 기준') !== -1 && D.called === 1, D);
  ok('7. 화면 오류 없음', [A, B, C, D].every(r => r.errs.length === 0), [A.errs, B.errs, C.errs, D.errs]);
  const root = path.resolve(__dirname, '..');
  const files = ['dash-render-est.js', 'dash-customer-estimates.js'];
  const src = files.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  ok('8. 삭제 버튼 3곳이 모두 공용 함수를 씀', (src.match(/confirmEstimateDelete\(/g) || []).length === 3, (src.match(/confirmEstimateDelete\(/g) || []).length);
  ok('9. 예전 직접 confirm(삭제 안내 문구 직접 붙이기)이 남아 있지 않음', !/confirm\([^\n]*EST_DELETE_CONFIRM_NOTE/.test(src));
  log.forEach(l => console.log(l));
  const f = log.filter(l => l.startsWith('❌')).length;
  console.log(f === 0 ? '\n전체 통과' : '\n실패 ' + f + '건');
  process.exit(f === 0 ? 0 : 1);
})();
