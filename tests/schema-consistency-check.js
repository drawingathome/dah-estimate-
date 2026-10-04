// tests/schema-consistency-check.js
// 2026-09-21(선혜님 - "전문업체라면 어떻게 하겠니? 제대로 좀 해봐" 요청
// 으로 전체 스키마 재점검 중 발견한 심각한 회귀를 계기로 신설): 오늘
// 아침 dash-customer-detail.js가 estimates 테이블에 실제로 존재하지
// 않는 컬럼(measure_date - 실제로는 'date')으로 PATCH를 보내고 있었음.
// 재현 테스트가 네트워크를 mock해서 항상 성공 응답을 줬기 때문에 이걸
// 못 잡았고, 실제 Supabase에 재현해서야 "column measure_date of
// relation estimates does not exist" 에러로 확인됨. 이런 "코드가 쓰는
// 필드명 vs 실제 DB 컬럼명" 불일치는 mock 기반 재현 테스트로는 원천적
// 으로 못 잡음 - customers/estimates 테이블에 쓰기(PATCH/POST)하는
// 모든 지점을 전수 확인해서, 그 필드명들을 db-schema-snapshot.json
// (실제 DB에서 조회한 컬럼 목록)과 대조하는 화이트박스 테스트로 신설.
// DB에 컬럼을 추가/삭제하면 db-schema-snapshot.json도 함께 갱신해야
// 하고, 코드에 새로운 estimates/customers 쓰기 지점을 추가하면 아래
// KNOWN_WRITE_SITES에도 그 필드 목록을 추가해야 이 테스트가 계속
// 의미 있음(체크리스트 성격 - 완전 자동 정적분석이 아님).
const fs = require('fs');
const path = require('path');

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'db-schema-snapshot.json'), 'utf8'));

// 코드베이스 전수조사로 확인한, customers/estimates에 실제로 쓰기하는
// 모든 지점과 그 지점이 보내는 필드명 목록. (파일:줄 은 발견 당시 기준 —
// 리팩터링으로 줄 번호가 달라져도 이 목록의 유효성엔 영향 없음, 필드명만
// 정확하면 됨.)
const KNOWN_WRITE_SITES = [
  { file: 'dash-customer-detail.js', desc: '날짜 클릭수정 - 견적서 동기화', table: 'estimates',
    fields: ['date', 'install_date', 'measure_date_tbd', 'install_date_tbd'] },
  { file: 'dash-customer-detail.js', desc: '진행중 견적 금액 직접수정', table: 'customers',
    fields: ['price', 'performance_revenue'] },
  { file: 'dash-customer-detail.js', desc: '이력 - 이 버전으로 복원', table: 'estimates',
    fields: ['price', 'line_items', 'memo', 'estimate_status', 'contract_status'] },
  { file: 'dash-customer-pay.js', desc: '견적서별 결제 저장', table: 'estimates',
    fields: ['deposit_amount', 'deposit_date', 'deposit_method', 'deposit_receipt',
             'balance_amount', 'balance_date', 'balance_method', 'balance_receipt'] },
  { file: 'dash-customer-pay.js', desc: '고객 레벨 결제 저장(신규고객 폴백)', table: 'customers',
    fields: ['deposit_amount', 'deposit_date', 'deposit_method', 'deposit_receipt',
             'balance_amount', 'balance_date', 'balance_method', 'balance_receipt',
             'price', 'performance_revenue'] },
  { file: 'dash-api.js', desc: '담당자 배정(선점)', table: 'customers', fields: ['staff_name'] },
  { file: 'dash-api.js', desc: '보관 복구/리드 보관·복귀', table: 'customers',
    fields: ['is_archived', 'lead_parked'] },
  { file: 'dash-customer-as.js', desc: 'AS 상태 변경', table: 'as_records', fields: [], skip: true },
  { file: 'dash-render-est.js', desc: '견적서 client_id 연결', table: 'estimates', fields: ['client_id'] },
  { file: 'dash-settings.js', desc: '담당자명 일괄변경', table: 'customers', fields: ['staff_name'] },
  { file: 'dash-settings.js', desc: '담당자명 일괄변경(견적서)', table: 'estimates', fields: ['staff_name'] },
  { file: 'est-doc-request.js', desc: '설치기사 정보 즉시저장', table: 'estimates',
    fields: ['installer_name', 'installer_phone'] },
  { file: 'est-save.js', desc: '견적서 메인 저장(신규/수정 공통)', table: 'estimates',
    fields: ['client_idempotency_key', 'customer_name', 'price', 'performance_revenue',
             'staff_name', 'estimate_status', 'phone', 'space', 'product', 'date',
             'install_date', 'measure_date_tbd', 'install_date_tbd', 'memo', 'confirmed_at',
             'branch', 'client_id', 'line_items', 'cust_type', 'region',
             'applied_discounts', 'price_breakdown',
             'as_install_date', 'as_type', 'as_symptom', 'as_photo_memo', 'as_fee_type'] },
];

const log = [];
function ok(label, cond, detail) { log.push((cond ? '✅' : '❌') + ' ' + label + (detail !== undefined ? ' — ' + detail : '')); }

KNOWN_WRITE_SITES.forEach(function(site) {
  if (site.skip) return; // as_records 등 이 스냅샷 범위 밖 테이블
  var validColumns = schema[site.table];
  ok('스키마 정의 존재 — ' + site.table, !!validColumns, site.table);
  if (!validColumns) return;
  site.fields.forEach(function(field) {
    ok(site.file + ' (' + site.desc + ') → ' + site.table + '.' + field,
       validColumns.indexOf(field) >= 0,
       validColumns.indexOf(field) >= 0 ? undefined : '실제 DB에 이 컬럼이 없음!');
  });
});

console.log(log.join('\n'));
const failed = log.filter(l => l.startsWith('❌'));
console.log(failed.length === 0 ? '\n✅ 전체 통과 (' + log.length + '건 검증)' : '\n❌ ' + failed.length + '건 실패');
if (failed.length > 0) process.exit(1);
