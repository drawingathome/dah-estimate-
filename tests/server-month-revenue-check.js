// 근본 수정(2026-10-23): 진행 중인 달 매출은 서버(month_revenue_detail) 값을 쓰고, 서버값이 없거나 낡으면 기기 계산, 마감월/교차검증(ignoreClosed)은 영향 없음
const vm = require('vm'), fs = require('fs'), path = require('path');
const dir = path.resolve(__dirname, '..');
const ctx = { console, localStorage: { getItem: () => '[]', setItem() {} }, document: { getElementById: () => null }, Date, Math, JSON, Number, parseInt, Array, Object, String, Boolean, setTimeout, clearTimeout,
  DAH_PRE_CONTRACT_STAGES: [], DAH_POST_CONTRACT_STAGES: [] };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['dash-utils.js', 'dash-chart.js']) { try { vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }); } catch (e) { /* 상수 미정의 등 무시 */ } }
const log = [];
function ok(l, c, d) { log.push((c ? '✅ ' : '❌ ') + l + (d ? ' — ' + d : '')); }
const cust = [{ id: 1, staffName: '오지은', stage: '실측준비중' }, { id: 2, staffName: '마스터', stage: '실측준비중' }];
ctx.getClosedMonth = () => null;
ctx.splitCustomerPayments = () => [{ date: '2026-10-05', revenue: 111, perf: 100, isRefund: false }];
ok('1. 서버값 없으면 기기 계산(100)', ctx.getMonthPerformanceRevenue(cust, '2026-10') === 200);
vm.runInContext("_srvMonthDetail['2026-10']={at:Date.now(),rows:[{customer_id:1,revenue:500,perf:400},{customer_id:2,revenue:50,perf:40},{customer_id:99,revenue:7,perf:7}]}", ctx);
ok('2. 서버값이 있으면 서버 성과매출(고객 1,2만 합산=440)', ctx.getMonthPerformanceRevenue(cust, '2026-10') === 440);
ok('3. 서버 매출(550)', ctx.getMonthRevenue(cust, '2026-10') === 550);
ok('4. 권한 필터된 고객만(오지은 1명=400)', ctx.getMonthPerformanceRevenue([cust[0]], '2026-10') === 400);
ok('5. ignoreClosed(교차검증)는 서버값 안 씀(200)', ctx.getMonthPerformanceRevenue(cust, '2026-10', true) === 200);
const st = ctx.getMonthStaffPerformance(cust, '2026-10');
ok('6. 담당자별 금액은 서버값(오지은400/마스터40), 건수는 유지', st['오지은'].rev === 400 && st['마스터'].rev === 40 && st['오지은'].count === 1, JSON.stringify(st));
vm.runInContext("_srvMonthDetail['2026-10'].at=Date.now()-999999", ctx);
ok('7. 오래된 서버값은 무시(기기 계산 200)', ctx.getMonthPerformanceRevenue(cust, '2026-10') === 200);
ctx.getClosedMonth = () => ({ revenue: 9, perf_revenue: 8 });
vm.runInContext("_srvMonthDetail['2026-10'].at=Date.now()", ctx);
ok('8. 마감월은 저장값 우선(8)', ctx.getMonthPerformanceRevenue(cust, '2026-10') === 8);
ctx.getClosedMonth = () => null;
ctx.invalidateServerMonthDetail();
ok('9. 무효화하면 서버값 안 씀(200)', ctx.getMonthPerformanceRevenue(cust, '2026-10') === 200);
log.forEach(l => console.log(l));
const f = log.filter(l => l.startsWith('❌'));
console.log(f.length ? '\n실패 ' + f.length + '건' : '\n전체 통과');
process.exit(f.length ? 1 : 0);
