const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9891;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await blockRealNetwork(page);
  await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  await loginAs(page, 'master');
  await new Promise(r => setTimeout(r, 1000));

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  function setupVendors() {
    window._dahVendorListRaw = [
      { name: '캔가공소', categories: ['production'], fabricArrivalLabel: '캔가공소', railBlindArrivalLabel: '캔가공소 유지철 팀장님' },
      { name: '디테라', categories: ['fabric'] }
    ];
  }

  // 1) 시공팀장 이름을 "김민수 팀장님"으로 넣은 건 → 그 이름 그대로 반영
  let r = await page.evaluate((fn) => {
    eval('(' + fn + ')')();
    document.getElementById('c-installer-name').value = '김민수 팀장님';
    window._vendorArrivalLocations = {};
    window._vendorArrivalDates = {};
    var groups = { '캔가공소': [{ orderCategory: 'production' }], '디테라': [{ orderCategory: 'fabric' }] };
    applyVendorArrivalDefaults(groups);
    return { production: window._vendorArrivalLocations['캔가공소'], fabric: window._vendorArrivalLocations['디테라'] };
  }, setupVendors.toString());
  ok('1. 시공팀장이 "김민수 팀장님"이면 그 이름 그대로 반영', r.production === '시공팀 시공 (김민수 팀장님)', r.production);
  ok('2. 원단 도착지는 시공팀장 이름과 무관하게 그대로 "캔가공소"', r.fabric === '캔가공소', r.fabric);

  // 2) 다른 건은 "박영희 팀장님" → 그 건에서는 그 이름으로 바뀜(고정값 아님 확인)
  r = await page.evaluate(() => {
    document.getElementById('c-installer-name').value = '박영희 팀장님';
    window._vendorArrivalLocations = {};
    window._vendorArrivalDates = {};
    var groups = { '캔가공소': [{ orderCategory: 'production' }] };
    applyVendorArrivalDefaults(groups);
    return window._vendorArrivalLocations['캔가공소'];
  });
  ok('3. 다른 건에서 시공팀장이 바뀌면 도착장소도 그 이름으로 바뀜(고정값 아님)', r === '시공팀 시공 (박영희 팀장님)', r);

  // 3) 시공팀장을 아직 안 정한 이른 단계(빈 값) → 이름 없이 일반 문구만
  r = await page.evaluate(() => {
    document.getElementById('c-installer-name').value = '';
    window._vendorArrivalLocations = {};
    window._vendorArrivalDates = {};
    var groups = { '캔가공소': [{ orderCategory: 'production' }] };
    applyVendorArrivalDefaults(groups);
    return window._vendorArrivalLocations['캔가공소'];
  });
  ok('4. 시공팀장 미정이면 이름 없이 "시공팀 시공"만 표시', r === '시공팀 시공', r);

  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');

  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 30000);
