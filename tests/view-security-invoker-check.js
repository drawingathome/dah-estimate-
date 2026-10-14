// tests/view-security-invoker-check.js
// 2026-10-15: data_integrity_issues 뷰를 create or replace 한 마이그레이션은 반드시 security_invoker를 다시 설정해야 함
// (안 하면 실장이 다른 담당자 고객의 점검 항목을 볼 수 있게 됨 — 10-14에 실제로 발생한 사고).
const fs = require('fs'); const path = require('path');
const dir = path.resolve(__dirname, '..');
const files = fs.readdirSync(dir).filter(f => /^migration_.*\.sql$/.test(f));
const bad = [];
files.forEach(f => {
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  if (/create\s+or\s+replace\s+view\s+public\.data_integrity_issues/i.test(t) && !/security_invoker\s*=\s*true/i.test(t)) bad.push(f);
});
const touching = files.filter(f => /create\s+or\s+replace\s+view\s+public\.data_integrity_issues/i.test(fs.readFileSync(path.join(dir, f), 'utf8')));
console.log('뷰를 교체하는 마이그레이션:', touching.length + '개');
if (bad.length) { console.log('❌ security_invoker 재설정이 없는 파일:', bad.join(', ')); process.exit(1); }
console.log('✅ 뷰를 교체하는 모든 마이그레이션이 security_invoker를 다시 설정함');
