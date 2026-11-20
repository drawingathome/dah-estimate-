// tests/rail-same-space-reopen-check.js
// 2026-11-20(N-202, 선혜님 '레일 2개인데 3개로 왜 뜨지??' — 박영주 자녀방 커튼 2줄): 저장된 견적을 다시 열 때 레일·레일시공비 행을
// '공간 이름이 같은 첫 커튼 행'에 붙여서, 같은 이름 커튼이 2줄 이상이면 레일이 첫 줄에 몰리고 둘째 줄을 고칠 때 레일 행이 하나 더 생겼음.
// 고친 뒤: 아직 짝이 없는 같은 이름 커튼 행에 1:1로 붙임.
// 검증(고치기 전엔 1·2·3이 실패해야 하는 시험):
//   1 같은 이름 2줄 저장→열기: 열린 직후 레일·레일시공비 각 2개, 서로 다른 커튼 행에 붙음
//   2 열린 뒤 둘째 줄 가로를 다시 입력해도 레일·레일시공비 각 2개 유지(옛 코드는 3개)
//   3 같은 이름 3줄(가로 다름)도 열고 각 줄을 고쳐도 3개 유지, 자 수가 각 줄 가로에 맞음(234→8자, 174→6자, 121→6자: 가로÷30 올림 후 짝수)
//   4 다른 이름 2줄은 기존처럼 정상(회귀 방지)
const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');
(async () => {
  const port = 9989;
  const server = await startServer(path.resolve(__dirname, '..'), port);
  const browser = await launchBrowser();
  const errs = [];
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', req => { const u = req.url(); if (u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) req.continue(); else if (u.includes('supabase.co')) { const h = { 'Access-Control-Allow-Origin': '*' }; if (req.method() === 'OPTIONS') req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } }); else req.respond({ status: 200, contentType: 'application/json', headers: h, body: '[]' }); } else req.abort(); });
  await page.setViewport({ width: 1280, height: 1600 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const w = ms => new Promise(r => setTimeout(r, ms));
  await w(900); await loginAs(page, 'master'); await w(800);
  let fail = 0;
  const check = (l, c, d) => { if (c) console.log('✅ ' + l); else { console.log('❌ ' + l + ' — ' + JSON.stringify(d)); fail++; } };
  // 한 번에: 견적 만들기 → 저장 자료(collectLineItems) → 화면 비우기 → 열기와 같은 순서로 복원 → (선택) 수정 → 레일 상태 반환
  const scenario = (spaces, widths, edits) => page.evaluate(async (spaces, widths, edits) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const typeW = (i, v) => { const mw = document.querySelectorAll('#curtain-body tr')[i].querySelector('.mw'); for (let k = 1; k <= v.length; k++) { mw.value = v.slice(0, k); mw.dispatchEvent(new Event('input', { bubbles: true })); } };
    document.getElementById('curtain-body').innerHTML = ''; document.getElementById('blind-body').innerHTML = ''; document.getElementById('svc-body').innerHTML = '';
    const reg = document.getElementById('c-region'); reg.value = '서울'; reg.dispatchEvent(new Event('change', { bubbles: true }));
    spaces.forEach((sp, i) => { addCurtainRow(); const tr = document.querySelectorAll('#curtain-body tr')[i]; tr.querySelector('.space-inp').value = sp; tr.querySelector('.mh').value = '234'; typeW(i, String(widths[i])); });
    await sleep(200);
    const items = collectLineItems();
    document.getElementById('curtain-body').innerHTML = ''; document.getElementById('svc-body').innerHTML = '';
    reg.value = '';
    window._estEditState.skipAutoSvc = true; window._estEditState.isRestoringEstimate = true;
    restoreLineItemsToForm(items);
    window._estEditState.isRestoringEstimate = false;
    reg.value = '서울'; reg.dispatchEvent(new Event('change', { bubbles: true }));
    window._estEditState.skipAutoSvc = false;
    await sleep(200);
    const state = () => {
      const rails = [...document.querySelectorAll('#svc-body tr[data-rail-src]')];
      const costs = [...document.querySelectorAll('#svc-body tr[data-railcost-src]')];
      return { rails: rails.map(t => t.querySelector('.sqty').value), railOwners: rails.map(t => t.getAttribute('data-rail-src')), costs: costs.length, costOwners: costs.map(t => t.getAttribute('data-railcost-src')) };
    };
    const afterOpen = state();
    for (const e of edits) { typeW(e[0], String(e[1])); await sleep(150); }
    return { afterOpen, afterEdit: state(), saved_rails: items.filter(i => i.type === 'svc' && i.autoType === 'rail').length };
  }, spaces, widths, edits);
  const uniq = a => new Set(a).size === a.length;
  let r = await scenario(['자녀방', '자녀방'], [173, 173], []);
  check('1 같은 이름 2줄 열기: 레일·레일시공비 각 2개, 서로 다른 커튼 행에 붙음', r.afterOpen.rails.length === 2 && r.afterOpen.costs === 2 && uniq(r.afterOpen.railOwners) && uniq(r.afterOpen.costOwners), r);
  r = await scenario(['자녀방', '자녀방'], [173, 173], [[1, 173]]);
  check('2 열린 뒤 둘째 줄을 다시 입력해도 레일·레일시공비 각 2개 유지', r.afterEdit.rails.length === 2 && r.afterEdit.costs === 2 && uniq(r.afterEdit.railOwners), r);
  r = await scenario(['방', '방', '방'], [234, 173, 120], [[2, 121], [0, 234], [1, 174]]);
  check('3 같은 이름 3줄: 열고 각 줄을 고쳐도 3개, 자 수가 각 줄에 맞음(8·6·6)', r.afterEdit.rails.length === 3 && r.afterEdit.costs === 3 && uniq(r.afterEdit.railOwners) && r.afterEdit.rails.slice().sort().join() === ['6', '6', '8'].join(), r);
  r = await scenario(['자녀방1', '자녀방2'], [173, 173], [[1, 173]]);
  check('4 다른 이름 2줄은 기존처럼 정상(회귀 방지)', r.afterEdit.rails.length === 2 && r.afterEdit.costs === 2, r);
  check('자바스크립트 오류 없음', errs.length === 0, errs);
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
