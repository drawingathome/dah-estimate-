// tests/vendor-fabric-writeback-check.js
// 2026-11-28 N-218(선혜님: 발주서 안에서 원단 마수·원단코드를 늘 고치는데 저장이 안 됨 → 저장돼야 함):
// 원단 발주서 표의 ①마수(수량) ②원단코드(원단명)를 고치면 견적서 행의 '원단량'(.c-yardage)·'원단코드'(.c-fabric) 칸에 저장 ③총액 괄호는 떼고 숫자만 ④그 사이 원본이 바뀌었으면 덮어쓰지 않음
// ⑤원단코드를 비우면 저장 안 함+노란 표시 ⑥고친 값이 있으면 발주완료 때 견적서 저장(saveEstimate)을 부름, 없으면 안 부름.
// 한계: 문서 함수에 가짜 원본 행을 넣어 보는 시험이며 실제 견적서 저장·화면은 눈 확인 필요.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
let fail = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const dir = path.resolve(__dirname, '..'); const server = await startServer(dir, 9947); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (u.startsWith('http://localhost')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('supabase.co')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' });
    req.abort(); });
  await page.goto('http://localhost:9947/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900)); await loginAs(page, 'master'); await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(() => {
    function srcRow(code, yard) { var tr = document.createElement('tr'); tr.innerHTML = '<td><input class="c-fabric"><input class="c-yardage"></td>'; tr.querySelector('.c-fabric').value = code; tr.querySelector('.c-yardage').value = yard; return tr; }
    var rows = [srcRow('AB-1001', '10.2마'), srcRow('CD-2002', '8마')];
    function mk(rr, space) { var y = rr.querySelector('.c-yardage').value; return { space: space, product: rr.querySelector('.c-fabric').value, color: '아이보리', size: '—', content: '나비주름', qty: y + ' (459,000원)', vendor: '다단다', orderCategory: 'fabric',
      sourceRow: rr, vendorField: '.c-vendor', rawYardage: y, rawFabric: rr.querySelector('.c-fabric').value, yardageField: '.c-yardage', codeField: '.c-fabric' }; }
    var items = [mk(rows[0], '거실'), mk(rows[1], '안방')];
    var box = document.createElement('div'); box.innerHTML = buildVendorDocForOne('다단다', items, '홍길동', '오지은 실장', null, '2026-11-28', '2026-12-03', '서울');
    document.body.appendChild(box); wireVendorFieldEdit(box, { '다단다': items });
    function cell(idx, f) { return box.querySelector('td[data-ed="' + f + '"][data-ed-idx="' + idx + '"]'); }
    function edit(idx, f, text) { var td = cell(idx, f); td.textContent = text; td.dispatchEvent(new Event('focusout', { bubbles: true })); return td; }
    var out = {}; out.hasCells = box.querySelectorAll('td[data-ed]').length;
    window._dahVendorPendingWrites = 0; var saved = 0; window.saveEstimate = function () { saved++; };
    out.noEditSave = dahSaveEstimateIfVendorEdited(); out.savedNoEdit = saved;
    edit(0, 'fqty', '12마 (550,000원)'); out.yard = rows[0].querySelector('.c-yardage').value;
    edit(0, 'fname', 'AB-1002 (아이보리)'); out.code = rows[0].querySelector('.c-fabric').value;
    out.pending = window._dahVendorPendingWrites;
    var tdE = edit(1, 'fname', ''); out.empty = { src: rows[1].querySelector('.c-fabric').value, diff: tdE.hasAttribute('data-diff') };
    rows[1].querySelector('.c-yardage').value = '99마'; var tdC = edit(1, 'fqty', '9마'); out.conflict = { src: rows[1].querySelector('.c-yardage').value, diff: tdC.hasAttribute('data-diff') };
    out.save1 = dahSaveEstimateIfVendorEdited(); out.savedAfter = saved; out.pendingAfter = window._dahVendorPendingWrites; out.save2 = dahSaveEstimateIfVendorEdited(); out.savedAfter2 = saved;
    return out;
  });
  ok('1. 원단 표 칸에 식별표(data-ed)가 붙음(2줄×2칸=4)', r.hasCells === 4, r.hasCells);
  ok('2. 고친 게 없으면 발주완료가 견적서 저장을 부르지 않음', r.noEditSave === false && r.savedNoEdit === 0, JSON.stringify([r.noEditSave, r.savedNoEdit]));
  ok('3. 마수를 고치면 원단량 칸에 숫자만 저장(총액 괄호 제외)', r.yard === '12마', r.yard);
  ok('4. 원단코드를 고치면 원단코드 칸에 저장((색상) 꼬리표 제외)', r.code === 'AB-1002', r.code);
  ok('5. 저장 대기 횟수가 2로 기록됨', r.pending === 2, r.pending);
  ok('6. 원단코드를 비우면 원본을 바꾸지 않고 노란 표시', r.empty.src === 'CD-2002' && r.empty.diff === true, JSON.stringify(r.empty));
  ok('7. 그 사이 원본이 바뀌었으면 덮어쓰지 않고 노란 표시', r.conflict.src === '99마' && r.conflict.diff === true, JSON.stringify(r.conflict));
  ok('8. 고친 값이 있으면 발주완료 때 saveEstimate를 한 번 부르고 대기 횟수를 비움', r.save1 === true && r.savedAfter === 1 && r.pendingAfter === 0, JSON.stringify([r.save1, r.savedAfter, r.pendingAfter]));
  ok('9. 곧바로 다시 눌러도 중복 저장하지 않음', r.save2 === false && r.savedAfter2 === 1, JSON.stringify([r.save2, r.savedAfter2]));
  console.log(errs.length ? '❌ JS 에러: ' + errs.join('; ') : '✅ JS 에러 없음'); if (errs.length) fail++;
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
