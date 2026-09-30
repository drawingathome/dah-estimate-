// tests/intra-app-twin-check.js
// ══════════════════════════════════════════════════
// cross-app-twin-check.js는 "대시보드 ↔ 견적서 앱"처럼 서로 다른
// 도메인 사이의 쌍둥이 함수만 감시한다. 그런데 2026-09-14에 실제로
// 발견된 버그(정보탭 "지금 해야 할 일" vs 소통탭 "지금 보낼 알림톡"이
// 서로 다른 개수를 보여줌)는 대시보드 "안에서" 같은 판단을 두 곳에
// 따로 구현해서 생긴 것 - cross-app 테스트로는 절대 못 잡는 종류다.
//
// 이 파일은 "대시보드 안에서 반드시 하나의 함수만 써야 하는" 로직을
// 목록으로 등록해두고, 그 규칙이 깨졌는지(누가 옆에 새 로컬 계산을
// 다시 만들었는지) 정적 검사 + 실제 동작 검사 둘 다로 잡는다.
//
// 새로운 쌍둥이 사례를 발견하면 아래 REGISTRY에 항목을 추가한다.
// ══════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

let passCount = 0, failCount = 0;
function check(label, condition, detail) {
  if (condition) { console.log('  ✅ ' + label); passCount++; }
  else { console.log('  ❌ ' + label + (detail ? ' — ' + detail : '')); failCount++; }
}

function readFile(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

// 등록부: "이 로직은 반드시 이 공용함수를 거쳐야 한다"는 규칙들.
// file/caller: 그 로직을 쓰는 곳(함수 이름). mustCall: 그 함수 소스
// 안에 반드시 등장해야 하는 공용함수 호출 패턴. forbid: 등장하면 안
// 되는 패턴(누가 로컬로 다시 구현했다는 신호).
const REGISTRY = [
  {
    name: '알림톡 "지금 할 일" 판단 (정보탭 renderDetailTodoSection ↔ 공용함수 getDueAlimKeys)',
    // 2026-09-24(선혜님 - "바꿔보자" 큰 파일 쪼개기로 renderDetailTodoSection이
    // dash-customer-detail.js → dash-customer-detail-tabs.js로 이동함에 따라
    // 이 검사 자체가 하드코딩된 파일명을 못 찾아서 조용히 실패하고 있었음.
    file: 'dash-customer-detail-tabs.js',
    fnName: 'renderDetailTodoSection',
    mustCall: 'getDueAlimKeys(',
    forbid: [/STAGE_ALIM\s*\[\s*c\.stage\s*\]/]
  }
];

function extractFunctionSource(content, fnName) {
  const startPattern = new RegExp('function\\s+' + fnName + '\\s*\\([^)]*\\)\\s*\\{');
  const m = startPattern.exec(content);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  const bodyStart = i;
  while (depth > 0 && i < content.length) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }
  return content.slice(bodyStart, i - 1);
}

console.log('\n[대시보드 내부 쌍둥이 함수 자동감시] intra-app-twin-check.js');

REGISTRY.forEach(function(rule) {
  const content = readFile(rule.file);
  const src = extractFunctionSource(content, rule.fnName);
  check(rule.name + ' - 함수 존재', !!src, rule.fnName + ' 못 찾음');
  if (!src) return;
  check(rule.name + ' - 공용함수를 실제로 호출함', src.indexOf(rule.mustCall) !== -1, '"' + rule.mustCall + '" 없음(로컬 재구현했을 가능성)');
  (rule.forbid || []).forEach(function(pattern) {
    check(rule.name + ' - 금지 패턴(' + pattern + ') 없음', !pattern.test(src));
  });
});

// getDueAlimKeys/getAlimSentMap 자체가 정확히 한 곳에만 정의돼있는지도 확인
// (공용함수 여러 벌 만들어놓고 서로 다른 데서 부르면 똑같이 쌍둥이 문제 재발)
['getDueAlimKeys', 'getAlimSentMap'].forEach(function(fnName) {
  const files = ['dash-customer-alim.js', 'dash-customer-detail.js', 'dash-customer-detail-tabs.js', 'dash-customer-estimates.js', 'dash-render.js', 'dash-kanban.js'];
  let defCount = 0;
  files.forEach(function(f) {
    try {
      const c = readFile(f);
      const matches = c.match(new RegExp('^function\\s+' + fnName + '\\s*\\(', 'gm'));
      if (matches) defCount += matches.length;
    } catch (e) {}
  });
  check(fnName + '() 정의가 정확히 1곳에만 있음(중복정의 없음)', defCount === 1, '정의 개수=' + defCount);
});

// 2026-09-29(코드정리 - 선혜님 "하자"): 고객 진행 9단계 순서(DAH_STAGE_ORDER)와 계약 이전 3단계
// (DAH_PRE_CONTRACT_STAGES)를 shared-common-utils.js 한 곳으로 모았는데, 예전처럼 누가 다시
// 하드코딩된 배열을 만들면 조용히 어긋나는 문제가 재발할 수 있음 - 그 리터럴 패턴이 공용파일
// 밖에 다시 나타나는지 감시.
(function () {
  var pattern = /\[\s*'방문예약'\s*,\s*'상담'\s*,\s*'가견적'/;
  var pattern2 = /\[\s*'선금결제'\s*,\s*'실측준비중'\s*,\s*'확정견적'\s*,\s*'잔금결제'\s*,\s*'시공준비중'\s*,\s*'시공완료'/; // 2026-09-30: 계약 이후 6단계(DAH_POST_CONTRACT_STAGES)도 추가
  var checkFiles = ['dash-render.js', 'dash-kanban.js', 'dash-customer-detail.js', 'dash-chart.js', 'dash-customer-pay.js', 'dash-customer-detail-tabs.js', 'dash-customer-estimates.js', 'dash-render-search.js', 'dash-render-est.js', 'dash-utils.js'];
  checkFiles.forEach(function (f) {
    var c;
    try { c = readFile(f); } catch (e) { return; }
    check('고객 진행단계 리터럴이 ' + f + '에 재등장하지 않음(공용상수 DAH_STAGE_ORDER/DAH_PRE_CONTRACT_STAGES 대신 쓸 것)', !pattern.test(c));
    check('계약 이후 6단계 리터럴이 ' + f + '에 재등장하지 않음(공용상수 DAH_POST_CONTRACT_STAGES 대신 쓸 것)', !pattern2.test(c));
  });
})();

// 2026-09-30(선혜님 - "이 문제의 쌍둥이함수도 찾아봤니" - est-save-stages.js의 is_archived 미명시
// 버그를 고친 뒤 전수검색으로 dash-customer-as.js에서도 같은 클래스의 위험 발견): 서버에서
// "is_archived=eq.false/is.false"로 필터링해서 목록을 조회하는데, 신규 생성 payload에 이 필드가
// 없으면 DB 기본값(NULL일 경우) 때문에 방금 만든 레코드가 목록에서 조용히 빠질 수 있음. 이
// 필드가 신규생성 payload에서 빠지는 재발을 감시.
(function () {
  var files = ['dash-customer-as.js', 'est-save-stages.js'];
  files.forEach(function (f) {
    var c;
    try { c = readFile(f); } catch (e) { return; }
    check('신규 생성 payload에 is_archived가 명시돼 있음(' + f + ') - 서버측 is_archived=false 필터 조회에서 누락되지 않도록', /is_archived\s*:\s*(false|window\._estEditState\.editingEstDbId)/.test(c));
  });
})();

console.log('\n결과: ' + passCount + '건 통과, ' + failCount + '건 실패');
process.exit(failCount === 0 ? 0 : 1);