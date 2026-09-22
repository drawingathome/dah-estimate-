// apps-script-daily-backup.js의 dahScanForDataIntegrity() 로직을 그대로
// 재현해서 검증 (Google Apps Script 전용 API라 실제 함수를 직접
// import해서 돌릴 수 없음 - 로직만 동일하게 복사해서 테스트).
function dahScanForDataIntegrity(backup) {
  var issues = [];
  if (!Array.isArray(backup.customers) || !Array.isArray(backup.estimates)) return issues;

  var estsByClientId = {};
  backup.estimates.forEach(function(e) {
    if (e.is_archived || !e.client_id) return;
    (estsByClientId[e.client_id] = estsByClientId[e.client_id] || []).push(e);
  });

  backup.customers.forEach(function(c) {
    if (c.is_archived) return;
    var custDep = Number(c.deposit_amount) || 0;
    var custBal = Number(c.balance_amount) || 0;
    var ests = estsByClientId[c.id] || [];
    var estDepSum = 0, estBalSum = 0;
    ests.forEach(function(e) { estDepSum += Number(e.deposit_amount) || 0; estBalSum += Number(e.balance_amount) || 0; });

    if ((custDep + custBal) > 0 && (estDepSum + estBalSum) > 0 && (custDep !== estDepSum || custBal !== estBalSum)) {
      issues.push('[결제 불일치] ' + c.client_name + '(id:' + c.id + ') — 고객레벨(선금' + custDep.toLocaleString() + '/잔금' + custBal.toLocaleString() +
        ') vs 견적서합계(선금' + estDepSum.toLocaleString() + '/잔금' + estBalSum.toLocaleString() + ')가 서로 다름');
    }

    var isPrePayment = ['방문예약', '상담', '가견적'].indexOf(c.stage) !== -1;
    var hasNoPayment = custDep === 0 && custBal === 0 && estDepSum === 0 && estBalSum === 0;
    if (isPrePayment && hasNoPayment && (c.measure_date || c.install_date)) {
      issues.push('[참고: 미확정 일정] ' + c.client_name + '(id:' + c.id + ') — "' + c.stage + '" 단계(결제 전)인데 ' +
        (c.measure_date ? '실측예정 ' + c.measure_date : '') + (c.measure_date && c.install_date ? ', ' : '') +
        (c.install_date ? '시공예정 ' + c.install_date : '') + '가 이미 입력돼 있음(캘린더엔 미확정으로 표시됨)');
    }
  });

  return issues;
}

const log = [];
function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }

// 1) 김은/황남주 실사례 재현: 고객레벨엔 완납 기록, 견적서엔 결제정보가
// 아예 없음(0) - 이건 오늘 이미 코드로 고쳤지만(둘 중 큰 쪽 신뢰), 그래도
// 근본적으로 "서로 다른 값"이 존재했다는 사실 자체는 정합성 문제로
// 남겨서 확인하게 해야 함. 근데 이 케이스는 "한쪽이 0"이라 조건(둘 다
// 0이 아닌데 다름)에 안 걸림 - 의도된 설계: 아직 견적서 단위 저장이
// 시작 안 된 정상 상태와 "진짜로 어긋난 상태"를 구분하기 위함.
const 김은사례 = {
  customers: [{ id: 192, client_name: '김 은', stage: '시공완료', deposit_amount: 1500000, balance_amount: 1600000, is_archived: false }],
  estimates: [{ id: 'e1', client_id: 192, deposit_amount: 0, balance_amount: 0, is_archived: false }]
};
const 결과1 = dahScanForDataIntegrity(김은사례);
ok('1. 한쪽만 0인 경우(아직 견적서단위 미전환 정상상태)는 "불일치"로 안 잡힘(오탐 방지)', 결과1.filter(i => i.indexOf('결제 불일치') !== -1).length === 0, 결과1);

// 2) 진짜 불일치: 양쪽 다 값이 있는데 서로 다름 - 이건 진짜 문제로 잡혀야 함
const 진짜불일치사례 = {
  customers: [{ id: 300, client_name: '불일치테스트', stage: '시공완료', deposit_amount: 1000000, balance_amount: 500000, is_archived: false }],
  estimates: [{ id: 'e2', client_id: 300, deposit_amount: 999999, balance_amount: 500000, is_archived: false }]
};
const 결과2 = dahScanForDataIntegrity(진짜불일치사례);
ok('2. 양쪽 다 값이 있는데 실제로 다르면 "결제 불일치"로 정확히 잡힘', 결과2.some(i => i.indexOf('결제 불일치') !== -1 && i.indexOf('불일치테스트') !== -1), 결과2);

// 3) 최선미 실사례 재현: 상담 단계, 결제 0원, 실측예정일 있음
const 최선미사례 = {
  customers: [{ id: 400, client_name: '최선미', stage: '상담', deposit_amount: 0, balance_amount: 0, measure_date: '2026-09-22', install_date: null, is_archived: false }],
  estimates: []
};
const 결과3 = dahScanForDataIntegrity(최선미사례);
ok('3. 최선미 사례(상담단계, 결제0원, 실측예정일 있음)가 "참고: 미확정 일정"으로 정확히 잡힘', 결과3.some(i => i.indexOf('참고: 미확정 일정') !== -1 && i.indexOf('최선미') !== -1), 결과3);

// 4) 정상 케이스: 결제도 됐고 단계도 진행됐으면 아무 문제 없어야 함(회귀 없음)
const 정상사례 = {
  customers: [{ id: 500, client_name: '정상고객', stage: '실측준비중', deposit_amount: 500000, balance_amount: 0, measure_date: '2026-09-25', is_archived: false }],
  estimates: [{ id: 'e5', client_id: 500, deposit_amount: 500000, balance_amount: 0, is_archived: false }]
};
const 결과4 = dahScanForDataIntegrity(정상사례);
ok('4. 정상적으로 결제되고 단계 진행된 고객은 아무 이슈도 안 잡힘(회귀 없음)', 결과4.length === 0, 결과4);

log.forEach(l => console.log(l));
const failed = log.filter(l => l.startsWith('❌'));
console.log(failed.length === 0 ? '\n전체 통과' : '\n실패 ' + failed.length + '건');
process.exit(failed.length === 0 ? 0 : 1);
