// apps-script-daily-backup.js의 isRoutineStage() 로직을 그대로
// 재현해서 검증 (Google Apps Script 전용 API라 실제 함수를 직접
// import해서 돌릴 수 없음 - 로직만 동일하게 복사해서 테스트).
function isRoutineStage(r) {
  var alwaysBenign = ['저장단계: 시작', '저장단계: 세션확인-정상', '저장단계: 검증통과', '저장단계: 필수항목검증완료', '저장단계: 확인창-진행'];
  if (alwaysBenign.indexOf(r.message) !== -1) return true;
  if (r.message === '저장단계: 고객저장-응답' || r.message === '저장단계: 견적서저장-응답') {
    try {
      var status = r.extra && r.extra.status;
      return typeof status === 'number' && status >= 200 && status < 300;
    } catch (e) { return false; }
  }
  return false;
}

const log = [];
function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }

// 1) 박윤아 실사례 재현: 전부 정상 저장 단계 -> 전부 조용히 걸러져야 함
const 박윤아사례 = [
  { message: '저장단계: 시작' },
  { message: '저장단계: 세션확인-정상' },
  { message: '저장단계: 검증통과' },
  { message: '저장단계: 필수항목검증완료' },
  { message: '저장단계: 고객저장-응답', extra: { status: 200 } },
  { message: '저장단계: 견적서저장-응답', extra: { status: 201 } }
];
const 필터결과1 = 박윤아사례.filter(function(r) { return !isRoutineStage(r); });
ok('1. 박윤아 실사례(전부 정상 응답)는 전부 걸러져서 메일 대상이 0건이 됨', 필터결과1.length === 0, 필터결과1);

// 2) 대조군: 응답 단계에서 실제로 4xx/5xx가 나오면 여전히 진짜 문제로 남아야 함
const 진짜실패사례 = [
  { message: '저장단계: 시작' },
  { message: '저장단계: 견적서저장-응답', extra: { status: 403 } }
];
const 필터결과2 = 진짜실패사례.filter(function(r) { return !isRoutineStage(r); });
ok('2. 응답 상태코드가 403이면 걸러지지 않고 그대로 메일 대상에 남음(회귀 없음)', 필터결과2.length === 1 && 필터결과2[0].extra.status === 403, 필터결과2);

// 3) 명시적 실패 단계(예: 타임아웃, 네트워크오류, 고착 등)는 항상 그대로 남아야 함
const 명시적실패 = [
  { message: '저장단계: 고객저장-타임아웃' },
  { message: '저장단계: 버튼-고착감지-자동복구', extra: { stuckMs: 20000 } },
  { message: '저장 실패(권한문제 또는 동시저장충돌)' }
];
const 필터결과3 = 명시적실패.filter(function(r) { return !isRoutineStage(r); });
ok('3. 타임아웃/고착/충돌 같은 명시적 문제 메시지는 전부 걸러지지 않고 그대로 남음', 필터결과3.length === 3, 필터결과3);

// 4) status 필드가 아예 없는 경우(읽기 실패) - 안전하게 "문제일 수 있음"으로 남아야 함
const 상태값없음 = [{ message: '저장단계: 견적서저장-응답' }];
const 필터결과4 = 상태값없음.filter(function(r) { return !isRoutineStage(r); });
ok('4. 응답단계인데 status 값 자체를 못 읽으면 안전하게 문제로 남김(숨기지 않음)', 필터결과4.length === 1, 필터결과4);

// 2026-09-22(선혜님 - "저렇게 메일이 많이 오니 체크가 안되거든" - genuineIssueCount
// 로직 재현): 동시저장충돌류가 전부 자동복구 확인되면(checkResolved=true)
// 메일 자체를 생략해야 함 - apps-script-daily-backup.js의 실제 로직과 동일하게 재현.
function isSaveConflictRow(r) { return /저장 실패\(권한문제 또는 동시저장충돌\)/.test(r.message); }
function genuineIssueCount(rows, checkResolvedFn) {
  return rows.filter(function(r) { return !(isSaveConflictRow(r) && checkResolvedFn(r)); }).length;
}

// 5) 동시저장충돌 2건이 전부 자동복구 확인됨 -> 진짜 확인 필요 건수 0(메일 생략)
const 전부자동복구됨 = [
  { message: '견적서 저장 실패(권한문제 또는 동시저장충돌) - 내용 백업됨' },
  { message: '고객정보 저장 실패(권한문제 또는 동시저장충돌) - 내용 백업됨' }
];
const 결과5 = genuineIssueCount(전부자동복구됨, function() { return true; });
ok('5. [핵심] 동시저장충돌이 전부 자동복구 확인되면 진짜확인필요 건수가 0이 됨(메일 생략 대상)', 결과5 === 0, 결과5);

// 6) 대조군: 동시저장충돌 중 하나라도 미해결이면 메일을 계속 보내야 함(회귀 방지)
const 일부미해결 = [
  { message: '견적서 저장 실패(권한문제 또는 동시저장충돌) - 내용 백업됨' },
  { message: '고객정보 저장 실패(권한문제 또는 동시저장충돌) - 내용 백업됨' }
];
let callIdx = 0;
const 결과6 = genuineIssueCount(일부미해결, function() { return (callIdx++) === 0; }); // 첫번째만 해결됨, 두번째는 미해결
ok('6. [회귀방지] 동시저장충돌 중 하나라도 미해결이면 진짜확인필요 건수가 0이 아님(메일 계속 감)', 결과6 === 1, 결과6);

// 7) 대조군: 동시저장충돌이 아닌(검증실패 등) 다른 문제가 섞여있으면, 그건 항상 진짜 문제로 셈
const 검증실패섞임 = [
  { message: '견적서 저장 실패(권한문제 또는 동시저장충돌) - 내용 백업됨' },
  { message: '저장단계: 검증실패-중단', extra: { detail: '제품 금액 0개', customerName: '윤정자' } }
];
const 결과7 = genuineIssueCount(검증실패섞임, function() { return true; }); // 동시저장충돌은 해결됐다고 쳐도
ok('7. [핵심] 동시저장충돌은 해결됐어도, 검증실패 같은 다른 종류 문제는 항상 진짜확인필요로 셈(숨기지 않음)', 결과7 === 1, 결과7);

log.forEach(l => console.log(l));
const failed = log.filter(l => l.startsWith('❌'));
console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');
process.exit(failed.length === 0 ? 0 : 1);
