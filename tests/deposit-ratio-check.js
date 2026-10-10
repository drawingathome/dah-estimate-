const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 25900;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co') || url.includes('script.google.com')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.setViewport({ width: 390, height: 1200 });
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  // 케이스 1: 침구만 있으면 계약금이 자동으로 100%(=총액과 동일)
  await page.evaluate(() => {
    addOtherItemRow();
    const tr = document.querySelector('#other-body tr');
    tr.querySelector('.other-name').value = '이불';
    tr.querySelector('.other-price').value = '200000';
    calcOtherItemRow(tr.querySelector('.other-price'));
  });
  await new Promise(r => setTimeout(r, 200));
  const beddingOnly = await page.evaluate(() => {
    const dep = document.getElementById('deposit-input');
    return { grand: document.getElementById('sum-total')?.textContent, deposit: dep?.value, depositRaw: dep?.dataset.raw };
  });
  ok('1. 침구만 있으면 계약금이 자동으로 총액과 동일(100%)', beddingOnly.grand === '200,000원' && beddingOnly.depositRaw === '200000', JSON.stringify(beddingOnly));

  // 케이스 2: 여기에 커튼을 추가하면(사이즈/단가 입력) 다시 50%로 전환
  await page.evaluate(() => {
    const curtainRow = document.querySelector('#curtain-body tr');
    curtainRow.querySelector('.mw').value = '300';
    curtainRow.querySelector('.mh').value = '250';
    curtainRow.querySelector('.cprice').value = '100000';
    calcCurtainRow(curtainRow.querySelector('.cprice'));
  });
  await new Promise(r => setTimeout(r, 200));
  const withCurtain = await page.evaluate(() => {
    const dep = document.getElementById('deposit-input');
    return { grand: document.getElementById('sum-total')?.textContent, depositRaw: dep?.dataset.raw };
  });
  // 총액 = 커튼(300x250 마수/판폭 계산 포함 - 정확한 금액은 계산식에 따라 달라질 수 있어 50% 비율만 검증
  const grandNum = parseInt((withCurtain.grand || '0').replace(/[^0-9]/g, ''));
  const depositNum = parseInt(withCurtain.depositRaw || '0');
  ok('2. 커튼이 추가되면 계약금이 다시 50% 비율로 자동전환됨(회귀 방지)', Math.abs(depositNum - grandNum * 0.5) < 2, JSON.stringify({ grandNum, depositNum, ratio: depositNum / grandNum }));

  // 케이스 3: 새 견적서 - 커튼만 있을 때(빈 기본행에 값 채움)는 여전히 50%
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate(() => {
    const tr = document.querySelector('#curtain-body tr');
    tr.querySelector('.mw').value = '300'; tr.querySelector('.mh').value = '250';
    tr.querySelector('.cprice').value = '100000';
    calcCurtainRow(tr.querySelector('.cprice'));
  });
  await new Promise(r => setTimeout(r, 200));
  const curtainOnly = await page.evaluate(() => {
    const dep = document.getElementById('deposit-input');
    return { grand: document.getElementById('sum-total')?.textContent, depositRaw: dep?.dataset.raw };
  });
  const grandNum2 = parseInt((curtainOnly.grand || '0').replace(/[^0-9]/g, ''));
  const depositNum2 = parseInt(curtainOnly.depositRaw || '0');
  ok('3. [회귀방지] 커튼만 있는 기존 흐름은 여전히 50%로 자동계산됨', Math.abs(depositNum2 - grandNum2 * 0.5) < 2, JSON.stringify({ grandNum2, depositNum2 }));

  console.log(log.join('\n'));
  console.log(jsErrors.length ? 'JS 에러: ' + jsErrors.join('\n') : 'JS 에러 없음');
  const allPass = log.every(l => l.startsWith('✅'));
  console.log(allPass && jsErrors.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');

  await browser.close();
  server.kill();
  if (!allPass || jsErrors.length > 0) process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
