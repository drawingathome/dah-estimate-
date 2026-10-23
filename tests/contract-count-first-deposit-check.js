// 계약 수 = 선금이 처음 입금된 달 기준 (고객 등록일 아님)
const vm = require('vm'), fs = require('fs'), path = require('path');
const dir = path.resolve(__dirname, '..');
const ctx = { console, localStorage: { getItem: () => '[]', setItem() {} }, document: { getElementById: () => null }, Date, Math, JSON, Number, parseInt, Array, Object, String, Boolean, setTimeout, clearTimeout,
  DAH_PRE_CONTRACT_STAGES: [], DAH_POST_CONTRACT_STAGES: [] };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['dash-utils.js', 'dash-chart.js']) { try { vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }); } catch (e) {} }
const log = []; const ok = (l, c, d) => log.push((c ? '✅ ' : '❌ ') + l + (d ? ' — ' + d : ''));
ctx.PRE_CONTRACT_STAGES = ['방문예약', '상담', '가견적'];
const E = {
  1: [{ depositAmount: 100, depositDate: '2026-10-03', balanceAmount: 0 }],               // 10월 선금
  2: [{ depositAmount: 100, depositDate: '2026-09-20', balanceAmount: 100, balanceDate: '2026-10-05' }], // 9월 선금, 10월 잔금
  3: [{ depositAmount: 0, balanceAmount: 0 }],                                              // 입금 없음
  4: [{ depositAmount: 100, depositDate: '2026-09-28', balanceAmount: 0 }, { depositAmount: 100, depositDate: '2026-10-02', balanceAmount: 0 }], // 견적 2건: 가장 이른 선금=9월
};
ctx.getAllEstPays = (c) => E[c.id] || [];
ctx.splitCustomerPayments = (c) => (E[c.id] || []).filter(e => e.depositAmount > 0).map(e => ({ date: e.depositDate, revenue: 1, perf: 1 }));
const C = (id, stage, date) => ({ id, stage, date: date || '2026-01-01' });
const cs = [C(1, '선금결제', '2026-08-01'), C(2, '잔금결제', '2026-10-01'), C(3, '선금결제', '2026-10-01'), C(4, '선금결제', '2026-10-01'), C(5, '가견적', '2026-10-01')];
ok('1. 10월 계약 = 1명(선금이 10월인 고객 1; 등록일은 무시)', ctx.getMonthContractCount(cs, '2026-10') === 1, String(ctx.getMonthContractCount(cs, '2026-10')));
ok('2. 9월 계약 = 2명(고객 2, 4)', ctx.getMonthContractCount(cs, '2026-09') === 2);
ok('3. 입금 없는 고객·계약 전 단계는 제외', ctx.getMonthContractCount([cs[2], cs[4]], '2026-10') === 0);
log.forEach(l => console.log(l)); const f = log.filter(l => l.startsWith('❌')); console.log(f.length ? '\n실패 ' + f.length + '건' : '\n전체 통과'); process.exit(f.length ? 1 : 0);
