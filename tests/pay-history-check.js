// tests/pay-history-check.js
// 2026-10-11: 고객상세 "입금 내역 보기"의 계산(dash-pay-history.js) 검증 - 윤정자님 실제 이력 모양 기준.
const fs = require('fs'), path = require('path');
const { buildPayHistoryEntries, formatPayHistoryLine } = new Function(fs.readFileSync(path.join(__dirname, '..', 'dash-pay-history.js'), 'utf8') + '\nreturn { buildPayHistoryEntries: buildPayHistoryEntries, formatPayHistoryLine: formatPayHistoryLine };')();
let fail = 0;
function ok(c, m) { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; }

// 윤정자님 형태: 이력은 "바뀌기 직전 상태"
const snaps = [
  { changed_at: '2026-10-03T03:49:58Z', snapshot: { deposit_amount: 0, deposit_date: '', balance_amount: 0, balance_date: '' } },
  { changed_at: '2026-10-06T07:52:02Z', snapshot: { deposit_amount: 100000, deposit_date: '2026-09-22', balance_amount: 0, balance_date: '' } },
  { changed_at: '2026-10-09T09:14:36Z', snapshot: { deposit_amount: 100000, deposit_date: '2026-09-22', balance_amount: 4868000, balance_date: '2026-10-06' } }
];
const cur = { deposit_amount: 100000, deposit_date: '2026-09-22', balance_amount: 5107000, balance_date: '2026-10-06' };
const e = buildPayHistoryEntries(snaps, cur);
ok(e.length === 3, '변동 3건(선금 입력·잔금 입력·잔금 증가): ' + e.length);
ok(e[0].field === '선금' && e[0].amount === 100000 && e[0].kind === 'add' && e[0].at === '2026-10-03T03:49:58Z', '첫 변동: 선금 +100,000 (그 시각)');
ok(e[1].field === '잔금' && e[1].amount === 4868000 && e[1].kind === 'add', '둘째: 잔금 +4,868,000');
ok(e[2].field === '잔금' && e[2].amount === 239000 && e[2].kind === 'add' && e[2].total === 5107000, '셋째: 잔금 +239,000 → 합계 5,107,000');
ok(formatPayHistoryLine(e[0]).indexOf('10/3 12:49') === 0, '시각은 한국시간으로 표시: ' + formatPayHistoryLine(e[0]));
// 감액
const c = buildPayHistoryEntries([{ changed_at: '2026-10-05T00:00:00Z', snapshot: { deposit_amount: 1200000, deposit_date: '2026-10-05' } }], { deposit_amount: 1027000, deposit_date: '2026-10-05' });
// 이력 시작 전부터 있던 선금 1건 + 감액 1건
ok(c.length === 2 && c[0].kind === 'start' && c[1].kind === 'cut' && c[1].amount === -173000, '이력 시작 전 선금 + 감액 -173,000 표시');
ok(/감액/.test(formatPayHistoryLine(c[1])) && /환불 또는 정정/.test(formatPayHistoryLine(c[1])) && !/환불 -/.test(formatPayHistoryLine(c[1])), '감액은 "환불"로 단정하지 않음');
// 변동 없음 / 이력 없음
ok(buildPayHistoryEntries([], cur).length === 0, '이력이 없으면 아무 줄도 없음');
ok(buildPayHistoryEntries([{ changed_at: '2026-10-05T00:00:00Z', snapshot: { deposit_amount: 0, balance_amount: 0 } }], { deposit_amount: 0, balance_amount: 0 }).length === 0, '금액이 안 바뀌면 줄 없음(메모만 바뀐 경우)');
// 지금 상태 = 마지막 이력과 같음 → 새 줄 없음
ok(buildPayHistoryEntries([{ changed_at: '2026-10-05T00:00:00Z', snapshot: { deposit_amount: 500, balance_amount: 0 } }], { deposit_amount: 500, balance_amount: 0 }).filter(x => x.kind !== 'start').length === 0, '마지막 이력과 현재가 같으면 변동 줄 없음');
console.log(fail ? '\n❌ 실패 ' + fail + '건' : '\n✅ 전체 통과(입금 내역 계산 검증)');
process.exit(fail ? 1 : 0);
