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
// ⚠️ 이 키는 RLS(권한잠금)를 우회하는 관리자 전용 키(service_role/secret)입니다.
// 이 저장소는 공개(public) 저장소이므로, 절대 여기에 실제 키 값을 하드코딩하지 않습니다.
// 대신 Google Apps Script의 "스크립트 속성"(Project Settings > Script Properties)에
// SUPABASE_SERVICE_ROLE_KEY라는 이름으로 등록해두면, 아래 코드가 안전하게 읽어옵니다.
// 등록 방법: Apps Script 에디터 왼쪽 톱니바퀴(프로젝트 설정) → 맨 아래 "스크립트 속성" →
// "속성 추가" → 속성: SUPABASE_SERVICE_ROLE_KEY, 값: (Supabase의 secret/service_role 키)
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
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'User-Agent': 'GoogleAppsScript-DAH-Backup/1.0'
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
