// tests/order-snapshot-write-check.js
// 2026-11-28 N-223 1단계(선혜님 '추천대로'): 발주완료·의뢰서 인쇄 때 '발주 당시 값'을 order_status.orderSnap(맨 위 별도 키)에 남기는지 확인.
// ①원단 발주완료 → orderSnap.fabric(round 1, 줄별 공간·품명·색상·마수·거래처, 시공일·실측일), 금액은 안 남김, 기존 키 유지
// ②다시 눌러도 처음 발주일 유지 + round 2 ③읽은 뒤 다른 기기가 먼저 저장해도 재시도하며 그 기록을 지우지 않음 ④의뢰서(시공) 일정이 orderSnap.request에 남고 원단 기록 유지.
// 한계: 가짜 서버로 보는 시험(실제 서버·화면 눈 확인 필요). 비교·알림은 2단계에서 만든다.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
const CORS = { 'Access-Control-Allow-Origin': '*' };

async function main() {
  const dir = path.resolve(__dirname, '..');
  const port = 30893;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.dismiss(); } catch (e) {} });
  const jsErrors = []; page.on('pageerror', e => jsErrors.push(e.message));
  let db = { order_status: {}, updated_at: 'T0' };
  const patches = []; let raceOnce = false;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      if (url.includes('/rest/v1/customers') && req.method() === 'GET' && url.includes('select=order_status')) {
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ order_status: db.order_status, updated_at: db.updated_at }]) }); return;
      }
      if (url.includes('/rest/v1/customers') && req.method() === 'PATCH') {
        patches.push(url);
        if (raceOnce && patches.length === 1) { db.order_status = Object.assign({}, db.order_status, { rail: { done: true }, orderSnap: Object.assign({}, db.order_status.orderSnap || {}, { production: { round: 1, at: 'X', lines: [{ s: '거실', p: '제작' }] } }) }); db.updated_at = 'T-race'; }
        const m = url.match(/updated_at=eq\.([^&]*)/); const cond = m ? decodeURIComponent(m[1]) : null;
        if (cond !== null && cond !== db.updated_at) { req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return; }
        const body = JSON.parse(req.postData() || '{}');
        db.order_status = body.order_status; db.updated_at = 'T' + patches.length;
        req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([{ id: 5, order_status: db.order_status, updated_at: db.updated_at }]) }); return;
      }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' }); return;
    }
    if (url.startsWith('http://localhost')) req.continue(); else req.abort();
  });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 600));
  await setupValidSession(page);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const groupsCall = () => page.evaluate(() => {
    window._estEditState = window._estEditState || {}; window._estEditState.estSaveCustomerId = 5;
    function setVal(id, v) { var el = document.getElementById(id); if (el) el.value = v; }
    setVal('c-install', '2026-12-10'); setVal('c-measure', '2026-12-01');
    var groups = { '한솔': [{ orderCategory: 'fabric', space: '거실', product: 'SH-2041', color: '아이보리', size: '—', qty: '12마 (550,000원)', rawYardage: '12마', vendor: '한솔' }] };
    updateOrderStatusFromVendorGroups(groups);
  });

  db = { order_status: { curtain: { done: true }, install: { done: true, vendor: '유', orderDate: '2026-11-20' } }, updated_at: 'T0' };
  await groupsCall(); await wait(900);
  const r1 = JSON.parse(JSON.stringify(db.order_status)); const p1 = patches.length;
  const firstDate = r1.fabric && r1.fabric.orderDate;
  await groupsCall(); await wait(900);
  const r2 = JSON.parse(JSON.stringify(db.order_status));
  // 읽은 뒤 다른 기기가 먼저 저장
  patches.length = 0; raceOnce = true; db = { order_status: { curtain: { done: true } }, updated_at: 'T0' };
  await groupsCall(); await wait(1200);
  const r3 = { n: patches.length, os: JSON.parse(JSON.stringify(db.order_status)) };
  raceOnce = false;
  // 의뢰서
  await page.evaluate(() => { updateOrderStatus({ install: { done: true, vendor: '유철', orderDate: '2026-11-28' } }, undefined, { request: { install: { date: '2026-12-10', installer: '유철' } } }); });
  await wait(900);
  const r4 = JSON.parse(JSON.stringify(db.order_status));

  const log = []; const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + d));
  const f = r1.orderSnap && r1.orderSnap.fabric;
  ok('1. 발주완료 때 orderSnap.fabric(round 1)에 줄(공간·품명·색상·마수·거래처)이 남음', f && f.round === 1 && f.lines.length === 1 && f.lines[0].s === '거실' && f.lines[0].p === 'SH-2041' && f.lines[0].c === '아이보리' && f.lines[0].q === '12마' && f.lines[0].v === '한솔', JSON.stringify(f));
  ok('2. 시공일·실측일도 같이 남음', f && f.installDate === '2026-12-10' && f.measureDate === '2026-12-01', JSON.stringify(f));
  ok('3. 금액(550,000)은 어디에도 남지 않음', JSON.stringify(r1.orderSnap).indexOf('550') < 0 && JSON.stringify(r1.orderSnap).indexOf('원') < 0, JSON.stringify(r1.orderSnap));
  ok('4. 기존 키(curtain·install)와 fabric 발주 기록은 그대로 유지', r1.curtain && r1.curtain.done && r1.install && r1.install.vendor === '유' && r1.fabric && r1.fabric.done && p1 === 1, JSON.stringify(r1));
  ok('5. 다시 눌러도 처음 발주일 유지, round는 2로 올라감', r2.fabric.orderDate === firstDate && r2.orderSnap.fabric.round === 2 && r2.orderSnap.fabric.lines[0].r === 2, JSON.stringify(r2.orderSnap && r2.orderSnap.fabric) + ' ' + r2.fabric.orderDate + '/' + firstDate);
  ok('6. 중간에 다른 기기가 저장해도 재시도하며 그 기기의 기록(rail·orderSnap.production)을 지우지 않고 fabric 기록 추가', r3.n === 2 && r3.os.rail && r3.os.orderSnap && r3.os.orderSnap.production && r3.os.orderSnap.fabric && r3.os.orderSnap.fabric.round === 1, JSON.stringify(r3));
  ok('7. 의뢰서(시공) 일정이 orderSnap.request.install에 남고 원단 기록은 유지', r4.orderSnap && r4.orderSnap.request && r4.orderSnap.request.install && r4.orderSnap.request.install.date === '2026-12-10' && r4.orderSnap.fabric && r4.install && r4.install.vendor === '유철', JSON.stringify(r4));
  ok('8. JS 에러 없음', jsErrors.length === 0, jsErrors.join(';'));
  log.forEach(l => console.log(l));
  await browser.close(); server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
