// tests/backdrop-drag-close-check.js
// 2026-11-17(선혜님 발견: 견적서에서 위치(방)를 직접 적었다가 고치려고 클릭하면 창이 닫힘):
// 창 안 입력칸에서 글자를 마우스로 끌어 선택하다 창 '밖(어두운 배경)'에서 손을 떼면, 브라우저가 어두운 배경에 클릭이 난 것으로
// 처리해 창이 통째로 닫혔다(고객 추가 창은 쓰던 내용도 사라짐). 이제 '누르기도 배경에서 시작한' 클릭만 배경 클릭으로 본다.
// 확인: ①견적서 공간 선택 창 ②대시보드 고객 추가 창 ③대시보드 고객 상세 창 — 끌어서 선택(안→밖)해도 유지 / 배경을 진짜 누르면 닫힘 / 코드의 .click()도 닫힘(옛 호환).
// 한계: 가짜 서버+자체 Chromium의 마우스 흉내이며 실제 폰 터치·선혜님 기기에서의 확인은 눈 확인 필요.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; }
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 80000);
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const dir = path.resolve(__dirname, '..');
  // ── ① 견적서 공간 선택 창
  let server = await startServer(dir, 9961); let browser = await launchBrowser(); let page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 800 }); await blockRealNetwork(page);
  await page.goto('http://localhost:9961/dah-estimate.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await wait(900); await loginAs(page, 'master'); await wait(800);
  await page.evaluate(() => { var g = document.getElementById('est-auth-gate'); if (g) g.remove(); });
  const disp = () => page.evaluate(() => getComputedStyle(document.getElementById('space-picker')).display);
  await page.evaluate(() => document.querySelector('.space-inp').scrollIntoView({ block: 'center' }));
  const sp = await page.$('.space-inp'); await sp.click();
  const ci = await page.$('#space-custom-input'); await ci.click(); await page.keyboard.type('드레스룸'); await page.keyboard.press('Enter');
  ok('①-1 직접 입력한 값이 공간 칸에 들어감', (await page.evaluate(() => document.querySelector('.space-inp').value)) === '드레스룸');
  await sp.click(); ok('①-2 다시 누르면 창이 열림(수정용)', (await disp()) === 'block');
  const b = await ci.boundingBox();
  await page.mouse.move(b.x + b.width - 5, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width + 120, b.y + b.height / 2, { steps: 5 }); await page.mouse.up();
  ok('①-3 입력칸에서 글자를 끌어 선택하고 창 밖에서 손을 떼도 창이 유지됨', (await disp()) === 'block', '창 상태: ' + (await disp()));
  await page.keyboard.type('팬트리'); ok('①-4 이어서 글자를 고칠 수 있음(선택된 글자가 바뀜)', (await page.evaluate(() => document.getElementById('space-custom-input').value)).indexOf('팬트리') >= 0);
  await page.mouse.click(30, 30); await wait(100); ok('①-5 어두운 배경을 진짜 누르면 닫힘', (await disp()) === 'none');
  await sp.click(); await page.evaluate(() => document.getElementById('space-picker').click());
  ok('①-6 코드의 overlay.click()도 닫힘(옛 호환)', (await disp()) === 'none');
  await sp.click(); const pb = await (await page.$('#space-picker-box')).boundingBox(); await page.mouse.click(pb.x + 5, pb.y + 5);
  ok('①-7 창 안쪽 여백을 눌러도 안 닫힘', (await disp()) === 'block');
  await browser.close(); server.close && server.close();
  // ── ② ③ 대시보드
  server = await startServer(dir, 9962); browser = await launchBrowser(); page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page); await page.setViewport({ width: 1300, height: 900 });
  await page.goto('http://localhost:9962/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await wait(800); await loginAs(page, 'master'); await wait(500);
  await page.evaluate(() => { openAdd(); }); await wait(400);
  const addOpen = () => page.evaluate(() => { var o = document.getElementById('add-overlay'); return o && getComputedStyle(o).display !== 'none' && o.classList.contains('open') || (o && o.style.display === 'flex'); });
  const addInp = await page.$('#add-overlay .modal-box input[type="text"], #add-overlay .modal-box input:not([type])');
  ok('②-0 고객 추가 창에 입력칸이 있음', !!addInp);
  if (addInp) {
    await addInp.click(); await page.keyboard.type('시험입력글자');
    const ab = await addInp.boundingBox();
    await page.mouse.move(ab.x + ab.width - 8, ab.y + ab.height / 2); await page.mouse.down();
    await page.mouse.move(ab.x + ab.width + 2, ab.y + ab.height / 2, { steps: 2 });
    await page.mouse.move(5, 5, { steps: 8 }); await page.mouse.up(); await wait(150);
    const still = await page.evaluate(() => { var o = document.getElementById('add-overlay'); var v = o.querySelector('.modal-box input'); return { open: getComputedStyle(o).display !== 'none' && getComputedStyle(o).visibility !== 'hidden' && (o.classList.contains('open') || o.style.display === 'flex' || getComputedStyle(o).opacity !== '0'), val: v && v.value }; });
    ok('②-1 고객 추가 창: 글자를 끌어 선택하고 창 밖에서 떼도 창과 쓰던 내용이 유지됨', still.open && still.val === '시험입력글자', JSON.stringify(still));
    await page.mouse.click(5, 5); await wait(200);
    const closed = await page.evaluate(() => { var o = document.getElementById('add-overlay'); return !(o.classList.contains('open')) && (o.style.display !== 'flex'); });
    ok('②-2 고객 추가 창: 배경을 진짜 누르면 닫힘', closed);
  }
  const det = await page.evaluate(() => {
    var o = document.getElementById('detail-overlay'); o.className = 'overlay open';
    var child = o.firstElementChild; child.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    o.dispatchEvent(new MouseEvent('click', { bubbles: true })); var keep = o.className.indexOf('open') >= 0;
    o.className = 'overlay open'; o.dispatchEvent(new MouseEvent('click', { bubbles: true })); var closeNow = o.className.indexOf('open') < 0;
    return { keep: keep, closeNow: closeNow, cls: o.className };
  });
  ok('③-1 고객 상세 창: 안에서 누르기 시작한 클릭은 닫지 않음', det.keep, JSON.stringify(det));
  ok('③-2 고객 상세 창: 배경에서 시작한 클릭은 닫음', det.closeNow, JSON.stringify(det));
  await browser.close(); server.close && server.close();
  console.log(fail ? '=== 실패 ' + fail + '건 ===' : '=== 전부 통과 ==='); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
