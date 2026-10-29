// N-44 재발 방지: 견적이 2건 이상인 고객(고객 전체 계약금 ≠ 이 견적 계약금)을 열 때
// 계약금 칸이 '이 견적 자체의 입금'이어야 한다(고객 합계가 덮어쓰면 안 됨).
// 경로: ①loadEstDbId 수정 ②같은 고객의 다른 견적 ③복사(copy) ④loadCustId(고객 불러오기) ⑤1건 고객 대조군 3종(입금 있음/없음/고객만 입금)
const path = require('path');
const { launchBrowser, startServer, loginAs, setupValidSession } = require('./_helpers');

const H = { 'Access-Control-Allow-Origin': '*' };
const EST = {
  'multi-a': { id: 'multi-a', customer_name: '시험다건', phone: '01090001001', price: 3099000, deposit_amount: 1559000, balance_amount: 0, line_items: [], estimate_status: 'final', confirmed_at: '2026-10-01T00:00:00Z', client_id: 777, created_at: '2026-10-02T00:00:00Z' },
  'multi-b': { id: 'multi-b', customer_name: '시험다건', phone: '01090001001', price: 1763000, deposit_amount: 1763000, balance_amount: 0, line_items: [], estimate_status: 'final', confirmed_at: '2026-10-01T00:00:00Z', client_id: 777, created_at: '2026-10-01T00:00:00Z' },
  'single-paid': { id: 'single-paid', customer_name: '시험단건', phone: '01090001002', price: 2000000, deposit_amount: 1000000, balance_amount: 0, line_items: [], estimate_status: 'final', confirmed_at: '2026-10-01T00:00:00Z', client_id: 778, created_at: '2026-10-01T00:00:00Z' },
  'single-none': { id: 'single-none', customer_name: '시험무입금', phone: '01090001003', price: 1000000, deposit_amount: 0, balance_amount: 0, line_items: [], estimate_status: 'ga', client_id: 779, created_at: '2026-10-01T00:00:00Z' },
};
let failEst = false;
const CUST = {
  777: { id: 777, client_name: '시험다건', phone: '01090001001', addr: '서울 서초구', deposit_amount: 3322000, measure_date: null, install_date: null },
  778: { id: 778, client_name: '시험단건', phone: '01090001002', addr: '서울 서초구', deposit_amount: 1000000, measure_date: null, install_date: null },
  780: { id: 780, client_name: '시험신규', phone: '01090001004', addr: '서울 서초구', deposit_amount: 500000, measure_date: null, install_date: null },
  779: { id: 779, client_name: '시험무입금', phone: '01090001003', addr: '서울 서초구', deposit_amount: 0, measure_date: null, install_date: null },
};

async function run() {
  const dir = path.resolve(__dirname, '..');
  const port = 9941;
  const server = await startServer(dir, port);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' } }); return; }
      let m = url.match(/\/estimates\?id=eq\.([^&]+)/);
      if (m && EST[decodeURIComponent(m[1])]) { req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([EST[decodeURIComponent(m[1])]]) }); return; }
      m = url.match(/\/estimates\?client_id=eq\.(\d+)/);
      if (m && failEst) { req.respond({ status: 401, contentType: 'application/json', headers: H, body: JSON.stringify({ message: 'JWT expired', code: 'PGRST301' }) }); return; }
      if (m) {
        const cid = Number(m[1]);
        const rows = Object.values(EST).filter(e => e.client_id === cid).sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
        req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(url.includes('limit=1') ? rows.slice(0, 1) : rows) }); return;
      }
      m = url.match(/\/customers\?id=eq\.(\d+)/);
      if (m && CUST[Number(m[1])]) { req.respond({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify([CUST[Number(m[1])]]) }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' });
      return;
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) { req.continue(); } else { req.abort(); }
  });
  await page.setViewport({ width: 1280, height: 1400 });

  const log = [];
  function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

  async function open(query) {
    await page.goto(`http://localhost:${port}/dah-estimate.html?${query}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500));
    await loginAs(page, 'master');
    await setupValidSession(page);
    await new Promise(r => setTimeout(r, 1500));
    // 4초 뒤 재적용(setTimeout)까지 지난 뒤의 최종 값을 본다
    await new Promise(r => setTimeout(r, 4500));
    return page.evaluate(() => {
      const d = document.getElementById('deposit-input');
      const dd = document.getElementById('sum-deposit-disp');
      const bd = document.getElementById('sum-balance-disp');
      return { dep: d ? d.value : '없음', source: d ? d.dataset.depositSource || '' : '', sumDep: dd ? dd.textContent : '', sumBal: bd ? bd.textContent : '' };
    });
  }
  const has = (s, n) => String(s).replace(/[^0-9]/g, '').indexOf(String(n)) !== -1;
  const digits = s => String(s).replace(/[^0-9]/g, '');

  let r = await open('loadEstDbId=multi-a&mode=edit');
  ok('1. [핵심] 견적 2건 고객: 견적 A를 열면 계약금 칸이 이 견적 입금(1,559,000)', digits(r.dep) === '1559000', JSON.stringify(r));
  ok('2. 고객 합계(3,322,000)가 계약금 칸에 들어가지 않음', digits(r.dep) !== '3322000' && !has(r.sumDep, 3322000), JSON.stringify(r));

  r = await open('loadEstDbId=multi-b&mode=edit');
  ok('3. 같은 고객의 견적 B(완납)는 자기 입금(1,763,000)', digits(r.dep) === '1763000', JSON.stringify(r));

  r = await open('loadEstDbId=multi-a&mode=copy');
  ok('4. 복사(copy)는 새 견적이므로 고객 합계(3,322,000)도 원본 입금(1,559,000)도 계약금에 들어가지 않음(빈 칸)', digits(r.dep) === '', JSON.stringify(r));

  r = await open('loadCustId=777&loadCustName=' + encodeURIComponent('시험다건'));
  ok('5. 고객 불러오기(loadCustId): 최신 견적(A) 입금(1,559,000), 고객 합계 아님', digits(r.dep) === '1559000', JSON.stringify(r));

  r = await open('loadEstDbId=single-paid&mode=edit');
  ok('6. [회귀 대조] 1건 고객·입금 있음: 계약금 1,000,000 그대로', digits(r.dep) === '1000000', JSON.stringify(r));

  r = await open('loadEstDbId=single-none&mode=edit');
  ok('7. [회귀 대조] 1건 고객·입금 없음: 계약금 칸 비어 있음(자동 50% 유지)', !r.dep || r.dep === '' || digits(r.dep) === '', JSON.stringify(r));


  // N-47: 고객 불러오기 모달(loadCustByIdx) - 이 기기 로컬 견적 캐시(dah_saved)가 비어 있는 경우(새 폰·다른 기기)
  async function modal(cust) {
    await page.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500));
    await loginAs(page, 'master');
    await setupValidSession(page);
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate((c) => {
      localStorage.setItem('dah_customers', JSON.stringify([c]));
      localStorage.setItem('dah_saved', '[]');
      loadCustByIdx({ getAttribute: function () { return '0'; } });
    }, cust);
    await new Promise(r => setTimeout(r, 6500));
    return page.evaluate(() => {
      const d = document.getElementById('deposit-input');
      return { dep: d ? d.value : '없음' };
    });
  }
  r = await modal({ id: 777, clientName: '시험다건', phone: '01090001001', addr: '서울 서초구', depositAmount: 3322000 });
  ok('8. [N-47 점검] 고객 불러오기 모달·로컬 캐시 없음·견적 2건 고객: 최신 견적 입금(1,559,000), 고객 합계 아님', digits(r.dep) === '1559000', JSON.stringify(r));
  r = await modal({ id: 780, clientName: '시험신규', phone: '01090001004', addr: '서울 서초구', depositAmount: 500000 });
  ok('9. [현재 동작 기록] 고객 불러오기 모달·견적이 하나도 없는 신규 고객: 계약금 빈 칸(불러오기가 폼을 초기화하므로). 바꾸려면 의도적으로 이 시험도 함께 고칠 것', digits(r.dep) === '', JSON.stringify(r));

  // N-48: 견적 조회가 오류 JSON(401)으로 실패해도 고객 합계(3,322,000)가 계약금에 들어가면 안 됨
  failEst = true;
  r = await open('loadCustId=777&loadCustName=' + encodeURIComponent('시험다건'));
  failEst = false;
  ok('10. [N-48] loadCustId에서 견적 조회가 401 오류 JSON이면 고객 합계(3,322,000)를 계약금에 넣지 않음(빈 칸)', digits(r.dep) === '', JSON.stringify(r));
  console.log('JS 에러:', jsErrors.length === 0 ? '✅ 없음' : '❌ ' + jsErrors.join('; '));
  log.forEach(l => console.log(l));
  const failed = log.filter(l => l.startsWith('❌'));
  console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');
  await browser.close();
  server.kill();
  process.exit(failed.length === 0 && jsErrors.length === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => process.exit(1), 90000);
