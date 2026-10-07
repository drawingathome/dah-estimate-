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
  const mails = [], created = [], logs = [];
  const now = new Date().toISOString();
  const customers = opts.customers ? opts.customers : opts.anomalies ? [{ id: 1, client_name: '테스트고객', phone: '010-1111-2222', stage: '시공완료', performance_revenue: 0, price: 1000000, deposit_amount: '0', balance_amount: '0', deposit_date: null, balance_date: null, addr: '트리니원 111동 2304호', updated_at: now, created_at: now, is_archived: false }] : [];
  const respond = (body, c = 200) => ({ getResponseCode: () => c, getContentText: () => JSON.stringify(body), getHeaders: () => ({}) });
  const ctx = {
    console, Date, JSON, Math, Array, Object, String, Number, RegExp, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, Error, Set, Map,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'LAST_ERROR_CHECK_TIME' ? null : 'fake-secret'), setProperty: () => {}, getProperties: () => ({}) }) },
    UrlFetchApp: { fetch: (url, o) => {
      if (url.includes('rpc/dah_backup_export')) { const t = JSON.parse(o.payload).table_name; return respond(t === 'customers' ? customers : []); }
      if (url.includes('client_error_logs?')) return respond(opts.errorLogs || []);
      if (url.includes('v_critical_triggers_status')) return respond(['trg_enforce_estimate_status', 'trg_estimate_history', 'trg_customer_history', 'trg_sync_customer_payment'].map(n => ({ trigger_name: n })));
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
  return { ctx, mails, created, logs };
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
const legacy2 = run({ customers: [Object.assign({}, base, { id: 13, client_name: '이관건물명', memo: '플러그(Pluuug)에서 이관', addr: '래미안 퍼스티지' })] });
ok('6-2. [이관 고객] 건물명만 있는 주소도 경고에 안 잡힘', legacy2.error === null && !legacy2.mails.some(m => /데이터 정합성/.test(m.subject) && /이관건물명/.test(m.body)), JSON.stringify(legacy2.mails.map(m => m.subject)));

console.log('\n' + (failed === 0 ? '✅ 전체 통과(' + path.basename(FILE) + ' 매일백업 실행 검증)' : '❌ 실패 ' + failed + '건'));
process.exit(failed === 0 ? 0 : 1);
