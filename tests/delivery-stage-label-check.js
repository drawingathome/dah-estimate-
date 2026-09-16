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
      installCustomer: getDisplayStageLabel({ stage: '시공준비중', region: '서울' }),
      deliveryCustomer: getDisplayStageLabel({ stage: '시공준비중', region: '' }),
      deliveryComplete: getDisplayStageLabel({ stage: '시공완료', region: '' }),
      deliveryMeasure: getDisplayStageLabel({ stage: '실측준비중', region: '' }),
      unrelatedStage: getDisplayStageLabel({ stage: '상담', region: '' }), // 매핑 대상 아닌 단계는 그대로여야 함
      noRegionField: getDisplayStageLabel({ stage: '시공준비중' }) // region 필드 자체가 없는 경우도 안전해야
    };
  });
  ok('1. 시공지역 있으면 원래 이름(시공준비중) 유지', fnCheck.installCustomer === '시공준비중', fnCheck.installCustomer);
  ok('2. 시공안함(배송)이면 발송준비중으로 변환', fnCheck.deliveryCustomer === '발송준비중', fnCheck.deliveryCustomer);
  ok('3. 시공완료 -> 발송완료', fnCheck.deliveryComplete === '발송완료', fnCheck.deliveryComplete);
  ok('4. 실측준비중 -> 제작준비중', fnCheck.deliveryMeasure === '제작준비중', fnCheck.deliveryMeasure);
  ok('5. 매핑 대상 아닌 단계(상담)는 안 바뀜', fnCheck.unrelatedStage === '상담', fnCheck.unrelatedStage);
  ok('6. region 필드 자체가 없어도 안전(크래시 없음)', fnCheck.noRegionField === '발송준비중', fnCheck.noRegionField);

  // 실제 화면(고객상세)에서 반영되는지
  const detailCheck = await page.evaluate(() => {
    saveCustomers([{ id: 9500, clientName: '배송고객', phone: '01000000095', stage: '시공준비중', region: '', date: todayStr() }]);
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
  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
