// tests/extra-pay-other-estimate-check.js
// 2026-10-20(이상옥 사례): 추가 결제 금액이 같은 고객의 "다른 견적서"의 선금(50%)/남은 금액과 같으면 그 견적서를 찾아 안내하는지(node 단독 시험).
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', 'dash-extra-pay.js'), 'utf8');
const saved = [
  { id: 'A', clientId: 7, clientName: '이상옥', fabric: '침구', price: 1763000, depositAmount: 1763000, balanceAmount: 0 },
  { id: 'B', clientId: 7, clientName: '이상옥', fabric: '커튼', price: 3118000, depositAmount: 0, balanceAmount: 0 },
  { id: 'C', clientId: 8, clientName: '다른사람', fabric: '블라인드', price: 2000000, depositAmount: 0, balanceAmount: 0 },
  { id: 'D', clientId: 7, clientName: '이상옥', fabric: '롤', confirmedAt: '2026-10-01T00:00:00Z', price: 1000000, depositAmount: 300000, balanceAmount: 0 }
];
const ctx = { localStorage: { getItem: () => JSON.stringify(saved) }, document: {}, window: {}, console };
vm.createContext(ctx); vm.runInContext(src, ctx);
const find = ctx.findOtherEstimateForAmount;
let fail = 0;
const check = (l, c, d) => { if (c) console.log('✅ ' + l); else { console.log('❌ ' + l + ' — ' + JSON.stringify(d)); fail++; } };
const c = { id: 7, clientName: '이상옥' }, estA = { id: 'A' };
const r1 = find(c, estA, 1559000);
check('침구 화면에서 커튼 선금(50%) 금액을 넣으면 커튼 견적서를 알려줌', r1 && /커튼/.test(r1.label) && /선금/.test(r1.kind), r1);
const r2 = find(c, estA, 700000);
check('선금만 받은 다른 견적서의 남은 금액과 같으면 잔금으로 안내', r2 && /롤/.test(r2.label) && /잔금/.test(r2.kind), r2);
check('안내 문구에 상품명·가견적/확정 구분·금액이 들어감', r1 && /커튼 가견적서 · 3,118,000원/.test(r1.label), r1);
check('상관없는 금액은 안내하지 않음', find(c, estA, 123456) === null, find(c, estA, 123456));
check('다른 고객의 견적서는 보지 않음', find(c, estA, 1000000) === null, find(c, estA, 1000000));
check('자기 자신(현재 견적서)은 제외', find(c, { id: 'B' }, 1559000) === null, find(c, { id: 'B' }, 1559000));
process.exit(fail ? 1 : 0);
