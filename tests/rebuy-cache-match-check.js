// N-226: 재구매(같은 이름+번호의 시공완료 고객)가 저장 때 이 기기 캐시의 옛 고객(시공완료)에 붙지 않아야 함
const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(__dirname + '/../est-save-stages.js', 'utf8');
let pass = 0, fail = 0; const t = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? '✅ ' : '❌ ') + n); };
const m = src.match(/function dahPickCachedCustomerIndex[\s\S]*?\n}\n/);
t('도우미 함수 dahPickCachedCustomerIndex 존재', !!m);
if (m) {
  const ctx = {}; vm.createContext(ctx); vm.runInContext(m[0], ctx);
  const f = ctx.dahPickCachedCustomerIndex;
  const list = [{ id: 53, clientName: '권재호', phone: '010-1111-2222', stage: '시공완료' }, { id: 9, clientName: '다른', phone: '010-9', stage: '상담' }];
  t('시공완료 캐시 고객은 이름+번호로 붙이지 않음(재구매=새 건)', f(list, null, '권재호', '01011112222') === -1);
  t('진행 중 고객은 이름+번호로 계속 찾음', f([{ id: 7, clientName: '권재호', phone: '010-1111-2222', stage: '가견적' }], null, '권재호', '010-1111-2222') === 0);
  t('고객 번호를 이미 알면(수정) 시공완료여도 그 고객', f(list, 53, '권재호', '010-1111-2222') === 0);
  t('id 없는 로컬 고객(방금 만든 것)은 계속 찾음', f([{ id: null, clientName: '김', phone: '010-5', stage: '가견적' }], null, '김', '010-5') === 0);
}
console.log(`${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
