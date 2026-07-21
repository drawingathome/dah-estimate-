#!/usr/bin/env node
// tests/customer-list-check.js
// 2026-07-20 발견/추가:
// ① 정렬버튼(최신순/이름순/금액순 등)을 눌러도 실제 목록 순서가 안 바뀌던 버그
//    (renderSearch()가 _currentSort를 무시하고 항상 등록순 반전만 하고 있었음)
// ② 홈 "오늘/내일 일정" 항목을 클릭해도 고객상세로 안 넘어가던 버그
//    (바로 옆 "처리필요" 항목엔 onclick이 있었는데 이쪽엔 빠져있었음)
// ③ 신규: 고객목록 단계별 필터(상담/계약금/실측/잔금/시공/완료) — 상담이 매일
//    여러건 들어와도 "상담"만 걸러서 누락없이 확인 가능하도록 추가
// 사용법: node tests/customer-list-check.js dah-dashboard.html

const path = require('path');
const { launchBrowser, startServer, loginAs } = require('./_helpers');

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

  try {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await page.setRequestInterception(true);
    page.on('request', (req) => { if (req.url().includes('supabase.co')) { req.abort(); return; } req.continue(); });
    await page.setViewport({ width: 1400, height: 1000 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await loginAs(page, 'master');

    await page.evaluate(() => {
      saveCustomers([
        { clientName: '가나다고객', phone: '01000000001', addr: '서울', stage: '상담', staffName: '마스터', price: 3000000, date: '2026-07-01' },
        { clientName: '마바사고객', phone: '01000000002', addr: '서울', stage: '계약금', staffName: '마스터', price: 1000000, date: '2026-07-10' },
        { clientName: '자차카고객', phone: '01000000003', addr: '서울', stage: '상담', staffName: '마스터', price: 2000000, date: '2026-07-15' }
      ]);
    });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => goTab('search'));
    await new Promise(r => setTimeout(r, 400));

    // ① 정렬 실제 반영 검증
    await page.evaluate(() => setSort('amount_desc'));
    await new Promise(r => setTimeout(r, 300));
    const sorted = await page.evaluate(() => Array.from(document.querySelectorAll('.ci-name span')).map(s => s.textContent).filter(t => t.includes('고객')));
    check('금액높은순 정렬버튼 클릭시 실제로 순서가 바뀜', JSON.stringify(sorted) === JSON.stringify(['가나다고객', '자차카고객', '마바사고객']), `실제순서=${JSON.stringify(sorted)}`);

    // ③ 단계 필터 검증
    await page.evaluate(() => setStageFilter('상담'));
    await new Promise(r => setTimeout(r, 300));
    const filtered = await page.evaluate(() => Array.from(document.querySelectorAll('.ci-name span')).map(s => s.textContent).filter(t => t.includes('고객')));
    check('"상담" 단계 필터 클릭시 상담단계 고객만 표시됨(계약금 고객 제외)', filtered.length === 2 && !filtered.includes('마바사고객'), `실제=${JSON.stringify(filtered)}`);

    // 필터+정렬 동시 적용 확인
    await page.evaluate(() => setSort('name_asc'));
    await new Promise(r => setTimeout(r, 300));
    const combined = await page.evaluate(() => ({
      list: Array.from(document.querySelectorAll('.ci-name span')).map(s => s.textContent).filter(t => t.includes('고객')),
      filterStillOn: document.querySelector('[data-stage="상담"]').classList.contains('on')
    }));
    check('정렬을 바꿔도 단계필터가 풀리지 않고 유지됨(버튼 클래스 충돌 없음)', combined.filterStillOn && combined.list.length === 2, JSON.stringify(combined));

    // ② 오늘/내일 일정 클릭 검증
    await page.evaluate(() => setStageFilter('all'));
    await page.evaluate(() => {
      var d = new Date();
      var ts = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      saveCustomers([{ clientName: '오늘실측검증', phone: '01000000009', addr: '서울', stage: '실측', staffName: '마스터', measureDate: ts, date: '2026-07-01' }]);
      renderHome(true);
    });
    await new Promise(r => setTimeout(r, 400));
    const clickResult = await page.evaluate(() => {
      var els = Array.from(document.querySelectorAll('[data-cname="오늘실측검증"]'));
      var todayItem = els.find(function(e) {
        var firstChild = e.children[0];
        return firstChild && firstChild.style.borderRadius === '50%' && firstChild.style.width === '34px';
      });
      if (!todayItem) return 'NOT_FOUND';
      if (!todayItem.getAttribute('onclick')) return 'NO_ONCLICK';
      todayItem.click();
      return 'clicked';
    });
    await new Promise(r => setTimeout(r, 400));
    const opened = await page.evaluate(() => document.getElementById('detail-overlay').className.includes('open'));
    check('홈 "오늘/내일 일정" 항목에 onclick이 있고 클릭시 고객상세로 이동됨', clickResult === 'clicked' && opened, `클릭결과=${clickResult}, 열림=${opened}`);

    process.exitCode = failCount === 0 ? 0 : 1;
    await page.close();
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
