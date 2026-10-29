// tests/est-card-pay-badge-check.js
// 2026-10-20(시험카 사례): 견적서 카드 배지가 고객 전체 단계가 아니라 "그 견적서의 결제 상태"(완납/선금)를 보여주는지(node 단독 시험).
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', 'dash-customer-estimates.js'), 'utf8');
const m = src.match(/function estPayBadge[\s\S]*?\n}\n/);
if (!m) { console.log('❌ estPayBadge 함수를 찾지 못함'); process.exit(1); }
const ctx = { stageColorFor: s => '#' + String(s).length, getEstExtraRows: e => e.extraPayRows || [] };
vm.createContext(ctx); vm.runInContext(m[0], ctx);
const f = ctx.estPayBadge;
let fail = 0;
const check = (l, c, d) => { if (c) console.log('✅ ' + l); else { console.log('❌ ' + l + ' — ' + JSON.stringify(d)); fail++; } };
check('선금으로 전액 받은 침구 견적서는 고객 단계가 선금결제여도 "완납"', f({ price: 1763000, depositAmount: 1763000, balanceAmount: 0 }, '선금결제').text === '완납', f({ price: 1763000, depositAmount: 1763000, balanceAmount: 0 }, '선금결제'));
check('선금 50%만 받은 커튼 견적서는 "선금 입금"', f({ price: 3118000, depositAmount: 1559000 }, '선금결제').text === '선금 입금', f({ price: 3118000, depositAmount: 1559000 }, '선금결제'));
check('선금+잔금으로 채우면 완납', f({ price: 1000, depositAmount: 500, balanceAmount: 500 }, '시공준비중').text === '완납', 0);
check('추가 결제까지 합쳐 채워도 완납', f({ price: 1000, depositAmount: 500, balanceAmount: 0, extraPayRows: [{ amount: 500 }] }, '선금결제').text === '완납', 0);
check('입금이 없으면 고객 단계를 그대로 보여줌', f({ price: 1000 }, '상담').text === '상담', f({ price: 1000 }, '상담'));
process.exit(fail ? 1 : 0);
