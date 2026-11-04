// N-79 ㉣ 견적서 삭제 안내·기록 시험: ①삭제 때 누가·언제·무엇을 지웠는지 기록(estimate_deleted)이 서버로 나감(이름 없이 번호·금액만)
// ②삭제 뒤 안내 문구에 서버가 다시 계산한 고객 금액이 나옴 ③확인창에 '남은 견적서 기준 자동 계산' 안내 ④서버 조회 실패 땐 금액 없이 기본 문구 ⑤고객 번호 모르면 기록은 남고 금액 문구 없음
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; };
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 50000);
(async () => {
  const server = await startServer(path.resolve(__dirname, '..'), 27153); const browser = await launchBrowser();
  try {
    const page = await browser.newPage(); await blockRealNetwork(page);
    await page.goto('http://localhost:27153/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
    const r = await page.evaluate(async () => {
      const out = {}; const calls = [];
      saveCustomers([{ id: 9801, clientName: '삭제안내시험', staffName: '마스터', stage: '가견적', price: 11914000, performanceRevenue: 10824000, updatedAt: 'o' }]);
      let failGet = false;
      window.sbXHR = function (m, p, d, cb) {
        calls.push({ m, p: p.split('?')[0], d });
        if (m === 'DELETE') return cb(null, []);
        if (m === 'GET' && p.indexOf('customers?') === 0) return failGet ? cb({ status: 500 }, null) : cb(null, [{ id: 9801, price: 11914000, performance_revenue: 10824000, updated_at: 'n' }]);
        cb(null, []);
      };
      const id = '0a80fb6e-c4cb-4948-a71a-914a60ad751f';
      await new Promise(res => archiveEstimate({ id, clientId: 9801, no: 'DAH-1', price: 24608000, clientName: '비밀이름' }, () => res()));
      out.text1 = estDeleteDoneText(); out.log = calls.find(c => c.p === 'analytics_events'); out.order = calls.map(c => c.m + ' ' + c.p);
      failGet = true; calls.length = 0;
      await new Promise(res => archiveEstimate({ id, clientId: 9801, no: 'DAH-1', price: 1 }, () => res()));
      out.text2 = estDeleteDoneText();
      calls.length = 0;
      await new Promise(res => archiveEstimate({ id, no: 'DAH-1', price: 1 }, () => res()));
      out.text3 = estDeleteDoneText(); out.log3 = calls.find(c => c.p === 'analytics_events');
      out.note = typeof EST_DELETE_CONFIRM_NOTE === 'string' ? EST_DELETE_CONFIRM_NOTE : '';
      return out;
    });
    ok(r.text1 === '완전히 삭제했어요 · 고객 금액 11,914,000원으로 다시 계산됐어요', '삭제 뒤 안내에 서버가 계산한 고객 금액이 나옴: ' + r.text1);
    ok(r.log && r.log.m === 'POST' && r.log.d.event_type === 'estimate_deleted', '삭제 기록(estimate_deleted)이 서버로 나감');
    ok(r.log && r.log.d.event_detail.estimateId === '0a80fb6e-c4cb-4948-a71a-914a60ad751f' && r.log.d.event_detail.clientId === 9801 && r.log.d.event_detail.price === 24608000, '기록에 견적서 번호·고객 번호·금액이 들어감');
    ok(r.log && JSON.stringify(r.log.d).indexOf('비밀이름') === -1 && r.log.d.staff_name === '마스터', '기록에 고객 이름은 없고 작업자(직원 이름)는 있음');
    ok(r.order.indexOf('POST analytics_events') < r.order.indexOf('DELETE estimates'), '기록을 먼저 보내고 그다음 삭제함');
    ok(r.text2 === '완전히 삭제했어요', '서버 조회가 실패하면 금액 없이 기본 문구: ' + r.text2);
    ok(r.text3 === '완전히 삭제했어요' && r.log3, '고객 번호를 모르면 기록은 남고 금액 문구는 없음');
    ok(r.note.indexOf('남은 견적서 기준') !== -1, '확인창 안내 문구에 "남은 견적서 기준 자동 계산"이 있음');
    const src = ['dash-customer-estimates.js', 'dash-render-est.js'].map(f => require('fs').readFileSync(path.resolve(__dirname, '..', f), 'utf8')).join('\n');
    ok((src.match(/confirmEstimateDelete\(/g) || []).length >= 3 && /EST_DELETE_CONFIRM_NOTE/.test(require('fs').readFileSync(path.resolve(__dirname, '..', 'dash-api-writes.js'), 'utf8')) && (src.match(/estDeleteDoneText\(\)/g) || []).length >= 3, '삭제 화면 3곳 모두 안내 문구·완료 문구 공용 함수를 씀');
    ok(!/showToast\('완전히 삭제했어요'\)/.test(src), '옛 고정 문구가 남아있지 않음');
  } finally { await browser.close(); server.kill(); }
  console.log(fail ? '\n❌ 실패 ' + fail : '\n✅ 모두 통과'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
