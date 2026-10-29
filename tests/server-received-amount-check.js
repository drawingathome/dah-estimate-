// 근본 수정(2026-10-24): 받은 금액/미수금은 서버(customer_money_status) 값을 쓰고, 서버값이 없거나 낡으면 기기 계산.
// 사고 재현: 이 기기의 견적서 복사본에 잔금·추가결제가 빠져 있어도(낡음) 서버값이 있으면 완납으로 보여야 함.
const vm = require('vm'), fs = require('fs'), path = require('path');
const dir = path.resolve(__dirname, '..');
const stale = [{ id: 'e1', clientId: 262, price: 586000, depositAmount: 324500, depositDate: '2026-10-12', balanceAmount: 0, balanceDate: '' }]; // 잔금 261,500이 빠진 낡은 복사본
const ctx = { console, localStorage: { getItem: (k) => k === 'dah_saved' ? JSON.stringify(stale) : '[]', setItem() {} }, document: { getElementById: () => null }, Date, Math, JSON, Number, parseInt, Array, Object, String, Boolean, setTimeout, clearTimeout,
  DAH_PRE_CONTRACT_STAGES: ['방문예약', '상담', '가견적'], DAH_POST_CONTRACT_STAGES: ['선금결제', '실측준비중', '확정견적', '잔금결제', '시공준비중', '시공완료'] };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['dash-utils.js']) { try { vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }); } catch (e) { console.log('로드 경고', e.message); } }
const log = []; const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (d ? ' — ' + d : ''));
const c = { id: 262, clientName: '시험르', stage: '시공준비중', price: 586000, depositAmount: 324500, balanceAmount: 261500 };
const unpaid = () => ctx.getUnpaidAmount(c);
ctx.sbXHR = (m, p, d, cb) => cb(null, [{ customer_id: 262, price: 586000, received: 586000, unpaid: 0 }]);
vm.runInContext('1', ctx);
ok('1. 서버값이 없으면(낡은 복사본) 기기 계산: 미수금 261,500 — 이게 사고 상황', unpaid() === 261500, String(unpaid()));
let changedFlag = null; ctx.refreshServerMoney((ch) => { changedFlag = ch; });
ok('2. 서버값을 받으면 완납(미수금 0)으로 보임', unpaid() === 0 && ctx.getReceivedAmount(c) === 586000, String(unpaid()));
ok('3. 처음 받아올 땐 "바뀜"으로 알려 화면을 다시 그리게 함', changedFlag === true);
ctx.refreshServerMoney((ch) => { changedFlag = ch; });
ok('4. 같은 값을 다시 받으면 "안 바뀜"(불필요한 재렌더 방지)', changedFlag === false);
ctx.invalidateServerMoney();
ok('5. 무효화하면 서버값을 안 씀(고객 정보가 방금 바뀐 경우)', unpaid() === 261500, String(unpaid()));
ctx.refreshServerMoney(() => {});
vm.runInContext('_srvMoney.at = Date.now() - 999999', ctx);
ok('6. 오래된 서버값은 무시', unpaid() === 261500);
ctx.sbXHR = (m, p, d, cb) => cb({ status: 500 }, null);
ctx.refreshServerMoney(() => {});
ok('7. 서버 오류여도 기기 계산으로 계속 동작', unpaid() === 261500);
ctx.sbXHR = (m, p, d, cb) => cb(null, [{ customer_id: 999, price: 1, received: 1, unpaid: 0 }]);
ctx.refreshServerMoney(() => {});
ok('8. 서버 목록에 없는 고객은 기기 계산으로 대체', unpaid() === 261500);
// 재발 감시: 기기 복사본과 서버값이 어긋나면 기록(1시간에 1회)
const events = [];
ctx.loadCustomers = () => [c];
ctx.logEvent = (type, d) => events.push({ type, d });
ctx.sbXHR = (m, p, d, cb) => cb(null, [{ customer_id: 262, price: 586000, received: 586000, unpaid: 0 }]);
ctx.refreshServerMoney(() => {});
ok('9. 복사본이 낡아 서버값과 다르면 money_mismatch 기록', events.length === 1 && events[0].type === 'money_mismatch' && events[0].d.n === 1, JSON.stringify(events));
ctx.refreshServerMoney(() => {});
ok('10. 1시간 안에는 다시 기록하지 않음', events.length === 1);
vm.runInContext('_moneyMismatchLoggedAt = 0', ctx);
stale[0].balanceAmount = 261500; // 복사본이 최신이 되면
ctx.refreshServerMoney(() => {});
ok('11. 복사본이 서버값과 같으면 기록하지 않음', events.length === 1);
log.forEach(l => console.log(l)); const f = log.filter(l => l.startsWith('❌')); console.log(f.length ? '\n실패 ' + f.length + '건' : '\n전체 통과'); process.exit(f.length ? 1 : 0);
