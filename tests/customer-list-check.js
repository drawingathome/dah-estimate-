#!/usr/bin/env node
// tests/customer-list-check.js
// 2026-07-20 발견/추가:
// ① 정렬버튼(최신순/이름순/금액순 등)을 눌러도 실제 목록 순서가 안 바뀌던 버그
// ② 홈 "오늘/내일 일정" 항목을 클릭해도 고객상세로 안 넘어가던 버그
// ③ 고객목록 단계별 필터(상담/계약금/실측/잔금/시공/완료) 신규추가
// 2026-07-21: 모바일(390px) 케이스 추가 — 예전엔 PC(1400px)만 검사했음
// 사용법: node tests/customer-list-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node customer-list-check.js <dah-dashboard.html경로>'); process.exit(1); }
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

  console.log('\n[고객목록 정렬/필터 + 오늘일정 클릭 회귀 검사] ' + file);

  async function testOnDevice(width, label) {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await blockRealNetwork(page);
    await page.setViewport({ width, height: 1000, isMobile: width < 500, hasTouch: width < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    await page.evaluate((suffix) => {
      saveCustomers([
        { clientName: '가나다고객' + suffix, phone: '01000000001', addr: '서울', stage: '상담', staffName: '마스터', price: 3000000, date: '2026-07-01' },
        { clientName: '마바사고객' + suffix, phone: '01000000002', addr: '서울', stage: '계약금', staffName: '마스터', price: 1000000, date: '2026-07-10' },
        { clientName: '자차카고객' + suffix, phone: '01000000003', addr: '서울', stage: '상담', staffName: '마스터', price: 2000000, date: '2026-07-15' },
        { clientName: '파타하고객' + suffix, phone: '01000000004', addr: '서울', stage: '상담', staffName: '마스터', price: 500000, date: '2026-07-20', leadParked: true }
      ]);
    }, label);
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => goTab('search'));
    await new Promise(r => setTimeout(r, 400));

    async function tapOrClick(selector) {
      const box = await page.evaluate((sel) => {
        var el = document.querySelector(sel);
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, selector);
      if (!box) return false;
      if (width < 500) await page.touchscreen.tap(box.x, box.y);
      else await page.mouse.click(box.x, box.y);
      return true;
    }

    await page.evaluate(() => setSort('amount_desc'));
    await new Promise(r => setTimeout(r, 300));
    const sorted = await page.evaluate((suffix) => Array.from(document.querySelectorAll('.ci-name span')).map(s => s.textContent).filter(t => t.includes(suffix)), label);
    check(`[${label}] 금액높은순 정렬버튼 클릭시 실제로 순서가 바뀜`, JSON.stringify(sorted) === JSON.stringify(['가나다고객' + label, '자차카고객' + label, '마바사고객' + label]), `실제순서=${JSON.stringify(sorted)}`);

    const filterTapped = await tapOrClick('[data-stage="parked"]');
    await new Promise(r => setTimeout(r, 300));
    const filtered = await page.evaluate((suffix) => Array.from(document.querySelectorAll('.ci-name span')).map(s => s.textContent).filter(t => t.includes(suffix)), label);
    check(`[${label}] "대기 리드" 필터 탭/클릭시 대기리드 고객만 표시됨`, filterTapped && filtered.length === 1 && filtered.includes('파타하고객' + label), `탭됨=${filterTapped}, 실제=${JSON.stringify(filtered)}`);

    await page.evaluate(() => setSort('name_asc'));
    await new Promise(r => setTimeout(r, 300));
    const combined = await page.evaluate((suffix) => ({
      list: Array.from(document.querySelectorAll('.ci-name span')).map(s => s.textContent).filter(t => t.includes(suffix)),
      filterStillOn: document.querySelector('[data-stage="parked"]').classList.contains('on')
    }), label);
    check(`[${label}] 정렬을 바꿔도 대기리드필터가 안 풀림`, combined.filterStillOn && combined.list.length === 1, JSON.stringify(combined));

    await page.evaluate(() => { if (typeof closeDetail === 'function') closeDetail(); });
    await page.evaluate(() => setStageFilter('all'));
    await page.evaluate(() => goTab('home'));
    await page.evaluate((suffix) => {
      var d = new Date();
      var ts = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      saveCustomers([{ clientName: '오늘실측검증' + suffix, phone: '01000000009', addr: '서울', stage: '실측', staffName: '마스터', measureDate: ts, date: '2026-07-01' }]);
      renderHome(true);
    }, label);
    await new Promise(r => setTimeout(r, 400));
    const box = await page.evaluate((suffix) => {
      var els = Array.from(document.querySelectorAll('[data-cname="오늘실측검증' + suffix + '"]'));
      var todayItem = els.find(function(e) {
        var firstChild = e.children[0];
        return firstChild && firstChild.style.borderRadius === '50%' && firstChild.style.width === '34px';
      });
      if (!todayItem) return null;
      var r = todayItem.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, label);
    if (box) {
      if (width < 500) await page.touchscreen.tap(box.x, box.y);
      else await page.mouse.click(box.x, box.y);
    }
    await new Promise(r => setTimeout(r, 400));
    const opened = await page.evaluate(() => document.getElementById('detail-overlay').className.includes('open'));
    check(`[${label}] 홈 "오늘/내일 일정" 실제 좌표 탭/클릭시 고객상세 이동됨`, !!box && opened, `요소찾음=${!!box}, 열림=${opened}`);

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
