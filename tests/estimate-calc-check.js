#!/usr/bin/env node
// tests/estimate-calc-check.js
// 견적서 앱(dah-estimate.html) 핵심 금액 계산 로직 회귀 테스트
//
// 2026-07-15 세션에서 실제로 발견/수정한 4개의 금전 계산 버그가
// 다시 재발하지 않는지 확인하는 영구 회귀 테스트입니다.
//   1) 레일시공비: 25,000원 고정(1개당)이어야 하는데 레일자수를 곱해서 과다청구되던 버그
//   2) 실적매출: 커튼값의 100%(제품가격 그대로)여야 하는데 95%로 축소산정되던 버그
//   3) 블라인드 옵션추가금(전동 등): 지역(서울/경기/기타) 미선택시 저장 자체가 막혀야 함
//      (금액이 조용히 유실되는 걸 막기 위한 안전장치)
//   4) 할인: 음수 입력시 총액이 오히려 올라가면 안 되고 0으로 방어되어야 함
//
// 사용법: node tests/estimate-calc-check.js dah-estimate.html

const path = require('path');
const { launchBrowser, blockRealNetwork, startServer } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node estimate-calc-check.js <dah-estimate.html경로>');
    process.exit(1);
  }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9401 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);

  const browser = await launchBrowser();
  let failCount = 0;

  function check(label, condition, detail) {
    if (condition) {
      console.log(`  ✅ ${label}`);
    } else {
      console.log(`  ❌ ${label} — ${detail}`);
      failCount++;
    }
  }

  try {
    const page = await browser.newPage();
    await blockRealNetwork(page);
    page.on('dialog', async d => { try { await d.accept(''); } catch (e) {} });

    // ── 테스트 1+4: 레일시공비 + 할인 음수방어 (같은 커튼행으로 함께 확인) ──
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));

    await page.evaluate(() => {
      var tr = document.querySelector('.row-curtain');
      tr.querySelector('.pleat-type').value = '나비주름형';
      tr.querySelector('.mw').value = '300';
      tr.querySelector('.mw').dispatchEvent(new Event('input'));
      calcCurtainRow(tr.querySelector('.mw'));
      tr.querySelector('.cprice').value = '50000';
      calcCurtainRow(tr.querySelector('.cprice'));
    });
    await new Promise(r => setTimeout(r, 300));

    const railInfo = await page.evaluate(() => {
      var rows = document.querySelectorAll('#svc-body tr');
      var railCostRow = Array.from(rows).find(function (tr) {
        var name = tr.querySelectorAll('td')[1]?.querySelector('input')?.value || '';
        return name.includes('레일 시공비');
      });
      return railCostRow ? railCostRow.querySelectorAll('td')[3]?.querySelector('input')?.value : 'not-found';
    });
    console.log('\n[견적서 핵심계산 검사] ' + file);
    check('레일시공비 수량이 1개 고정 (레일자수를 곱하지 않음)', railInfo === '1', '실제값=' + railInfo + ' (예상: 1)');

    const totalBefore = await page.evaluate(() => document.getElementById('sum-total').textContent);
    check('커튼 300cm·나비주름·단가5만원 손계산 일치', totalBefore === '291,000원', '실제값=' + totalBefore + ' (예상: 291,000원 = 커튼250,000+레일16,000+레일시공25,000)');

    // 할인 음수 방어
    const negDiscTotal = await page.evaluate(() => {
      document.getElementById('discount-type').value = 'won';
      document.getElementById('discount').value = '-10000';
      calcTotal();
      return document.getElementById('sum-total').textContent;
    });
    check('할인에 음수 입력시 총액이 오르지 않고 방어됨', negDiscTotal === '291,000원', '실제값=' + negDiscTotal + ' (음수할인 전과 동일해야 함, 291,000원)');

    // ── 테스트 2: 실적매출 = 제품가격 100% (95% 아님) ──
    const perfInfo = await page.evaluate(() => {
      var curtain = document.getElementById('sum-curtain').textContent;
      var perf = document.getElementById('sum-perf').textContent;
      return { curtain: curtain, perf: perf };
    });
    check('실적매출이 커튼값과 정확히 동일(95%로 축소 안 됨)', perfInfo.curtain === perfInfo.perf, 'curtain=' + perfInfo.curtain + ', perf=' + perfInfo.perf);

    // ── 테스트 3: 블라인드 옵션추가금 있는데 지역 미선택시 저장 차단 ──
    const page2 = await browser.newPage();
    await blockRealNetwork(page2);
    page2.on('dialog', async d => { try { await d.accept(''); } catch (e) {} });
    await page2.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await page2.evaluate(() => {
      document.getElementById('c-name').value = '회귀테스트고객';
      addBlindRow();
    });
    await new Promise(r => setTimeout(r, 300));
    await page2.evaluate(() => {
      var tr = document.querySelector('#blind-body tr');
      tr.querySelector('.bmw').value = '150';
      tr.querySelector('.bmh').value = '100';
      tr.querySelector('.blind-price').value = '50000';
      calcBlindRow(tr.querySelector('.blind-price'));
      var extra = tr.querySelector('.blind-extra');
      extra.value = '30000';
      extra.dispatchEvent(new Event('input'));
      calcBlindRow(extra);
    });
    await new Promise(r => setTimeout(r, 300));
    await page2.evaluate(() => { localStorage.removeItem('dah_saved'); saveEstimate(); });
    await new Promise(r => setTimeout(r, 500));
    const savedCountNoRegion = await page2.evaluate(() => JSON.parse(localStorage.getItem('dah_saved') || '[]').length);
    check('지역 미선택+옵션추가금 있을때 저장이 차단됨(금액유실 방지)', savedCountNoRegion === 0, '실제 저장건수=' + savedCountNoRegion + ' (예상: 0건, 차단되어야 함)');
    await page2.close();

    process.exitCode = failCount === 0 ? 0 : 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
