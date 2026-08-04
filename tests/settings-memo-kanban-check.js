#!/usr/bin/env node
// tests/settings-memo-kanban-check.js
// 2026-07-21: 오늘 채팅에서 "그때그때" 확인만 하고 자동테스트로 안 박아뒀던
// 3가지(설정탭 저장, 메모 편집, 칸반 드래그+모바일 케밥 보존)를 정식 회귀
// 테스트로 고정. "대기업처럼 균일하게 확인"하려면 사람이 매번 기억해서
// 확인하는 대신, 이렇게 한 번 자동테스트로 박아두고 매번 기계적으로 돌리는
// 것이 유일한 방법 — 대화 안에서의 확인은 필연적으로 편차가 생김.
// 사용법: node tests/settings-memo-kanban-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node settings-memo-kanban-check.js <dah-dashboard.html경로>'); process.exit(1); }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9901 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let failCount = 0;
  function check(label, condition, detail) {
    if (condition) { console.log(`  ✅ ${label}`); }
    else { console.log(`  ❌ ${label} — ${detail}`); failCount++; }
  }

  console.log('\n[설정·메모·칸반드래그 회귀 검사] ' + file);

  async function testOnDevice(width, label) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await blockRealNetwork(page);
    await page.setViewport({ width, height: 900, hasTouch: width < 500, isMobile: width < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    // ── 1. 설정탭: 아코디언 펼치기 + 전체저장 버튼 실제 클릭 → 토스트 확인 ──
    await page.evaluate(() => goTab('settings'));
    await new Promise(r => setTimeout(r, 400));
    await page.evaluate(() => {
      var hs = Array.from(document.querySelectorAll('#settings div')).filter(d => d.style.cursor === 'pointer' && d.nextElementSibling);
      var target = hs.find(h => h.textContent.includes('계정'));
      if (target) target.click();
    });
    await new Promise(r => setTimeout(r, 300));
    const saveBox = await page.evaluate(() => {
      var saveBtn = Array.from(document.querySelectorAll('#settings button')).find(b => b.textContent.includes('전체 저장'));
      if (!saveBtn) return null;
      saveBtn.scrollIntoView({ block: 'center' });
      var r = saveBtn.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (saveBox) {
      if (width < 500) await page.touchscreen.tap(saveBox.x, saveBox.y);
      else await page.mouse.click(saveBox.x, saveBox.y);
    }
    await new Promise(r => setTimeout(r, 400));
    const toast = await page.evaluate(() => document.getElementById('toast')?.textContent || '');
    check(`[${label}] 설정 전체저장 버튼 클릭시 저장확인 토스트 표시됨`, !!saveBox && toast.includes('저장'), `버튼찾음=${!!saveBox}, 토스트="${toast}"`);

    // ── 2. 메모: 탭해서 편집 + 빠른문구 삽입 + 저장 ──
    await page.evaluate((name) => {
      saveCustomers([{ clientName: name, phone: '01099990000', addr: '서울', stage: '상담', staffName: '마스터' }]);
    }, '메모검사_' + label);
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((name) => { openDetail(name, null, 'info'); }, '메모검사_' + label);
    await new Promise(r => setTimeout(r, 400));
    const memoResult = await page.evaluate(() => {
      var candidates = Array.from(document.querySelectorAll('#detail-body div')).filter(d => d.style.cursor === 'pointer' && d.textContent.includes('메모'));
      if (!candidates.length) return 'NOT_FOUND';
      candidates[0].click();
      var textarea = document.querySelector('#detail-body textarea');
      if (!textarea) return 'NO_TEXTAREA';
      var btns = Array.from(textarea.parentElement.querySelectorAll('button'));
      var quickBtn = btns.find(b => b.textContent === '가견적서 발송');
      if (!quickBtn) return 'NO_QUICKBTN';
      quickBtn.click();
      return textarea.value;
    });
    let memoSaved = null;
    if (memoResult === '가견적서 발송') {
      await page.evaluate(() => { document.querySelector('#detail-body textarea').dispatchEvent(new Event('blur')); });
      await new Promise(r => setTimeout(r, 300));
      memoSaved = await page.evaluate((name) => loadCustomers().find(c => c.clientName === name)?.memo, '메모검사_' + label);
    }
    check(`[${label}] 메모 탭 → 빠른문구 삽입 → 저장까지 전체 흐름 정상`, memoSaved === '가견적서 발송', `중간결과=${memoResult}, 저장값=${memoSaved}`);

    // ── 3. 칸반: PC는 드래그로 단계변경, 모바일은 케밥메뉴 여전히 동작 ──
    await page.evaluate((name) => {
      saveCustomers([{ clientName: name, phone: '01099990001', addr: '서울', stage: '계약금', staffName: '마스터' }]);
    }, '칸반검사_' + label);
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => goTab('pipe'));
    await new Promise(r => setTimeout(r, 400));
    if (width >= 500) {
      const dragResult = await page.evaluate((name) => {
        var cols = document.querySelectorAll('.kanban-col');
        var item = Array.from(cols[0].querySelectorAll('.kanban-item')).find(i => i.textContent.includes(name));
        if (!item) return 'ITEM_NOT_FOUND';
        var dt = new DataTransfer();
        item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        cols[1].dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
        return 'dispatched';
      }, '칸반검사_' + label);
      await new Promise(r => setTimeout(r, 400));
      const stageAfter = await page.evaluate((name) => loadCustomers().find(c => c.clientName === name)?.stage, '칸반검사_' + label);
      check(`[${label}] PC 드래그로 카드를 다른 컬럼에 놓으면 단계 변경됨`, dragResult === 'dispatched' && stageAfter === '실측', `드래그결과=${dragResult}, 변경후단계=${stageAfter}`);
    } else {
      const kebabResult = await page.evaluate((name) => {
        var btn = Array.from(document.querySelectorAll('.ksb')).find(b => b.closest('.kanban-item')?.textContent.includes(name));
        if (!btn) return 'BTN_NOT_FOUND';
        var draggableVal = btn.closest('.kanban-item').draggable;
        btn.click();
        var menu = document.getElementById('stage-menu');
        return { draggable: draggableVal, menuShown: !!menu };
      }, '칸반검사_' + label);
      check(`[${label}] 모바일에서 draggable이 꺼져있고(터치충돌방지) 케밥메뉴는 정상 동작`,
        kebabResult.draggable === false && kebabResult.menuShown === true, JSON.stringify(kebabResult));
    }

    check(`[${label}] 이 구간에서 JS 런타임 에러 없음`, errors.length === 0, JSON.stringify(errors));
    await page.close();
  }

  try {
    await testOnDevice(390, '모바일');
    await testOnDevice(1400, 'PC');
    process.exitCode = failCount === 0 ? 0 : 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
