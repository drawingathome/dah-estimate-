// N-227: 대시보드에서 '시공완료' 고객과 같은 이름+번호로 등록/연결할 때 옛 시공완료 줄에 붙지 않고 새 고객 줄이 만들어지는지(11-19 규칙 ②, 가짜 서버·가짜 함수 시험, 운영 확인 아님)
//  A) 견적서 목록 '고객으로 등록'(dash-render-est.js): 이 기기 목록에 시공완료 같은 고객이 있어도 연결하지 않고 새로 만듦
//  B) 고객 추가 창(dash-customer-add.js): 시공완료 같은 고객을 '재구매 업데이트'(옛 줄 갱신)하지 않고 새 줄 등록(확인 뒤)
//  C) 진행 중인 같은 고객은 예전처럼 연결/업데이트(기존 동작 유지)
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
(async () => {
  const dir = path.resolve(__dirname, '..'); const port = 28704;
  const server = await startServer(dir, port); const browser = await launchBrowser();
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const dialogs = []; page.on('dialog', async d => { dialogs.push(d.message()); try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
  const log = []; const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || '')));
  const setNative = (id, v) => `(() => { const el = document.getElementById('${id}'); const proto = window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`;

  await page.evaluate(() => { window.__origLoad = window.loadCustomers; });
  // A) 견적서 목록 → 고객으로 등록
  async function scenA(tag, stage) {
    return await page.evaluate(async (tag, stage) => {
      var calls = { post: 0, linked: [] };
      window.confirm = function () { return true; }; window.alert = function () {}; window.showToast = function () {}; window.openDetail = function () {};
      window.sbXHR = function (method, p, data, cb) {
        if (p.indexOf('rpc/check_phone_duplicate') === 0) { cb(null, [{ exists_flag: false }]); return; }
        if (method === 'POST' && p === 'customers') { calls.post++; cb(null, [{ id: 900 }]); return; }
        if (method === 'PATCH' && p.indexOf('estimates?id=eq.') === 0) { calls.linked.push(data.client_id); cb(null, [{ id: 'x', client_id: data.client_id }]); return; }
        cb(null, []);
      };
      window.loadCustomers = function () { return [{ id: 801, clientName: '재구매A' + tag, phone: '010-7777-8888', stage: stage, staffName: '마스터' }]; };
      window._estCreatedCustomerByEstId = {};
      localStorage.setItem('dah_saved', JSON.stringify([{ id: 'ea-' + tag, no: 'N-' + tag, clientName: '재구매A' + tag, phone: '010-7777-8888', price: 1000, status: 'ga', savedAt: new Date().toISOString() }]));
      if (typeof setEstArchiveFilter === 'function') setEstArchiveFilter('all');
      renderEstList();
      var host = document.getElementById('est-list-body'); var cards = host ? host.querySelectorAll('div') : []; var target = null;
      for (var i = 0; i < cards.length; i++) { if (cards[i].textContent.indexOf('재구매A' + tag) >= 0 && !cards[i].closest('button')) target = cards[i]; }
      if (target) target.click();
      await new Promise(r => setTimeout(r, 120));
      return { found: !!target, post: calls.post, linked: calls.linked };
    }, tag, stage);
  }
  const A1 = await scenA('1', '시공완료');
  ok('A1. 시공완료 같은 고객이 목록에 있어도 새 고객을 만들고 그 새 번호(900)에 연결(옛 801에 붙지 않음)', A1.found && A1.post === 1 && A1.linked.length === 1 && A1.linked[0] === 900, JSON.stringify(A1));
  const A2 = await scenA('2', '가견적');
  ok('C1. 진행 중인 같은 고객이면 새로 만들지 않고 801에 연결(기존 동작 유지)', A2.found && A2.post === 0 && A2.linked[0] === 801, JSON.stringify(A2));

  // B) 고객 추가 창
  async function scenB(tag, stage) {
    const nm = '재구매B' + tag; dialogs.length = 0;
    await page.evaluate((nm, stage) => {
      window.loadCustomers = window.__origLoad; window.__dlg = []; window.confirm = function (m) { window.__dlg.push(m); return true; }; window.alert = function () {}; window.__saved = []; window.__dbCalls = [];
      window.sbXHR = function (method, p, data, cb) { if (p.indexOf('rpc/check_phone_duplicate') === 0) { cb(null, [{ exists_flag: false }]); return; } cb(null, []); };
      window.saveCustomerToDb = function (c, cb) { window.__dbCalls.push({ id: c.id || null, name: c.clientName, visit: c.visitCount }); cb && cb(null, [{ id: 910 }]); };
      saveCustomers([{ id: 802, clientName: nm, phone: '010-5555-4444', stage: stage, staffName: '마스터', visitCount: 1 }]);
      openAdd();
    }, nm, stage);
    await new Promise(r => setTimeout(r, 250));
    await page.evaluate(setNative('add-name', nm)); await page.evaluate(setNative('add-phone', '01055554444'));
    await page.click('#add-save-btn'); await new Promise(r => setTimeout(r, 700));
    const r = await page.evaluate(() => ({ db: window.__dbCalls, dlg: window.__dlg, list: loadCustomers().map(c => ({ id: c.id || null, stage: c.stage, visit: c.visitCount })) })); r.dialogs = r.dlg; return r;
  }
  const B1 = await scenB('1', '시공완료');
  ok('B1. 시공완료 같은 고객이면 옛 줄(802)을 갱신하지 않고 새 줄을 저장', B1.db.length === 1 && B1.db[0].id !== 802 && B1.list.some(c => c.id === 802 && c.visit === 1 && c.stage === '시공완료') && B1.list.length === 2, JSON.stringify(B1));
  ok('B2. 새 줄 등록 전에 "이전에 시공한 고객" 확인 문구가 나옴', B1.dialogs.some(m => /이전에 시공한/.test(m)), JSON.stringify(B1.dialogs).slice(0, 300));
  const B3 = await scenB('3', '가견적');
  ok('C2. 진행 중인 같은 고객이면 옛 줄(802)을 갱신(방문횟수 2, 기존 동작 유지)', B3.db.length === 1 && B3.db[0].id === 802 && B3.db[0].visit === 2 && B3.list.length === 1, JSON.stringify(B3));
  ok('0. 화면 오류 없음', errs.length === 0, errs.join(';'));
  log.forEach(l => console.log(l)); await browser.close(); server.kill && server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 90000);
