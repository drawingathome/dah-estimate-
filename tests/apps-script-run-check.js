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
  const customers = opts.anomalies ? [{ id: 1, client_name: '테스트고객', phone: '010-1111-2222', stage: '시공완료', performance_revenue: 0, price: 1000000, deposit_amount: '0', balance_amount: '0', deposit_date: null, balance_date: null, addr: '트리니원 111동 2304호', updated_at: now, created_at: now, is_archived: false }] : [];
  const respond = (body, c = 200) => ({ getResponseCode: () => c, getContentText: () => JSON.stringify(body), getHeaders: () => ({}) });
  const ctx = {
    console, Date, JSON, Math, Array, Object, String, Number, RegExp, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, Error, Set, Map,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'LAST_ERROR_CHECK_TIME' ? null : 'fake-secret'), setProperty: () => {}, getProperties: () => ({}) }) },
    UrlFetchApp: { fetch: (url, o) => {
      if (url.includes('rpc/dah_backup_export')) { const t = JSON.parse(o.payload).table_name; return respond(t === 'customers' ? customers : []); }
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

console.log('\n' + (failed === 0 ? '✅ 전체 통과(' + path.basename(FILE) + ' 매일백업 실행 검증)' : '❌ 실패 ' + failed + '건'));
process.exit(failed === 0 ? 0 : 1);
