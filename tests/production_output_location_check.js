const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9890;
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

  const r = await page.evaluate(() => {
    window._dahVendorListRaw = [
      { name: '캔가공소', categories: ['production'], productionOutputLocation: '시공팀 시공 (유지철 팀장님)' },
      { name: '디테라', categories: ['fabric'] },
      { name: '윈텍', categories: ['blind'] },
      { name: '목성', categories: ['material'] }
    ];
    window._vendorArrivalLocations = {};
    window._vendorArrivalDates = {};
    var groups = {
      '캔가공소': [{ orderCategory: 'production' }],
      '디테라': [{ orderCategory: 'fabric' }],
      '윈텍': [{ orderCategory: 'blind' }],
      '목성': [{ orderCategory: 'material' }]
    };
    applyVendorArrivalDefaults(groups);
    return {
      production: window._vendorArrivalLocations['캔가공소'],
      fabric: window._vendorArrivalLocations['디테라'],
      blind: window._vendorArrivalLocations['윈텍'],
      material: window._vendorArrivalLocations['목성']
    };
  });

  ok('1. 캔가공소 자체 발주서 도착장소 = 시공팀 시공(유지철 팀장님)', r.production === '시공팀 시공 (유지철 팀장님)', r.production);
  ok('2. 원단(fabric) 도착장소는 시공팀시공으로 안 바뀜(별개 필드 분리 확인)', r.fabric !== '시공팀 시공 (유지철 팀장님)', r.fabric);
  ok('3. 블라인드 도착장소도 안 바뀜', r.blind !== '시공팀 시공 (유지철 팀장님)', r.blind);
  ok('4. 레일(material) 도착장소도 안 바뀜', r.material !== '시공팀 시공 (유지철 팀장님)', r.material);
  ok('5. 원단/블라인드/레일은 여전히 서로 같은(캔가공소 수신) 주소로 통일됨', r.fabric === r.blind && r.blind === r.material, JSON.stringify({fabric:r.fabric, blind:r.blind, material:r.material}));

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
