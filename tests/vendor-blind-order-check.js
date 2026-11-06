// tests/vendor-blind-order-check.js
// 2026-11-06(선혜님): 블라인드 발주서 — ①같은 위치는 한 번만 적고 칸 병합 ②거래처는 상단 '발주처' 한 곳만(표 안 거래처 칸은 미지정일 때만)
// ③상단 = 요청일/도착일/업체명/고객명 // 발주처/도착장소/담당자, 표 = 위치/원단명/시스템/사이즈/수량/손잡이방향/끈길이/하단바/코멘트.
// 한계: 문서 생성 함수에 가짜 항목을 넣어 구조를 보는 시험이며 실제 견적서·인쇄는 못 봄. 커튼/레일 발주서는 바뀌지 않음을 함께 확인.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
let fail = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const dir = path.resolve(__dirname, '..'); const server = await startServer(dir, 9938); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
    if (u.startsWith('http://localhost')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
    if (u.includes('supabase.co')) return req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' });
    req.abort(); });
  await page.goto('http://localhost:9938/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900)); await loginAs(page, 'master'); await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(() => {
    function mk(space, product, extra) { return Object.assign({ space: space, product: product, vendor: '윈텍', kind: '콤비', size: '120×200', qty: '1', handle: '우', cordLength: '150', bottomBar: '화이트', comment: '', orderCategory: 'blind' }, extra || {}); }
    var items = [mk('거실', '버튼'), mk('안방', '화이트'), mk('거실', '그레이'), mk('거실', '베이지'), mk('주방', '화이트')];
    var html = buildVendorDocForOne('윈텍', items, '홍길동', '오지은 실장', null, '2026-11-06', '2026-11-12', '서울 서초구 가공소');
    var box = document.createElement('div'); box.innerHTML = html;
    var tbl = box.querySelector('table.pv-blind-table');
    var heads = tbl ? Array.from(tbl.querySelectorAll('thead th')).map(function(t){ return t.textContent; }) : [];
    var rows = tbl ? Array.from(tbl.querySelectorAll('tbody tr')) : [];
    var spaceCells = rows.map(function(tr){ var td = tr.querySelector('td'); return td ? td.textContent + '|' + (td.getAttribute('rowspan') || '') : ''; });
    var info = box.querySelector('table.pv-blind-info');
    var infoLabels = info ? Array.from(info.querySelectorAll('td')).filter(function(td){ return td.style.background; }).map(function(td){ return td.textContent; }) : [];
    var infoText = info ? info.textContent : '';
    // 미지정 그룹
    var un = buildVendorDocForOne('미지정(블라인드)', [mk('거실', '버튼', { vendor: '' })], '홍길동', '오지은 실장', null, '2026-11-06', '', '');
    var box2 = document.createElement('div'); box2.innerHTML = un;
    var heads2 = Array.from(box2.querySelectorAll('table.pv-blind-table thead th')).map(function(t){ return t.textContent; });
    var banner = box.querySelector('.pv-unassigned-banner'), banner2 = box2.querySelector('.pv-unassigned-banner');
    return { heads: heads, spaceCells: spaceCells, infoLabels: infoLabels, infoText: infoText, heads2: heads2, hasBanner: !!banner, hasBanner2: !!banner2, vendorField: !!box.querySelector('.pv-vendor-name-field') };
  });
  ok('1. 표 칸 순서 = 위치/원단명/시스템/사이즈/수량/손잡이방향/끈길이/하단바/코멘트', JSON.stringify(r.heads) === JSON.stringify(['위치','원단명','시스템','사이즈','수량','손잡이방향','끈길이','하단바','코멘트']), JSON.stringify(r.heads));
  ok('2. 표 안에 거래처·고객명 칸이 없음(거래처가 정해진 경우)', r.heads.indexOf('거래처') === -1 && r.heads.indexOf('고객명') === -1, JSON.stringify(r.heads));
  ok('3. 같은 위치(거실 3개)는 첫 줄에만 위치를 적고 rowspan=3으로 병합', r.spaceCells[0] === '거실|3', JSON.stringify(r.spaceCells));
  ok('4. 병합된 줄(2·3번째)은 위치 칸이 없고 다른 위치는 각자 표시(안방·주방 rowspan=1)', r.spaceCells.length === 5 && r.spaceCells.filter(function(x){ return x.indexOf('거실') === 0; }).length === 1 && r.spaceCells.indexOf('안방|1') !== -1 && r.spaceCells.indexOf('주방|1') !== -1, JSON.stringify(r.spaceCells));
  ok('5. 상단 항목 = 요청일/도착일/업체명/고객명/발주처/도착장소/담당자', JSON.stringify(r.infoLabels) === JSON.stringify(['요청일','도착일','업체명','고객명','발주처','도착장소','담당자']), JSON.stringify(r.infoLabels));
  ok('6. 상단에 고객명·발주처 값이 들어감', r.infoText.indexOf('홍길동') !== -1 && r.infoText.indexOf('윈텍') !== -1 && r.vendorField, r.infoText);
  ok('7. 거래처 정해진 발주서에는 "거래처:" 배너가 없음(발주처와 중복 방지)', r.hasBanner === false);
  ok('8. 거래처 미지정이면 표 안 거래처 칸과 경고 배너가 유지됨(항목별 지정 통로)', r.heads2.indexOf('거래처') !== -1 && r.hasBanner2 === true, JSON.stringify(r.heads2));
  console.log(errs.length ? '❌ JS 에러: ' + errs.join('; ') : '✅ JS 에러 없음'); if (errs.length) fail++;
  await browser.close(); server.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
