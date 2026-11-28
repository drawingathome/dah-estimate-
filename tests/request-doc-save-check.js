// N-231: 실측·시공요청서에서 고친 내용(공간/제품 줄)과 '비고' 메모가 저장되고, 다시 열 때 복원되는지(가짜 서버, 운영 확인 아님)
//  1) 미리보기에서 고친 뒤 닫기만 해도 order_status.orderSnap.request.<종류>에 저장
//  2) 같은 견적으로 다시 열면 고친 내용이 그대로 복원
//  3) 비고 메모는 담당자 팝업에 미리 채워짐
//  4) 견적 내용이 바뀐 뒤에는 자동 적용하지 않고 '이전에 고친 내용 불러오기' 안내만 표시(엉뚱한 내용이 나가지 않게)
//  5) 저장 서버가 응답 안 해도 요청서 열기는 막히지 않음
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };
let fail = 0; const ok = (l, c, d) => { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; };
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 150000);
(async () => {
  const port = 28701; const server = await startServer(path.resolve(__dirname, '..'), port); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  let db = { order_status: {}, updated_at: 'T0' }; let hang = false; const patches = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/rest/v1/app_settings')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[{"value":{}}]' }); return; }
      if (url.includes('/auth/v1/token')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ access_token: 'fake', refresh_token: 'fake', expires_in: 3600, token_type: 'bearer' }) }); return; }
      if (url.includes('/rest/v1/customers') && req.method() === 'GET' && url.includes('select=order_status')) {
        if (hang) return; // 응답 없음
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ order_status: db.order_status, updated_at: db.updated_at }]) }); return;
      }
      if (url.includes('/rest/v1/customers') && req.method() === 'PATCH') {
        patches.push(url); const body = JSON.parse(req.postData() || '{}');
        if (body.order_status) { db.order_status = body.order_status; db.updated_at = 'T' + patches.length; }
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 374, order_status: db.order_status, updated_at: db.updated_at }]) }); return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return;
    }
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700)); await setupValidSession(page); await new Promise(r => setTimeout(r, 500));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await page.evaluate(() => {
    window._estEditState = window._estEditState || {}; window._estEditState.estSaveCustomerId = 374;
    document.getElementById('c-name').value = '권재호'; document.getElementById('c-phone').value = '010-8914-1991';
    document.getElementById('c-addr').value = '서울 강남구 도산대로85길 52'; document.getElementById('c-region').value = '서울';
    document.getElementById('c-measure').value = '2026-12-02';
    var tr = document.querySelector('.row-curtain'); tr.querySelector('.space-inp').value = '안방';
    tr.querySelector('.mw').value = 200; calcCurtainRow(tr.querySelector('.mw')); tr.querySelector('.mh').value = 240; calcCurtainRow(tr.querySelector('.mh'));
    tr.querySelector('.cprice').value = 50000; calcCurtainRow(tr.querySelector('.cprice'));
  });
  const edited = () => page.evaluate(() => { var e = document.getElementById('pv-request-editable'); return e ? e.innerText : null; });
  const closePv = () => page.evaluate(() => { var o = document.getElementById('pv-overlay'); var b = o && Array.from(o.querySelectorAll('button')).find(x => /닫기/.test(x.textContent)); b && b.click(); });

  // 1) 열기(다시보기 경로) → 고치기 → 닫기
  await page.evaluate(() => printRequest('measure', true)); await wait(1200);
  const before = await edited(); ok('1-0. 미리보기가 열리고 고칠 수 있는 영역이 있음', before && /안방/.test(before), String(before));
  await page.evaluate(() => { var e = document.getElementById('pv-request-editable'); e.innerHTML += '<div>고친내용XYZ 현관 비밀번호 확인</div>'; });
  await closePv(); await wait(1500);
  const saved = db.order_status.orderSnap && db.order_status.orderSnap.request && db.order_status.orderSnap.request.measure;
  ok('1. 닫기만 눌러도 고친 내용이 서버에 저장됨', !!(saved && /고친내용XYZ/.test(saved.edited || '')), JSON.stringify(db.order_status).slice(0, 300));

  // 2) 다시 열면 복원
  await page.evaluate(() => printRequest('measure', true)); await wait(1500);
  const again = await edited();
  ok('2. 다시 열면 고친 내용이 그대로 복원됨', again && /고친내용XYZ/.test(again), String(again));
  await closePv(); await wait(500);

  // 3) 비고 메모: 팝업에서 입력 → 미리보기 → 닫기 → 다시 팝업에 미리 채워짐
  await page.evaluate(() => printRequest('measure', false)); await wait(1500);
  await page.evaluate(() => { var ta = document.querySelector('#installer-info-modal textarea'); ta.value = '비고ABC 엘리베이터 사용 불가'; var b = Array.from(document.querySelectorAll('#installer-info-modal button')).find(x => /확인/.test(x.textContent)); b.click(); });
  await wait(1200); await closePv(); await wait(1500);
  ok('3a. 비고가 서버에 저장됨', !!(db.order_status.orderSnap.request.measure.note && /비고ABC/.test(db.order_status.orderSnap.request.measure.note)), JSON.stringify(db.order_status.orderSnap.request.measure).slice(0, 200));
  await page.evaluate(() => printRequest('measure', false)); await wait(1500);
  const noteVal = await page.evaluate(() => { var ta = document.querySelector('#installer-info-modal textarea'); return ta ? ta.value : null; });
  ok('3b. 다시 열면 팝업 비고에 미리 채워져 있음', noteVal && /비고ABC/.test(noteVal), String(noteVal));
  await page.evaluate(() => { var o = document.getElementById('installer-info-modal'); o && o.remove(); });

  // 4) 견적이 바뀌면(제품 줄 변경) 자동 적용 안 하고 안내만
  await page.evaluate(() => { var tr = document.querySelector('.row-curtain'); tr.querySelector('.space-inp').value = '거실로변경'; });
  await page.evaluate(() => printRequest('measure', true)); await wait(1500);
  const changed = await edited(); const notice = await page.evaluate(() => { var o = document.getElementById('pv-overlay'); return o ? o.innerText : ''; });
  ok('4a. 견적이 바뀌면 옛 고친 내용을 자동 적용하지 않음', changed && /거실로변경/.test(changed) && !/고친내용XYZ/.test(changed), String(changed));
  ok('4b. "이전에 고친 내용" 불러오기 안내가 보임', /이전에 고친 내용/.test(notice), notice.slice(0, 200));
  await page.evaluate(() => { var o = document.getElementById('pv-overlay'); var b = o && Array.from(o.querySelectorAll('button')).find(x => /이전에 고친 내용/.test(x.textContent)); b && b.click(); }); await wait(300);
  const loaded = await edited(); ok('4c. 안내 버튼을 누르면 이전에 고친 내용이 들어옴', loaded && /고친내용XYZ/.test(loaded), String(loaded));
  await closePv(); await wait(500);

  // 5) 서버가 응답 없어도 요청서는 열림
  hang = true; await page.evaluate(() => printRequest('measure', true)); await wait(9000);
  const opened = await edited(); ok('5. 서버 응답이 없어도 요청서가 열림(막히지 않음)', !!opened, String(opened));
  ok('6. 화면 오류 없음', errs.length === 0, errs.join(';'));
  await browser.close(); server.close && server.close();
  console.log(fail ? '❌ 실패 ' + fail + '건' : '✅ 모두 통과'); process.exit(fail ? 1 : 0);
})();
