// tests/public-view-id-clean-check.js
// 2026-10-30(선혜님 폰: 드린 공개 링크가 "견적서를 찾을 수 없어요"): 서버는 정상인데 주소 끝에 점·공백·따옴표·한글 조사 등이 붙거나
// 대문자로 바뀐 번호도 같은 안내가 뜰 수 있음 → 주소의 view 값에서 견적 번호(UUID) 모양만 뽑아 써야 한다.
const path = require('path'), fs = require('fs');
const { launchBrowser, startServer } = require('./_helpers');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
const ROOT = path.resolve(__dirname, '..');
const ID = '307864ed-3ded-4c9f-bdb5-ed8e1cd5431c';
const items = [{ type: 'curtain', space: '거실', displayName: '시험 원단', mw: '300', mh: '264', pnum: '4', price: 45000, amt: '180,000원', pleatType: '나비주름형', openType: '양개형', hemType: '8cm' }];
(async () => {
  const server = await startServer(ROOT, 9972); const browser = await launchBrowser();
  const cases = [['번호만', ID], ['끝에 점', ID + '.'], ['끝에 공백', ID + '%20'], ['앞뒤 따옴표', '%22' + ID + '%22'], ['대문자', ID.toUpperCase()], ['끝에 한글 글자', ID + '%EC%9E%85%EB%8B%88%EB%8B%A4']];
  for (const [label, q] of cases) {
    const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844, isMobile: true });
    let sent = null;
    await page.setRequestInterception(true);
    page.on('request', req => { const u = req.url(), h = { 'Access-Control-Allow-Origin': '*' };
      if (req.method() === 'OPTIONS' && u.includes('supabase.co')) return req.respond({ status: 204, headers: { ...h, 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } });
      if (u.includes('/rpc/get_public_estimate')) { try { sent = JSON.parse(req.postData() || '{}').p_id; } catch (e) {}
        return req.respond({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify(sent === ID ? [{ customer_name: '시험가', phone: '01090000001', staff_name: '장선혜', estimate_status: 'ga', install_date: '', line_items: items }] : []) }); }
      if (u.includes('logo.png')) return req.respond({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(ROOT, 'logo.png')) });
      if (u.includes('supabase.co') || u.includes('script.google.com')) return req.abort(); req.continue(); });
    await page.goto('http://localhost:9972/dah-estimate.html?view=' + q, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() => { var c = document.getElementById('public-view-container'); return c && (c.querySelector('.pv-prod-table') || /찾을 수 없/.test(c.textContent || '')); }, { timeout: 8000 }).catch(() => {});
    const txt = await page.evaluate(() => { const c = document.getElementById('public-view-container'); return c.querySelector('.pv-prod-table') ? '표 있음(견적서 열림)' : (c.textContent || '').slice(0, 80); });
    ok('주소 형태: ' + label + ' → 서버에는 깨끗한 번호만 보냄', sent === ID, String(sent));
    ok('주소 형태: ' + label + ' → 견적서가 열림', /견적서 열림/.test(txt), txt);
    await page.close();
  }
  await browser.close(); server.kill && server.kill();
  console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 전부 통과'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
