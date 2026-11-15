// tests/vendor-doc-field-writeback-check.js
// 2026-11-15 N-159 ④(선혜님 결정: "A만 저장·B는 표시만 / 안내는 직접 닫을 때까지 유지"):
// 블라인드 발주서 칸을 고쳤을 때 ①손잡이·끈길이·하단바·코멘트는 원본 견적서 행에 저장 ②사이즈·수량·원단명은 저장하지 않고 노란 표시+닫을 때 경고
// ③그 사이 원본이 바뀌었으면 덮어쓰지 않음 ④안내(토스트)는 6초 뒤 저절로 사라지지 않고 ✕로 닫음.
// 한계: 문서 함수에 가짜 원본 행을 넣어 보는 시험이며 실제 견적서 저장·화면 모양은 눈 확인 필요.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
let fail = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const dir = path.resolve(__dirname, '..'); const server = await startServer(dir, 9941); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (u.startsWith('http://localhost')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('supabase.co')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' });
    req.abort(); });
  await page.goto('http://localhost:9941/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900)); await loginAs(page, 'master'); await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(async () => {
    function srcRow(handle, cord, bar, comment, opt) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><select class="handle-dir"><option value="">선택</option><option>좌손</option><option>우손</option><option>노코드</option><option>기타</option></select>'
        + '<input class="b-cord-length"><input class="b-bottom-bar"><input class="b-comment"><input class="blind-opt"></td>';
      tr.querySelector('.handle-dir').value = handle; tr.querySelector('.b-cord-length').value = cord; tr.querySelector('.b-bottom-bar').value = bar;
      tr.querySelector('.b-comment').value = comment; tr.querySelector('.blind-opt').value = opt; return tr;
    }
    var rows = [srcRow('우손', '150', '화이트', '창문 안쪽', ''), srcRow('좌손', '120', '블랙', '현장확인', '전동')];
    function mk(i, space, rr) { return { space: space, product: '버튼', color: '—', size: '120×200', kind: '콤비', handle: rr.querySelector('.handle-dir').value + '잡이', cordLength: rr.querySelector('.b-cord-length').value, bottomBar: rr.querySelector('.b-bottom-bar').value,
      comment: [rr.querySelector('.blind-opt').value, rr.querySelector('.b-comment').value].filter(Boolean).join(' / '), qty: '1개', vendor: '윈텍', orderCategory: 'blind', sourceRow: rr, vendorField: '.b-vendor', vendorIsSelect: true,
      rawHandle: rr.querySelector('.handle-dir').value, rawCord: rr.querySelector('.b-cord-length').value, rawBar: rr.querySelector('.b-bottom-bar').value, rawComment: rr.querySelector('.b-comment').value, rawOpt: rr.querySelector('.blind-opt').value }; }
    var items = [mk(0, '거실', rows[0]), mk(1, '안방', rows[1])];
    var box = document.createElement('div'); box.innerHTML = buildVendorDocForOne('윈텍', items, '홍길동', '오지은 실장', null, '2026-11-15', '2026-11-20', '서울');
    document.body.appendChild(box);
    wireVendorFieldEdit(box, { '윈텍': items });
    function cell(idx, f) { return box.querySelector('td[data-ed="' + f + '"][data-ed-idx="' + idx + '"]'); }
    function edit(idx, f, text) { var td = cell(idx, f); td.textContent = text; td.dispatchEvent(new Event('focusout', { bubbles: true })); return td; }
    var out = {};
    out.hasCells = box.querySelectorAll('td[data-ed]').length;
    // A칸 저장
    edit(0, 'handle', '좌손잡이'); edit(0, 'cord', '180'); edit(0, 'bar', '블랙'); edit(0, 'comment', '창문 바깥쪽');
    out.a = [rows[0].querySelector('.handle-dir').value, rows[0].querySelector('.b-cord-length').value, rows[0].querySelector('.b-bottom-bar').value, rows[0].querySelector('.b-comment').value];
    out.diffAfterA = box.querySelectorAll('td[data-diff]').length;
    // 옵션이 있는 줄의 코멘트: "전동 / 현장확인" → 앞의 옵션은 건드리지 않고 코멘트만 저장
    edit(1, 'comment', '전동 / 고객과 통화');
    out.opt = [rows[1].querySelector('.b-comment').value, rows[1].querySelector('.blind-opt').value];
    // 옵션 글자를 지우면 되돌려 쓸 수 없음 → 원본 그대로 + 노란 표시
    var tdBad = edit(1, 'comment', '그냥 새 문장');
    out.optBad = { src: rows[1].querySelector('.b-comment').value, diff: tdBad.hasAttribute('data-diff') };
    // 이상한 손잡이 글자
    var tdH = edit(1, 'handle', '위쪽'); out.badHandle = { src: rows[1].querySelector('.handle-dir').value, diff: tdH.hasAttribute('data-diff') };
    // B칸: 저장 안 함 + 표시
    var tdS = edit(0, 'size', '130×210'); var tdQ = edit(0, 'qty', '3개'); var tdN = edit(0, 'name', '다른원단');
    out.b = { diff: [tdS, tdQ, tdN].every(function(t){ return t.hasAttribute('data-diff'); }), title: tdS.title };
    out.countDiff = dahCountDiffCells(box);
    // B칸을 원래대로 되돌리면 표시 해제
    edit(0, 'size', '120×200'); out.afterRevert = dahCountDiffCells(box);
    // 충돌: 그 사이 원본이 바뀜
    rows[0].querySelector('.b-cord-length').value = '999';
    var tdC = edit(0, 'cord', '200'); out.conflict = { src: rows[0].querySelector('.b-cord-length').value, diff: tdC.hasAttribute('data-diff') };
    // 토스트: 6.5초 뒤에도 남아 있고 ✕로 닫힘
    dahShowVendorSavedToast('테스트'); await new Promise(function(r){ setTimeout(r, 6500); });
    var t = document.getElementById('pv-saved-toast'); out.toastStays = !!t;
    if (t) { var x = Array.from(t.querySelectorAll('button')).find(function(b){ return b.textContent === '✕'; }); out.hasX = !!x; if (x) x.click(); }
    out.toastClosed = !document.getElementById('pv-saved-toast');
    return out;
  });
  ok('1. 블라인드 칸에 식별표(data-ed)가 붙음(2줄×7칸=14)', r.hasCells === 14, r.hasCells);
  ok('2. A칸(손잡이·끈길이·하단바·코멘트) 고치면 원본 행에 저장', JSON.stringify(r.a) === JSON.stringify(['좌손', '180', '블랙', '창문 바깥쪽']), JSON.stringify(r.a));
  ok('3. A칸 저장 후에는 노란 표시가 없음', r.diffAfterA === 0, r.diffAfterA);
  ok('4. 옵션이 있는 줄: 코멘트만 저장하고 옵션은 그대로', r.opt[0] === '고객과 통화' && r.opt[1] === '전동', JSON.stringify(r.opt));
  ok('5. 옵션 글자를 지운 코멘트는 원본을 바꾸지 않고 노란 표시', r.optBad.src === '고객과 통화' && r.optBad.diff === true, JSON.stringify(r.optBad));
  ok('6. 손잡이에 없는 글자("위쪽")는 원본을 바꾸지 않고 노란 표시', r.badHandle.src === '좌손' && r.badHandle.diff === true, JSON.stringify(r.badHandle));
  ok('7. B칸(사이즈·수량·원단명)은 노란 표시 + 안내 문구, 저장 안 함', r.b.diff && /저장 안 됨/.test(r.b.title) && r.countDiff >= 4, JSON.stringify(r.b) + ' ' + r.countDiff);
  ok('8. B칸을 원래대로 되돌리면 표시가 사라짐(옵션 지운 코멘트·위쪽 손잡이 2칸만 남음)', r.afterRevert === r.countDiff - 1, r.afterRevert + '/' + r.countDiff);
  ok('9. 그 사이 원본이 바뀌었으면 덮어쓰지 않고 노란 표시', r.conflict.src === '999' && r.conflict.diff === true, JSON.stringify(r.conflict));
  ok('10. 안내 토스트는 6.5초 뒤에도 남아 있고 ✕로 닫힘', r.toastStays && r.hasX && r.toastClosed, JSON.stringify([r.toastStays, r.hasX, r.toastClosed]));
  console.log(errs.length ? '❌ JS 에러: ' + errs.join('; ') : '✅ JS 에러 없음'); if (errs.length) fail++;
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
