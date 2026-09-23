// tests/concept-registry-check.js
// ══════════════════════════════════════════════════
// 2026-09-22(선혜님 - "근본적으로 수정할 부분을 설계해봐") 도입.
//
// 오늘 하루 발견한 10개 계보의 공통 원인: "이 개념이 코드/DB 어디에
// 흩어져 있는지"를 사람이 기억에만 의존해서, 하나 고치면 나머지를
// 놓쳤다. CONCEPT_REGISTRY.json이 그 목록을 문서화하는데, 문서만
// 있으면 CHANGE_IMPACT_CHECKLIST.md 28번(8/28)처럼 "적어놨는데 또
// 안 지켜지는" 운명을 반복한다.
//
// 이 스크립트는 그 문서가 "말뿐인 기록"이 아니라 "실제와 어긋나면
// CI가 잡아내는 살아있는 계약"이 되게 한다:
//   1. code_locations에 적힌 파일이 실제로 존재하는지
//   2. guard_tests에 적힌 테스트 파일이 실제로 존재하고, run-all.js
//      에 등록돼 있는지 (있다고 적어놓고 등록 안 된 사례가 오늘도
//      3건 있었음)
//   3. guard_tests가 비어있는 개념(=아무도 안 지키는 개념)이 있으면
//      경고
//
// 새 개념을 등록하거나 기존 개념을 고쳤으면, 이 검사부터 통과해야
// "완료"라고 부를 수 있다.
// ══════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

let passCount = 0, failCount = 0, warnCount = 0;
function ok(label) { console.log('✅ ' + label); passCount++; }
function fail(label, detail) { console.log('❌ ' + label + (detail ? ' — ' + detail : '')); failCount++; }
function warn(label, detail) { console.log('⚠️  ' + label + (detail ? ' — ' + detail : '')); warnCount++; }

const root = path.join(__dirname, '..');
const registryPath = path.join(root, 'CONCEPT_REGISTRY.json');
const runAllPath = path.join(root, 'tests', 'run-all.js');

console.log('\n[개념 레지스트리 검증] concept-registry-check.js');

if (!fs.existsSync(registryPath)) {
  fail('CONCEPT_REGISTRY.json이 존재함');
  process.exit(1);
}
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
const runAllContent = fs.readFileSync(runAllPath, 'utf-8');
// registration-check.js와 동일한 화이트리스트 - run-all.js의 단일target
// 구조와 안 맞아 의도적으로 별도 커맨드로 실행되는 파일들(두 앱을 동시에
// 받아야 함). 이런 파일은 run-all.js 미등록이 정상이므로 실패 대신 통과.
const SEPARATELY_RUN = ['full-role-device-audit.js', 'staff-full-sweep.js', 'staff-full-sweep-estimate.js'];

Object.keys(registry).forEach(function(key) {
  if (key.startsWith('_')) return; // 설명 필드는 건너뜀
  const concept = registry[key];
  if (!concept || typeof concept !== 'object') return;

  // 1. code_locations의 파일이 실제로 존재하는지
  (concept.code_locations || []).forEach(function(loc) {
    const fileName = loc.split(':')[0].split(' ')[0].trim();
    const filePath = path.join(root, fileName);
    if (fs.existsSync(filePath)) {
      ok('[' + key + '] 코드 위치 존재: ' + fileName);
    } else {
      fail('[' + key + '] 코드 위치가 실제로 없음(파일 삭제/이동됐는데 레지스트리 안 고침?): ' + fileName);
    }
  });

  // 2. guard_tests가 실제로 존재하고 run-all.js에 등록돼 있는지
  const guardTests = concept.guard_tests || [];
  if (guardTests.length === 0) {
    warn('[' + key + '] 이 개념을 지키는 자동 테스트가 하나도 없음(아무도 안 지켜지는 개념)');
  }
  guardTests.forEach(function(testFile) {
    const testPath = path.join(root, 'tests', testFile);
    if (!fs.existsSync(testPath)) {
      fail('[' + key + '] guard_test 파일이 실제로 없음: ' + testFile);
      return;
    }
    ok('[' + key + '] guard_test 파일 존재: ' + testFile);
    if (SEPARATELY_RUN.indexOf(testFile) !== -1) {
      ok('[' + key + '] guard_test는 run-all.js와 별도로 항상 수동 실행되는 화이트리스트 파일(두 앱 동시 필요): ' + testFile);
      return;
    }
    const escaped = testFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const registered = new RegExp("scripts\\.push\\(\\['" + escaped + "'").test(runAllContent);
    if (registered) {
      ok('[' + key + '] guard_test가 run-all.js에 등록돼 CI에서 실제로 돎: ' + testFile);
    } else {
      fail('[' + key + '] guard_test가 run-all.js에 등록 안 돼 CI에서 안 돎(오늘 3건 실제 발견된 유형): ' + testFile);
    }
  });
});

console.log('\n' + passCount + '건 통과, ' + failCount + '건 실패, ' + warnCount + '건 경고');
if (warnCount > 0) console.log('(경고는 CI를 막지 않지만, 다음에 이 개념을 고칠 때 guard_test부터 만드는 것을 고려할 것)');
process.exit(failCount === 0 ? 0 : 1);
