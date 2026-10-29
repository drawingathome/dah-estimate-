// tests/row-drag-reorder-check.js
// 2026-10-21(선혜님 - "견적서에 순서를 옮기는게 안돼", 시험타 견적서: 블라인드 줄이 45개 이상): 줄 오른쪽 ⠿ 손잡이로 순서를 바꾸는 기능 점검.
// ① 마우스로 끌어 옮겨짐 ② 터치로 끌어 옮겨짐 ③ 줄이 많아 화면 끝보다 멀리 옮겨야 할 때 화면이 자동으로 스크롤돼 끝까지 옮겨짐(예전엔 화면에 보이는 범위까지만 옮겨졌음)
// ④ 옮긴 순서대로 저장용 줄 목록이 만들어짐
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
(async () => {
  const root = path.resolve(__dirname, '..'); const port = 9975;
  const server = await startServer(root, port); const browser = await launchBrowser(); const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, hasTouch: true });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(); if (u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) req.continue(); else if (u.includes('supabase.co')) { const h = { 'Access-Control-Allow-Origin': '*' }; if (req.method() === 'OPTIONS') req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } }); else req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' }); } else req.abort(); });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 900)); await setupValidSession(page); await new Promise(r => setTimeout(r, 800));
  await page.evaluate(() => { const g = document.getElementById('est-auth-gate'); if (g) g.remove(); });
  const fill = (body, add, names) => page.evaluate((body, add, names) => { document.getElementById(body).innerHTML = ''; names.forEach(sp => { window[add](); document.querySelector('#' + body + ' tr:last-child .space-inp').value = sp; }); }, body, add, names);
  const order = (body) => page.evaluate((body) => [...document.querySelectorAll('#' + body + ' tr')].map(tr => tr.querySelector('.space-inp').value), body);
  const hbox = (body, i) => page.evaluate((body, i) => { const h = document.querySelectorAll('#' + body + ' tr')[i].querySelector('.row-drag-handle'); const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, body, i);
  const center = (body, i) => page.evaluate((body, i) => document.querySelectorAll('#' + body + ' tr')[i].scrollIntoView({ block: 'center' }), body, i);

  // ① 마우스(커튼 3줄)
  await fill('curtain-body', 'addCurtainRow', ['A', 'B', 'C']); await center('curtain-body', 1);
  let a = await hbox('curtain-body', 0), c = await hbox('curtain-body', 2);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(c.x, c.y + 40, { steps: 12 }); await page.mouse.up();
  ok('① 마우스로 끌어 순서가 바뀜(A를 맨 아래로)', JSON.stringify(await order('curtain-body')) === JSON.stringify(['B', 'C', 'A']), JSON.stringify(await order('curtain-body')));
  // ④ 저장용 목록 순서
  const li = await page.evaluate(() => { try { return (typeof collectLineItems === 'function' ? collectLineItems() : null); } catch (e) { return null; } });
  if (li) ok('④ 저장용 줄 목록도 옮긴 순서(B,C,A)', JSON.stringify(li.filter(x => x.type === 'curtain').map(x => x.space)) === JSON.stringify(['B', 'C', 'A']), JSON.stringify(li.filter(x => x.type === 'curtain').map(x => x.space)));

  // ⑤ 저장 → 다시 열기(복원)해도 옮긴 순서 유지
  if (li) { const back = await page.evaluate((li) => { restoreLineItemsToForm(JSON.parse(JSON.stringify(li)), ''); return [...document.querySelectorAll('#curtain-body tr')].map(tr => tr.querySelector('.space-inp').value); }, li);
    ok('⑤ 저장한 줄 목록을 다시 불러와도 옮긴 순서(B,C,A) 그대로', JSON.stringify(back) === JSON.stringify(['B', 'C', 'A']), JSON.stringify(back));
    await fill('curtain-body', 'addCurtainRow', ['B', 'C', 'A']); }

  // ② 터치(블라인드 3줄)
  await fill('blind-body', 'addBlindRow', ['T1', 'T2', 'T3']); await center('blind-body', 1);
  const t0 = await hbox('blind-body', 0), t2 = await hbox('blind-body', 2);
  await page.touchscreen.touchStart(t0.x, t0.y); for (let s = 1; s <= 10; s++) await page.touchscreen.touchMove(t2.x, t0.y + (t2.y + 40 - t0.y) * s / 10); await page.touchscreen.touchEnd();
  ok('② 터치(태블릿)로 끌어 순서가 바뀜', JSON.stringify(await order('blind-body')) === JSON.stringify(['T2', 'T3', 'T1']), JSON.stringify(await order('blind-body')));

  // ③ 50줄: 첫 줄을 맨 아래 끝까지(화면 아래 끝에서 잠시 머무르면 화면이 자동으로 내려가야 함)
  const names50 = Array.from({ length: 50 }, (_, i) => 'R' + (i + 1));
  await fill('blind-body', 'addBlindRow', names50); await page.evaluate(() => document.querySelectorAll('#blind-body tr')[0].scrollIntoView({ block: 'start' }));
  const b0 = await hbox('blind-body', 0);
  await page.mouse.move(b0.x, b0.y); await page.mouse.down(); await page.mouse.move(b0.x, 885, { steps: 20 });
  for (let k = 0; k < 90; k++) { await new Promise(r => setTimeout(r, 100)); const o = await order('blind-body'); if (o[o.length - 1] === 'R1') break; }
  await page.mouse.up();
  let o = await order('blind-body');
  ok('③ 줄 50개: 첫 줄을 맨 아래 끝까지 옮길 수 있음(화면 자동 스크롤)', o[o.length - 1] === 'R1', 'R1 위치 ' + (o.indexOf('R1') + 1) + '/50');
  // ③-2 반대로: 맨 아래 줄을 맨 위로
  await page.evaluate(() => document.querySelectorAll('#blind-body tr')[49].scrollIntoView({ block: 'center' }));
  const e0 = await hbox('blind-body', 49);
  await page.mouse.move(e0.x, e0.y); await page.mouse.down(); await page.mouse.move(e0.x, 25, { steps: 20 });
  for (let k = 0; k < 90; k++) { await new Promise(r => setTimeout(r, 100)); const oo = await order('blind-body'); if (oo[0] === 'R1') break; }
  await page.mouse.up();
  o = await order('blind-body');
  ok('③-2 줄 50개: 맨 아래 줄을 맨 위까지 옮길 수 있음', o[0] === 'R1', '맨 위 = ' + o[0]);
  ok('JS 에러 없음', errs.length === 0, errs.join(' | '));
  await browser.close(); server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 모두 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
