// tests/dash-save-stage-patch-check.js
// N-142 ②⑤ (2026-11-07): 고객 수정 저장(PATCH)에 대해
//  ② 서버가 저장 중에 단계를 자동으로 옮겼으면(예: 상담→가견적) 화면의 고객 정보도 그 단계로 맞춰져야 한다.
//     안 맞으면 다음 저장이 옛 단계('상담')를 서버로 다시 보내 되돌려 버린다.
//  ⑤ 수정 저장이 중복 거절(409/23505)되면 재시도 대기열에 넣지 않고 안내만 한다(일반 오류 500은 기존대로 대기열).
// 한계: 가짜 서버 시험(실제 DB 트리거는 DB 쪽 시험/롤백 시험으로 별도 확인).
const path = require('path');
const { launchBrowser, startServer, loginAs, blockRealNetwork } = require('./_helpers');
let fail = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; };
setTimeout(() => { console.log('❌ 시간 초과'); process.exit(1); }, 60000);
(async () => {
  const server = await startServer(path.resolve(__dirname, '..'), 27182); const browser = await launchBrowser();
  try {
    const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await blockRealNetwork(page);
    await page.goto('http://localhost:27182/dah-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 700)); await loginAs(page, 'master');
    const r = await page.evaluate(async () => {
      const out = { queued: [], toasts: [], sent: [] };
      let mode = 'moved';
      function FakeXHR() { this.headers = {}; }
      FakeXHR.prototype.open = function (m, u) { this.m = m; this.u = u; };
      FakeXHR.prototype.setRequestHeader = function (k, v) { this.headers[k] = v; };
      FakeXHR.prototype.send = function (body) {
        const self = this;
        try { out.sent.push(JSON.parse(body || '{}')); } catch (e) { out.sent.push({}); }
        setTimeout(function () {
          if (mode === 'moved') { self.status = 200; self.responseText = JSON.stringify([{ id: 9101, updated_at: '2026-11-07T10:00:00+00:00', stage: '가견적' }]); }
          else if (mode === 403) { self.status = 403; self.responseText = '{"code":"42501","message":"마감된 달(2026-09)의 입금 기록은 수정할 수 없습니다. 마스터에게 요청하세요."}'; }
          else if (mode === 'light') { self.status = 200; self.responseText = JSON.stringify([{ id: 9101, updated_at: '2026-11-07T11:00:00+00:00', stage: '가견적' }]); }
          else if (mode === 409) { self.status = 409; self.responseText = '{"code":"23505","message":"duplicate key value violates unique constraint"}'; }
          else { self.status = 500; self.responseText = '{"message":"boom"}'; }
          self.onload && self.onload();
        }, 0);
      };
      window.XMLHttpRequest = FakeXHR;
      window.addToPendingSyncQueue = function (k, m, p) { out.queued.push(m + ' ' + p); };
      window.showToast = function (t) { out.toasts.push(t); };
      const base = () => ({ id: 9101, clientName: '단계시험', phone: '01000009101', staffName: '마스터', stage: '상담', updatedAt: '2026-11-07T09:00:00+00:00', date: '2026-11-01' });
      saveCustomers([base()]);
      // ② 서버가 단계를 옮김
      const c1 = loadCustomers()[0];
      mode = 'moved';
      await new Promise(res => saveCustomerToDb(c1, res));
      out.afterObjStage = c1.stage;
      out.afterCacheStage = loadCustomers().find(x => x.id === 9101).stage;
      out.afterLocalStorageStage = (JSON.parse(localStorage.getItem('dah_customers') || '[]').find(x => x.id === 9101) || {}).stage;
      // 다음 저장이 옛 단계를 다시 보내지 않는지
      out.sent = [];
      await new Promise(res => saveCustomerToDb(c1, res));
      out.nextSentStage = out.sent.length ? out.sent[out.sent.length - 1].stage : null;
      // ⑤ 수정 저장 중복 거절
      const c2 = base(); c2.stage = '상담';
      out.queued = []; out.toasts = []; mode = 409;
      out.r409 = await new Promise(res => saveCustomerToDb(c2, (e) => res({ e: !!e })));
      out.q409 = out.queued.length; out.t409 = out.toasts.slice();
      // 일반 오류는 기존대로 대기열
      out.queued = []; out.toasts = []; mode = 500;
      await new Promise(res => saveCustomerToDb(base(), res));
      out.q500 = out.queued.length;
      // ② 가벼운 PATCH(보관·복귀·담당변경 같은 공용 경로)도 서버가 옮긴 단계를 캐시에 반영해야 함
      saveCustomers([base()]);
      mode = 'light';
      await new Promise(res => sbXHR('PATCH', 'customers?id=eq.9101', { lead_parked: false }, res));
      out.lightStage = loadCustomers().find(x => x.id === 9101).stage;
      // 영구 거절(403/42501 마감월 가드)은 재시도 대기열에 넣지 않고 서버 문구를 그대로 안내
      out.queued = []; out.toasts = []; mode = 403;
      out.r403 = await new Promise(res => saveCustomerToDb(base(), (e) => res({ e: !!e })));
      out.q403 = out.queued.length; out.t403 = out.toasts.slice();
      // 이미 대기열에 쌓인 영구 거절 건은 다음 재시도 때 정리됨
      const key = 'dah_pending_sync_queue';
      out.queueKeyUsed = typeof getPendingSyncQueue === 'function';
      window.addToPendingSyncQueue = undefined;
      return out;
    });
    ok(r.lightStage === '가견적', '② 가벼운 PATCH(보관·복귀·담당변경 공용 경로)도 서버가 옮긴 단계를 캐시에 반영 — ' + r.lightStage);
    ok(r.r403.e === true, '영구 거절(403): 호출한 쪽에 실패로 알려줌');
    ok(r.q403 === 0, '영구 거절(403/42501): 재시도 대기열에 넣지 않음 — ' + r.q403);
    ok(r.t403.some(t => /마감된 달/.test(t)), '영구 거절: 서버가 준 이유(마감된 달…)를 그대로 보여줌 — ' + JSON.stringify(r.t403));
    ok(r.afterObjStage === '가견적', '② 저장 후 화면의 고객 정보가 서버가 옮긴 단계(가견적)로 바뀜 — ' + r.afterObjStage);
    ok(r.afterCacheStage === '가견적', '② 저장 후 고객 목록 캐시도 가견적 — ' + r.afterCacheStage);
    ok(r.afterLocalStorageStage === '가견적', '② 저장 후 이 기기 저장소도 가견적 — ' + r.afterLocalStorageStage);
    ok(r.nextSentStage === '가견적', '② 다음 저장이 옛 단계(상담)를 다시 보내지 않음 — 보낸 단계: ' + r.nextSentStage);
    ok(r.r409.e === true, '⑤ 수정 409: 호출한 쪽에 실패로 알려줌');
    ok(r.q409 === 0, '⑤ 수정 409(중복 거절): 재시도 대기열에 넣지 않음 — ' + r.q409);
    ok(r.t409.some(t => /이미 있어/.test(t)), '⑤ 수정 409: 중복 안내 문구가 뜸 — ' + JSON.stringify(r.t409));
    ok(r.q500 === 1, '⑤ 수정 500(일반 오류): 기존대로 재시도 대기열에 들어감 — ' + r.q500);
    ok(errs.length === 0, '화면 오류(JS) 없음 ' + errs.join(';'));
  } finally { await browser.close(); server.close && server.close(); }
  console.log(fail ? '❌ 실패 ' + fail + '건' : '✅ 모두 통과'); process.exit(fail ? 1 : 0);
})();
