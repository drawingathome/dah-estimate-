// tests/whats-new-check.js (N-69 ②) — "새 소식" 안내: 로그인 뒤 한 번 보이고, 확인하면 숨고, 다시 열어도 안 보이며, 저장소를 못 써도 오류가 없다.
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
async function openAndLogin(browser, port, role, opts) {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await blockRealNetwork(page);
  if (opts && opts.noStorage) await page.evaluateOnNewDocument(() => { // 앱 전체가 아니라 '새 소식' 기록 칸만 막음(앱 자체는 저장소 없이 로그인이 안 되므로)
    const g = Storage.prototype.getItem, st = Storage.prototype.setItem;
    Storage.prototype.getItem = function (k) { if (k === 'dah_whatsnew_seen') throw new Error('blocked'); return g.apply(this, arguments); };
    Storage.prototype.setItem = function (k) { if (k === 'dah_whatsnew_seen') throw new Error('blocked'); return st.apply(this, arguments); }; });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 600));
  return { page, errs };
}
const state = (page) => page.evaluate(() => { const el = document.getElementById('whats-new'); return { shown: !!el, text: el ? el.textContent : '', seen: (() => { try { return localStorage.getItem('dah_whatsnew_seen'); } catch (e) { return 'ERR'; } })() }; });
const waitShown = async (page, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if ((await state(page)).shown) return true; await new Promise(r => setTimeout(r, 200)); } return false; };
async function run() {
  const dir = path.resolve(__dirname, '..'); const port = 9968;
  const server = await startServer(dir, port); const browser = await launchBrowser();
  const log = []; const ok = (l, c, d) => log.push((c ? '✅' : '❌') + ' ' + l + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : ''));
  // 1) 로그인 전에는 안 보임
  let { page, errs } = await openAndLogin(browser, port, 'master');
  await new Promise(r => setTimeout(r, 1500));
  ok('로그인 전에는 안내가 보이지 않음', !(await state(page)).shown);
  // 2) 마스터 로그인 뒤 보임
  await loginAs(page, 'master');
  ok('마스터 로그인 뒤 안내가 보임(최대 4초)', await waitShown(page, 4000));
  const s1 = await state(page);
  ok('내용: 단계 자동 이동 + 규칙 3가지 + 뒤로는 직접', /자동으로 옮겨져요/.test(s1.text) && /실측준비중/.test(s1.text) && /잔금결제/.test(s1.text) && /시공준비중/.test(s1.text) && /뒤로 옮길 때만 직접/.test(s1.text), s1.text);
  // 3) 확인을 누르면 숨고 기록됨
  await page.click('#whats-new-ok');
  const s2 = await state(page);
  ok('확인을 누르면 숨고 이 기기에 기록됨', !s2.shown && s2.seen === '2026-11-02-stage-auto', s2);
  ok('JS 오류 없음(1)', errs.length === 0, errs);
  // 4) 같은 기기에서 다시 열면 안 보임
  await page.reload({ waitUntil: 'domcontentloaded' }); await new Promise(r => setTimeout(r, 600)); await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 2500));
  ok('다시 열어도 안 보임(한 번만)', !(await state(page)).shown);
  // 5) 버전이 바뀌면 다시 보임(역검증: 기록을 옛 버전으로 바꾸면 보여야 함)
  await page.evaluate(() => localStorage.setItem('dah_whatsnew_seen', 'old-version'));
  await page.reload({ waitUntil: 'domcontentloaded' }); await new Promise(r => setTimeout(r, 600)); await loginAs(page, 'master');
  ok('새 버전이면 다시 보임(역검증)', await waitShown(page, 4000));
  await page.close();
  // 6) 실장 계정도 보임
  ({ page, errs } = await openAndLogin(browser, port, 'staff')); await loginAs(page, 'staff', undefined, '오지은');
  ok('실장 로그인 뒤에도 안내가 보임', await waitShown(page, 4000)); await page.close();
  // 7) 저장소를 못 써도 오류 없이 보이고 닫힘
  ({ page, errs } = await openAndLogin(browser, port, 'master', { noStorage: true })); await loginAs(page, 'master');
  const shown = await waitShown(page, 4000);
  ok('기록 칸이 막혀도 안내가 보임', shown);
  if (shown) { await page.click('#whats-new-ok'); ok('기록 칸이 막혀도 닫힘', !(await state(page)).shown); }
  ok('기록 칸이 막혀도 JS 오류 없음', errs.filter(e => !/blocked/.test(e)).length === 0, errs);
  await page.close();
  console.log(log.join('\n')); await browser.close(); server.close();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 90000);
