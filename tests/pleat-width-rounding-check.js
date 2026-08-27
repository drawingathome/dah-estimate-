#!/usr/bin/env node
// tests/pleat-width-rounding-check.js
// 2026-08-27(선혜님 지시 - "무조건 반올림하니 폭수가 너무 많다"):
// 민자형은 소수점 0.2 이하, 나비주름형은 0.1 이하면 올리지 않고 내림하도록
// est-product-calc.js의 calcCurtainRow()를 수정함. 이 테스트는 그 기준이
// 정확히 지켜지는지 몇 가지 대표 사이즈로 확인.
const path = require('path');
const { launchBrowser, startServer, setupValidSession } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node pleat-width-rounding-check.js <dah-estimate.html경로>'); process.exit(1); }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9611 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let failCount = 0;
  function check(label, actual, expected) {
    if (actual === expected) { console.log(`  ✅ ${label} — ${actual}폭`); }
    else { console.log(`  ❌ ${label} — 실제=${actual}폭, 기대=${expected}폭`); failCount++; }
  }

  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(''); } catch (e) {} });
  await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await setupValidSession(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  async function pleatWidthFor(mw, pleatType) {
    await page.evaluate(() => { if (typeof addCurtainRow === 'function') addCurtainRow(); });
    await new Promise(r => setTimeout(r, 150));
    return page.evaluate((mw, pleatType) => {
      const rows = document.querySelectorAll('.row-curtain');
      const tr = rows[rows.length - 1];
      tr.querySelector('.pleat-type').value = pleatType;
      tr.querySelector('.mw').value = String(mw);
      tr.querySelector('.mw').dispatchEvent(new Event('input'));
      calcCurtainRow(tr.querySelector('.mw'));
      return Number(tr.querySelector('.pnum').value);
    }, mw, pleatType);
  }

  // 나비주름형: 0.1 이하 내림
  check('나비주름 300cm (4.615배 → 여유범위 밖)', await pleatWidthFor(300, '나비주름형'), 5);
  check('나비주름 261cm (4.015배 → 0.1 이하, 내림)', await pleatWidthFor(261, '나비주름형'), 4);
  check('나비주름 260cm (정확히 4.0배)', await pleatWidthFor(260, '나비주름형'), 4);
  check('나비주름 280cm (4.308배 → 여유범위 밖)', await pleatWidthFor(280, '나비주름형'), 5);

  // 민자형: 0.2 이하 내림
  check('민자 350cm (4.038배 → 0.2 이하, 내림)', await pleatWidthFor(350, '민자형'), 4);
  check('민자 320cm (3.692배 → 여유범위 밖)', await pleatWidthFor(320, '민자형'), 4);
  check('민자 300cm (3.462배 → 여유범위 밖)', await pleatWidthFor(300, '민자형'), 4);

  await browser.close();
  server.kill();
  process.exit(failCount ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
