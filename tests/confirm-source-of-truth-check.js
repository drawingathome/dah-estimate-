// tests/confirm-source-of-truth-check.js
// ══════════════════════════════════════════════════
// 2026-09-22 도입 — "확정" 개념이 코드 역사상 최소 3번(9/14 공개보기
// 페이지 contract_status 오판별, 오늘 est-save.js의 currentTab 오판별
// 2건 x 2곳) 서로 다른 필드/변수로 잘못 판별돼서 재발했던 패턴을
// 정적 검사로 감시함. "확정 여부를 저장/전송하는 모든 곳은 반드시
// window._estEditState.estimateConfirmedAt(또는 그와 동등한 서버측
// 필드 confirmed_at)에서만 나와야 한다"는 규칙이 깨졌는지(누가 다시
// currentTab이나 DOM classList 같은 화면 상태에서 확정 여부를 끌어오는
// 코드를 새로 만들었는지) 소스코드 패턴으로 확인.
// ══════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

let passCount = 0, failCount = 0;
function check(label, condition, detail) {
  if (condition) { console.log('✅ ' + label); passCount++; }
  else { console.log('❌ ' + label + (detail ? ' — ' + detail : '')); failCount++; }
}

function readFile(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf-8');
}

console.log('\n[확정 상태 단일 소스 감시] confirm-source-of-truth-check.js');

const estSave = readFile('est-save.js');

// 금지 패턴: currentTab(가견적서/최종견적서 탭 변수)이나 DOM classList로
// "확정견적"/estimate_status 같은 확정 관련 값을 판별하는 코드가 다시
// 생기면 안 됨 - 반드시 estimateConfirmedAt에서만 나와야 함.
const forbiddenPatterns = [
  { pattern: /currentTab\s*\|\|\s*'ga'/, desc: "currentTab||'ga' (탭 상태로 estimate_status를 정하던 예전 패턴)" },
  { pattern: /currentTab\s*===\s*'final'/, desc: "currentTab === 'final' (탭 상태로 확정 여부를 판별하던 예전 패턴)" }
];

forbiddenPatterns.forEach(function(fp) {
  check('est-save.js에 금지 패턴 없음: ' + fp.desc, !fp.pattern.test(estSave));
});

// 필수 패턴: 실제로 estimateConfirmedAt을 확정 여부 판별에 쓰고 있어야 함
// (이 검사 자체가 무력화되지 않았는지 - 위 forbidden 패턴이 그냥
// 통째로 사라져서 통과한 게 아니라 올바른 방식으로 대체됐는지 확인)
const requiredUsages = [
  'estimate_status: window._estEditState.estimateConfirmedAt',
  'isFinalForDrive = !!window._estEditState.estimateConfirmedAt',
  'isFinal = !!window._estEditState.estimateConfirmedAt'
];
requiredUsages.forEach(function(snippet) {
  check('est-save.js가 estimateConfirmedAt 기준으로 정확히 판별함: "' + snippet.slice(0, 50) + '..."', estSave.indexOf(snippet) !== -1, '해당 코드를 못 찾음 - 다른 방식으로 리팩토링됐다면 이 검사도 같이 갱신 필요');
});

console.log(passCount + '건 통과, ' + failCount + '건 실패');
process.exit(failCount === 0 ? 0 : 1);
