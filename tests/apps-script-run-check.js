#!/usr/bin/env node
// tests/apps-script-run-check.js
// ══════════════════════════════════════════════════
// 2026-10-06(선혜님 - 매일 아침 "ReferenceError: issues is not defined" 실패 메일, "해결해"):
// Apps Script는 브라우저 테스트 대상이 아니라 CI 밖에 있었고, ESLint(정적 검사)만으로는 "실제로 끝까지 실행되는지"까지는
// 보장하지 못함. 구글 서비스(드라이브·메일·서버 호출)를 가짜로 대체한 환경에서 dahDailyBackup()을 실제로 실행해서
//  1) 이상 데이터가 없는 날: 끝까지 정상 실행 + 백업 파일 저장 + 불필요한 메일 없음
//  2) 이상 데이터가 있는 날: 끝까지 정상 실행 + 정합성 점검 메일 발송 + 메일에 스크립트 버전 표시
//  3) 점검 함수 하나가 오류로 죽는 날: 전체가 죽지 않고(백업 저장 + 나머지 점검 계속), "어떤 점검이 죽었는지" 알림 메일 발송
// 을 검증. 사고(9/23~10/6, issues 선언 누락으로 매일 실패)가 배포 전에 걸러지게 하는 용도.
//
// 사용법: node tests/apps-script-run-check.js   (다른 파일 검증: APPS_SCRIPT_FILE=경로 node tests/apps-script-run-check.js)
// ══════════════════════════════════════════════════
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const FILE = process.env.APPS_SCRIPT_FILE || path.resolve(__dirname, '..', 'apps-script-daily-backup.js');
let failed = 0;
function ok(label, cond, detail) { console.log((cond ? '✅ ' : '❌ ') + label + (cond ? '' : ' — ' + (detail || ''))); if (!cond) failed++; }

function buildContext(opts) {
  const mails = [], created = [], logs = [], fetchedTables = [];
  // 2026-10-10: 월 마감 점검용 - 기본값은 "지난달이 이미 마감됨"이라 기존 케이스들은 조용함.
  const _d = new Date(); const _p = new Date(_d.getFullYear(), _d.getMonth() - 1, 1);
  const prevMonthKey = _p.getFullYear() + '-' + String(_p.getMonth() + 1).padStart(2, '0');
  const now = new Date().toISOString();
  const customers = opts.customers ? opts.customers : opts.anomalies ? [{ id: 1, client_name: '테스트고객', phone: '010-1111-2222', stage: '시공완료', performance_revenue: 0, price: 1000000, deposit_amount: '0', balance_amount: '0', deposit_date: null, balance_date: null, addr: '트리니원 111동 2304호', updated_at: now, created_at: now, is_archived: false }] : [];
  const respond = (body, c = 200) => ({ getResponseCode: () => c, getContentText: () => JSON.stringify(body), getHeaders: () => ({}) });
  const ctx = {
    console, Date, JSON, Math, Array, Object, String, Number, RegExp, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, Error, Set, Map,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'LAST_ERROR_CHECK_TIME' ? null : 'fake-secret'), setProperty: () => {}, getProperties: () => ({}) }) },
    UrlFetchApp: { fetch: (url, o) => {
      if (url.includes('rpc/dah_backup_export')) { const t = JSON.parse(o.payload).table_name; fetchedTables.push(t); if (t === 'monthly_close') return respond(opts.monthlyClose === 'error' ? { error: 'x' } : (opts.monthlyClose || [{ month: prevMonthKey }])); return respond(t === 'customers' ? customers : t === 'estimates' ? (opts.estimates || []) : []); }
      if (url.includes('client_error_logs?select=message,user_name')) return respond(opts.saveFails || []);
      if (url.includes('client_error_logs?')) return respond(opts.errorLogs || []);
      if (url.includes('v_critical_triggers_status')) return respond((opts.triggers || ['trg_enforce_estimate_status', 'trg_estimate_history', 'trg_customer_history', 'trg_sync_customer_payment', 'trg_guard_staff_name_customers', 'trg_guard_staff_name_estimates', 'trg_guard_payment_reduction_customers', 'trg_guard_payment_reduction_estimates', 'trg_guard_payment_date', 'trg_guard_archived_estimate_payment', 'trg_payment_refunds_append_only', 'trg_estimates_confirm_guard', 'trg_sync_customer_price', 'trg_adjust_customer_amounts_on_estimate_delete', 'trg_extra_payment_touch_customer', 'trg_customers_auto_stage']).map(n => ({ trigger_name: n })));
      if (url.includes('integrity_daily_log')) return respond(opts.dbLog || [{ run_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), total_count: 0 }]);
      if (url.includes('data_integrity_issues')) return respond(opts.dbIssues || []);
      if (url.includes('permission_selftest_log?')) return respond(opts.selftest || [{ run_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), ok: true, detail: {} }]);
      if (url.includes('apps-script-daily-backup.js')) return { getResponseCode: () => opts.liveVer === 'fail' ? 500 : 200, getContentText: () => "var DAH_SCRIPT_VERSION = '" + (opts.liveVer || fs.readFileSync(FILE, 'utf-8').match(/var DAH_SCRIPT_VERSION = '([^']+)'/)[1]) + "';", getHeaders: () => ({}) };
      if (url.includes('estimate_confirm_log?')) return respond(opts.confirmLog || []);
      if (url.includes('/customers?id=in.')) return respond([{ id: 7, client_name: '해제테스트' }]);
      if (url.includes('/surveys?status=eq.')) return respond(opts.newSurveys || []);
      if (url.includes('integrity_acks')) return respond(opts.dbAcks || []);
      if (url.includes('v_critical_constraints_status')) return respond([{ constraint_name: 'surveys_client_idempotency_key_unique' }]);
      return respond([]);
    } },
    DriveApp: { getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => ({ getFilesByName: () => ({ hasNext: () => false }), createFile: (n) => { created.push(n); } }) },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
    MailApp: { sendEmail: (...a) => mails.push({ subject: String(a[1] || ''), body: String(a[2] || '') }) },
    Session: { getActiveUser: () => ({ getEmail: () => 'owner@example.com' }), getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    Logger: { log: (m) => logs.push(String(m)), getLog: () => logs.join('\n') },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    ScriptApp: { getProjectTriggers: () => [] },
  };
  return { ctx, mails, created, logs, fetchedTables };
}

function run(opts, tweak) {
  const env = buildContext(opts);
  vm.createContext(env.ctx);
  vm.runInContext(fs.readFileSync(FILE, 'utf-8'), env.ctx);
  const calls = { triggers: 0 };
  if (tweak) tweak(env.ctx, calls);
  let error = null;
  try { env.ctx.dahDailyBackup(); } catch (e) { error = e.name + ': ' + e.message; }
  return { error, calls, version: env.ctx.DAH_SCRIPT_VERSION, ...env };
}

// 1) 이상 데이터 없는 날
const clean = run({ anomalies: false });
ok('1. [이상 없는 날] 끝까지 정상 실행', clean.error === null, clean.error);
ok('1-1. [이상 없는 날] 백업 파일이 저장됨', clean.created.length === 1, JSON.stringify(clean.created));
ok('1-2. [이상 없는 날] 불필요한 알림 메일이 없음', clean.mails.length === 0, JSON.stringify(clean.mails.map(m => m.subject)));

// 2) 이상 데이터 있는 날
const bad = run({ anomalies: true });
ok('2. [이상 있는 날] 끝까지 정상 실행', bad.error === null, bad.error);
ok('2-1. [이상 있는 날] 백업 파일이 저장됨', bad.created.length === 1);
const integrityMail = bad.mails.find(m => /데이터 정합성 점검/.test(m.subject));
ok('2-2. [이상 있는 날] 정합성 점검 메일이 발송됨', !!integrityMail, JSON.stringify(bad.mails.map(m => m.subject)));
ok('2-3. [이상 있는 날] 메일 본문에 스크립트 버전이 표시됨(낡은 코드 식별용)', !!integrityMail && integrityMail.body.indexOf(String(bad.version)) !== -1 && !!bad.version, 'version=' + bad.version);

// 3) 점검 함수 하나가 죽는 날
const boom = run({ anomalies: true }, (ctx, calls) => {
  ctx.dahScanForDataIntegrity = function () { throw new Error('일부러 낸 오류'); };
  ctx.dahScanForMissingTriggers = function () { calls.triggers++; return []; };
});
ok('3. [점검 하나가 죽는 날] 전체가 죽지 않고 끝까지 실행', boom.error === null, boom.error);
ok('3-1. [점검 하나가 죽는 날] 백업 파일은 정상 저장됨', boom.created.length === 1);
ok('3-2. [점검 하나가 죽는 날] 뒤따르는 다른 점검(트리거 점검)이 계속 실행됨', boom.calls.triggers === 1, 'calls=' + boom.calls.triggers);
const failMail = boom.mails.find(m => /자동점검 실행 오류/.test(m.subject));
ok('3-3. [점검 하나가 죽는 날] "어떤 점검이 죽었는지" 알림 메일이 발송됨(점검 이름 + 버전 포함)', !!failMail && /dahScanForDataIntegrity/.test(failMail.body) && failMail.subject.indexOf(String(boom.version)) !== -1, JSON.stringify(boom.mails.map(m => m.subject)));

// ── 2026-10-07(선혜님 - "오류가 이렇게 많다, 모두 확인 제대로 하라고"): 아침 점검 메일 소음 4통 수정 검증 ──
// 실제 운영 기록 모양 그대로: 저장 성공 응답은 상태값이 extra.detail.status(한 단계 아래)에 있음(DB로 확인).
const now = new Date().toISOString();
const routineLogs = [
  { created_at: now, message: '저장단계: 시작', url: '', extra: { stage: '시작', detail: null, customerName: '홍은지' }, app: 'estimate', user_role: 'staff' },
  { created_at: now, message: '저장단계: 세션확인-정상', url: '', extra: { stage: '세션확인-정상', detail: null }, app: 'estimate', user_role: 'staff' },
  { created_at: now, message: '저장단계: 검증통과', url: '', extra: { stage: '검증통과', detail: null }, app: 'estimate', user_role: 'staff' },
  { created_at: now, message: '저장단계: 고객저장-응답', url: '', extra: { stage: '고객저장-응답', detail: { status: 200, bodyLen: 826 } }, app: 'estimate', user_role: 'staff' },
  { created_at: now, message: '저장단계: 견적서저장-응답', url: '', extra: { stage: '견적서저장-응답', detail: { status: 201, bodyLen: 2720 } }, app: 'estimate', user_role: 'staff' },
];
const realError = { created_at: now, message: '저장단계: 견적서저장-응답', url: '', extra: { stage: '견적서저장-응답', detail: { status: 500, bodyLen: 40 } }, app: 'estimate', user_role: 'staff' };
const isErrMail = (m) => /신규 에러|확인 필요 \d+건/.test(m.subject);

const quiet = run({ customers: [], errorLogs: routineLogs });
ok('4. [정상 기록만 있는 날] 에러 알림 메일이 0통(정상 단계·저장 성공 응답 5건이 걸러짐)', quiet.error === null && quiet.mails.filter(isErrMail).length === 0, quiet.error || JSON.stringify(quiet.mails.map(m => m.subject)));
ok('4-1. [정상 기록만 있는 날] 옛 알림 제목("DAH 신규 에러 N건")이 더는 발송되지 않음', !quiet.mails.some(m => /DAH 신규 에러/.test(m.subject)), JSON.stringify(quiet.mails.map(m => m.subject)));

const withReal = run({ customers: [], errorLogs: routineLogs.concat([realError]) });
const realMail = withReal.mails.find(isErrMail);
ok('5. [진짜 오류(저장 응답 500)가 섞인 날] 알림이 오고, 정상 기록은 빠지고 그 오류만 담김', withReal.error === null && !!realMail && /500/.test(realMail.body + realMail.subject) === true || (!!realMail && /견적서저장-응답/.test(realMail.body)), JSON.stringify(withReal.mails.map(m => m.subject)));
ok('5-1. [진짜 오류가 섞인 날] 정상 단계 기록("검증통과")은 메일 본문에 없음', !!realMail && realMail.body.indexOf('검증통과') === -1 && realMail.body.indexOf('세션확인-정상') === -1, realMail ? realMail.body.slice(0, 120) : '메일 없음');

const base = { id: 1, phone: '010-1', stage: '시공완료', price: 1000000, performance_revenue: 800000, deposit_amount: '500000', balance_amount: '500000', deposit_date: null, balance_date: null, addr: '', updated_at: now, created_at: now, is_archived: false };
const legacy = run({ customers: [Object.assign({}, base, { id: 11, client_name: '이관고객', memo: '플러그(Pluuug)에서 이관된 기존 고객' })] });
ok('6. [이관 고객] 입금날짜·주소가 비어 있어도 정합성 경고에 안 잡힘(제 보정이 오래된 데이터를 "최근 수정"으로 되살려도)', legacy.error === null && !legacy.mails.some(m => /데이터 정합성/.test(m.subject) && /이관고객/.test(m.body)), JSON.stringify(legacy.mails.map(m => m.subject)));
// 이 점검의 "주소 확인 필요"는 주소가 있는데 시/도·도로명이 없는 경우(건물명만 등)를 본다(빈 주소는 다른 종류) - 규칙에 맞게 건물명만 있는 주소로 시험
const fresh = run({ customers: [Object.assign({}, base, { id: 12, client_name: '신규고객', memo: '', addr: '래미안 퍼스티지' })] });
const freshMail = fresh.mails.find(m => /데이터 정합성/.test(m.subject));
ok('6-1. [신규 고객] 같은 종류의 공백은 계속 경고로 잡힘(진짜 문제를 놓치지 않음: 입금날짜 누락 + 주소 확인 필요)', !!freshMail && /입금날짜 누락/.test(freshMail.body) && /주소 확인 필요/.test(freshMail.body) && /신규고객/.test(freshMail.body), JSON.stringify(fresh.mails.map(m => m.subject)));

// ── 2026-10-10: 오늘 전수 점검에서 찾은 유형 추가 검증 ──
const over = run({ customers: [Object.assign({}, base, { id: 21, client_name: '초과고객', memo: '', addr: '', price: 1000000, performance_revenue: 800000, deposit_amount: '1200000', balance_amount: '0', deposit_date: '2026-10-01', balance_date: null })] });
const overMail = over.mails.find(m => /데이터 정합성/.test(m.subject));
ok('7. [받은 돈 > 총액] 최근 변경된 고객이 경고로 잡힘', over.error === null && !!overMail && /입금 초과/.test(overMail.body) && /초과고객/.test(overMail.body), JSON.stringify(over.mails.map(m => m.subject)));
const perfOver = run({ customers: [Object.assign({}, base, { id: 22, client_name: '성과초과고객', memo: '', addr: '', price: 80000, performance_revenue: 6380000, deposit_amount: '80000', balance_amount: '0', deposit_date: '2026-10-01', balance_date: null })] });
const perfMail = perfOver.mails.find(m => /데이터 정합성/.test(m.subject));
ok('7-1. [성과매출 > 총액] 경고로 잡힘', !!perfMail && /성과매출 초과/.test(perfMail.body), JSON.stringify(perfOver.mails.map(m => m.subject)));
const okCust = run({ customers: [Object.assign({}, base, { id: 23, client_name: '정상고객', memo: '', addr: '', price: 1000000, performance_revenue: 900000, deposit_amount: '500000', balance_amount: '500000', deposit_date: '2026-10-01', balance_date: '2026-10-05' })] });
ok('7-2. [정상 고객] 새 점검에서 경고 메일이 없음(소음 없음)', okCust.error === null && !okCust.mails.some(m => /데이터 정합성/.test(m.subject)), JSON.stringify(okCust.mails.map(m => m.subject)));
const estBad = run({ customers: [], estimates: [{ id: 'e1', customer_name: '확정이상', estimate_status: 'final', confirmed_at: null, is_archived: false }, { id: 'e2', customer_name: '스키마진단테스트_1', estimate_status: 'ga', confirmed_at: null, is_archived: false }, { id: 'e3', customer_name: '정상견적', estimate_status: 'final', confirmed_at: '2026-10-01T00:00:00Z', is_archived: false }] });
const estMail = estBad.mails.find(m => /데이터 정합성/.test(m.subject));
ok('8. [확정 상태 불일치] 확정인데 확정일 없는 견적이 잡힘, 정상 견적은 안 잡힘', !!estMail && /확정 상태 불일치/.test(estMail.body) && /확정이상/.test(estMail.body) && !/정상견적/.test(estMail.body), JSON.stringify(estBad.mails.map(m => m.subject)));
ok('8-1. [시험 데이터 잔존] 시험용 이름의 견적이 잡힘', !!estMail && /시험 데이터 잔존/.test(estMail.body), estMail ? estMail.body.slice(0, 160) : '메일 없음');
const legacy2 = run({ customers: [Object.assign({}, base, { id: 13, client_name: '이관건물명', memo: '플러그(Pluuug)에서 이관', addr: '래미안 퍼스티지' })] });
ok('6-2. [이관 고객] 건물명만 있는 주소도 경고에 안 잡힘', legacy2.error === null && !legacy2.mails.some(m => /데이터 정합성/.test(m.subject) && /이관건물명/.test(m.body)), JSON.stringify(legacy2.mails.map(m => m.subject)));

// 9) 월 마감 미실시 점검(매달 3일 이후, 지난달이 monthly_close에 없으면 알림)
const _today = new Date();
if (_today.getDate() >= 3) {
  const unclosed = run({ customers: [], monthlyClose: [] });
  const ucMail = unclosed.mails.find(m => /데이터 정합성/.test(m.subject));
  ok('9. [월 마감 미실시] 지난달이 마감되지 않았으면 알림이 옴', unclosed.error === null && !!ucMail && /월 마감 미실시/.test(ucMail.body), JSON.stringify(unclosed.mails.map(m => m.subject)));
  const closedOk = run({ customers: [] });
  ok('9-1. [월 마감 완료] 지난달이 마감돼 있으면 조용함', closedOk.error === null && !closedOk.mails.some(m => /월 마감 미실시/.test(m.body)), JSON.stringify(closedOk.mails.map(m => m.subject)));
  const noTable = run({ customers: [], monthlyClose: 'error' });
  ok('9-2. [표를 못 읽은 날] 월 마감 점검은 조용히 건너뜀(다른 점검·백업은 정상)', noTable.error === null && !noTable.mails.some(m => /월 마감 미실시/.test(m.body)), JSON.stringify(noTable.mails.map(m => m.subject)));
} else {
  console.log('(오늘이 3일 이전이라 월 마감 미실시 점검 케이스는 건너뜀)');
}
const bk = run({ customers: [] });
ok('9-4. 매일 백업이 변경 이력·저장 기록·점검 확인 기록도 가져옴', ['customer_history','estimate_history','save_receipts','integrity_acks'].every(function(t){ return bk.fetchedTables.indexOf(t) !== -1; }), JSON.stringify(bk.fetchedTables));
ok('9-3. 매일 백업이 월 마감(monthly_close)·입금 장부(payment_ledger)도 가져옴', bk.fetchedTables.indexOf('monthly_close') !== -1 && bk.fetchedTables.indexOf('payment_ledger') !== -1, JSON.stringify(bk.fetchedTables));

// ── 2026-10-14: DB 자동 점검 연동 검증 ──
const dbIssue = { code: 'OVERPAID', severity: 'warn', customer_id: 248, client_name: '이영욱', staff_name: '오지은 실장', detail: '입금합계 1200000원이 금액 1027000원보다 큼' };
const dbBad = run({ customers: [], dbIssues: [dbIssue] });
const dbBadMail = dbBad.mails.find(m => /데이터 정합성/.test(m.subject));
ok('10. [DB 점검에 확인 안 한 이상] 메일에 고객·내용이 포함됨', dbBad.error === null && !!dbBadMail && /OVERPAID/.test(dbBadMail.body) && /이영욱/.test(dbBadMail.body), JSON.stringify(dbBad.mails.map(m => m.subject)));
const dbAcked = run({ customers: [], dbIssues: [dbIssue], dbAcks: [{ ack_key: 'OVERPAID|248|' + dbIssue.detail }] });
ok('10-1. [확인함 처리한 이상] 매일 메일로 반복되지 않음', dbAcked.error === null && !dbAcked.mails.some(m => /데이터 정합성/.test(m.subject)), JSON.stringify(dbAcked.mails.map(m => m.subject)));
const dbStale = run({ customers: [], dbLog: [{ run_at: new Date(Date.now() - 50 * 3600 * 1000).toISOString(), total_count: 0 }] });
const dbStaleMail = dbStale.mails.find(m => /데이터 정합성/.test(m.subject));
ok('10-2. [DB 자동 점검이 36시간 넘게 멈춤] "멈춤" 알림 메일이 옴', !!dbStaleMail && /DB 자동 점검 멈춤/.test(dbStaleMail.body), JSON.stringify(dbStale.mails.map(m => m.subject)));
const dbNoLog = run({ customers: [], dbLog: [] });
ok('10-3. [점검 기록이 하나도 없음] 알림이 옴', dbNoLog.mails.some(m => /DB 자동 점검 멈춤/.test(m.body)), JSON.stringify(dbNoLog.mails.map(m => m.subject)));
const noGuard = run({ customers: [], triggers: ['trg_enforce_estimate_status', 'trg_estimate_history', 'trg_customer_history', 'trg_sync_customer_payment'] });
const noGuardMail = noGuard.mails.find(m => /데이터 정합성/.test(m.subject));
ok('10-4. [보호 트리거가 사라짐] 담당자·감액 보호 트리거 누락이 알림으로 옴', !!noGuardMail && /trg_guard_staff_name_customers/.test(noGuardMail.body) && /trg_guard_payment_reduction_estimates/.test(noGuardMail.body), JSON.stringify(noGuard.mails.map(m => m.subject)));

// ── 2026-10-25(전수표 T-18): 권한 자동시험 결과 알림 ──
const stFail = run({ customers: [], selftest: [{ run_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), ok: false, detail: { delete_master_customer: { ok: false }, see_master_customers: { ok: true } } }] });
ok('10-5. [권한 시험 실패] 실패한 항목 이름이 포함된 알림 메일이 옴', stFail.mails.some(m => /권한 자동시험 실패/.test(m.body) && /delete_master_customer/.test(m.body)), JSON.stringify(stFail.mails.map(m => m.subject)));
const stStale = run({ customers: [], selftest: [{ run_at: new Date(Date.now() - 50 * 3600 * 1000).toISOString(), ok: true, detail: {} }] });
ok('10-6. [권한 시험이 36시간 넘게 멈춤] 알림이 옴', stStale.mails.some(m => /권한 자동시험 멈춤/.test(m.body)), JSON.stringify(stStale.mails.map(m => m.subject)));
const stNone = run({ customers: [], selftest: [] });
ok('10-7. [권한 시험 기록이 하나도 없음] 알림이 옴', stNone.mails.some(m => /권한 자동시험 멈춤/.test(m.body)), JSON.stringify(stNone.mails.map(m => m.subject)));
const stOk = run({ customers: [] });
ok('10-8. [정상] 권한 시험 관련 알림 없음', !stOk.mails.some(m => /권한 자동시험/.test(m.body)), JSON.stringify(stOk.mails.map(m => m.subject)));

const svStuck = run({ customers: [], newSurveys: [{ id: 5, client_name: '대기고객', created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString() }] });
ok('10-9. [설문이 3시간 넘게 신규로 남음] 알림이 옴', svStuck.mails.some(m => /설문 자동등록 지연/.test(m.body) && /대기고객/.test(m.body)), JSON.stringify(svStuck.mails.map(m => m.subject)));
const svFresh = run({ customers: [], newSurveys: [{ id: 6, client_name: '방금', created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() }] });
ok('10-10. [방금 들어온 설문] 알림 없음(다음 실행에서 처리될 시간)', !svFresh.mails.some(m => /설문 자동등록 지연/.test(m.body)), JSON.stringify(svFresh.mails.map(m => m.subject)));

const noConfirmGuard = run({ customers: [], triggers: ['trg_enforce_estimate_status', 'trg_estimate_history', 'trg_customer_history', 'trg_sync_customer_payment', 'trg_guard_staff_name_customers', 'trg_guard_staff_name_estimates', 'trg_guard_payment_reduction_customers', 'trg_guard_payment_reduction_estimates', 'trg_guard_payment_date', 'trg_guard_archived_estimate_payment', 'trg_payment_refunds_append_only', 'trg_sync_customer_price', 'trg_adjust_customer_amounts_on_estimate_delete', 'trg_extra_payment_touch_customer', 'trg_customers_auto_stage'] });
ok('10-11. [확정 보호 트리거가 사라짐] 알림이 옴(전수표 T-07)', noConfirmGuard.mails.some(m => /trg_estimates_confirm_guard/.test(m.body)), JSON.stringify(noConfirmGuard.mails.map(m => m.subject)));

const H = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
const cfNoReason = run({ customers: [], confirmLog: [{ estimate_id: 'e1', client_id: 7, action: 'unconfirm', reason: null, changed_at: H(1) }] });
ok('10-12. [R-06 사유 없이 확정이 풀림] 즉시 알림(고객 이름 포함)', cfNoReason.mails.some(m => /확정 해제 상태 유지/.test(m.body) && /해제테스트/.test(m.body) && /없음/.test(m.body)), JSON.stringify(cfNoReason.mails.map(m => m.subject)));
const cfOld = run({ customers: [], confirmLog: [{ estimate_id: 'e2', client_id: 7, action: 'unconfirm', reason: '고객 요청', changed_at: H(30) }] });
ok('10-13. [R-06 사유 있어도 24시간 넘게 재확정 안 됨] 알림', cfOld.mails.some(m => /확정 해제 상태 유지/.test(m.body)), JSON.stringify(cfOld.mails.map(m => m.subject)));
const cfFresh = run({ customers: [], confirmLog: [{ estimate_id: 'e3', client_id: 7, action: 'unconfirm', reason: '고객 요청', changed_at: H(2) }] });
ok('10-14. [R-06 사유 있고 방금 풀림] 알림 없음(재확정 시간 줌)', !cfFresh.mails.some(m => /확정 해제 상태 유지/.test(m.body)), JSON.stringify(cfFresh.mails.map(m => m.subject)));
const cfRe = run({ customers: [], confirmLog: [{ estimate_id: 'e4', client_id: 7, action: 'unconfirm', reason: null, changed_at: H(40) }, { estimate_id: 'e4', client_id: 7, action: 'confirm', reason: null, changed_at: H(39) }] });
ok('10-15. [R-06 풀렸다가 재확정됨] 알림 없음', !cfRe.mails.some(m => /확정 해제 상태 유지/.test(m.body)), JSON.stringify(cfRe.mails.map(m => m.subject)));

const svSame = run({ customers: [] });
ok('10-16. [R-02 붙여넣은 버전 = 최신] 스크립트 버전 알림 없음', !svSame.mails.some(m => /스크립트가 최신이 아님|스크립트 최신본 확인 실패/.test(m.body)), JSON.stringify(svSame.mails.map(m => m.subject)));
const svOld = run({ customers: [], liveVer: '2099-01-01.9' });
ok('10-17. [R-02 저장소가 더 새 버전] 붙여넣기 필요 알림', svOld.mails.some(m => /스크립트가 최신이 아님/.test(m.body) && /2099-01-01\.9/.test(m.body)), JSON.stringify(svOld.mails.map(m => m.subject)));
const svFail = run({ customers: [], liveVer: 'fail' });
ok('10-18. [R-02 사이트 파일을 못 읽음] 확인 실패로 표시(조용히 넘어가지 않음)', svFail.mails.some(m => /스크립트 최신본 확인 실패/.test(m.body)), JSON.stringify(svFail.mails.map(m => m.subject)));

// R-07 주간 저장 실패 요약: 월요일에만 동작. 시계를 월요일/화요일로 고정해 검증
function runOnDay(utcMondayOffset, extra) {
  const RealDate = Date; const base = new RealDate('2026-10-26T01:00:00Z').getTime() + utcMondayOffset * 86400000; // 2026-10-26 = 월요일(KST 10시)
  const FakeDate = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(base); } static now() { return base; } };
  return run(extra, (ctx) => { ctx.Date = FakeDate; });
}
const wkMon = runOnDay(0, { customers: [], saveFails: [{ message: '견적서 저장 실패(권한문제 또는 동시저장충돌) - 내용 백업됨', user_name: '오지은 실장', created_at: '2026-10-23T02:00:00Z' }, { message: '견적서 저장 실패(권한문제 또는 동시저장충돌) - 내용 백업됨', user_name: '오지은 실장', created_at: '2026-10-23T03:00:00Z' }] });
ok('10-19. [R-07 월요일] 지난 7일 저장 실패 요약이 옴(사람·종류별 건수)', wkMon.mails.some(m => /주간 저장 실패 요약/.test(m.body) && /오지은 실장/.test(m.body) && /2건/.test(m.body)), JSON.stringify(wkMon.mails.map(m => m.subject)));
const wkTue = runOnDay(1, { customers: [], saveFails: [{ message: '견적서 저장 실패 - 내용 백업됨', user_name: '오지은 실장', created_at: '2026-10-26T02:00:00Z' }] });
ok('10-20. [R-07 화요일] 월요일이 아니면 요약 없음', !wkTue.mails.some(m => /주간 저장 실패 요약/.test(m.body)), JSON.stringify(wkTue.mails.map(m => m.subject)));
const wkNone = runOnDay(0, { customers: [], saveFails: [] });
ok('10-21. [R-07 월요일, 실패 0건] 요약 메일 없음', !wkNone.mails.some(m => /주간 저장 실패 요약/.test(m.body)), JSON.stringify(wkNone.mails.map(m => m.subject)));

const bkNew = run({ customers: [] });
ok('11. 매일 백업이 환불 기록(payment_refunds)·자동 점검 기록도 가져옴(돈이 빠져나간 근거가 백업에서 빠지지 않게)', bkNew.fetchedTables.indexOf("payment_refunds") >= 0 && bkNew.fetchedTables.indexOf("integrity_daily_log") >= 0, JSON.stringify(bkNew.fetchedTables));

console.log('\n' + (failed === 0 ? '✅ 전체 통과(' + path.basename(FILE) + ' 매일백업 실행 검증)' : '❌ 실패 ' + failed + '건'));
process.exit(failed === 0 ? 0 : 1);
