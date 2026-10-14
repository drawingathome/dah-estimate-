// tests/pay-concurrent-edit-check.js
// 2026-10-14(전문업체 점검 - 동시 수정): 입금 저장은 "화면에서 본 값이 서버 값과 같을 때만" 저장되어야 함.
// 1) 저장 요청에 선금/잔금 비교 조건(and=(...))이 붙는지  2) 0건 매칭 + 서버 값이 다르면 "충돌" 안내 후 덮어쓰지 않는지
// 3) 0건 매칭 + 서버 값이 같으면(권한 문제) 충돌 안내가 아닌 일반 경고인지  4) 성공 뒤 같은 화면에서 이어 저장해도 가짜 충돌이 없는지
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 27148;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [], dialogs = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { dialogs.push(d.message()); try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  const log = [];
  function ok(l, c, d) { log.push((c ? '✅' : '❌') + ' ' + l + (d !== undefined ? ' — ' + d : '')); }
  async function setup(dep) {
    await page.evaluate((dep) => {
      localStorage.setItem('dah_saved', JSON.stringify([{ id: 'est-C', clientId: 9601, clientName: '동시수정', price: 1000000, date: '2026-10-11',
        depositAmount: dep, depositDate: dep ? '2026-10-10' : '', depositMethod: '', depositReceipt: false, balanceAmount: 0, balanceDate: '', balanceMethod: '', balanceReceipt: false }]));
      saveCustomers([{ id: 9601, clientName: '동시수정', phone: '01077778888', stage: '가견적', staffName: '마스터', price: 1000000, updatedAt: '2026-10-11T01:00:00.000Z' }]);
      openDetail('동시수정', 9601);
    }, dep);
    await new Promise(r => setTimeout(r, 500));
  }
  async function stub(mode) { // mode: 'ok' | 'conflict' | 'perm'
    await page.evaluate((mode) => {
      window.__patches = []; window.__gets = 0;
      if (!window.sbXHR_orig) window.sbXHR_orig = window.sbXHR;
      window.sbXHR = function (method, p, data, cb) {
        if (method === 'PATCH' && p.indexOf('estimates?id=eq.est-C') === 0) {
          window.__patches.push(p);
          if (mode === 'ok') { cb(null, [{ id: 'est-C' }]); } else { cb({ status: 200, text: 'zero', zeroRows: true }, null); }
          return;
        }
        if (method === 'GET' && p.indexOf('estimates?id=eq.est-C&select=deposit_amount') === 0) {
          window.__gets++;
          cb(null, [mode === 'conflict' ? { deposit_amount: 300000, balance_amount: 0 } : { deposit_amount: 0, balance_amount: 0 }]); return;
        }
        window.sbXHR_orig(method, p, data, cb);
      };
      window.fetchLatestUpdatedAt = function (t, i, cb) { cb('2026-10-11T02:00:00.000Z'); };
    }, mode);
  }
  async function saveDeposit(v) {
    await page.evaluate(() => { try { switchDetailTab('pay'); } catch (e) {} });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => { if (!document.querySelector('input[placeholder="선금 금액"]')) { const e = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === '수정' && x.parentElement && /선금/.test(x.parentElement.textContent)); if (e) e.click(); } });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((v) => {
      const inp = document.querySelector('input[placeholder="선금 금액"]');
      inp.value = String(v); inp.dispatchEvent(new Event('input'));
      const di = inp.closest('div').parentElement.querySelectorAll('input[type="date"]');
      if (di.length) { di[di.length - 1].value = '2026-10-11'; di[di.length - 1].dispatchEvent(new Event('change')); }
      Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('선금 저장')).click();
    }, v);
    await new Promise(r => setTimeout(r, 800));
  }

  // 1·4) 정상 저장: 비교 조건이 붙고, 이어 저장 시 기준값이 갱신됨
  await setup(0); await stub('ok'); await saveDeposit(500000);
  let r = await page.evaluate(() => window.__patches.slice());
  ok('1. 저장 요청에 선금/잔금 비교 조건이 붙음(값 0 → null 도 허용)', r.length === 1 && /and=\(or\(deposit_amount\.is\.null,deposit_amount\.eq\.0\),or\(balance_amount\.is\.null,balance_amount\.eq\.0\)\)/.test(r[0]), r[0]);
  await saveDeposit(600000);
  r = await page.evaluate(() => window.__patches.slice());
  ok('4. 성공 뒤 이어 저장하면 새 기준값(500000)으로 비교함(가짜 충돌 없음)', r.length === 2 && /deposit_amount\.eq\.500000/.test(r[1]), r[1]);
  ok('4-1. 정상 저장 중에는 충돌 안내가 뜨지 않음', !dialogs.some(m => /그 사이에/.test(m)), JSON.stringify(dialogs));

  // 2) 충돌
  await page.evaluate(() => { closeDetail(); });
  await setup(0); await stub('conflict'); await saveDeposit(500000);
  const g = await page.evaluate(() => window.__gets);
  ok('2. 0건 매칭 + 서버 값이 다르면 충돌 안내를 띄움', dialogs.some(m => /그 사이에/.test(m)), JSON.stringify(dialogs));
  ok('2-1. 서버 값을 다시 읽어 확인함', g === 1, String(g));

  // 3) 권한 문제
  dialogs.length = 0;
  await page.evaluate(() => { closeDetail(); });
  await setup(0); await stub('perm'); await saveDeposit(500000);
  ok('3. 0건 매칭 + 서버 값이 같으면 "충돌" 대화상자는 안 뜸(권한 경고)', !dialogs.some(m => /그 사이에/.test(m)), JSON.stringify(dialogs));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');
  await browser.close(); server.kill();
  process.exit(!allPass || jsErrors.length > 0 ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
