// 담당자별 실적 비교(getStaffComparison / renderChartStaffRank): 숫자 계산과 화면 구성 검사 (브라우저 불필요)
const vm = require('vm'), fs = require('fs'), path = require('path');
const dir = path.resolve(__dirname, '..');
const wrap = { innerHTML: '', appendChild() {} };
const titleEl = { textContent: '' };
const ctx = { console, localStorage: { getItem: () => '[]', setItem() {} },
  document: { getElementById: (id) => id === 'chart-staffrank' ? wrap : id === 'chart-staffrank-title' ? titleEl : null },
  Date, Math, JSON, Number, parseInt, Array, Object, String,
  DAH_PRE_CONTRACT_STAGES: ['상담예약', '가견적'], DAH_POST_CONTRACT_STAGES: ['선금결제', '잔금결제', '시공'] };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['shared-common-utils.js', 'dash-utils.js', 'dash-chart.js']) { try { vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }); } catch (e) { /* 브라우저 전용 코드는 무시 */ } }
ctx.PRE_CONTRACT_STAGES = ['상담예약', '가견적'];
const log = [];
function ok(label, cond, d) { log.push((cond ? '✅ ' : '❌ ') + label + (d ? ' — ' + d : '')); }
function cust(staff, stage, date, price, dep, depDate, bal, balDate, perf) {
  return { id: staff + date + stage + price, clientName: staff + date, staffName: staff, stage, date, price, performanceRevenue: perf, depositAmount: dep, depositDate: depDate, balanceAmount: bal, balanceDate: balDate };
}
const range = { start: new Date('2026-10-01'), end: new Date('2026-10-31') };
const list = [
  cust('장선혜', '잔금결제', '2026-10-02', 1000000, 500000, '2026-10-03', 500000, '2026-10-20', 900000),
  cust('장선혜', '상담예약', '2026-10-05', 0, 0, '', 0, '', 0),
  cust('오지은', '선금결제', '2026-10-04', 2000000, 800000, '2026-10-06', 0, '', 1800000),
  cust('오지은', '가견적', '2026-10-07', 500000, 0, '', 0, '', 0),
  cust('오지은', '상담예약', '2026-10-08', 0, 0, '', 0, '', 0),
  cust('오지은', '상담예약', '2026-09-01', 0, 0, '', 0, '', 0), // 기간 밖
];
const by = ctx.getStaffComparison(list, range);
ok('1. 장선혜 성과매출 900,000원(선금+잔금 전체)', Math.round(by['장선혜'].perf) === 900000, JSON.stringify(by['장선혜']));
ok('2. 오지은 성과매출은 선금 비율만큼만(800,000/2,000,000 × 1,800,000 = 720,000원)', Math.round(by['오지은'].perf) === 720000, JSON.stringify(by['오지은']));
ok('3. 입금액은 실제 들어온 돈', by['장선혜'].rev === 1000000 && by['오지은'].rev === 800000);
ok('4. 상담 건수는 기간 안의 고객만(장선혜 2건, 오지은 3건)', by['장선혜'].consults === 2 && by['오지은'].consults === 3);
ok('5. 계약은 계약 이후 단계만(장선혜 1건, 오지은 1건)', by['장선혜'].contracts === 1 && by['오지은'].contracts === 1);
ok('6. 전환율 50% / 33%', by['장선혜'].conv === 50 && by['오지은'].conv === 33);
ok('7. 미수금은 오지은만 1,200,000원(2,000,000-800,000), 가견적은 제외', by['오지은'].unpaid === 1200000 && by['장선혜'].unpaid === 0);
ok('8. 상담이 0건이면 전환율은 null(0%로 속이지 않음)', ctx.getStaffComparison([cust('A', '선금결제', '2026-08-01', 100, 100, '2026-10-02', 0, '', 100)], range)['A'].conv === null);
ok('9. 활동이 전혀 없는 담당자는 표에서 빠짐', !ctx.getStaffComparison([cust('B', '상담예약', '2026-01-01', 0, 0, '', 0, '', 0)], range)['B']);
// 2026-10-10: 계약 건수는 "계약금 받은 달" 기준(상담 등록한 달이 아님)
const byPay = ctx.getStaffComparison([
  cust('C', '선금결제', '2026-09-10', 1000000, 500000, '2026-10-05', 0, '', 900000), // 9월 상담, 10월 계약금
  cust('C', '선금결제', '2026-10-02', 1000000, 500000, '2026-11-03', 0, '', 900000), // 10월 상담, 11월 계약금
  cust('C', '상담예약', '2026-10-03', 0, 0, '', 0, '', 0)
], range)['C'];
ok('13. 9월 상담·10월 계약금 고객은 10월 계약으로 셈', byPay.contracts === 1, JSON.stringify(byPay));
ok('14. 10월 상담·11월 계약금 고객은 10월 계약으로 안 셈(상담은 2건)', byPay.consults === 2 && byPay.contracts === 1 && byPay.conv === 50, JSON.stringify(byPay));
// 2026-10-10: 입금일이 비어 있으면 고객 등록일 달로 배정(이관 고객)
const undated = ctx.getStaffComparison([cust('D', '시공완료', '2026-10-04', 1000000, 0, '', 1000000, '', 1000000)], range)['D'];
ok('15. 입금일 없는 입금은 등록일 달 매출로 잡힘', undated && undated.rev === 1000000 && Math.round(undated.perf) === 1000000, JSON.stringify(undated));
const undatedOut = ctx.getStaffComparison([cust('D', '시공완료', '2026-08-04', 1000000, 0, '', 1000000, '', 1000000)], range)['D'];
ok('16. 등록일이 기간 밖이면 이번 기간 매출에 안 잡힘', !undatedOut || undatedOut.rev === 0, JSON.stringify(undatedOut));
ctx.renderChartStaffRank(list, range);
ok('10. 화면에 두 담당자와 4개 항목이 모두 나옴', ['장선혜', '오지은', '성과매출', '입금액', '상담→계약', '현재 미수금'].every(t => wrap.innerHTML.includes(t)));
ok('11. 제목이 기간에 맞게 바뀜', /담당자별 실적 비교/.test(titleEl.textContent), titleEl.textContent);
ok('12. 미수금은 적은 쪽(장선혜 0원)이 강조색', /var\(--terra\)">0원/.test(wrap.innerHTML));
ctx.renderChartStaffRank([], range);
ok('13. 데이터가 없으면 안내 문구', wrap.innerHTML.includes('실적 데이터가 없습니다'));
log.forEach(l => console.log(l));
const failed = log.filter(l => l.startsWith('❌'));
console.log(failed.length ? '\n실패 ' + failed.length + '건' : '\n전체 통과');
process.exit(failed.length ? 1 : 0);
