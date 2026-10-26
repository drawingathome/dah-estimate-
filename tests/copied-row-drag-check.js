// tests/copied-row-drag-check.js
// 2026-10-26(선혜님 - "커튼에서 줄을 복사한 뒤 올리고 내리려 하면 순서가 안 바뀜"): 복사(⧉)한 커튼·블라인드 줄도 ⠿ 손잡이로 끌어 순서를 바꿀 수 있는지 확인.
// 기존 row-drag-reorder-check는 '새로 추가한 줄'만 확인해서 이 경우를 놓쳤음.
// ④ 옮긴 순서대로 저장용 줄 목록이 만들어짐
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
(async () => {
  const root = path.resolve(__dirname, '..'); const port = 9976;
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
  // 복사(⧉)한 줄도 ⠿ 손잡이로 끌어 순서를 바꿀 수 있어야 함 (2026-10-26 선혜님: "커튼에서 줄을 복사한 뒤 올리고 내리려 하면 순서가 안 바뀜")
  for (const [label, body, add, copyFn] of [['커튼', 'curtain-body', 'addCurtainRow', 'copyCurtainRow'], ['블라인드', 'blind-body', 'addBlindRow', 'copyBlindRow']]) {
    await fill(body, add, ['A', 'B', 'C']); await center(body, 1);
    // A를 복사 → A, A(복사), B, C 가 되고, 복사본에 이름 표시
    await page.evaluate((body, copyFn) => { const btn = document.querySelector('#' + body + ' tr .copy-btn'); window[copyFn](btn); const rows = document.querySelectorAll('#' + body + ' tr'); rows[1].querySelector('.space-inp').value = 'A복사'; }, body, copyFn);
    ok(label + ': 복사하면 바로 아래에 복사본이 생김', JSON.stringify(await order(body)).startsWith('["A","A복사"'), JSON.stringify(await order(body)));
    const focused = await page.evaluate((body) => { const rows = document.querySelectorAll('#' + body + ' tr'); return document.activeElement === rows[1].querySelector('.space-inp'); }, body);
    ok(label + ': 복사 직후 복사본의 위치(방) 칸에 커서가 가 있음(이름 바꾸기 안내)', focused);
    // 복사본(2번째 줄)을 맨 아래로 끌기
    await center(body, 1);
    const n = (await order(body)).length;
    const s = await hbox(body, 1), e = await hbox(body, n - 1);
    await page.mouse.move(s.x, s.y); await page.mouse.down(); await page.mouse.move(e.x, e.y + 40, { steps: 12 }); await page.mouse.up();
    let o = await order(body);
    ok(label + ': 복사한 줄을 끌어 맨 아래로 옮길 수 있음', o[o.length - 1] === 'A복사', JSON.stringify(o));
    // 원본 줄도 복사 뒤에 여전히 끌어 옮겨져야 함
    await center(body, 0);
    const s0 = await hbox(body, 0), e0 = await hbox(body, o.length - 1);
    await page.mouse.move(s0.x, s0.y); await page.mouse.down(); await page.mouse.move(e0.x, e0.y + 40, { steps: 12 }); await page.mouse.up();
    o = await order(body);
    ok(label + ': 원본 줄도 복사 뒤에 끌어 옮길 수 있음', o[o.length - 1] === 'A', JSON.stringify(o));
  }
  // 기타 품목 줄(copyOtherItemRow)도 같은 끌기 코드를 쓰므로, 복사본에 끌기 기능이 붙었는지 직접 확인
  const other = await page.evaluate(() => { try { document.getElementById('other-body').innerHTML = ''; addOtherItemRow(); copyOtherItemRow(document.querySelector('#other-body tr .copy-btn')); const hs = [...document.querySelectorAll('#other-body tr .row-drag-handle')]; return { n: hs.length, bound: hs.map(h => !!h._dragBound) }; } catch (e) { return { err: e.message }; } });
  ok('기타 품목: 복사한 줄에도 끌기 기능이 붙음', other.n === 2 && other.bound.every(Boolean), JSON.stringify(other));
  ok('JS 에러 없음', errs.length === 0, errs.join(' | '));
  await browser.close(); server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 모두 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
