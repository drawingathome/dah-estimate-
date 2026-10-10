// 이영욱 사례: 받은 돈(선금 1,200,000)이 총액(982,000)보다 커도 성과매출이 총액(862,000)을 넘으면 안 됨 (순수 계산 검사, 브라우저 불필요)
const vm = require('vm'), fs = require('fs'), path = require('path');
const dir = path.resolve(__dirname, '..');
const ctx = { console, localStorage: { getItem: () => '[]', setItem() {} }, document: { getElementById: () => null }, Date, Math, JSON, Number, parseInt, Array, Object, String,
  DAH_PRE_CONTRACT_STAGES: [], DAH_POST_CONTRACT_STAGES: [] };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['dash-utils.js', 'dash-chart.js']) { try { vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }); } catch (e) { /* 상수 미정의 등은 무시 */ } }
const log = [];
function ok(label, cond, d) { log.push((cond ? '✅ ' : '❌ ') + label + (d ? ' — ' + d : '')); }
function mk(price, perf, dep, bal) { return { id: 1, clientName: 't', stage: '실측준비중', price, performanceRevenue: perf, depositAmount: dep, balanceAmount: bal, depositDate: '2026-10-05', balanceDate: bal ? '2026-10-20' : '', estimates: [{ id: 'e', price, depositAmount: dep, depositDate: '2026-10-05', balanceAmount: bal, balanceDate: bal ? '2026-10-20' : '', estimateStatus: 'ga' }] }; }
const sum = (parts, k) => parts.reduce((a, p) => a + p[k], 0);
let p = ctx.splitCustomerPayments(mk(982000, 862000, 1200000, 0));
ok('1. 선금이 총액보다 커도 성과매출은 862,000원을 넘지 않음', Math.round(sum(p, 'perf')) === 862000, JSON.stringify(p));
ok('2. 입금(revenue)은 실제 받은 1,200,000원 그대로', sum(p, 'revenue') === 1200000);
p = ctx.splitCustomerPayments(mk(982000, 862000, 500000, 482000));
ok('3. 정상(선금+잔금=총액)은 성과매출 합이 정확히 862,000원', Math.round(sum(p, 'perf')) === 862000, JSON.stringify(p));
p = ctx.splitCustomerPayments(mk(982000, 862000, 750000, 0));
ok('4. 선금만 일부 들어오면 비율만큼만(750,000/982,000)', Math.round(sum(p, 'perf')) === Math.round(862000 * 750000 / 982000));
p = ctx.splitCustomerPayments(mk(1000000, 900000, 800000, 400000));
ok('5. 선금+잔금이 총액을 넘어도 성과매출 합은 900,000원 이하', Math.round(sum(p, 'perf')) <= 900000, JSON.stringify(p));
log.forEach(l => console.log(l));
const failed = log.filter(l => l.startsWith('❌'));
console.log(failed.length ? '\n실패 ' + failed.length + '건' : '\n전체 통과');
process.exit(failed.length ? 1 : 0);
