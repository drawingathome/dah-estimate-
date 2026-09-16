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
  // 2026-09-15(코드정리 중 발견 - run-all.js에 등록이 안 돼있던 기존
  // 테스트 파일 10개 재등록. 여러 세션이 동시에 이 저장소를 작업하면서
  // 병합 과정에서 scripts.push 등록 줄이 누락된 것으로 추정): 실제로
  // 돌려보고 통과하는 것만 등록함(staff-full-sweep류는 전체탐색형
  // 도구라 별개로 수동 실행하는 게 맞아서 제외).
  scripts.push(['add_modal_position_check.js', []]);
  scripts.push(['cloud_estimate_convert_check.js', []]);
  scripts.push(['modal_mobile_position_check.js', []]);
  scripts.push(['modal_pc_position_check.js', []]);
  scripts.push(['no_archive_hide_check.js', []]);
  scripts.push(['no_reentry_needed_check.js', []]);
  // 2026-09-15(코드정리 중 발견 - 8/24 이전 기준으로 짜여있던 테스트를
  // 최신 기준(isRejected는 명시적 'rejected'만)에 맞게 고쳐서 재등록)
  scripts.push(['est_archive_filter_check.js', []]);
  scripts.push(['xhr_timeout_check.js', []]);
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
  // 2026-09-11: 22개→13개 통합 재작성으로 옛 alim_v3_rewrite_check.js가
  // 참조하던 키(t43_deposit_card 등)가 전부 없어져서 폐기, 신규 테스트로 교체
  scripts.push(['alim_13_rewrite_check.js', []]);
  // 2026-09-11: 트리거감지 1단계(시점판단 로직) 검증 — D-1/재확인/재예약리셋 등
  scripts.push(['alim_trigger_timing_check.js', []]);
  // 2026-09-11: 신규리드 선착순 배정(미배정 풀 + 클릭해서 담당) 검증
  scripts.push(['unassigned_claim_check.js', []]);
  // 2026-09-15("코드 검사 꼼꼼하게 하자" 중 발견): 위 unassigned_claim_check.js가
  // 마스터 계정으로만 검증해서, 정작 이 기능(신규리드 선착순 배정)을 써야 할
  // 스태프 계정에서는 완전히 안 보이던 심각한 버그를 놓쳤었음 - 반드시 스태프
  // 관점으로 검증하는 테스트를 별도로 추가(체크리스트 37번 참고).
  scripts.push(['staff-claim-check.js', []]);
  // 2026-09-15("이제 누락된거는 없니?? 시뮬레이션 돌려보자"): 위 개별
  // 화면별 테스트들과 별개로, "한 명의 신규(미배정) 고객"이 홈/검색/캘린더/
  // 칸반/견적서목록 5곳에 전부 보이다가 담당을 가져가면 정확히 사라지는
  // 것까지 하나로 이어서 검증하는 종단간 시뮬레이션 - 각 화면을 따로
  // 고쳤을 때 놓치기 쉬운 "전체 흐름에서 어딘가 하나가 빠지는" 회귀를 잡음.
  scripts.push(['unassigned-lifecycle-e2e-check.js', []]);
  // 2026-09-11: 감사로그(변경이력) 조회 화면 검증
  scripts.push(['audit_log_check.js', []]);
  // 2026-09-11: AS 관리 화면(GitHub 이슈#4) — 접수 등록/상태변경 검증
  scripts.push(['as_management_check.js', []]);
  // 2026-09-11: 네이버예약 붙여넣기 자동채우기 검증
  scripts.push(['naver_paste_parse_check.js', []]);
  // 2026-09-14: 4번/7번 가견적·확정견적서 발송 시 최신 견적ID 자동조회 검증
  scripts.push(['estimate_link_autofetch_check.js', []]);
  // 2026-09-14: 견적서 링크가 오래된(오늘 아닌) 견적을 가리킬 때 경고배너 검증
  scripts.push(['estimate_stale_warning_check.js', []]);
  // 2026-09-14: 소통(알림톡) 탭 UX 개선 검증 - 발송라벨/기본접힘/중복제거
  scripts.push(['alim_tab_ux_check.js', []]);
  // 2026-09-14: 정보탭/소통탭 "지금 할 일" 개수 일치 검증 (서로 다른 로직 쓰던 버그)
  scripts.push(['alim_todo_consistency_check.js', []]);
  // 2026-09-15: 로그인 토큰이 자동갱신될 때 실시간 동기화 채널에도 새
  // 토큰이 반영되는지 검증 (예전엔 최초 토큰 그대로 굳어있다가 만료후
  // 계속 연결실패하던 버그)
  scripts.push(['realtime_token_refresh_check.js', []]);
  // 2026-09-15: 견적서 이력/복원 기능 검증 (DB 트리거로 자동 백업된
  // 이전 버전을 화면에서 보고 복원할 수 있는지)
  scripts.push(['estimate_history_restore_check.js', []]);
  // 2026-09-15: 정보탭 개선 검증 - 중복금액 병합/버튼 정리(⋮메뉴)
  scripts.push(['info_tab_polish_check.js', []]);
  // 2026-09-14: 진행 단계 표시가 "N/전체" 숫자 형식으로 정확히 나오는지 검증
  scripts.push(['stage_progress_number_check.js', []]);
  // 2026-09-14: 6번 결제안내 버튼 URL("https://#{결제링크}")이 저장된
  // 링크값과 합쳐질 때 "https://https://" 이중 접두어가 안 생기는지 검증
  scripts.push(['payment_link_button_check.js', []]);
  // 2026-09-15: "새 견적서" 버튼이 이전 고객의 확정상태를 초기화하는지
  // 검증 - 허서진 고객 사례("데이터 다 날아감")로 발견
  scripts.push(['confirm_state_reset_check.js', []]);
  // 2026-09-15: 편집세션 상태 리셋을 "레지스트리 객체" 구조로 통합 -
  // 새 변수가 생겨도 이름만 등록하면 자동으로 리셋되는지 검증
  scripts.push(['est_session_reset_registry_check.js', []]);
  // 2026-08-29(선혜님 제안 - "1번도 2번도 아니고 자동 감시 테스트를
  // 만들자"): 대시보드/견적서 앱은 서로 다른 도메인이라 코드 공유가
  // 안 되고, 같은 목적의 로직이 양쪽에 따로 구현되면서 한쪽만 고치면
  // 조용히 어긋나는 문제(fmtPhone, 실측의뢰서 그룹핑 로직 등)가 오늘
  // 실제로 있었음. 양쪽 파일을 다 확인하는 특수한 테스트라, 중복 실행
  // 방지를 위해 dah-dashboard 대상일 때 한 번만 돌림(target 인자 자체는
  // 안 쓰고 dash-*.js/est-*.js 전체를 직접 스캔함).
  scripts.push(['cross-app-twin-check.js', []]);
  // 2026-09-14(선혜님 지시 - "쌍둥이함수 찾아", 정보탭↔소통탭 "지금 할
  // 일" 불일치 버그로 발견): 대시보드 "안에서" 같은 판단을 두 곳에
  // 따로 구현하는 문제는 cross-app-twin-check.js로는 못 잡음 - 별도
  // 감시 테스트 신설.
  scripts.push(['intra-app-twin-check.js', []]);
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
  // 2026-09-15(코드정리 중 발견 - 등록 누락됐던 기존 테스트 재등록)
  scripts.push(['lineitems_fix_check.js', []]);
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
  scripts.push(['pay-changestage-lock-sync-check.js', []]);
  // 2026-09-08(선혜님 지적 - "얼렁뚱땅 넘어가지 마... 이래서 너를
  // 믿겠니??"로 발견된 신뢰 문제 해결): 같은 종류의 select값 유실
  // 버그가 세 번 재발했음(8/29, 9/8 1차 오진단, 9/8 2차) - 말이 아니라
  // 테스트로 다음 재발을 잡도록 영구 등록.
  scripts.push(['curtain-select-value-integrity-check.js', []]);
  // 2026-09-12: 형상가공 기본값 복원 검증 (예전 데이터 X로 잘못 복원되던 버그)
  scripts.push(['shape_process_default_check.js', []]);
  // 2026-09-15: "복사해서 새로 만들기"가 오늘 저장된 원본을 덮어쓰지 않는지 검증
  scripts.push(['estimate_copy_no_overwrite_check.js', []]);
  // 2026-09-12: 캔가공소 자체 도착장소(시공팀 시공)와 원단/레일/블라인드
  // 도착장소(캔가공소 수신)가 서로 다른 필드로 올바르게 분리됐는지 검증
  scripts.push(['production_output_location_check.js', []]);
  // 2026-09-12: 캔가공소 자체 도착장소가 고정값이 아니라 건별 시공팀장
  // 입력값을 따라 동적으로 바뀌는지 검증
  scripts.push(['production_dynamic_installer_check.js', []]);
  scripts.push(['field-parity-check.js', []]);
  // 2026-09-14: 고객용 견적서 공개보기(로그인 없이 ?view=id로 보는 화면) 검증
  scripts.push(['est_public_view_check.js', []]);
  // 2026-09-15: 저장 버튼을 눌렀는데 검증실패로 조용히 멈춰도 "시도 기록"이
  // 무조건 남는지 검증 - "인테리어오월" 견적서 실종 사건으로 발견한 위험
  scripts.push(['save_attempt_log_check.js', []]);
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
