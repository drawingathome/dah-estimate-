// tests/est-sync-queue-prefer-header-check.js
// 2026-09-22(선혜님 - 최금희 견적서 사고 - "쌍둥이함수까지 찾아" 요청
// 으로 est-save.js에서 발견한 근본원인과 정확히 같은 클래스의 버그를
// 이 파일에서도 발견): 저장 실패시 재시도하는 큐(_doRetryEstPendingSync)
// 가 신규 견적서를 POST할 때 Prefer 헤더로 'isEdit ? return=minimal :
// return=minimal'을 쓰고 있었음 - 삼항연산자 양쪽이 완전히 같은 값이라
// 조건을 넣은 의미가 없었고, 신규 저장(POST)이 성공해도 서버 응답이
// 항상 비어있어 새로 생성된 견적서의 id를 절대 받을 수 없는 구조였음.
// 이 재시도 경로로 신규 견적서가 저장되면 editingEstDbId가 계속
// 비어있게 남아, 다음 재저장에서 est-save.js의 "다른 견적서 합계"
// 로직이 자기 자신을 이중 계산하는 것과 완전히 같은 위험을 안고 있음.
// 이 테스트는 실제 저장 흐름 전체를 재현하기보다, 코드 자체가 신규
// 저장에 대해 정확한 Prefer 헤더를 요청하는지를 직접 확인.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'est-sync-queue.js'), 'utf8');

const log = [];
function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

// 신규 저장(POST, isEdit=false)일 때 return=minimal을 쓰는 패턴이 남아있는지 확인
const badPattern = /Prefer',\s*isEdit\s*\?\s*'return=minimal'\s*:\s*'return=minimal'/;
ok('1. [핵심] 신규 저장(POST) 성공시 새 id를 받을 수 있도록 Prefer 헤더가 정확함(양쪽 다 minimal이던 버그 없음)', !badPattern.test(src));

// 정확한 수정이 적용됐는지 - isEdit=false일 때 return=representation
const goodPattern = /Prefer',\s*isEdit\s*\?\s*'return=minimal'\s*:\s*'return=representation'/;
ok('2. 신규 저장(POST)시 return=representation을 요청함(새 id를 받아 editingEstDbId 복구 가능)', goodPattern.test(src));

console.log(log.join('\n'));
const failed = log.filter(l => l.startsWith('❌'));
console.log(failed.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');
if (failed.length > 0) process.exit(1);
