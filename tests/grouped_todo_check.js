const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9805;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await blockRealNetwork(page);
  await page.setViewport({ width: 390, height: 1400 });
  await page.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));
  await loginAs(page, 'master');

  const result = await page.evaluate(() => {
    function daysAgo(n) { var d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
    saveCustomers([
      { id: 900, clientName: '결제고객A', phone:'01011110000', stage:'선금결제', staffName:'마스터', date: todayStr(), price: 1000000, orderStatus:{fabric:true,production:true,blind:true,material:true,install:true} },
      { id: 901, clientName: '발주고객B', phone:'01022220000', stage:'실측준비중', staffName:'마스터', date: todayStr(), price: 1000000, orderStatus:{} },
      { id: 902, clientName: '리드고객C', phone:'01033330000', stage:'상담', staffName:'마스터', date: daysAgo(10) }
    ]);
    localStorage.setItem('dah_saved', JSON.stringify([
      { no:'E1', clientId: 901, clientName:'발주고객B', price:1000000, curtainCount:1, blindCount:0, lineItems:[{type:'curtain'}], staffName:'마스터', savedAt: todayStr() }
    ]));
    renderHome(true);
    var html = document.getElementById('sec-todo').innerHTML;
    return {
      hasPaymentGroup: html.includes('결제 처리'),
      hasOrderGroup: html.includes('발주 필요'),
      hasLeadGroup: html.includes('리드 팔로업'),
      order: [html.indexOf('결제 처리'), html.indexOf('발주 필요'), html.indexOf('리드 팔로업')]
    };
  });

  console.log('결제처리 그룹 헤더 존재:', result.hasPaymentGroup ? '✅' : '❌');
  console.log('발주필요 그룹 헤더 존재:', result.hasOrderGroup ? '✅' : '❌');
  console.log('리드팔로업 그룹 헤더 존재:', result.hasLeadGroup ? '✅' : '❌');
  console.log('순서(결제→발주→리드):', JSON.stringify(result.order), result.order[0] < result.order[1] && result.order[1] < result.order[2] ? '✅' : '❌');

  await browser.close();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 20000);
