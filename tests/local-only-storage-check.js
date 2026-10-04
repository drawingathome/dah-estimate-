// tests/local-only-storage-check.js
// ══════════════════════════════════════════════════
// 2026-09-24(선혜님 - "우리 설계를 탄탄하게 하는 방법은?") 도입.
//
// 오늘 결제탭/발주탭/알림톡에서 반복된 병: "로컬저장소(localStorage)
// 에만 있는 값이 다른 기기와 어긋난다." 매번 내가 우연히 발견해서
// 하나씩 고쳤는데, 이걸 "발견을 기다리는" 대신 "새로 생기면 자동으로
// 경고받는" 걸로 바꾼다.
//
// 원리: 모든 dah_ 로 시작하는 localStorage 키를 코드 전체에서 찾아서,
// 그 키가 쓰이는 파일들 안에 "서버 동기화 흔적"(sbXHR, sbSyncSetting,
// logEvent, refresh...FromServer 같은 패턴)이 있는지 확인한다. 없으면
// 경고 - 이게 "이 기기에만 있어도 되는 값"(세션/로그인 토큰 등)인지
// "여러 기기에서 같아야 하는 값"인지는 사람이 판단해서 ALLOWLIST에
// 넣거나 동기화를 추가해야 한다.
//
// 이 검사는 "확실한 버그"를 못 잡는다(휴리스틱이라 오탐 가능) - 대신
// "이건 한 번 사람이 봐야 한다"는 후보를 자동으로 뽑아준다는 점에서
// 의미가 있다. 결제/발주/알림톡 세 사건 다 이 패턴이었다면, 이 검사가
// 있었다면 셋 다 더 일찍 걸렸을 것이다.
// ══════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

let warnCount = 0;
function warn(label, detail) { console.log('⚠️  ' + label + (detail ? ' — ' + detail : '')); warnCount++; }
function ok(label) { console.log('✅ ' + label); }

const root = path.join(__dirname, '..');

// 의도적으로 기기 전용이라 서버 동기화가 필요 없는 키들 - 새로 추가할
// 때는 "왜 이 기기에만 있어도 되는지"를 반드시 옆에 이유로 남길 것.
const ALLOWLIST = {
  'dah_auth_session': '로그인 세션 토큰 - 기기마다 별도 세션이 정상',
  'dah_session': '위와 동일',
  'dah_last_login_email': '이 기기에서 마지막으로 로그인한 이메일 자동완성용 - 기기 전용이 정상',
  'dah_master_email': '로그인 검증용 상수 - 서버 설정에서 읽어와 로컬에 캐시, 자체가 진실은 아님',
  'dah_save_diagnostics': '이 기기에서 저장 시도한 진단 로그 - 기기별로 다른 게 정상(참고용)',
  'dah_save_attempts': '위와 동일 계열',
  'dah_estimate_draft': '입력 중인 임시저장(아직 저장 안 한 초안) - 기기 전용이 정상, 저장하면 서버로 감',
  'dah_failed_customer_saves': '저장 실패시 이 기기에 남는 긴급 백업 - 서버 저장이 안 됐을 때의 최후 수단이라 기기 전용이 맞음',
  'dah_failed_saves': '위와 동일 계열',
  '__diag_test__': '자가진단용 임시 테스트 키',
  'dah_lead_stale_days': '이 화면에서만 쓰는 표시 설정(며칠 지나면 강조할지) - 개인 UI 취향, 서버 동기화 불필요',
  'dah_webhook_url': '읽기는 서버(app_settings)에서 오고 로컬은 캐시 - sbSyncSetting으로 쓰기 동기화됨(코드 내 확인됨)',
  'dah_settings': '위와 동일 계열(app_settings 캐시)'
};

// 이 패턴 중 하나라도 같은 파일 안에 있으면 "동기화 흔적 있음"으로 봄
const SYNC_PATTERNS = [/sbXHR\s*\(/, /sbSyncSetting\s*\(/, /logEvent\s*\(/, /refresh\w*FromServer/, /syncStaffGoalsToCloud/, /syncCustomerToSheet/];

const allJsFiles = fs.readdirSync(root).filter(f => f.endsWith('.js') && !f.includes('.min.'));
const keyToFiles = {};

allJsFiles.forEach(function(file) {
  const content = fs.readFileSync(path.join(root, file), 'utf-8');
  const matches = content.matchAll(/localStorage\.(?:setItem|getItem)\(\s*['"](dah_[a-z_]+|__diag_test__)/g);
  for (const m of matches) {
    const key = m[1];
    if (!keyToFiles[key]) keyToFiles[key] = new Set();
    keyToFiles[key].add(file);
  }
});

console.log('\n[로컬저장소 서버동기화 흔적 검사] local-only-storage-check.js\n');

Object.keys(keyToFiles).sort().forEach(function(key) {
  if (ALLOWLIST[key]) { ok(key + ' — 화이트리스트(' + ALLOWLIST[key] + ')'); return; }
  const files = Array.from(keyToFiles[key]);
  let hasSyncTrace = false;
  files.forEach(function(file) {
    const content = fs.readFileSync(path.join(root, file), 'utf-8');
    if (SYNC_PATTERNS.some(p => p.test(content))) hasSyncTrace = true;
  });
  if (hasSyncTrace) {
    ok(key + ' — 관련 파일(' + files.join(', ') + ') 안에 서버동기화 흔적 있음');
  } else {
    warn(key + ' — 서버동기화 흔적 없음, 사람이 한 번 봐야 함(다른 기기와 어긋날 수 있는 후보)', '관련 파일: ' + files.join(', '));
  }
});

console.log('\n' + warnCount + '건 경고');
if (warnCount > 0) {
  console.log('(경고는 CI를 막지 않음 - "이 값이 기기 전용이 맞다"면 위 ALLOWLIST에 이유와 함께 추가하고,');
  console.log(' "여러 기기에서 같아야 한다"면 서버 동기화를 추가한 뒤 다시 실행해서 없어지는지 확인할 것)');
}
process.exit(0); // 경고 전용 - 실패로 CI를 막지 않음(오탐 가능성 때문에 사람 판단 필요)
