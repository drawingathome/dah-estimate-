// tests/customer-family-phone-check.js
// 2026-11-05(N-105②·N-119③): 같은 전화번호를 쓰는 가족(이름이 다름)이 다른 담당자 고객과 겹쳐도 등록이 영영 막히지 않고, 서버가 '이름이 다르다'(same_name=false)고 알려 주면 본인에게 묻는다(다른 담당자 고객의 이름은 노출하지 않음).
// 같은 이름은 기존처럼 차단, 예전 DB 함수(이름 안 줌)에서도 기존처럼 안전. 아래 헤더는 재구매 시험의 설명(참고).
// (원본) tests/customer-repurchase-no-duplicate-check.js
// 2026-11-04(선혜님 - 임현정이 마스터/오지은 둘로 등록됨): "이미 있는 고객, 재구매로 업데이트할까요?"에서 '예'를 눌러도
// 기존 고객을 고치지 않고 새 행을 또 만들던 버그 방지.
//  A) 내 화면에 이미 있는 고객 → 새 행(POST) 없이 기존 행(id 유지)을 갱신, 돈/단계 유지, 방문횟수 +1
//  B) 서버에만 있는 고객(다른 담당자 것) → 새 행을 만들지 않고 안내 메시지
const { launchBrowser, startServer, loginAs } = require('./_helpers');
const path = require('path');
const CORS = { 'Access-Control-Allow-Origin': '*' };
const json = (o) => JSON.stringify(o);

async function scenario(idx, rpcRow, typedName, accept) {
  const dir = path.resolve(__dirname, '..');
  const port = 30750 + idx;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const rec = { reqs: [], dialogs: [], errs: [] };
  page.on('pageerror', e => rec.errs.push(e.message));
  page.on('dialog', async d => { rec.dialogs.push(d.message()); try { if (d.type() === 'confirm' && !accept) await d.dismiss(); else await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url(); const method = req.method();
    if (!url.includes('supabase.co')) { if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) req.continue(); else req.abort(); return; }
    if (method === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
    const p = new URL(url).pathname + new URL(url).search;
    if (p.includes('/rest/v1/app_settings')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return; }
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
    if (p.includes('rpc/check_phone_duplicate')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: json([rpcRow]) }); return; }
    if (p.includes('/rest/v1/customers')) { rec.reqs.push({ method, p, body }); req.respond({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', headers: CORS, body: json([{ id: 778, ...(body || {}), updated_at: '2026-11-05T00:00:00Z' }]) }); return; }
    req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
  });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  await page.evaluate(() => { localStorage.setItem('dah_settings', JSON.stringify({ account: '123-456-789', holder: '선혜' })); saveCustomers([]); });
  const setNative = (id, v) => page.evaluate((id, v) => { const el = document.getElementById(id); const proto = window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }, id, v);
  await page.evaluate(() => openAdd());
  await new Promise(r => setTimeout(r, 250));
  await setNative('add-name', typedName);
  await setNative('add-phone', '01072824432');
  await page.click('#add-save-btn');
  await new Promise(r => setTimeout(r, 900));
  const names = await page.evaluate(() => loadCustomers().map(c => c.clientName));
  await browser.close(); server.kill();
  return { rec, names };
}

(async () => {
  const log = []; const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (d !== undefined && !c ? ' — ' + JSON.stringify(d) : ''));
  // F1: 같은 번호, 이름이 다름(가족) + 서버가 이름을 알려줌 → 막지 않고 본인에게 물어봄, '예'면 새 고객 등록
  const F1 = await scenario(1, { exists_flag: true, staff_name: '오지은 실장', same_name: false }, '다른가족', true);
  ok('F1-1. 이름이 다른 같은 번호: 가족일 수 있다는 확인창이 뜸(담당자 표시, 다른 사람 고객 이름은 안 보임)', F1.rec.dialogs.some(m => /오지은 실장/.test(m) && /가족/.test(m) && !/임가족/.test(m)), F1.rec.dialogs);
  ok('F1-2. 확인창에서 예 → 새 고객이 등록됨(POST 1건, 화면에도 추가)', F1.rec.reqs.filter(r => r.method === 'POST').length === 1 && F1.names.includes('다른가족'), { reqs: F1.rec.reqs.length, names: F1.names });
  // F2: 같은 상황에서 아니오 → 등록 안 됨
  const F2 = await scenario(2, { exists_flag: true, staff_name: '오지은 실장', same_name: false }, '다른가족', false);
  ok('F2. 확인창에서 아니오 → 새 고객 등록 안 됨(POST 0건, 화면에도 없음)', F2.rec.reqs.filter(r => r.method === 'POST').length === 0 && !F2.names.includes('다른가족'), { reqs: F2.rec.reqs.length, names: F2.names });
  // F3: 같은 번호·같은 이름(= 같은 사람)이 다른 담당자 것 → 기존처럼 막음
  const F3 = await scenario(3, { exists_flag: true, staff_name: '오지은 실장', same_name: true }, '임가족', true);
  ok('F3. 같은 번호·같은 이름은 기존처럼 중복 차단(안내문, POST 0건)', F3.rec.dialogs.some(m => /이미 .*담당으로 등록/.test(m)) && F3.rec.reqs.filter(r => r.method === 'POST').length === 0, { d: F3.rec.dialogs, r: F3.rec.reqs.length });
  // F4: 예전 DB 함수(이름을 안 돌려줌)에서는 이름이 달라도 기존처럼 차단 — 앱이 먼저 배포돼도 안전
  const F4 = await scenario(4, { exists_flag: true, staff_name: '오지은 실장' }, '다른가족', true);
  ok('F4. 예전 함수(이름 비교 정보 없음)에서는 기존처럼 차단(DB를 아직 안 바꿔도 안전)', F4.rec.dialogs.some(m => /이미 .*담당으로 등록/.test(m)) && F4.rec.reqs.filter(r => r.method === 'POST').length === 0, { d: F4.rec.dialogs, r: F4.rec.reqs.length });
  ok('JS 오류 없음', [F1, F2, F3, F4].every(s => s.rec.errs.length === 0), [F1, F2, F3, F4].map(s => s.rec.errs));
  console.log(log.join('\n')); const bad = log.some(l => l.startsWith('❌')); console.log(bad ? '\n❌ 실패 있음' : '\n✅ 모두 통과'); process.exit(bad ? 1 : 0);
})();
