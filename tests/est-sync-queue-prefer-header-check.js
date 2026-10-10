// tests/est-sync-queue-prefer-header-check.js
// 2026-09-22(선혜님 - 최금희 견적서 사고 - "쌍둥이함수까지 찾아" 요청
// 으로 est-save.js에서 발견한 근본원인과 정확히 같은 클래스의 버그를
// 이 파일에서도 발견): 저장 실패시 재시도하는 큐(_doRetryEstPendingSync)
// 가 신규 견적서를 POST할 때 Prefer 헤더로 'isEdit ? return=minimal :
// return=minimal'을 쓰고 있었음 - 삼항연산자 양쪽이 완전히 같은 값이라
// 조건을 넣은 의미가 없었고, 신규 저장(POST)이 성공해도 서버 응답이
// 항상 비어있어 새로 생성된 견적서의 id를 절대 받을 수 없는 구조였음.
// 이때는 POST(신규)만 고치고 PATCH(수정)는 그대로 둬서(반쪽만 수정),
// 정확히 같은 문제(반영 건수 확인 불가)가 수정 저장 쪽에 그대로 남았음.
//
// 2026-09-30(선혜님 - "지금 고쳐야지" - 노지경 견적서 사례로 발견): 그
// 남아있던 절반짜리 문제가 실제로 터짐 - PATCH(수정 저장) 재시도가
// return=minimal이라 실제 반영 건수(0건=권한문제/동시저장충돌)를 전혀
// 확인 못 해서, 서버에 아무것도 안 바뀌었는데도 "성공"으로 착각하고
// 조용히 큐에서 지워버림. 이번엔 PATCH/POST 양쪽 다 항상
// return=representation으로 통일해서, 이런 "절반만 고침"이 구조적으로
// 다시 생길 수 없게 함 - isEdit 조건 자체를 없앰.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'est-sync-queue.js'), 'utf8');

const log = [];
function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

// PATCH/POST 어느 쪽이든 return=minimal을 쓰는 조건부 패턴이 남아있으면 안 됨(과거 두 번
// 재발한 "isEdit에 따라 다른 Prefer를 쓰다가 한쪽을 놓치는" 클래스의 문제 자체를 봉쇄)
const conditionalPreferPattern = /Prefer',\s*isEdit\s*\?/;
ok('1. [핵심] Prefer 헤더가 isEdit(PATCH/POST) 조건에 따라 갈리지 않음(항상 같은 값 - "한쪽만 고침" 재발 구조적으로 차단)', !conditionalPreferPattern.test(src));

// PATCH/POST 둘 다 실제 반영 건수를 확인할 수 있는 return=representation을 씀
const fixedPreferPattern = /Prefer',\s*'return=representation'\s*\)/;
ok('2. Prefer 헤더가 항상 return=representation(신규는 새 id 복구, 수정은 0건 반영 감지 둘 다 가능)', fixedPreferPattern.test(src));

// 2026-09-30 신설: PATCH(수정)가 0건 반영됐을 때 성공으로 착각하지 않고 실제로 확인하는지
const zeroRowCheckPattern = /isZeroRowFail/;
ok('3. [핵심] PATCH 응답이 0건(빈 배열)이면 성공으로 착각하지 않고 별도로 감지함(조용한 데이터유실 방지)', zeroRowCheckPattern.test(src));

console.log(log.join('\n'));
const failed = log.filter(l => l.startsWith('❌'));
console.log(failed.length === 0 ? '\n✅ 전체 통과' : '\n❌ 일부 실패');
if (failed.length > 0) process.exit(1);
