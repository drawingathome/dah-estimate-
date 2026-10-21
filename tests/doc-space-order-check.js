// tests/doc-space-order-check.js
// 2026-10-21(선혜님 - 윤세현 견적서: "1층 2층 지하 공간별로 … 고객용 견적서와 실측요청서·시공요청서 공간 순서가 엉망"):
// 고객용 견적서 / 실측·시공 의뢰서 / 발주서가 모두 같은 공간 순서(1층→2층→…→지하, 층 표기 없는 공간은 앞 공간과 같은 층)로 나오는지 확인.
// ① 정렬 함수 단위 시험(윤세현 실제 공간 목록 50줄) ② 실제 화면에 커튼·블라인드 줄을 넣고 세 문서의 순서가 같고 규칙대로인지 ③ 세 문서가 공통 함수를 쓰는지(가나다순 등 따로 정렬 금지)
const fs = require('fs'), path = require('path');
const { estSpaceOrderMap, estFloorRankFromText } = require('../est-space-order.js');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }

// ① 윤세현 실제 입력 순서(커튼 먼저, 그다음 블라인드)
const YUN = ['1층 주방_식탁 옆', '1층 작은거실', '1층 메인거실', '안방 드레스룸', '2층 미니거실',
  '1층 주방_식탁 옆 가구쪽', '1층 주방_난로뒤', '1층 주방_수전', '1층 주방 옆 차마시는 공간', '1층 작은거실 맞은편', '1층 작은거실 맞은편 화장실', '1층 메인거실', '1층 메인거실 옆 난로',
  '안방 침실', '안방 거실 (TV쪽)', '안방 드레스룸', '안방 화장실 통창', '안방 화장실 측면', '1층 계단쪽 창',
  '2층 복도 1', '2층 복도 2', '2층 미니거실', '2층 안방 침실', '2층 안방 거실', '2층 안방 화장실 정면', '2층 안방 화장실 측면',
  '지하 운동방', '지하 운동방 탈의실', '지하 운동방 내부 입구쪽', '(외부) 지하 운동방 입구쪽', '(외부) 지하 운동방 내부 입구쪽', '지하 운동방 계단창',
  '1층 메인 입구문', '1층 주방 베란다'];
function sortedUnique(list) { const m = estSpaceOrderMap(list); return Object.keys(m).sort((a, b) => m[a] - m[b]); }
const s1 = sortedUnique(YUN);
const floorOf = (sp) => { const r = estFloorRankFromText(sp); return r; };
// 층 번호가 단조 증가(1층들 → 2층들 → 지하들)인지: 층 표기 없는 공간은 앞 공간 층을 따르므로 직접 계산
let prev = 1, rankSeq = s1.map(sp => { const r = floorOf(sp); const v = r === null ? prev : r; prev = v; return v; });
// 정렬 후 목록에서 층 표기가 없는 공간의 층은 "원래 목록 기준 앞 공간"이라 위 계산은 근사 — 층 표기 있는 공간만으로 단조성 확인
const explicit = s1.map(sp => floorOf(sp)).filter(r => r !== null);
ok('① 층 표기 있는 공간은 1층 → 2층 → 지하 순(되돌아가지 않음)', explicit.every((v, i) => i === 0 || explicit[i - 1] <= v), explicit.join(','));
ok('① 지하 공간이 모두 맨 끝에 모임', (() => { const idx = s1.map((sp, i) => /지하/.test(sp) ? i : -1).filter(i => i >= 0); return idx.length && idx[0] === s1.length - idx.length; })(), s1.join(' / '));
ok('① 안방(층 표기 없음)은 같은 이름의 "2층 안방 …"과 같은 2층 묶음에 붙음', ['안방 침실','안방 드레스룸','안방 거실 (TV쪽)'].every(sp => s1.indexOf(sp) > s1.indexOf('1층 주방 베란다') && s1.indexOf(sp) < s1.indexOf('지하 운동방')), s1.join(' / '));
(() => { const m = estSpaceOrderMap(['1층 주방','거실','2층 거실','안방','2층 안방','지하 운동방']); const l = Object.keys(m).sort((a,b)=>m[a]-m[b]);
  ok('① 같은 이름 층 표기가 있으면 그 층을 따름(안방→2층, 앞 공간 층 아님)', l.indexOf('안방') > l.indexOf('1층 주방') && l.indexOf('안방') < l.indexOf('지하 운동방') && Math.abs(l.indexOf('안방') - l.indexOf('2층 안방')) === 1, l.join(' / '));
  const m2 = estSpaceOrderMap(['1층 거실','2층 거실','거실','지하 운동방']); const l2 = Object.keys(m2).sort((a,b)=>m2[a]-m2[b]);
  ok('① 같은 이름이 층이 갈리면(1층·2층 모두) 억지로 정하지 않고 앞 공간 규칙대로', l2.indexOf('거실') > l2.indexOf('2층 거실') && l2.indexOf('거실') < l2.indexOf('지하 운동방'), l2.join(' / ')); })();
(() => { const L = ['1층 주방_식탁','1층 안방','1층 드레스룸','1층 거실','1층 자녀방','1층 베란다','2층 주방','2층 거실','안방 침실','2층 안방 화장실','지하 창고'];
  const m = estSpaceOrderMap(L); const l = Object.keys(m).sort((a,b)=>m[a]-m[b]);
  const f1 = l.slice(0, 6), f2 = l.slice(6, 10);
  ok('① 같은 층 안 방 종류 순서 = 거실→안방→자녀방→드레스룸→주방→그 외', f1.join('|') === ['1층 거실','1층 안방','1층 자녀방','1층 드레스룸','1층 주방_식탁','1층 베란다'].join('|'), f1.join(' / '));
  ok('① 2층도 같은 규칙(거실→안방 묶음→주방), 층 순서가 방 순서보다 우선', f2.join('|') === ['2층 거실','안방 침실','2층 안방 화장실','2층 주방'].join('|') && l[l.length - 1] === '지하 창고', l.join(' / ')); })();
ok('① 층 표기 변형(2F·1F·지층·반지하·B1)도 층으로 인식', [['2F 거실',2],['1F 안방',1],['지층 창고',1000],['반지하 방',1000],['B1 창고',1000],['2층 거실',2]].every(([n, r]) => estFloorRankFromText(n) === r));
(() => { const m = estSpaceOrderMap(['2F 안방','1F 거실','지층 창고','1F 안방']); const l = Object.keys(m).sort((a,b)=>m[a]-m[b]); ok('① 영문 층 표기도 1F→2F→지층 순', l.join('|') === ['1F 거실','1F 안방','2F 안방','지층 창고'].join('|'), l.join(' / ')); })();
ok('① 같은 공간은 항상 한 번만(붙어서) 나옴', new Set(s1).size === s1.length);

// ③ 코드 연결(공통 함수 사용, 따로 정렬 금지)
const read = f => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
ok('③ 고객용 견적서가 공통 정렬 함수 사용', /estSpaceOrderMap/.test(read('est-doc-customer.js')));
ok('③ 의뢰서가 공통 정렬 함수 사용', /estSpaceOrderMap/.test(read('est-doc-request.js')));
ok('③ 발주서가 공통 정렬 함수 사용(가나다순 단독 정렬 아님)', /estSpaceOrderMap/.test(read('est-doc-vendor.js')));
const html = read('dah-estimate.html');
ok('③ 화면이 est-space-order.js를 문서 코드보다 먼저 읽음', html.indexOf('est-space-order.js') > 0 && html.indexOf('est-space-order.js') < html.indexOf('est-doc-customer.js'));

(async () => {
  const dir = path.resolve(__dirname, '..');
  const port = 9971;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(); if (u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) req.continue(); else if (u.includes('supabase.co')) { const h = { 'Access-Control-Allow-Origin': '*' }; if (req.method() === 'OPTIONS') req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } }); else req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' }); } else req.abort(); });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 900));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 800));
  const res = await page.evaluate((YUN) => {
    document.getElementById('curtain-body').innerHTML = '';
    document.getElementById('blind-body').innerHTML = '';
    const curtains = YUN.slice(0, 5), blinds = YUN.slice(5);
    curtains.forEach(sp => { addCurtainRow(); const tr = document.querySelector('#curtain-body tr:last-child'); tr.querySelector('.space-inp').value = sp; tr.querySelector('.mw').value = 100; calcCurtainRow(tr.querySelector('.mw')); tr.querySelector('.mh').value = 100; calcCurtainRow(tr.querySelector('.mh')); tr.querySelector('.cprice').value = 10000; calcCurtainRow(tr.querySelector('.cprice')); const dn = tr.querySelector('.c-display-name'); if (dn) dn.value = '커튼'; const fb = tr.querySelector('.c-fabric'); if (fb) fb.value = '원단A'; });
    blinds.forEach(sp => { addBlindRow(); const tr = document.querySelector('#blind-body tr:last-child'); tr.querySelector('.space-inp').value = sp; const dn = tr.querySelector('.b-display-name'); if (dn) dn.value = '블라인드'; const fb = tr.querySelector('.b-fabric'); if (fb) fb.value = '원단B'; const vs = tr.querySelector('.b-vendor'); if (vs) { vs.innerHTML = '<option value="윈텍">윈텍</option>'; vs.value = '윈텍'; } });
    const strip = h => { const d = document.createElement('div'); d.innerHTML = h; return d; };
    const out = {};
    const cu = strip(buildCustomerHTML());
    out.customer = [...cu.querySelectorAll('.space-cell-text')].map(e => e.textContent.trim());
    const mq = strip(buildRequestHTML('measure', ''));
    out.measureText = mq.textContent;
    out.measure = [...mq.querySelectorAll('tbody tr, li, div')].map(e => e.children.length === 0 ? e.textContent.trim() : '').filter(Boolean);
    const rq = strip(buildRequestHTML('install', ''));
    out.request = [...rq.querySelectorAll('tbody tr')].map(tr => (tr.children[0] || {}).textContent || '').map(s => s.trim()).filter(Boolean);
    try { const c = collectVendorGroups(); const k = Object.keys(c.groups).find(g => /윈텍/.test(g)); out.vendor = k ? [...new Set(c.groups[k].map(i => i.space))] : []; out.vendorKeys = Object.keys(c.groups); } catch (e) { out.vendorErr = String(e); }
    return out;
  }, YUN);
  const expected = sortedUnique(YUN);
  const sameAs = (a) => JSON.stringify(a) === JSON.stringify(expected);
  ok('② 고객용 견적서의 공간 순서 = 규칙대로(1층→2층→지하)', sameAs(res.customer), JSON.stringify(res.customer.slice(0, 40)));
  ok('② 실측/시공 의뢰서의 공간 순서 = 규칙대로', res.request.length > 0 && JSON.stringify(res.request.filter((v, i, a) => a.indexOf(v) === i)) === JSON.stringify(expected.filter(s => res.request.indexOf(s) >= 0)), JSON.stringify(res.request.slice(0, 40)));
  // 실측의뢰서(별도 코드): 본문에 나온 공간 이름들의 등장 순서가 규칙 순서와 같아야 함
  const posIn = (txt, sp) => txt.indexOf(sp);
  const mText = res.measureText || '';
  const mSpaces = expected.filter(sp => /^\d+층 |^지하 /.test(sp) && posIn(mText, sp) >= 0 && !expected.some(o => o !== sp && o.indexOf(sp) === 0 && posIn(mText, o) === posIn(mText, sp)));
  const mPos = mSpaces.map(sp => posIn(mText, sp));
  ok('② 실측의뢰서의 공간 순서 = 같은 규칙(1층→2층→지하, 시공의뢰서·고객용과 동일)', mSpaces.length >= 10 && mPos.every((v, i) => i === 0 || mPos[i - 1] < v), 'n=' + mSpaces.length + ' ' + JSON.stringify(mText.slice(0, 600)));
  ok('② 발주서(블라인드 거래처 = 그 거래처 품목만)의 공간 순서 = 같은 규칙대로(가나다순 아님)', res.vendor && res.vendor.length > 0 && JSON.stringify(res.vendor) === JSON.stringify(sortedUnique(YUN.slice(5))), res.vendorErr || JSON.stringify((res.vendor || []).slice(0, 40)) + ' keys=' + JSON.stringify(res.vendorKeys));
  ok('JS 에러 없음', errs.length === 0, errs.join(' | '));
  await browser.close(); server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 모두 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
