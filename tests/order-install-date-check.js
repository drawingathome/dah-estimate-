#!/usr/bin/env node
// tests/order-install-date-check.js
// N-141b (2026-11-07): DB 규칙은 '시공일이 있고 미정이 아니면 시공 발주 완료'로 본다. 화면(홈 처리필요·발주 탭)도 똑같이 봐야 한다.
// 사용법: node tests/order-install-date-check.js dah-dashboard.html
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node order-install-date-check.js <dah-dashboard.html경로>'); process.exit(1); }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 20101 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let failCount = 0;
  function check(label, condition, detail) {
    if (condition) console.log(`  ✅ ${label}`);
    else { console.log(`  ❌ ${label} — ${detail}`); failCount++; }
  }
  console.log('\n[시공일 = 시공 발주 완료 판정 일치 검사] ' + file);
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 1100, height: 1000 });
  await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');
  const res = await page.evaluate(() => {
    const done4 = { fabric: true, production: true, blind: true, material: true, install: false };
    const base = { phone: '01000000031', addr: '서울', stage: '시공준비중', staffName: '마스터', date: '2026-10-01', orderStatus: done4 };
    const mk = (id, name, extra) => Object.assign({}, base, { id, clientName: name }, extra);
    saveCustomers([
      mk(9301, '시공일있음', { installDate: '2026-11-20', installDateTbd: false }),
      mk(9302, '시공일미정', { installDate: '2026-11-20', installDateTbd: true }),
      mk(9303, '시공일없음', { installDate: '', installDateTbd: false }),
      mk(9304, '원단빠짐', { installDate: '2026-11-20', installDateTbd: false, orderStatus: { fabric: false, production: true, blind: true, material: true, install: false } })
    ]);
    localStorage.setItem('dah_saved', JSON.stringify(
      [9301, 9302, 9303, 9304].map((id, i) => ({ clientId: id, clientName: ['시공일있음','시공일미정','시공일없음','원단빠짐'][i], no: 'A-' + id, curtainCount: 2, blindCount: 1, savedAt: '2026-10-01' }))
    ));
    const find = n => loadCustomers().find(c => c.clientName === n);
    return {
      withDate: hasIncompleteOrder(find('시공일있음')),
      tbd: hasIncompleteOrder(find('시공일미정')),
      noDate: hasIncompleteOrder(find('시공일없음')),
      missingFabric: hasIncompleteOrder(find('원단빠짐')),
      itemDone: typeof isInstallDateSet === 'function' ? isInstallDateSet(find('시공일있음')) : null
    };
  });
  check('시공일이 있으면(원단·제작·블라인드·자재 완료) 발주 미완료가 아님', res.withDate === false, `hasIncompleteOrder=${res.withDate}`);
  check('시공일이 "미정"이면 시공 발주는 미완료', res.tbd === true, `hasIncompleteOrder=${res.tbd}`);
  check('시공일이 없으면 시공 발주는 미완료', res.noDate === true, `hasIncompleteOrder=${res.noDate}`);
  check('시공일이 있어도 다른 항목(원단)이 비면 미완료', res.missingFabric === true, `hasIncompleteOrder=${res.missingFabric}`);
  // 홈 화면
  await page.evaluate(() => { goTab('home'); renderHome(true); });
  await new Promise(r => setTimeout(r, 500));
  const home = await page.evaluate(() => document.getElementById('home').textContent);
  check('홈 처리필요: 시공일 있는 고객은 "발주 필요"에 안 뜸', !home.includes('시공일있음'), '홈에 표시됨');
  check('홈 처리필요: 시공일 없는 고객은 "발주 필요"에 뜸', home.includes('시공일없음'), '홈에 안 보임');
  check('홈 처리필요: 시공일 미정 고객은 "발주 필요"에 뜸', home.includes('시공일미정'), '홈에 안 보임');
  // 발주 탭
  async function installBox(name) {
    await page.evaluate((n) => {
      const old = document.getElementById('order-test-wrap'); if (old) old.remove();
      const c = loadCustomers().find(x => x.clientName === n);
      const wrap = document.createElement('div'); wrap.id = 'order-test-wrap'; document.body.appendChild(wrap);
      renderOrderSection(c, wrap);
    }, name);
    await new Promise(r => setTimeout(r, 1200));
    return page.evaluate(() => {
      const wrap = document.getElementById('order-test-wrap');
      const lab = Array.from(wrap.querySelectorAll('span')).find(s => s.textContent.trim() === '시공 발주');
      const row = lab && lab.closest('div[style*="justify-content"]');
      const box = row && row.querySelector('input[type=checkbox]');
      return { found: !!box, checked: box ? box.checked : null };
    });
  }
  const tab = await installBox('시공일있음');
  const tabNo = await installBox('시공일없음');
  check('발주 탭: 시공일 있는 고객의 "시공 발주"가 체크 표시됨', tab.found && tab.checked === true, JSON.stringify(tab));
  check('발주 탭: 시공일 없는 고객의 "시공 발주"는 체크 안 됨', tabNo.found && tabNo.checked === false, JSON.stringify(tabNo));
  await browser.close(); server.close();
  if (failCount > 0) { console.log(`\n❌ ${failCount}개 실패`); process.exit(1); }
  console.log('\n✅ 모든 항목 통과');
}
run().catch(e => { console.error(e); process.exit(1); });
