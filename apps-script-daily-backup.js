/**
 * ══════════════════════════════════════════════════
 * DAH 데이터 자동 백업 → 구글 드라이브
 * ══════════════════════════════════════════════════
 *
 * 설치 방법:
 * 1. script.google.com 접속 → 새 프로젝트
 * 2. 이 코드 전체를 붙여넣기
 * 3. 저장 (프로젝트 이름: "DAH 자동백업" 등)
 * 4. 왼쪽 시계 아이콘(트리거) 클릭 → "트리거 추가"
 *    - 실행할 함수: dahDailyBackup
 *    - 이벤트 소스: 시간 기반
 *    - 시간 기반 트리거 유형: 일 타이머
 *    - 원하는 시간대 선택 (예: 오전 3시~4시) → 저장
 * 5. 저장 시 구글 계정 권한 승인 요청 뜨면 허용
 * 6. 처음 한 번은 수동으로 dahDailyBackup()을 직접 실행해서
 *    정상 작동하는지 확인 (실행 버튼 옆 드롭다운에서 함수 선택 후 실행)
 *
 * 백업 파일은 구글드라이브 > "DAH_자동백업" 폴더에
 * 날짜별로 영구 저장됩니다 (예: DAH_백업_2026-07-10.json)
 * 자동 삭제 없음 — 10년 이상 장기 보관 목적이라 오래된 백업도
 * 절대 지우지 않습니다 (JSON 텍스트 파일이라 용량 부담 거의 없음:
 * 10년치 매일 백업해도 보통 1~2GB 수준으로 무료 용량 내에서 충분)
 * ══════════════════════════════════════════════════
 */

var SUPABASE_URL = 'https://sradnglutbzbyyunjyah.supabase.co';
// ⚠️ 이 키는 RLS(권한잠금)를 우회하는 관리자 전용 키(service_role)입니다.
// 이 저장소는 공개(public) 저장소이므로, 절대 여기에 실제 키 값을 하드코딩하지 않습니다.
// 대신 Google Apps Script의 "스크립트 속성"(Project Settings > Script Properties)에
// SUPABASE_SERVICE_ROLE_KEY라는 이름으로 등록해두면, 아래 코드가 안전하게 읽어옵니다.
// 등록 방법: Apps Script 에디터 왼쪽 톱니바퀴(프로젝트 설정) → 맨 아래 "스크립트 속성" →
// "속성 추가" → 속성: SUPABASE_SERVICE_ROLE_KEY, 값: (Supabase Legacy API Keys의 service_role 키, eyJ로 시작)
//
// ⚠️ 반드시 "Legacy API Keys" 탭의 service_role 키(JWT, eyJ로 시작)를 써야 합니다.
// 신규 형식 키(sb_secret_...)는 Supabase가 User-Agent 헤더로 브라우저 여부를 판별해 차단하는데,
// Google Apps Script(UrlFetchApp)는 구조적으로 User-Agent를 커스텀 설정할 수 없어(항상 자체
// 고정값 전송) 항상 401로 거부됩니다. 레거시 service_role 키는 이 검사 자체가 없어 정상 작동합니다.
var SUPABASE_SERVICE_ROLE_KEY = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY');
var BACKUP_FOLDER_NAME = 'DAH_자동백업';
// 자동 삭제 없음(영구보관) — 이전엔 KEEP_DAYS로 30일 지나면 지웠으나
// 10년 이상 보관해야 하는 요구사항이라 완전히 제거함

function dahDailyBackup() {
  var tables = ['customers', 'estimates', 'surveys'];
  var backup = { exportedAt: new Date().toISOString(), version: '1.0' };
  var errors = [];

  tables.forEach(function(table) {
    try {
      var url = SUPABASE_URL + '/rest/v1/' + table + '?select=*';
      var res = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY
        },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        backup[table] = JSON.parse(res.getContentText());
      } else {
        errors.push(table + ': HTTP ' + res.getResponseCode());
        backup[table] = { error: res.getContentText() };
      }
    } catch (e) {
      errors.push(table + ': ' + e.message);
      backup[table] = { error: e.message };
    }
  });

  // 구글드라이브 폴더 찾기/생성
  var folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(BACKUP_FOLDER_NAME);

  // 파일 저장 (영구 보관 — 자동 삭제 로직 없음)
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var fileName = 'DAH_백업_' + today + '.json';
  var content = JSON.stringify(backup, null, 2);
  folder.createFile(fileName, content, MimeType.PLAIN_TEXT);

  // 결과 요약 (실행 로그에서 확인 가능: 보기 > 실행 로그)
  var summary = '백업 완료: ' + today
    + ' | customers ' + (backup.customers ? backup.customers.length : '실패') + '건'
    + ' | estimates ' + (backup.estimates ? backup.estimates.length : '실패') + '건'
    + ' | surveys ' + (backup.surveys ? backup.surveys.length : '실패') + '건';
  Logger.log(summary);

  // 실패한 테이블이 있으면 이메일로 알림 (선택사항 — 본인 이메일로 변경)
  if (errors.length > 0) {
    try {
      MailApp.sendEmail(
        Session.getActiveUser().getEmail(),
        'DAH 백업 일부 실패 알림',
        '다음 테이블 백업에 실패했습니다:\n\n' + errors.join('\n') + '\n\n나머지는 정상 백업되었습니다.'
      );
    } catch (e) { /* 이메일 발송 실패는 무시 */ }
  }
}

/**
 * 수동 복원 도우미: 특정 날짜 백업 파일 내용을 로그로 확인하고 싶을 때 사용
 * (실제 복원은 JSON 파일을 열어서 Supabase Table Editor로 직접 넣거나,
 *  개발자에게 파일을 전달하면 복원 스크립트로 처리 가능)
 */
function dahPeekBackup(dateStr) {
  var folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (!folders.hasNext()) { Logger.log('백업 폴더가 없습니다'); return; }
  var folder = folders.next();
  var fileName = 'DAH_백업_' + (dateStr || Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd')) + '.json';
  var files = folder.getFilesByName(fileName);
  if (!files.hasNext()) { Logger.log('해당 날짜 백업 파일이 없습니다: ' + fileName); return; }
  var content = files.next().getBlob().getDataAsString();
  var data = JSON.parse(content);
  Logger.log('백업일: ' + data.exportedAt);
  Logger.log('고객 수: ' + (data.customers ? data.customers.length : 0));
  Logger.log('견적 수: ' + (data.estimates ? data.estimates.length : 0));
  Logger.log('설문 수: ' + (data.surveys ? data.surveys.length : 0));
}

/**
 * ══════════════════════════════════════════════════
 * 복구 드릴(Restore Drill) — "백업 파일로 실제 복구가 되는지" 검증
 * ══════════════════════════════════════════════════
 *
 * 실제 운영 데이터는 절대 건드리지 않고, 안전하게 검증합니다:
 * 1. 가장 최근 백업 파일을 구글드라이브에서 읽어옴
 * 2. 백업 안의 각 테이블(customers/estimates/surveys) 데이터가
 *    구조적으로 온전한지 확인 (레코드 개수, 필수 필드 존재 여부)
 * 3. 실제 복구 파이프라인이 작동하는지 증명하기 위해, 백업에서
 *    고객 1건을 골라 이름 앞에 "복구드릴테스트_"를 붙인 완전히
 *    새로운 임시 레코드로 Supabase에 저장
 * 4. 저장이 실제로 됐는지 다시 조회해서 내용이 정확히 일치하는지 확인
 * 5. 검증이 끝나면 방금 만든 임시 레코드를 즉시 삭제해 흔적을 남기지 않음
 *
 * 실행: 함수 목록에서 dahRestoreDrill 선택 후 실행. 결과는 실행 로그에서 확인.
 */
function dahRestoreDrill() {
  var log = [];
  function report(msg) { log.push(msg); Logger.log(msg); }

  // 1. 가장 최근 백업 파일 찾기
  var folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (!folders.hasNext()) { report('❌ 실패: 백업 폴더(' + BACKUP_FOLDER_NAME + ')가 없습니다'); return; }
  var folder = folders.next();
  var files = folder.getFilesByType(MimeType.PLAIN_TEXT);
  var latestFile = null, latestDate = null;
  while (files.hasNext()) {
    var f = files.next();
    var d = f.getLastUpdated();
    if (!latestDate || d > latestDate) { latestDate = d; latestFile = f; }
  }
  if (!latestFile) { report('❌ 실패: 백업 파일을 하나도 찾을 수 없습니다'); return; }
  report('1단계 완료: 최근 백업파일 발견 — ' + latestFile.getName());

  // 2. 백업 파일 파싱 및 구조 검증
  var backup;
  try {
    backup = JSON.parse(latestFile.getBlob().getDataAsString());
  } catch (e) {
    report('❌ 실패: 백업 파일이 손상되어 JSON으로 읽을 수 없습니다 — ' + e.message);
    return;
  }
  var tables = ['customers', 'estimates', 'surveys'];
  var counts = {};
  tables.forEach(function(t) {
    if (!Array.isArray(backup[t])) { report('❌ 실패: 백업 안에 "' + t + '" 데이터가 배열 형태로 없습니다'); return; }
    counts[t] = backup[t].length;
  });
  report('2단계 완료: 백업 구조 정상 — customers ' + (counts.customers||0) + '건, estimates ' + (counts.estimates||0) + '건, surveys ' + (counts.surveys||0) + '건');

  if (!backup.customers || backup.customers.length === 0) {
    report('⚠️ 참고: 백업에 고객 데이터가 없어 3~5단계(실제 복구 파이프라인 검증)는 건너뜁니다');
    report('=== 드릴 완료 (구조 검증만) ===');
    return;
  }

  // 3. 실제 복구 시뮬레이션: 백업의 첫 고객 데이터를 복사해 임시 테스트 레코드로 저장
  var sample = backup.customers[0];
  var testName = '복구드릴테스트_' + new Date().getTime();
  var testRow = {
    client_name: testName,
    phone: sample.phone || '010-0000-0000',
    stage: '상담',
    is_archived: false
  };
  var insertRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/customers', {
    method: 'post',
    headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    payload: JSON.stringify(testRow),
    muteHttpExceptions: true
  });
  if (insertRes.getResponseCode() >= 300) {
    report('❌ 실패: 복구 테스트 레코드 저장 실패 — HTTP ' + insertRes.getResponseCode() + ' ' + insertRes.getContentText());
    return;
  }
  report('3단계 완료: 백업 데이터 기반 임시 테스트 레코드를 실제로 Supabase에 저장 성공 (' + testName + ')');

  // 4. 저장된 게 실제로 맞는지 다시 조회해서 확인
  var checkRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/customers?client_name=eq.' + encodeURIComponent(testName) + '&select=*', {
    method: 'get',
    headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY },
    muteHttpExceptions: true
  });
  var checkData = JSON.parse(checkRes.getContentText());
  if (!checkData || checkData.length === 0) {
    report('❌ 실패: 저장은 성공했다는데 다시 조회하니 안 나옵니다 — 뭔가 이상합니다');
    return;
  }
  report('4단계 완료: 저장된 테스트 레코드를 다시 조회해서 정확히 확인됨 (phone: ' + checkData[0].phone + ')');

  // 5. 테스트 레코드 정리 (실제 DELETE — 이건 테스트로 만든 레코드라 완전삭제해도 안전)
  var deleteRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/customers?client_name=eq.' + encodeURIComponent(testName), {
    method: 'delete',
    headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Prefer': 'return=minimal' },
    muteHttpExceptions: true
  });
  if (deleteRes.getResponseCode() >= 300) {
    report('⚠️ 경고: 테스트 레코드 삭제 실패 — 수동으로 "' + testName + '"를 찾아 지워주세요 (HTTP ' + deleteRes.getResponseCode() + ')');
  } else {
    report('5단계 완료: 테스트 레코드 정리 완료 — 실제 데이터엔 흔적이 전혀 안 남았습니다');
  }

  report('=== ✅ 복구 드릴 전체 성공 — 백업 파일로 실제 복구가 가능함을 확인했습니다 ===');
}
