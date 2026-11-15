// tests/order-defs-single-source-check.js
// 2026-11-15 N-165 P3: 발주 종류 이름·서류 제목은 shared-order-defs.js 한 곳에만 있고, 두 앱이 그 값을 그대로 쓴다(값은 기존과 동일).
// 한계: 이름/순서만 한 곳. '필요한 발주·끝났나' 규칙은 DB 함수와 JS에 아직 따로(N-165 P4).
const path = require('path'); const fs = require('fs');
const { launchBrowser, startServer, blockRealNetwork } = require('./_helpers');
async function main() {
  const dir = path.resolve(__dirname, '..'); const port = 30894;
  const server = await startServer(dir, port); const browser = await launchBrowser();
  const log = []; const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + d));
  // 1. 소스 검사: 정의 파일 밖에 옛 사본이 없어야 함
  const files = ['est-doc-vendor-ui.js', 'est-doc-vendor.js', 'est-utils.js', 'dash-api-settings.js', 'dash-customer-order.js'];
  const bad = [];
  files.forEach(f => { const s = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    [/label: '(원단|캔가공소\(제작\)|레일·자재|블라인드) 발주서'/, /fabric: '원단[^']*'\s*,\s*production/, /production: '제작', material: '(레일|자재)'/, /label: '(원단|제작|블라인드|자재) 발주'/, /\['fabric', 'production', 'material', 'blind'\]/, /label: '(원단|제작|블라인드|자재)' *\}/].forEach(re => { if (re.test(s)) bad.push(f + ' ' + re); }); });
  ok('1. 정의 파일 밖(5개 파일)에 발주 종류 이름·목록 옛 사본이 없다', bad.length === 0, bad.join(' | '));
  const defsSrc = fs.readFileSync(path.join(dir, 'shared-order-defs.js'), 'utf8');
  ok('2. 정의 파일에 4종(fabric/production/material/blind)이 있다', ['fabric', 'production', 'material', 'blind'].every(k => defsSrc.includes("key: '" + k + "'")), '');
  // 3~. 실제 값(두 앱)
  async function vals(file) {
    const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await blockRealNetwork(page);
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 15000 }); await new Promise(r => setTimeout(r, 700));
    const r = await page.evaluate(() => ({ keys: dahOrderKeys(), doc: dahOrderMap('docTitle'), status: dahOrderMap('statusName'), notice: dahOrderMap('noticeName'), empty: dahOrderMap('emptyName'),
      vendorCats: typeof VENDOR_CATEGORIES !== 'undefined' ? VENDOR_CATEGORIES.map(c => c.key + ':' + c.label).join(',') : null }));
    r.errs = errs; await page.close(); return r;
  }
  const est = await vals('dah-estimate.html'), dash = await vals('dah-dashboard.html');
  const same = JSON.stringify([est.keys, est.doc, est.status, est.notice, est.empty]) === JSON.stringify([dash.keys, dash.doc, dash.status, dash.notice, dash.empty]);
  ok('3. 두 앱이 같은 정의를 쓴다(키·서류 제목·이름 모두 동일)', same, JSON.stringify([est.keys, dash.keys]));
  ok('4. 값이 기존과 동일(서류 제목·상태 이름·안내 이름·빈 안내 이름)', JSON.stringify(est.keys) === '["fabric","production","material","blind"]' && est.doc.production === '캔가공소(제작) 발주서' && est.doc.material === '레일·자재 발주서' && est.status.material === '자재' && est.notice.material === '레일' && est.empty.production === '캔가공소(제작)', JSON.stringify(est));
  ok('5. 대시보드 거래처 구분 이름이 기존과 동일', dash.vendorCats === 'fabric:원단,production:제작,blind:블라인드,material:자재,install:실측·시공', String(dash.vendorCats));
  ok('6. JS 에러 없음', est.errs.length === 0 && dash.errs.length === 0, est.errs.concat(dash.errs).join(';'));
  log.forEach(l => console.log(l)); await browser.close(); server.kill();
  process.exit(log.some(l => l.startsWith('❌')) ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 60000);
