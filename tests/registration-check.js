// tests/registration-check.js
// 2026-09-22(선혜님 - "누락된거는 없니??" 요청으로 발견): 오늘 하루
// 동안 여러 세션이 새 테스트를 만들 때마다 run-all.js 등록을 깜빡하는
// 일이 반복됐음(customer_count_label_check, detail_tab_overflow_check,
// grouped_todo_check, order_data_gap_check, payment_order_gating_check,
// full_lifecycle_simulation, daily-error-digest-filter-check,
// data-integrity-scan-check — 8개나 됐음). 매번 사람이 파일 목록과
// run-all.js를 수동으로 대조하는 대신, 이 확인 자체를 CI에 올려서
// 앞으로 등록을 깜빡하면 바로 잡히게 함. 의도적으로 별도 실행되는
// 파일(두 앱을 동시에 받아야 하는 것들)은 화이트리스트로 명시 제외.
const fs = require('fs');
const path = require('path');

const testsDir = __dirname;
const runAllContent = fs.readFileSync(path.join(testsDir, 'run-all.js'), 'utf8');

// 실행 파일 자체이거나(run-all.js 스스로, _로 시작하는 헬퍼) run-all.js의
// 단일 target 구조와 안 맞아 의도적으로 별도 커맨드로 실행되는 파일들.
const EXCLUDED = [
  'run-all.js',
  '_helpers.js',
  'full-role-device-audit.js', // node tests/full-role-device-audit.js dah-estimate.html dah-dashboard.html (두 앱 동시 필요)
  'staff-full-sweep.js',       // node tests/staff-full-sweep.js dah-dashboard.html
  'staff-full-sweep-estimate.js' // node tests/staff-full-sweep-estimate.js dah-estimate.html
];

const allTestFiles = fs.readdirSync(testsDir)
  .filter(f => f.endsWith('.js'))
  .filter(f => !f.startsWith('_'))
  .filter(f => EXCLUDED.indexOf(f) < 0);

const log = [];
function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

const missing = allTestFiles.filter(f => !runAllContent.includes("'" + f + "'"));
ok('tests/ 디렉토리의 모든 실행 대상 테스트가 run-all.js에 등록되어 있음', missing.length === 0, missing.length > 0 ? JSON.stringify(missing) : undefined);

console.log(log.join('\n'));
if (missing.length > 0) {
  console.log('\n누락된 파일들:');
  missing.forEach(f => console.log('  - ' + f));
  console.log('\n→ 새 테스트라면 tests/run-all.js에 scripts.push([...])로 등록하거나,');
  console.log('  두 앱을 동시에 받아야 해서 의도적으로 별도 실행하는 파일이라면');
  console.log('  이 스크립트 상단의 EXCLUDED 배열에 파일명을 추가하세요.');
}
const failed = log.filter(l => l.startsWith('❌'));
console.log(failed.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');
if (failed.length > 0) process.exit(1);
