#!/usr/bin/env node
// tests/est-editing-state-reset-check.js
// 2026-08-26: "새 견적서" 버튼을 눌렀을 때 견적 편집상태 관련 전역변수
// 4가지(_editingEstDbId/_editingEstUpdatedAt/_viewingFrozenEstimate/
// _estSaveCustomerId)가 전부 리셋되는지 확인. 예전엔 _estSaveCustomerId가
// 빠져있었음(resetEstEditingState() 도입으로 수정) - 재발 방지용 회귀테스트.
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('사용법: node est-editing-state-reset-check.js <dah-estimate.html경로>'); process.exit(1); }
  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9951 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  let failCount = 0;
  function check(label, condition, detail) {
    if (condition) { console.log(`  ✅ ${label}`); } else { console.log(`  ❌ ${label} — ${detail}`); failCount++; }
  }

  async function testOnDevice(vw, label) {
    const page = await browser.newPage();
    page.on('dialog', async d => { try { await d.accept(''); } catch (e) {} });
    await page.setViewport({ width: vw, height: 900, isMobile: vw < 500, hasTouch: vw < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));

    console.log('\n[견적편집상태 리셋 검사] ' + file + ' @ ' + label);

    // 견적을 "편집 중"인 것처럼 4가지 변수를 전부 세팅
    await page.evaluate(() => {
      window._editingEstDbId = 'fake-editing-id';
      window._editingEstUpdatedAt = '2026-08-26T00:00:00Z';
      window._viewingFrozenEstimate = true;
      window._estSaveCustomerId = 'fake-customer-id';
      // 2026-08-26 추가: 계산결과 캐시 3개도 이전 고객 것인 양 채워둠
      window._lastCalcBreakdown = { total: 999999 };
      window._lastDiscountBreakdown = [{ label: '가짜할인', amount: 1000 }];
      window._lastAppliedDiscounts = { coupons: ['fake-coupon'], manual: 500 };
    });

    await page.evaluate(() => { newEstimate(); });
    await new Promise(r => setTimeout(r, 300));

    const state = await page.evaluate(() => ({
      editingEstDbId: window._editingEstDbId,
      editingEstUpdatedAt: window._editingEstUpdatedAt,
      viewingFrozenEstimate: window._viewingFrozenEstimate,
      estSaveCustomerId: window._estSaveCustomerId,
      lastCalcBreakdown: window._lastCalcBreakdown,
      lastDiscountBreakdown: window._lastDiscountBreakdown,
      lastAppliedDiscounts: window._lastAppliedDiscounts
    }));

    check('[' + label + '] _editingEstDbId가 null로 리셋됨', state.editingEstDbId === null, `실제=${state.editingEstDbId}`);
    check('[' + label + '] _editingEstUpdatedAt이 null로 리셋됨', state.editingEstUpdatedAt === null, `실제=${state.editingEstUpdatedAt}`);
    check('[' + label + '] _viewingFrozenEstimate가 false로 리셋됨', state.viewingFrozenEstimate === false, `실제=${state.viewingFrozenEstimate}`);
    check('[' + label + '] _estSaveCustomerId가 null로 리셋됨(예전엔 빠져있던 것)', state.estSaveCustomerId === null, `실제=${state.estSaveCustomerId}`);
    // calcTotal()이 newEstimate() 끝에서 호출되면서 0원 상태의 새 breakdown 객체로
    // 덮어써짐(=null이 아니라 total:0에 가까운 값) - "이전 고객의 999999가 아님"만 확인
    check('[' + label + '] _lastCalcBreakdown이 이전 고객 값(999999)로 남아있지 않음', !state.lastCalcBreakdown || state.lastCalcBreakdown.total !== 999999, `실제=${JSON.stringify(state.lastCalcBreakdown)}`);
    check('[' + label + '] _lastDiscountBreakdown이 이전 고객 값(가짜할인)로 남아있지 않음', !Array.isArray(state.lastDiscountBreakdown) || !state.lastDiscountBreakdown.some(d => d.label === '가짜할인'), `실제=${JSON.stringify(state.lastDiscountBreakdown)}`);
    check('[' + label + '] _lastAppliedDiscounts가 이전 고객 값(fake-coupon)로 남아있지 않음', !state.lastAppliedDiscounts || !(state.lastAppliedDiscounts.coupons||[]).includes('fake-coupon'), `실제=${JSON.stringify(state.lastAppliedDiscounts)}`);

    await page.close();
  }

  try {
    await testOnDevice(1280, 'PC');
    await testOnDevice(390, '모바일');
    process.exitCode = failCount === 0 ? 0 : 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
