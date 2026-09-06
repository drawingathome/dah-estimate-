#!/usr/bin/env node
// tests/run-all.js
// 4단계 검증 프로토콜 중 "Phase 4 (전문 제작 수준 최종 점검)"에 해당하는
// 자동화 가능한 항목들을 한번에 실행합니다.
//
// 사용법 (레포 루트에서):
//   node tests/run-all.js dah-dashboard.html
//   node tests/run-all.js dah-estimate.html
//
// 참고: 권한별 검사(role-permission-check)는 dah-dashboard.html에만 해당됩니다.
//
// 2026-08-27 추가: 헤더/전체폭 레이아웃처럼 두 앱(견적서+대시보드) 모두에
// 영향을 주는 큰 구조 변경을 했다면, 이 스크립트와 별개로
//   node tests/full-role-device-audit.js dah-estimate.html dah-dashboard.html
// 를 한 번 더 돌린다(마스터/실장 x PC/모바일 x 두 앱 = 8조합 스모크 테스트).
// 두 파일을 동시에 받아야 해서 이 run-all.js의 단일 target 구조에는
// 안 넣고 별도 스크립트로 둠 - CHANGE_IMPACT_CHECKLIST.md 15번 참고.

const { execSync } = require('child_process');
const path = require('path');

const target = process.argv[2];
if (!target) {
  console.error('사용법: node run-all.js <html파일경로>');
  process.exit(1);
}

const scripts = [
  ['font-check.js', [target, '390']],
  ['font-check.js', [target, '1280']],
  ['scroll-check.js', [target, '390']],
  ['scroll-check.js', [target, '1400']],
  ['touch-target-check.js', [target]] // 터치타겟은 개념 자체가 모바일 전용이라 의도적으로 390px만 검사
];

if (/dah-dashboard/.test(target)) {
  scripts.push(['login-flow-check.js', [target]]);
  scripts.push(['role-permission-check.js', [target]]);
  scripts.push(['dashboard-data-check.js', [target]]);
  scripts.push(['multi-device-sync-check.js', [target]]);
  scripts.push(['data-safety-check.js', [target]]);
  scripts.push(['race-condition-check.js', [target]]);
  scripts.push(['home-duplication-check.js', [target]]);
  scripts.push(['settings-memo-kanban-check.js', [target]]);
  scripts.push(['order-completeness-check.js', [target]]);
  scripts.push(['lead-followup-check.js', [target]]);
  scripts.push(['customer-list-check.js', [target]]);
  scripts.push(['revenue-consistency-check.js', [target]]);
  scripts.push(['detail-structure-check.js', [target]]);
  scripts.push(['responsive-layout-check.js', [target]]);
  scripts.push(['alim_excel_calendar_check.js', []]);
  // 2026-08-29: 알림톡 v3 재작성(체크리스트 25번 - 새 외부시스템 붙이기 전
  // 검증 습관화) - 22개 문구 존재/변수치환누락/고아항목/결제링크UI 검증
  scripts.push(['alim_v3_rewrite_check.js', []]);
  // 2026-08-29(선혜님 제안 - "1번도 2번도 아니고 자동 감시 테스트를
  // 만들자"): 대시보드/견적서 앱은 서로 다른 도메인이라 코드 공유가
  // 안 되고, 같은 목적의 로직이 양쪽에 따로 구현되면서 한쪽만 고치면
  // 조용히 어긋나는 문제(fmtPhone, 실측의뢰서 그룹핑 로직 등)가 오늘
  // 실제로 있었음. 양쪽 파일을 다 확인하는 특수한 테스트라, 중복 실행
  // 방지를 위해 dah-dashboard 대상일 때 한 번만 돌림(target 인자 자체는
  // 안 쓰고 dash-*.js/est-*.js 전체를 직접 스캔함).
  scripts.push(['cross-app-twin-check.js', []]);
  // 2026-09-06(선혜님 지시 - "지금 하자", 전문업체 기준 개선점으로
  // "새로 만든 안전장치에 영구 테스트가 없다"는 걸 해결하기 위해 추가):
  // shared-staging-guard.js(스테이징 쓰기차단 안전장치)도 두 앱이 공유하는
  // 파일이라 cross-app-twin-check.js와 같은 이유로 한 번만 돌림.
  scripts.push(['staging-guard-check.js', []]);
  const dashDir = path.dirname(target);
  const dashJsFiles = ['dash-api.js','dash-auth.js','dash-calendar.js','dash-chart.js','dash-core.js',
    'dash-customer-detail.js','dash-export.js','dash-kanban.js','dash-memo.js','dash-render.js',
    'dash-search.js','dash-settings.js','dash-ui-helpers.js','dash-utils.js']
    .map(f => path.join(dashDir, f));
  scripts.push(['anti-pattern-check.js', dashJsFiles]);
}

if (/dah-estimate/.test(target)) {
  scripts.push(['estimate-calc-check.js', [target]]);
  scripts.push(['estimate-validation-check.js', [target]]);
  scripts.push(['multi-device-sync-check.js', [target]]);
  scripts.push(['estimate-customer-link-check.js', [target]]);
  scripts.push(['estimate-duplicate-blindspot-check.js', [target]]);
  scripts.push(['master-vs-staff-feature-check.js', []]);
  scripts.push(['est-editing-state-reset-check.js', [target]]);
  scripts.push(['pleat-width-rounding-check.js', [target]]);
  // 2026-09-06(선혜님 지시 - "지금 하자", 전문업체 기준 개선점 - "새로
  // 만든 안전장치에 영구 테스트가 없다"는 걸 해결하기 위해 추가):
  // shared-optimistic-lock.js(낙관적잠금 락값갱신 공용함수) 검증.
  scripts.push(['optimistic-lock-check.js', []]);
}

let anyFail = false;
for (const [script, args] of scripts) {
  const scriptPath = path.join(__dirname, script);
  try {
    execSync(`node "${scriptPath}" ${args.map(a => `"${a}"`).join(' ')}`, { stdio: 'inherit' });
  } catch (e) {
    anyFail = true;
  }
}

console.log('\n========================================');
console.log(anyFail ? '❌ 일부 검사 실패 — 위 로그 확인 필요' : '✅ 전체 검사 통과');
console.log('========================================');
process.exitCode = anyFail ? 1 : 0;
