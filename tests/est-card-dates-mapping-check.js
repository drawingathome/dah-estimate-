// tests/est-card-dates-mapping-check.js
// 2026-10-20(시험카 사례): 견적서 DB행 → 로컬 객체 변환에서 시공일이 들어오고, 저장일(savedAt)이 실측 예정일이 아니라 작성 시각 기준인지(node 단독 시험).
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', 'dash-api-data.js'), 'utf8');
const mh = src.match(/function estSavedAtFromRow\(row\) \{[\s\S]*?\n\}\n/);
const m = src.match(/function estimateDbRowToLocal\(row\) \{[\s\S]*?\n\}\n/);
if (!m) { console.log('❌ estimateDbRowToLocal 함수를 찾지 못함'); process.exit(1); }
const ctx = { console, window: {}, localStorage: { getItem: () => null }, getEstExtraRows: () => [] };
vm.createContext(ctx); vm.runInContext(mh[0], ctx); vm.runInContext(m[0], ctx);
const f = ctx.estimateDbRowToLocal;
let fail = 0;
const check = (l, c, d) => { if (c) console.log('✅ ' + l); else { console.log('❌ ' + l + ' — ' + JSON.stringify(d)); fail++; } };
const row = { id: '307864ed-3ded-4c9f-bdb5-ed8e1cd5431c', customer_name: '시험', price: 1, date: '2026-10-29', install_date: '2026-11-16', created_at: '2026-10-17T02:47:57.766426', line_items: [] };
const e = f(row);
check('견적서 시공일(install_date)이 들어옴', e.installDate === '2026-11-16', e.installDate);
check('실측 예정일(date)은 그대로 date 에 들어옴', e.date === '2026-10-29', e.date);
check('저장일(savedAt)은 실측 예정일이 아니라 작성 시각 기준', /^2026-10-17T/.test(e.savedAt), e.savedAt);
check('시간대 표시가 없는 작성 시각에는 Z(UTC)를 붙임', /Z$/.test(e.savedAt), e.savedAt);
const e2 = f(Object.assign({}, row, { created_at: '2026-10-17T02:47:57+00:00' }));
check('이미 시간대가 있으면 그대로 둠', e2.savedAt === '2026-10-17T02:47:57+00:00', e2.savedAt);
const e3 = f(Object.assign({}, row, { created_at: null }));
check('작성 시각이 없으면 date로 대체', e3.savedAt === '2026-10-29', e3.savedAt);
const src2 = fs.readFileSync(path.resolve(__dirname, '..', 'dash-customer-estimates.js'), 'utf8');
const m2 = src2.match(/function estSavedDateKst\(e\) \{[\s\S]*?\n\}\n/);
if (!m2) { console.log('❌ estSavedDateKst 함수를 찾지 못함'); process.exit(1); }
vm.runInContext(m2[0], ctx);
check('새벽 저장(UTC 10-16 20:00 = 한국 10-17 05:00)은 한국 날짜 10-17로 표시', ctx.estSavedDateKst({ savedAt: '2026-10-16T20:00:00Z' }) === '2026-10-17', ctx.estSavedDateKst({ savedAt: '2026-10-16T20:00:00Z' }));
check('날짜만 있는 값은 그대로', ctx.estSavedDateKst({ savedAt: '2026-10-29' }) === '2026-10-29', 0);
// 재발 방지: DB 행 → savedAt 변환이 estSavedAtFromRow 한 곳만 쓰는지(수정 시각·실측일을 직접 쓰는 쌍둥이 변환이 다시 생기면 실패)
const dir = path.resolve(__dirname, '..');
fs.readdirSync(dir).filter(f => /^dash-.*\.js$/.test(f)).forEach(f => {
  fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((ln, i) => {
    if (/savedAt\s*:\s*(r|row)\.(updated_at|created_at|date)/.test(ln)) check('savedAt 변환은 estSavedAtFromRow 한 곳만 사용 (' + f + ':' + (i + 1) + ')', false, ln.trim().slice(0, 120));
  });
});
check('savedAt 변환 쌍둥이 없음(직접 변환 줄 0개)', true, 0);
process.exit(fail ? 1 : 0);
