// tests/save-changed-only-check.js
// 2026-10-21(W2 1단계 "바꾼 칸만 저장"): 열었던 서버 값과 같은 칸은 수정 저장(PATCH)에 담지 않는다.
// ① 왕복 불변: 아무것도 안 바꾸고 저장하면 항상 보내는 칸(금액·고객명)만 나감 ② 바꾼 칸만 나감
// ③ 못 채운 칸(빈 값)이 서버의 값을 덮어쓰지 않음 ④ 숫자/문자/JSON 표현 차이는 같은 값으로 봄 ⑤ 코드 연결 확인
const fs = require('fs'), path = require('path');
const { estDropUnchangedColumns } = require('../est-save-diff.js');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
const row = { id: 'e1', customer_name: '홍길동', price: '1000000', performance_revenue: 900000, phone: '010-1', date: '2026-10-25', install_date: '2026-11-01',
  memo: '현관 비번 1234', confirmed_at: '2026-10-20T01:00:00Z', estimate_status: 'final', region: '서울', measure_date_tbd: false,
  line_items: [{ a: 1, b: { x: 1, y: 2 } }], applied_discounts: { coupons: [], manual: null } };
const same = { customer_name: '홍길동', price: 1000000, performance_revenue: 900000, phone: '010-1', date: '2026-10-25', install_date: '2026-11-01',
  memo: '현관 비번 1234', confirmed_at: '2026-10-20T01:00:00Z', estimate_status: 'final', region: '서울', measure_date_tbd: false,
  line_items: [{ b: { y: 2, x: 1 }, a: 1 }], applied_discounts: { coupons: [], manual: null } };
let out = estDropUnchangedColumns(same, row);
ok('① 안 바꾸고 저장 → 금액·고객명만 나감', JSON.stringify(Object.keys(out).sort()) === JSON.stringify(['customer_name', 'performance_revenue', 'price']), Object.keys(out).join());
out = estDropUnchangedColumns(Object.assign({}, same, { memo: '바뀜', region: '경기' }), row);
ok('② 바꾼 칸(memo, region)이 포함', out.memo === '바뀜' && out.region === '경기');
ok('②-2 안 바꾼 칸(phone, date)은 빠짐', !('phone' in out) && !('date' in out));
out = estDropUnchangedColumns(Object.assign({}, same, { install_date: '', memo: '' }), row);
ok('③ 화면이 비운 칸은 "바꿈"으로 보내짐(의도적 삭제 가능)', out.install_date === '' && out.memo === '');
out = estDropUnchangedColumns(Object.assign({}, same, { confirmed_at: undefined, estimate_status: undefined }), row);
ok('③-2 undefined(확정 보호)는 보내지 않음', !('confirmed_at' in out) && !('estimate_status' in out));
const rowNull = Object.assign({}, row, { install_date: null, memo: null });
out = estDropUnchangedColumns(Object.assign({}, same, { install_date: '', memo: '' }), rowNull);
ok('④ null 과 빈 문자열은 같은 값', !('install_date' in out) && !('memo' in out));
out = estDropUnchangedColumns({ price: 5, new_col: 'x' }, row);
ok('④-2 서버 행에 없는 칸은 그대로 보냄', out.new_col === 'x');
out = estDropUnchangedColumns(Object.assign({}, same, { line_items: [{ a: 1, b: { x: 1, y: 3 } }] }), row);
ok('④-3 품목이 바뀌면 포함', 'line_items' in out);
const st = fs.readFileSync(path.resolve(__dirname, '../est-save-stages.js'), 'utf8');
ok('⑤ 저장이 estDropUnchangedColumns 결과를 서버로 보냄', /xhr2\.send\(JSON\.stringify\(estPayloadToSend\)\)/.test(st) && /estDropUnchangedColumns\(estPayloadForRetry, _lrBase\)/.test(st));
ok('⑤-2 덮어쓰기 선택 시엔 전체 전송', /lockSource !== 'overwrite'/.test(st));
ok('⑤-3 저장 성공 후 기준 행 갱신', /window\._estLoadedRow = Object\.assign\(\{\}, window\._estLoadedRow \|\| \{\}, lockCheckRows\[0\]\)/.test(st));
const html = fs.readFileSync(path.resolve(__dirname, '../dah-estimate.html'), 'utf8');
ok('⑥ 화면이 est-save-diff.js를 저장 코드보다 먼저 읽음', html.indexOf('est-save-diff.js') > 0 && html.indexOf('est-save-diff.js') < html.indexOf('est-save-stages.js'));
console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 모두 통과'); process.exit(failed ? 1 : 0);
