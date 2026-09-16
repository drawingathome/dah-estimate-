// tests/typecheck-check.js
// ══════════════════════════════════════════════════
// 2026-09-16(선혜님 - "4번 하자"): 가벼운 타입체크(tsc --noEmit, 빌드
// 시스템 없이 검사만). 이 코드베이스는 원래 타입 주석이 전혀 없어서,
// 지금 당장 전체를 "깨끗하게" 만들려면 기존 코드 수백 곳(주로
// document.querySelector가 반환하는 제네릭 Element 타입에 .style/.value
// 접근하는 흔한 패턴)을 다 고쳐야 해서 비현실적임 - 그 노이즈는
// "베이스라인"으로 스냅샷 떠두고, 앞으로 새로 생기는 오류만 잡아내는
// 방식("ratchet" - 기준선은 그대로 두고 더 나빠지지만 않게 막음)으로
// 운영. 베이스라인 자체에 있는 항목 중 진짜 버그로 보이는 건 이미
// 발견해서 그 자리에서 고쳤음(dash-api.js의 clientId 중복 정의 등).
// ══════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIGS = [
  { name: '대시보드', config: 'tsconfig.dashboard.json', baseline: 'tests/typecheck-baseline/dashboard-baseline.txt' },
  { name: '견적서', config: 'tsconfig.estimate.json', baseline: 'tests/typecheck-baseline/estimate-baseline.txt' },
];

let anyNew = false;

for (const c of CONFIGS) {
  console.log(`\n[타입체크] ${c.name} (${c.config})`);
  let currentOutput;
  try {
    execSync(`npx tsc --noEmit --locale ko -p ${c.config}`, { cwd: ROOT, encoding: 'utf-8' });
    currentOutput = '';
  } catch (e) {
    currentOutput = e.stdout || '';
  }
  const current = currentOutput.split('\n').filter(Boolean).sort();
  const baselinePath = path.join(ROOT, c.baseline);
  const baseline = fs.existsSync(baselinePath)
    ? fs.readFileSync(baselinePath, 'utf-8').split('\n').filter(Boolean)
    : [];
  const baselineSet = new Set(baseline);

  const newErrors = current.filter(line => !baselineSet.has(line));
  const fixedCount = baseline.filter(line => !current.includes(line)).length;

  console.log(`  기존(베이스라인) 오류: ${baseline.length}건 — 그대로 둠(당장 고칠 대상 아님)`);
  if (fixedCount > 0) console.log(`  ✅ 베이스라인 중 ${fixedCount}건은 이번에 고쳐져서 없어짐(베이스라인 갱신 권장)`);
  if (newErrors.length > 0) {
    anyNew = true;
    console.log(`  ❌ 새로 생긴 오류 ${newErrors.length}건:`);
    newErrors.forEach(l => console.log('    ' + l));
  } else {
    console.log(`  ✅ 새로 생긴 오류 없음`);
  }
}

console.log('\n========================================');
if (anyNew) {
  console.log('❌ 새로운 타입 오류가 발견됐어요 — 위 목록을 확인해주세요');
  process.exitCode = 1;
} else {
  console.log('✅ 전체 검사 통과 (기존 베이스라인 대비 새 오류 없음)');
  process.exitCode = 0;
}
console.log('========================================');
