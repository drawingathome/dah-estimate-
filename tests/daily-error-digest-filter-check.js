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

log.forEach(l => console.log(l));
const failed = log.filter(l => l.startsWith('❌'));
console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');
process.exit(failed.length === 0 ? 0 : 1);
