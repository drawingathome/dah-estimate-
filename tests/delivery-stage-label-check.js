const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 24900;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 함수 자체 검증
  const fnCheck = await page.evaluate(() => {
    return {
      installCustomer: getDisplayStageLabel({ stage: '시공준비중', deliveryOnly: false }),
      deliveryCustomer: getDisplayStageLabel({ stage: '시공준비중', deliveryOnly: true }),
      deliveryComplete: getDisplayStageLabel({ stage: '시공완료', deliveryOnly: true }),
      deliveryMeasure: getDisplayStageLabel({ stage: '실측준비중', deliveryOnly: true }),
      unrelatedStage: getDisplayStageLabel({ stage: '상담', deliveryOnly: true }), // 매핑 대상 아닌 단계는 그대로여야 함
      noRegionField: getDisplayStageLabel({ stage: '시공준비중' }) // 배송 표시가 없으면(채하나·신수정 사례) 원래 이름이어야 함
    };
  });
  ok('1. 시공지역 있으면 원래 이름(시공준비중) 유지', fnCheck.installCustomer === '시공준비중', fnCheck.installCustomer);
  ok('2. 시공안함(배송)이면 발송준비중으로 변환', fnCheck.deliveryCustomer === '발송준비중', fnCheck.deliveryCustomer);
  ok('3. 시공완료 -> 발송완료', fnCheck.deliveryComplete === '발송완료', fnCheck.deliveryComplete);
  ok('4. 실측준비중 -> 제작준비중', fnCheck.deliveryMeasure === '제작준비중', fnCheck.deliveryMeasure);
  ok('5. 매핑 대상 아닌 단계(상담)는 안 바뀜', fnCheck.unrelatedStage === '상담', fnCheck.unrelatedStage);
  ok('6. [핵심] 견적서에 배송 선택이 없는 고객은 원래 이름(채하나·신수정 오표시 재발 방지)', fnCheck.noRegionField === '시공준비중', fnCheck.noRegionField);

  // 실제 화면(고객상세)에서 반영되는지
  const detailCheck = await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([{ id: 'e9500', clientId: 9500, clientName: '배송고객', region: '', deliveryOnly: true, isArchived: false, savedAt: '2026-10-23T01:00:00Z' }]));
    saveCustomers([{ id: 9500, clientName: '배송고객', phone: '01000000095', stage: '시공준비중', date: todayStr() }]);
    openDetail('배송고객', 9500, 'info');
    return true;
  });
  await new Promise(r => setTimeout(r, 800));
  const detailText = await page.evaluate(() => document.getElementById('detail-overlay').textContent);
  ok('7. 고객상세 화면에 "발송준비중"이 실제로 보임', detailText.includes('발송준비중'));
  ok('8. 고객상세 화면에 원래 이름(시공준비중)은 안 보임', !detailText.includes('시공준비중'));
  if (detailText.includes('시공준비중')) {
    const foundInfo = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.getElementById('detail-overlay'), NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.includes('시공준비중')) {
          var parent = node.parentElement;
          var grandparent = parent.parentElement;
          return { tag: parent.tagName, cls: parent.className, outerHTML: parent.outerHTML.slice(0, 200), grandparentHTML: grandparent ? grandparent.outerHTML.slice(0, 600) : null };
        }
      }
      return null;
    });
  }

  // ── 전 화면 전수조사: 텍스트 노드를 직접 순회해서 "시공준비중/시공완료/
  // 실측준비중"이 화면 어디에도 새서 남아있지 않은지 확인 (검색/칸반/홈)
  async function findLeftoverLabel(tabName, evalFn) {
    await page.evaluate(evalFn);
    await new Promise(r => setTimeout(r, 500));
    return page.evaluate((tabName) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node, hits = [];
      while (node = walker.nextNode()) {
        ['시공준비중', '시공완료', '실측준비중'].forEach(function(bad) {
          if (node.textContent.trim() === bad) {
            var rect = node.parentElement.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) { // 실제로 화면에 보이는 것만
              hits.push({ tag: node.parentElement.tagName, cls: node.parentElement.className, text: bad });
            }
          }
        });
      }
      return { tabName, hits };
    }, tabName);
  }

  const searchLeftover = await findLeftoverLabel('search', () => { goTab('search'); });
  const kanbanLeftover = await findLeftoverLabel('kanban', () => { goTab('pipe'); });
  ok('9. 검색화면에 원래 단계명이 새어나오지 않음', searchLeftover.hits.length === 0, JSON.stringify(searchLeftover.hits));
  ok('10. 칸반화면엔 컬럼헤더(kanban-label, 의도적 그룹라벨)만 남고 그 외엔 없음', kanbanLeftover.hits.every(h => h.cls === 'kanban-label'), JSON.stringify(kanbanLeftover.hits));
  // ── 혼합 시나리오: 시공/배송/기타지역 고객이 한 화면에 섞여도 서로 안 섞이는지 ──
  const mixedResult = await page.evaluate(() => {
    localStorage.setItem('dah_saved', JSON.stringify([
      { id: 'e9600', clientId: 9600, region: '서울', deliveryOnly: false, isArchived: false, savedAt: '2026-10-23T01:00:00Z' },
      { id: 'e9601', clientId: 9601, region: '', deliveryOnly: true, isArchived: false, savedAt: '2026-10-23T01:00:00Z' },
      { id: 'e9602', clientId: 9602, region: '기타', deliveryOnly: false, isArchived: false, savedAt: '2026-10-23T01:00:00Z' }
    ]));
    saveCustomers([
      { id: 9600, clientName: '시공고객A', phone: '01000000101', stage: '시공준비중', date: todayStr() },
      { id: 9601, clientName: '배송고객B', phone: '01000000102', stage: '시공준비중', date: todayStr() },
      { id: 9602, clientName: '기타지역고객C', phone: '01000000103', stage: '시공완료', date: todayStr() }
    ]);
    goTab('search');
    renderSearch();
    return document.getElementById('search-list').innerText;
  });
  ok('11. 혼합목록에서 시공고객은 원래 이름 유지', mixedResult.includes('시공고객A') && mixedResult.split('시공고객A')[1].slice(0, 30).includes('시공준비중'));
  ok('12. 혼합목록에서 배송고객만 정확히 변환(서로 안 섞임)', mixedResult.includes('배송고객B') && mixedResult.split('배송고객B')[1].slice(0, 30).includes('발송준비중'));
  ok('13. 기타지역 고객은 시공으로 취급되어 원래 이름 유지', mixedResult.includes('기타지역고객C') && mixedResult.split('기타지역고객C')[1].slice(0, 30).includes('시공완료'));

  // ── 배송이었다가 나중에 지역을 지정하면 정상적으로 시공 이름으로 복귀하는지 ──
  const switchBack = await page.evaluate(() => {
    const mk = (arr) => { localStorage.setItem('dah_saved', JSON.stringify(arr)); };
    mk([{ id: 'a', clientId: 9700, deliveryOnly: true, isArchived: false, savedAt: '2026-10-20T00:00:00Z' }]);
    const before = getDisplayStageLabel({ id: 9700, stage: '시공준비중' });
    mk([{ id: 'a', clientId: 9700, deliveryOnly: true, isArchived: false, savedAt: '2026-10-20T00:00:00Z' }, { id: 'b', clientId: 9700, region: '경기', deliveryOnly: false, isArchived: false, savedAt: '2026-10-22T00:00:00Z' }]);
    const after = getDisplayStageLabel({ id: 9700, stage: '시공준비중' });
    // 채하나·신수정 사례: 고객에는 지역 정보가 없고 최근 견적서는 서울 → 실측준비중 그대로
    mk([{ id: 'c', clientId: 9701, region: '서울', deliveryOnly: false, isArchived: false, savedAt: '2026-10-22T00:00:00Z' }]);
    const seoul = getDisplayStageLabel({ id: 9701, stage: '실측준비중' });
    // 예전 견적서(지역 값 없음 → deliveryOnly false) / 견적서 없는 고객
    mk([{ id: 'd', clientId: 9702, isArchived: false, savedAt: '2026-08-10T00:00:00Z', deliveryOnly: false }]);
    const legacy = getDisplayStageLabel({ id: 9702, stage: '시공완료' });
    const noEst = getDisplayStageLabel({ id: 9703, stage: '시공완료' });
    return { before, after, seoul, legacy, noEst };
  });
  ok('14. 배송->시공 전환시(더 최근 견적서 기준) 원래 이름 복귀', switchBack.before === '발송준비중' && switchBack.after === '시공준비중', JSON.stringify(switchBack));
  ok('15. [핵심] 서울 견적서 고객(채하나·신수정 사례)은 실측준비중 그대로', switchBack.seoul === '실측준비중', switchBack.seoul);
  ok('16. 예전 견적서(지역 값 없음)·견적서 없는 고객은 원래 이름', switchBack.legacy === '시공완료' && switchBack.noEst === '시공완료', JSON.stringify([switchBack.legacy, switchBack.noEst]));

  const mapped = await page.evaluate(() => {
    const f = typeof estimateDbRowToLocal === 'function' ? estimateDbRowToLocal : null;
    if (!f) return null;
    return { blank: f({ id: 'x', region: '' }).deliveryOnly, nul: f({ id: 'y', region: null }).deliveryOnly, seoul: f({ id: 'z', region: '서울' }).deliveryOnly };
  });
  ok('17. 견적서 변환: 시공 안함(배송, 빈 값)만 deliveryOnly, 예전 견적서(null)·지역 있음은 false', mapped && mapped.blank === true && mapped.nul === false && mapped.seoul === false, JSON.stringify(mapped));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
