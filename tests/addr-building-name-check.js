#!/usr/bin/env node
// tests/addr-building-name-check.js
// 2026-10-21(선혜님 - "주소에 아파트명이 나오게 할 수는 없어?"): 주소 검색 결과에 건물명(아파트명)이 있으면 기본주소에 "(건물명)"으로 붙는지 확인.
// 건물명 없으면 기존 그대로, 이미 주소에 건물명이 들어 있으면 중복 없이, 다음 검색 후 문서(고객용·의뢰서)에도 아파트명이 나오는지까지 확인.
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
(async () => {
  const port = 16010;
  const server = await startServer(path.resolve(__dirname, '..'), port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => { const url = req.url(); if (url.includes('supabase.co')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return; } if (url.includes('daumcdn.net')) { req.abort(); return; } if (url.startsWith('http://localhost')) req.continue(); else req.abort(); });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));
  const pick = (data, withDetail) => page.evaluate((data, withDetail) => {
    window.daum = { Postcode: function (opts) { this.open = function () { opts.oncomplete(data); }; } };
    document.getElementById('c-addr').value = ''; document.getElementById('c-addr2').value = '';
    openKakaoAddr('c-addr', withDetail ? 'c-addr2' : undefined);
    return { base: document.getElementById('c-addr').value, detail: document.getElementById('c-addr2').value };
  }, data, withDetail);
  const a = await pick({ roadAddress: '서울 서초구 사평대로 205', buildingName: '반포자이', apartment: 'Y' }, true);
  ok('① 아파트면 상세주소 칸에 아파트명이 미리 채워짐(기본주소는 도로명 그대로)', a.base === '서울 서초구 사평대로 205' && a.detail === '반포자이 ', JSON.stringify(a));
  const b = await pick({ roadAddress: '서울 성북구 대사관로11나길 49', buildingName: '', apartment: 'N' }, true);
  ok('② 건물명이 없으면 기존 그대로(상세주소 비어 있음)', b.base === '서울 성북구 대사관로11나길 49' && b.detail === '', JSON.stringify(b));
  const c = await pick({ roadAddress: '서울 서초구 신반포로 42 반포자이', buildingName: '반포자이', apartment: 'Y' }, true);
  ok('③ 주소에 이미 건물명이 있으면 상세주소에 또 넣지 않음', c.detail === '', JSON.stringify(c));
  const d = await pick({ roadAddress: '', autoRoadAddress: '서울 서초구 신반포로 42', jibunAddress: '', buildingName: '트리니원', apartment: 'Y' }, true);
  ok('④ autoRoadAddress 경로(지번 선택)에서도 아파트명이 채워짐', d.base === '서울 서초구 신반포로 42' && d.detail === '트리니원 ', JSON.stringify(d));
  const e = await pick({ roadAddress: '서울 서초구 사평대로 205', buildingName: '반포자이', apartment: 'Y' }, false);
  ok('⑤ 상세주소 칸이 없는 화면은 기본주소 뒤에 (아파트명)으로 붙음', e.base === '서울 서초구 사평대로 205 (반포자이)', JSON.stringify(e));
  // 이미 적어둔 상세주소는 덮어쓰지 않음
  const f = await page.evaluate(() => {
    window.daum = { Postcode: function (opts) { this.open = function () { opts.oncomplete({ roadAddress: '서울 서초구 사평대로 205', buildingName: '반포자이' }); }; } };
    document.getElementById('c-addr2').value = '138동 1504호';
    openKakaoAddr('c-addr', 'c-addr2');
    return document.getElementById('c-addr2').value;
  });
  ok('⑥ 상세주소에 이미 적은 내용은 덮어쓰지 않음', f === '138동 1504호', f);
  // 문서에 나오는지: 아파트명 + 동·호수가 의뢰서·고객용에 그대로
  const docs = await page.evaluate(() => {
    document.getElementById('c-addr').value = '서울 서초구 사평대로 205';
    document.getElementById('c-addr2').value = '반포자이 138동 1504호';
    const want = '서울 서초구 사평대로 205 반포자이 138동 1504호';
    return { measure: buildRequestHTML('measure', '').indexOf(want) >= 0, install: buildRequestHTML('install', '').indexOf(want) >= 0, customer: buildCustomerHTML().indexOf('반포자이') >= 0 };
  });
  ok('⑦ 실측의뢰서 주소에 아파트명 + 동·호수가 나옴', docs.measure);
  ok('⑦ 시공의뢰서 주소에 아파트명 + 동·호수가 나옴', docs.install);
  ok('⑦ 고객용 견적서에도 아파트명이 나옴', docs.customer);
  // 대시보드 고객 상세 화면 헤더에도 아파트명이 그대로 보임
  const dp = await browser.newPage(); const derrs = []; dp.on('pageerror', e => derrs.push(e.message)); dp.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await dp.setRequestInterception(true);
  dp.on('request', (req) => { const url = req.url(); if (url.includes('supabase.co')) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return; } if (url.startsWith('http://localhost')) req.continue(); else req.abort(); });
  await dp.setViewport({ width: 1280, height: 1200 });
  await dp.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800)); await loginAs(dp, 'master'); await new Promise(r => setTimeout(r, 800));
  const dd = await dp.evaluate(() => { renderDetailHeader({ clientName: '테스트고객', addr: '서울 서초구 사평대로 205 반포자이 138동 1504호', addrDetail: '반포자이 138동 1504호', phone: '010-0000-0000', stage: '상담', date: '2026-10-21', staffName: '마스터' }); const el = document.getElementById('detail-addr'); return el ? el.textContent : null; });
  ok('⑧ 대시보드 고객 상세 헤더에 아파트명 + 동·호수가 그대로 보임', dd === '서울 서초구 사평대로 205 반포자이 138동 1504호', dd);
  ok('JS 에러 없음(대시보드)', derrs.length === 0, derrs.join(' | '));
  ok('JS 에러 없음', errs.length === 0, errs.join(' | '));
  await browser.close(); server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 모두 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
