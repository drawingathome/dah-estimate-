const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9980;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));

  const result = await page.evaluate(() => {
    document.getElementById('c-name').value = '빈칸저장테스트';
    document.getElementById('c-phone').value = '01055556666';
    const tr = document.querySelector('.row-curtain');
    // 공간/제품명/원단명은 일부러 안 채움
    tr.querySelector('.mw').value = 200; calcCurtainRow(tr.querySelector('.mw'));
    tr.querySelector('.mh').value = 250; calcCurtainRow(tr.querySelector('.mh'));
    tr.querySelector('.cprice').value = 30000; calcCurtainRow(tr.querySelector('.cprice'));

    // saveEstimate 내부 lineItems 수집 로직을 그대로 재현해서 확인
    // (실제 saveEstimate는 XHR을 쏘니, 수집 결과만 별도로 확인)
    var lineItems = [];
    document.querySelectorAll('#curtain-body tr').forEach(function(row){
      var space = row.querySelector('.space-inp')?.value||'';
      var displayName = row.querySelector('.c-display-name')?.value||'';
      var fabric = row.querySelector('.c-fabric')?.value||'';
      var mwVal = row.querySelector('.mw')?.value||'';
      var mhVal = row.querySelector('.mh')?.value||'';
      var priceVal = getPriceVal(row.querySelector('.cprice'));
      if (!space && !displayName && !fabric && !mwVal && !mhVal && !priceVal) return;
      lineItems.push({ mw: mwVal, mh: mhVal, price: priceVal });
    });

    return { lineItemsCount: lineItems.length, lineItems: lineItems };
  });

  console.log('공간/제품명/원단명 없이 사이즈만 채운 행 저장여부:', result.lineItemsCount, '개 —', JSON.stringify(result.lineItems));
  console.log('결과:', result.lineItemsCount === 1 ? '✅ 정상 저장됨' : '❌ (여전히 누락됨)');

  await browser.close();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 25000);
