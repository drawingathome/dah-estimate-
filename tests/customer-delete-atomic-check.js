// N-113 고객 완전삭제 한 번에 처리 시험: ①DB 함수(dah_delete_customer)가 있으면 그 함수 한 번만 부르고 견적서를 따로 지우지 않음
// ②함수가 아직 없으면(404) 예전 방식(견적서→고객)으로 대체 ③발주 기록 등으로 막히면 '아무것도 지워지지 않았다'는 안내 + 고객이 목록에 그대로 남음
// ④권한 없음/이미 삭제됨도 같은 안내. (반쪽 삭제 방지: 앱이 견적서를 먼저 지워 버리면 고객 삭제가 막혀도 견적서가 사라짐)
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0; const ok = (c, m, d) => { console.log((c ? '✅ ' : '❌ ') + m + (c ? '' : ' — ' + (d || ''))); if (!c) fail++; };
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const server = await startServer(path.resolve(__dirname, '..'), 27161); const browser = await launchBrowser();
  try {
    const page = await browser.newPage(); await blockRealNetwork(page);
    await page.goto('http://localhost:27161/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
    const r = await page.evaluate(async () => {
      const out = {}; let calls = []; let mode = 'ok'; const toasts = [];
      window.showToast = (m) => toasts.push(m); window.confirm = () => true; window.prompt = (q) => '삭제시험';
      window.closeDetail = function () {}; window.renderHome = function () {};
      window.sbXHR = function (m, p, d, cb) {
        calls.push(m + ' ' + p.split('?')[0]);
        if (p.indexOf('rpc/dah_delete_customer') === 0) {
          if (mode === 'ok') return cb(null, { estimates_deleted: 2, customers_deleted: 1 });
          if (mode === 'norpc') return cb({ status: 404, text: '{"code":"PGRST202","message":"Could not find the function public.dah_delete_customer"}' }, null);
          if (mode === 'fk') return cb({ status: 409, text: '{"code":"23503","message":"update or delete on table \\"customers\\" violates foreign key constraint \\"dah_purchase_orders_customer_id_fkey\\" on table \\"dah_purchase_orders\\""}' }, null);
          if (mode === 'perm') return cb({ status: 403, text: '{"code":"42501","message":"고객을 삭제할 수 없습니다(권한이 없거나 이미 삭제됨). 견적서도 지우지 않았습니다."}' }, null);
        }
        cb(null, []);
      };
      const mk = () => { saveCustomers([{ id: 9901, clientName: '삭제시험', staffName: '마스터', stage: '상담' }]); return { id: 9901, clientName: '삭제시험', staffName: '마스터' }; };
      const stillThere = () => loadCustomers().some(c => String(c.id) === '9901');
      mode = 'ok'; calls = []; toasts.length = 0; permanentlyDeleteCustomer(mk()); await new Promise(r => setTimeout(r, 150));
      out.a = { calls: calls.slice(), gone: !stillThere(), toast: toasts.join('|') };
      mode = 'norpc'; calls = []; toasts.length = 0; permanentlyDeleteCustomer(mk()); await new Promise(r => setTimeout(r, 150));
      out.b = { calls: calls.slice(), gone: !stillThere() };
      mode = 'fk'; calls = []; toasts.length = 0; permanentlyDeleteCustomer(mk()); await new Promise(r => setTimeout(r, 150));
      out.c = { calls: calls.slice(), there: stillThere(), toast: toasts.join('|') };
      mode = 'perm'; calls = []; toasts.length = 0; permanentlyDeleteCustomer(mk()); await new Promise(r => setTimeout(r, 150));
      out.d = { calls: calls.slice(), there: stillThere(), toast: toasts.join('|') };
      return out;
    });
    ok(r.a.calls.length === 1 && r.a.calls[0] === 'POST rpc/dah_delete_customer', '함수가 있으면 함수 한 번만 부름(견적서를 따로 지우지 않음)', JSON.stringify(r.a.calls));
    ok(r.a.gone && /완전히 삭제/.test(r.a.toast), '성공하면 목록에서 사라지고 완료 안내', JSON.stringify(r.a));
    ok(r.b.calls.join(',') === 'POST rpc/dah_delete_customer,DELETE estimates,DELETE customers' && r.b.gone, '함수가 아직 없으면(404) 예전 방식으로 대체되어 삭제됨', JSON.stringify(r.b));
    ok(r.c.calls.join(',') === 'POST rpc/dah_delete_customer' && r.c.there, '발주 기록 등으로 막히면 견적서 삭제 요청 없이 끝나고 고객이 목록에 남음', JSON.stringify(r.c));
    ok(/발주/.test(r.c.toast) && /지워지지 않았/.test(r.c.toast), '막힌 이유(발주 기록)와 "아무것도 지워지지 않았어요" 안내', r.c.toast);
    ok(r.d.there && /권한|이미/.test(r.d.toast) && /지워지지 않았/.test(r.d.toast), '권한 없음/이미 삭제됨 안내 + 아무것도 안 지워짐', JSON.stringify(r.d));
  } catch (e) { ok(false, '시험 실행 오류', e.message); }
  await browser.close(); server.kill && server.kill();
  console.log(fail ? '\n❌ 실패 ' + fail + '건' : '\n✅ 전부 통과'); process.exit(fail ? 1 : 0);
})();
