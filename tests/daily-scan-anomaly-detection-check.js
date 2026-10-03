#!/usr/bin/env node
// tests/daily-scan-anomaly-detection-check.js
// ══════════════════════════════════════════════════
// 2026-10-02(선혜님 - "전문업체 기준으로 확인해" / "해결방법은 뭔데" / "그럼 너가
// 순서를 정해서 위 부분 모두 적용하자" 요청으로 추가): apps-script-daily-backup.js의
// dahScanForDataIntegrity()에 오늘 실제로 터진 3가지 사고 패턴(이민선/김현정의
// 결제-단계 불일치·입금날짜 누락, 플러그 이관 19건의 매출 미인식, Daum API
// autoRoadAddress 누락으로 인한 주소 이상)을 자동 감시로 추가 - 사용자 신고로
// 발견되기 전에 매일 밤 자동 백업 시점에 먼저 잡아내기 위함.
//
// "최근 7일 이내 변경된 레코드만" 검사하도록 좁힘 - 실제 운영 DB로 미리 검증한 결과
// 이 필터가 없으면 "입금날짜 누락"만 62건이 나와(대부분 플러그 이관 당시부터 날짜
// 정보가 없었던 과거 데이터) 매일 같은 내용이 반복되는 "경고 피로"로 무시당할
// 위험이 컸음 - 필터 적용 후 2건으로 줄어듦(실제 새로 발생한 것만).
//
// 사용법: node tests/daily-scan-anomaly-detection-check.js
// ══════════════════════════════════════════════════
function dahScanForDataIntegrity(backup) {
  // 2026-10-02(선혜님 - "전문업체 기준으로 확인해" 지적으로 자동 감시 추가하다
  // 발견): 이 함수 안에 issues 배열이 선언 없이 쓰이고 있었음(Apps Script의
  // non-strict 환경에서 암묵적 전역변수로 우연히 작동했을 뿐, 명시적 선언이
  // 아니었음) - 다른 함수의 지역변수 issues와 이름이 겹치면 서로 오염될 위험이
  // 있던 잠재적 결함. 명시적으로 선언.
  var issues = [];

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

    // 1) 결제 정합성: 고객 레벨과 견적서 레벨 둘 다 결제 기록이 있는데
    // (둘 다 0이 아닌데) 서로 다른 금액이면 - 오늘 발견한 김은/황남주
    // 사례처럼 "쓰는 곳과 읽는 곳이 서로 다른 값을 본다"는 신호.
    if ((custDep + custBal) > 0 && (estDepSum + estBalSum) > 0 && (custDep !== estDepSum || custBal !== estBalSum)) {
      issues.push('[결제 불일치] ' + c.client_name + '(id:' + c.id + ') — 고객레벨(선금' + custDep.toLocaleString() + '/잔금' + custBal.toLocaleString() +
        ') vs 견적서합계(선금' + estDepSum.toLocaleString() + '/잔금' + estBalSum.toLocaleString() + ')가 서로 다름');
    }

    // 2) 미확정 일정 참고 알림: 아직 결제 전(상담/가견적 단계)인데
    // 실측·시공 예정일이 이미 잡혀있는 경우 - 오늘 최선미 고객 사례로
    // 발견함. 이건 "틀렸다"는 게 아니라(계획상 미리 적어두는 건 정상)
    // 참고용으로만 매일 한 번 모아서 보여줌 - 캘린더 화면 자체엔 이미
    // "미확정(결제 전)" 표시를 붙여둠(dash-calendar.js).
    var isPrePayment = ['방문예약', '상담', '가견적'].indexOf(c.stage) !== -1;
    var hasNoPayment = custDep === 0 && custBal === 0 && estDepSum === 0 && estBalSum === 0;
    if (isPrePayment && hasNoPayment && (c.measure_date || c.install_date)) {
      issues.push('[참고: 미확정 일정] ' + c.client_name + '(id:' + c.id + ') — "' + c.stage + '" 단계(결제 전)인데 ' +
        (c.measure_date ? '실측예정 ' + c.measure_date : '') + (c.measure_date && c.install_date ? ', ' : '') +
        (c.install_date ? '시공예정 ' + c.install_date : '') + '가 이미 입력돼 있음(캘린더엔 미확정으로 표시됨)');
    }

    // 2026-10-02(선혜님 - "이민선/김현정 결제했는데 상담에 뜨니 ... 전체 확인해" /
    // "전문업체 기준으로 확인해" 요청으로 추가한 자동 감시 3종): 전부 오늘 실제로
    // 터진 사고 패턴 - 사용자 신고로 발견되기 전에 매일 밤 자동으로 먼저 잡아내기 위함.
    // 실제 운영 DB로 미리 검증(아래 3~5번 조건) 중, "입금날짜 누락"이 62건이나 나오는
    // 것을 발견 - 대부분 플러그 이관 당시부터 날짜 정보 자체가 없었던 오래된 데이터라,
    // 매일 리포트에 그대로 넣으면 매번 같은 62건이 반복돼 "경고 피로"로 무시당할
    // 위험이 큼. 이 리포트의 목적은 "오늘/최근 새로 생긴 이상"을 잡는 것이지 과거
    // 누적 결함을 매일 알리는 게 아니므로, 아래 3개(3~5번)는 "최근 7일 이내에 실제로
    // 변경된 레코드"만 대상으로 좁힘 - 과거 데이터는 한 번(선혜님이 직접 확인한 16건
    // 등)만 별도로 정리하고, 이후로는 새로 발생하는 것만 매일 감시.
    var RECENT_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    var recentCutoff = new Date(Date.now() - RECENT_DAYS_MS);
    function isRecentlyUpdated(c) {
      if (!c.updated_at) return false;
      var t = new Date(c.updated_at);
      return !isNaN(t.getTime()) && t >= recentCutoff;
    }

    var recent = isRecentlyUpdated(c);

    // 3) 결제(선금 또는 잔금)는 있는데 아직 방문예약/상담/가견적 단계에 머물러
    // 있음 - 이민선/김현정 사례(estimates PATCH는 됐는데 customers 동기화가
    // 안 되거나, 단계전환이 조용히 실패한 신호).
    if (recent && isPrePayment && (custDep > 0 || custBal > 0)) {
      issues.push('[결제-단계 불일치] ' + c.client_name + '(id:' + c.id + ') — "' + c.stage +
        '" 단계인데 입금 기록(선금' + custDep.toLocaleString() + '/잔금' + custBal.toLocaleString() + ')이 있음 - 단계전환이 안 된 것으로 보임');
    }

    // 4) 입금액은 있는데 입금날짜가 비어있음 - 이민선/김현정 사례의 정확한 증상
    // (estimates엔 날짜가 있는데 customers 동기화에서 날짜만 빠지는 패턴). 최근
    // 변경분만 - 과거 이관 데이터는 원래부터 날짜가 없는 경우가 많아 매일 반복
    // 경고하면 의미가 없음.
    if (recent && custDep > 0 && !c.deposit_date) {
      issues.push('[입금날짜 누락] ' + c.client_name + '(id:' + c.id + ') — 선금 ' + custDep.toLocaleString() + '원은 기록됐는데 입금날짜가 비어있음');
    }
    if (recent && custBal > 0 && !c.balance_date) {
      issues.push('[입금날짜 누락] ' + c.client_name + '(id:' + c.id + ') — 잔금 ' + custBal.toLocaleString() + '원은 기록됐는데 입금날짜가 비어있음');
    }

    // 5) 시공완료 단계인데 매출(performance_revenue)이 0 - 오늘 플러그 이관
    // 19건에서 발견된 패턴(견적서가 가견적 상태로 남아 매출 미인식). 최근
    // 변경분만 - 아직 정리 안 된 과거 이관 잔여건을 매일 반복 경고하지 않도록.
    if (recent && c.stage === '시공완료' && !(Number(c.performance_revenue) > 0) && Number(c.price) > 0) {
      issues.push('[매출 미인식] ' + c.client_name + '(id:' + c.id + ') — "시공완료"인데 매출이 0으로 집계됨(제품가격 ' + Number(c.price).toLocaleString() + '원)');
    }

    // 6) 주소에 도로명주소 요소(로/길+숫자, 또는 시/도 이름)가 전혀 없음 -
    // Daum API의 autoRoadAddress 누락으로 생기던 패턴(16건 발견 사례). 최근
    // 변경분만 - 이미 아는 과거 16건은 선혜님이 별도로 정리 중이므로 매일
    // 반복하지 않고, "새로 또 발생했는지"만 감시.
    if (recent && c.addr) {
      var hasRoadMarker = /(로|길)\s*[0-9]/.test(c.addr) || /(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)/.test(c.addr);
      if (!hasRoadMarker) {
        issues.push('[주소 확인 필요] ' + c.client_name + '(id:' + c.id + ') — 주소 "' + c.addr + '"에 도로명/시도 표기가 없어 보임(확인 필요)');
      }
    }
  });

  return issues;
}

var NOW = Date.now();
var RECENT = new Date(NOW - 2*24*60*60*1000).toISOString(); // 2일 전(최근)
var OLD = new Date(NOW - 30*24*60*60*1000).toISOString(); // 30일 전(과거)

var backup = {
  customers: [
    // 최근 변경 + 이상 → 잡혀야 함
    { id: 1, client_name: '최근이상', is_archived: false, stage: '상담', deposit_amount: 1000000, deposit_date: '', balance_amount: 0, balance_date: '', price: 2475000, performance_revenue: 0, addr: '서울 신반포로 20', updated_at: RECENT },
    // 과거 변경 + 이상 → 안 잡혀야 함(경고피로 방지)
    { id: 2, client_name: '과거이상', is_archived: false, stage: '상담', deposit_amount: 1000000, deposit_date: '', balance_amount: 0, balance_date: '', price: 2475000, performance_revenue: 0, addr: '서울 신반포로 20', updated_at: OLD },
    // 최근 변경 + 정상 → 안 잡혀야 함
    { id: 3, client_name: '최근정상', is_archived: false, stage: '선금결제', deposit_amount: 500000, deposit_date: '2026-10-01', balance_amount: 0, balance_date: '', price: 2000000, performance_revenue: 2000000, addr: '서울 신반포로 20', updated_at: RECENT }
  ],
  estimates: []
};

var found = dahScanForDataIntegrity(backup);
console.log('발견:', found.length);
found.forEach(function(i){ console.log(' -', i); });

var checks = [
  ['최근이상 잡힘', found.some(function(i){return i.indexOf('최근이상')>=0;})],
  ['과거이상 안 잡힘(경고피로 방지)', !found.some(function(i){return i.indexOf('과거이상')>=0;})],
  ['최근정상 안 잡힘', !found.some(function(i){return i.indexOf('최근정상')>=0;})]
];
var ok = true;
checks.forEach(function(c){ console.log((c[1]?'✅':'❌'), c[0]); if(!c[1]) ok=false; });
process.exit(ok?0:1);
