#!/usr/bin/env node
// tests/run-all.js
// 4단계 검증 프로토콜 중 "Phase 4 (전문 제작 수준 최종 점검)"에 해당하는
// 자동화 가능한 항목들을 한번에 실행합니다.
//
// 사용법 (레포 루트에서):
//   node tests/run-all.js dah-dashboard.html
//   node tests/run-all.js dah-estimate.html
//
// 참고: 권한별 검사(role-permission-check)는 dah-dashboard.html에만 해당됩니다.

const { execSync } = require('child_process');
const path = require('path');

const target = process.argv[2];
if (!target) {
  console.error('사용법: node run-all.js <html파일경로>');
  process.exit(1);
}

const scripts = [
  ['font-check.js', [target, '390']],
  ['font-check.js', [target, '1280']],
  ['scroll-check.js', [target, '390']],
  ['touch-target-check.js', [target]]
];

if (/dah-dashboard/.test(target)) {
  scripts.push(['role-permission-check.js', [target]]);
}

let anyFail = false;
for (const [script, args] of scripts) {
  const scriptPath = path.join(__dirname, script);
  try {
    execSync(`node "${scriptPath}" ${args.map(a => `"${a}"`).join(' ')}`, { stdio: 'inherit' });
  } catch (e) {
    anyFail = true;
  }
}

console.log('\n========================================');
console.log(anyFail ? '❌ 일부 검사 실패 — 위 로그 확인 필요' : '✅ 전체 검사 통과');
console.log('========================================');
process.exitCode = anyFail ? 1 : 0;
