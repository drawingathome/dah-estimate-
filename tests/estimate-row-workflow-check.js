// tests/estimate-row-workflow-check.js
// 2026-10-26(선혜님 - "커튼에서 줄을 복사한 뒤 올리고 내리려 하면 순서가 안 바뀜"): 복사(⧉)한 커튼·블라인드 줄도 ⠿ 손잡이로 끌어 순서를 바꿀 수 있는지 확인.
// 기존 row-drag-reorder-check는 '새로 추가한 줄'만 확인해서 이 경우를 놓쳤음.
// ④ 옮긴 순서대로 저장용 줄 목록이 만들어짐
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
(async () => {
  const root = path.resolve(__dirname, '..'); const port = 9978;
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

  // 2026-10-26 P-1(선혜님 지적: 같은 오류가 반복) — 견적서 작성 업무를 순서대로 한 번에 재생하는 시험.
  // 김민아 견적서(커튼 6줄 + 블라인드 6줄) 구조로: 불러오기 → 줄 복사 → 복사본 끌어 이동 → 위치 이름 수정 → 줄 삭제 → 저장용 목록 → 다시 불러오기 → 문서 공간 순서.
  const C=(space,name,mw,pnum,price)=>({type:'curtain',space,displayName:name,mw:String(mw),mh:'265',pnum:String(pnum),price,hemType:'8cm',openType:'양개형',pleatType:'민자형',heightAdjust:'-3',shapeProcess:true});
  const B=(space,kind,price)=>({type:'blind',space,kind,displayName:kind,bmw:'100',bmh:'200',price,handle:'좌손',extra:0});
  const items=[C('거실','이븐 겉커튼',390,5,185000),C('거실','시소코 속커튼',390,6,135000),C('안방','라떼 암막',288,4,150000),C('자녀방 1 (테라스방)','굿나잇 암막',310,4,125000),C('자녀방 1 (테라스방)','PLS 1540 속커튼',310,5,75000),C('자녀방 2','셀마 암막',300,4,99000),
    B('안방 작은창','허니콤',108000),B('서재','롤스크린',55000),B('서재','롤스크린',55000),B('주방','알루미늄',66000),B('욕실 위','알루미늄',66000),B('욕실 아래','알루미늄',66000)];
  const rowsOf=(body)=>page.evaluate((body)=>[...document.querySelectorAll('#'+body+' tr')].map(tr=>tr.querySelector('.space-inp').value+'|'+(tr.querySelector('.cdisp,.cname')||{value:''}).value),body);
  const spaces=(body)=>page.evaluate((body)=>[...document.querySelectorAll('#'+body+' tr')].map(tr=>tr.querySelector('.space-inp').value),body);
  await page.evaluate((items)=>{ restoreLineItemsToForm(JSON.parse(JSON.stringify(items)),''); },items);
  let sp=await spaces('curtain-body');
  ok('① 저장본 불러오기: 커튼 6줄·순서 유지', JSON.stringify(sp)===JSON.stringify(['거실','거실','안방','자녀방 1 (테라스방)','자녀방 1 (테라스방)','자녀방 2']), JSON.stringify(sp));
  ok('① 블라인드 6줄', (await spaces('blind-body')).length===6);
  ok('① 불러온 모든 줄에 끌기 연결', await page.evaluate(()=>[...document.querySelectorAll('#curtain-body tr .row-drag-handle,#blind-body tr .row-drag-handle')].every(h=>!!h._dragBound)));
  // ② 5번째 줄 복사
  await center('curtain-body',4);
  await page.evaluate(()=>copyCurtainRow(document.querySelectorAll('#curtain-body tr')[4].querySelector('.copy-btn')));
  sp=await spaces('curtain-body');
  ok('② 복사하면 같은 방 줄 바로 아래에 생김(7줄)', sp.length===7 && sp[5]==='자녀방 1 (테라스방)', JSON.stringify(sp));
  ok('② 복사본에도 끌기 연결', await page.evaluate(()=>[...document.querySelectorAll('#curtain-body tr .row-drag-handle')].every(h=>!!h._dragBound)));
  // ③ 복사본을 맨 아래로 끌기
  await center('curtain-body',5);
  const s=await hbox('curtain-body',5), e=await hbox('curtain-body',6);
  await page.mouse.move(s.x,s.y); await page.mouse.down(); await page.mouse.move(e.x,e.y+40,{steps:12}); await page.mouse.up();
  sp=await spaces('curtain-body');
  ok('③ 복사본을 끌어 맨 아래로 이동', sp[6]==='자녀방 1 (테라스방)' && sp[5]==='자녀방 2', JSON.stringify(sp));
  // ④ 위치 이름 수정(자녀방 2) — 복사본은 자녀방 2의 속커튼이라는 뜻
  await page.evaluate(()=>{ const r=document.querySelectorAll('#curtain-body tr')[6].querySelector('.space-inp'); r.value='자녀방 2'; r.dispatchEvent(new Event('input',{bubbles:true})); r.dispatchEvent(new Event('change',{bubbles:true})); });
  // ⑤ 저장용 목록 → 순서와 이름 반영
  let li=await page.evaluate(()=>collectLineItems().filter(x=>x.type==='curtain').map(x=>x.space));
  ok('⑤ 저장용 줄 목록이 화면 순서·수정한 이름 그대로', JSON.stringify(li)===JSON.stringify(['거실','거실','안방','자녀방 1 (테라스방)','자녀방 1 (테라스방)','자녀방 2','자녀방 2']), JSON.stringify(li));
  // ⑥ 다시 불러오기(저장 후 열기) → 같은 순서
  const all=await page.evaluate(()=>JSON.parse(JSON.stringify(collectLineItems())));
  await page.evaluate((all)=>{ restoreLineItemsToForm(all,''); },all);
  sp=await spaces('curtain-body');
  ok('⑥ 저장한 내용을 다시 불러와도 같은 순서', JSON.stringify(sp)===JSON.stringify(li), JSON.stringify(sp));
  ok('⑥ 다시 불러온 줄에도 끌기 연결', await page.evaluate(()=>[...document.querySelectorAll('#curtain-body tr .row-drag-handle')].every(h=>!!h._dragBound)));
  // ⑦ 문서 공간 순서: 자녀방 1 다음에 자녀방 2(복사본 이름을 바꿨으니 자녀방 2 묶음에 들어감)
  const docOrder=await page.evaluate((li)=>{ const u=[...new Set(li)]; const m=estSpaceOrderMap(u,[]); return u.slice().sort((a,b)=>m[a]-m[b]); },li);
  ok('⑦ 문서 공간 순서 = 거실 → 안방 → 자녀방 1 → 자녀방 2', JSON.stringify(docOrder)===JSON.stringify(['거실','안방','자녀방 1 (테라스방)','자녀방 2']), JSON.stringify(docOrder));
  // ⑧ 줄 삭제 후에도 나머지 끌기 가능
  await page.evaluate(()=>delRow(document.querySelectorAll('#curtain-body tr')[0].querySelector('.del-btn')));
  await center('curtain-body',1);
  const n=(await spaces('curtain-body')).length; const a=await hbox('curtain-body',0), z=await hbox('curtain-body',n-1);
  const before=await spaces('curtain-body');
  await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(z.x,z.y+40,{steps:12}); await page.mouse.up();
  const after=await spaces('curtain-body');
  ok('⑧ 줄 삭제 후에도 남은 줄을 끌어 옮길 수 있음', after[after.length-1]===before[0] && after.length===before.length, JSON.stringify(after));
  ok('JS 에러 없음', errs.length === 0, errs.join(' | '));
  await browser.close(); server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 모두 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
