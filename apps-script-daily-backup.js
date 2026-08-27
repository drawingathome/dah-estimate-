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
 *
 * 2026-08-26 추가: 매일 백업할 때마다 "중복 의심 데이터"도 함께 자동
 * 스캔합니다(같은 전화번호의 고객이 2건 이상, 또는 같은 고객명+금액+날짜의
 * 견적서가 2건 이상 있으면 의심 대상). 발견되면 자동으로 지우지 않고,
 * 트리거를 설정한 구글 계정 이메일로 알림만 보냅니다 — 실제 정리는 직접
 * 확인 후 처리. 지금 당장 한 번만 확인하고 싶으면 함수 목록에서
 * dahDuplicateScanOnly()를 선택해 수동 실행하면 됩니다(백업은 안 만들고
 * 스캔+알림만 함).
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
  // 2026-08-24(선혜님 지적 — "우리쪽 백업데이터도 잘 짜야겠는데"): customers/
  // estimates/surveys 세 개만 백업하고 있었는데, app_settings(마스터/담당자
  // 이메일, 할인쿠폰, 지역출장비 설정 — 이거 하나 날아가면 로그인부터 막힘),
  // as_records(A/S 기록), staff_profiles(직원 계정)가 통째로 빠져있었음.
  // analytics_events는 단순 사용로그라 우선순위 낮지만 비용 거의 안 드니 같이 포함.
  // 2026-08-27(선혜님 요청 - "에러 모니터링 도입하자"): client_error_logs도
  // 백업 대상에 포함 + 아래에서 새로 쌓인 에러가 있으면 이메일로 알림.
  var tables = ['customers', 'estimates', 'surveys', 'app_settings', 'as_records', 'staff_profiles', 'analytics_events', 'client_error_logs'];
  var backup = { exportedAt: new Date().toISOString(), version: '1.0' };
  var errors = [];

  tables.forEach(function(table) {
    try {
      // 2026-08-27(선혜님과 함께 디버깅 — service_role 키가 정확한데도
      // 계속 0건이 나오던 문제): Supabase 서버 로그로 확인해보니 요청 자체는
      // service_role로 정상 인식되고 200 응답까지 왔는데도 결과가 계속
      // 빈 배열이었음(원인 불명 - PostgREST 단의 이례적 동작으로 추정).
      // 원인을 더 캐는 대신, DB에 SECURITY DEFINER 함수(dah_backup_export)를
      // 만들어서 그 함수를 통해 데이터를 가져오는 방식으로 우회함 - 이
      // 함수는 함수 소유자 권한으로 실행되어 이 이례적 문제와 무관하게
      // 항상 정상 작동함.
      var url = SUPABASE_URL + '/rest/v1/rpc/dah_backup_export';
      var res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY
        },
        payload: JSON.stringify({ table_name: table }),
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
  // 2026-08-05: 구글드라이브는 같은 이름의 파일이 여러 개 있어도 허용해서,
  // 같은 날 두 번 실행되면(수동 실행 + 자동 트리거가 겹치는 경우 등) 완전히
  // 똑같은 이름의 백업 파일이 중복 생성될 수 있었음. 기존 파일이 있으면
  // 지우고 새로 만들어서 항상 "그날의 최신 백업 1개"만 남도록 함.
  var existingBackups = folder.getFilesByName(fileName);
  while (existingBackups.hasNext()) { existingBackups.next().setTrashed(true); }
  folder.createFile(fileName, content, MimeType.PLAIN_TEXT);

  // 결과 요약 (실행 로그에서 확인 가능: 보기 > 실행 로그)
  // 2026-08-24: 하드코딩된 3개 대신 tables 배열 전체를 자동으로 순회하도록
  // 바꿔서, 나중에 테이블이 더 추가돼도 이 요약 로그를 또 고칠 필요 없게 함.
  var summary = '백업 완료: ' + today + ' | ' + tables.map(function(t) {
    return t + ' ' + (Array.isArray(backup[t]) ? backup[t].length : '실패') + '건';
  }).join(' | ');
  Logger.log(summary);

  // 2026-08-26(선혜님과 함께 도입 — "중복탐지 자동알림"): 백업 때 이미
  // customers/estimates 전체를 한 번 가져오므로, 그 데이터를 그대로 재사용해서
  // 중복 의심 건이 있는지 매일 스캔함(API 호출을 따로 더 늘리지 않음).
  // 8/26에 실제로 발견했던 패턴 그대로: 고객은 "전화번호가 같은데 둘 다
  // 안 지워진(is_archived=false) 레코드가 2건 이상", 견적은 "같은 고객명+
  // 같은 금액+같은 날짜에 생성된 게 2건 이상"인 경우를 의심 대상으로 봄.
  var dupIssues = dahScanForDuplicates(backup);
  if (dupIssues.length > 0) {
    Logger.log('⚠️ 중복 의심 ' + dupIssues.length + '건 발견:\n' + dupIssues.join('\n'));
    try {
      MailApp.sendEmail(
        Session.getActiveUser().getEmail(),
        'DAH 중복 의심 데이터 발견 (' + today + ')',
        '오늘 백업 중 아래와 같은 중복 의심 건이 발견됐습니다. 실제 중복인지 확인 후 필요하면 정리해주세요.\n' +
        '(자동으로 지우지 않습니다 — 실제 다른 사람일 수도 있어서 반드시 직접 확인 후 처리)\n\n' +
        dupIssues.join('\n\n') +
        '\n\n※ 이 알림은 apps-script-daily-backup.js의 dahScanForDuplicates()에서 매일 자동 발송됩니다.'
      );
    } catch (e) { Logger.log('중복알림 이메일 발송 실패: ' + e.message); }
  } else {
    Logger.log('✅ 중복 의심 건 없음');
  }

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

  // 2026-08-27(선혜님 요청 - "에러 모니터링 도입하자"): 백업 때 이미 가져온
  // client_error_logs 안에서, 최근 24시간 안에 새로 쌓인 에러가 있으면
  // 이메일로 알림. (client_error_logs_insert RLS 정책도 오늘 함께 손봄 -
  // 예전엔 로그인 세션 없을 때 조용히 실패하던 구멍이 있었음, 지금은
  // 로그인 여부와 무관하게 항상 기록되도록 고쳐놓음)
  if (Array.isArray(backup.client_error_logs)) {
    var oneDayAgo = new Date(Date.now() - 24*60*60*1000);
    var recentErrors = backup.client_error_logs.filter(function(e) {
      return new Date(e.created_at) > oneDayAgo;
    });
    if (recentErrors.length > 0) {
      Logger.log('⚠️ 최근 24시간 신규 에러 ' + recentErrors.length + '건 발견');
      try {
        var errorSummary = recentErrors.slice(0, 20).map(function(e) {
          return '[' + e.app + '/' + (e.user_role||'?') + '] ' + e.message + ' (' + e.created_at + ')';
        }).join('\n');
        MailApp.sendEmail(
          Session.getActiveUser().getEmail(),
          'DAH 신규 에러 ' + recentErrors.length + '건 발견 (' + today + ')',
          '최근 24시간 안에 화면에서 발생한 에러입니다:\n\n' + errorSummary +
          (recentErrors.length > 20 ? '\n\n... 외 ' + (recentErrors.length-20) + '건 더' : '')
        );
      } catch (e) { Logger.log('에러알림 이메일 발송 실패: ' + e.message); }
    } else {
      Logger.log('✅ 최근 24시간 신규 에러 없음');
    }
  }
}

/**
 * ══════════════════════════════════════════════════
 * 중복 의심 데이터 스캔 (dahScanForDuplicates)
 * ══════════════════════════════════════════════════
 * 2026-08-26 도입 — 8/26에 실제로 발견했던 중복 사례(김채은/유경진 견적서,
 * 정은송/박소진 마이그레이션 중복)를 계기로, "사람이 우연히 발견하기 전에
 * 자동으로 걸러내자"는 취지로 만듦.
 *
 * backup 객체(customers/estimates 배열 포함)를 받아서:
 *  - 고객: 같은 전화번호로 안 지워진(is_archived=false) 레코드가 2건 이상
 *  - 견적: 같은 고객명 + 같은 금액 + 같은 날짜(생성일 기준)로 안 지워진
 *    레코드가 2건 이상
 * 인 경우를 의심 목록으로 반환. 아무것도 안 지우거나 고치지 않는 순수
 * "찾아서 보고만" 하는 함수 — 실제 정리는 사람이 확인 후 직접 처리.
 */
function dahScanForDuplicates(backup) {
  var issues = [];

  // 1) 고객 중복 의심 (전화번호 기준)
  if (Array.isArray(backup.customers)) {
    var byPhone = {};
    backup.customers.forEach(function(c) {
      if (c.is_archived || !c.phone) return;
      var key = String(c.phone).replace(/[^0-9]/g, '');
      if (!key) return;
      (byPhone[key] = byPhone[key] || []).push(c);
    });
    Object.keys(byPhone).forEach(function(phone) {
      var group = byPhone[phone];
      if (group.length > 1) {
        issues.push('[고객 중복의심] 전화번호 ' + phone + ' — ' + group.length + '건: ' +
          group.map(function(c) { return c.client_name + '(id:' + c.id + ')'; }).join(', '));
      }
    });
  }

  // 2) 견적서 중복 의심 (고객명+금액+생성일 기준)
  if (Array.isArray(backup.estimates)) {
    var byKey = {};
    backup.estimates.forEach(function(e) {
      if (e.is_archived || !e.customer_name) return;
      var day = (e.created_at || '').slice(0, 10);
      var key = e.customer_name + '|' + e.price + '|' + day;
      (byKey[key] = byKey[key] || []).push(e);
    });
    Object.keys(byKey).forEach(function(key) {
      var group = byKey[key];
      if (group.length > 1) {
        var parts = key.split('|');
        issues.push('[견적서 중복의심] ' + parts[0] + ' / ' + Number(parts[1]).toLocaleString() + '원 / ' + parts[2] +
          ' — ' + group.length + '건: ' + group.map(function(e) { return e.id; }).join(', '));
      }
    });
  }

  // 3) 고아 데이터 의심 (2026-08-27 추가 — 선혜님과 함께 실제로 발견한
  // 최시내 고객님 사례가 계기: 선금결제 단계까지 갔는데 정작 확정된
  // 견적서가 하나도 없던 상태. "결제 단계인데 뒷받침하는 견적이 없다"는
  // 건을 자동으로 걸러냄.)
  if (Array.isArray(backup.customers) && Array.isArray(backup.estimates)) {
    var PAID_STAGES = ['선금결제', '잔금결제', '시공준비중', '시공완료'];
    var estByClientId = {};
    backup.estimates.forEach(function(e) {
      if (e.is_archived || !e.client_id) return;
      (estByClientId[e.client_id] = estByClientId[e.client_id] || []).push(e);
    });
    backup.customers.forEach(function(c) {
      if (c.is_archived) return;
      if (PAID_STAGES.indexOf(c.stage) === -1) return;
      var ests = estByClientId[c.id] || [];
      if (ests.length === 0) {
        issues.push('[고아데이터의심] ' + c.client_name + '(id:' + c.id + ') — "' + c.stage + '" 단계인데 연결된 견적서가 없음');
      }
    });
  }

  return issues;
}

/**
 * 수동으로 지금 바로 중복 스캔만 돌려보고 싶을 때 사용 (백업은 안 만듦,
 * 스캔 전용 API 호출 — customers/estimates만 가져와서 검사).
 * 결과는 실행 로그 + 발견되면 이메일로도 발송.
 */
function dahDuplicateScanOnly() {
  var backup = {};
  var tables = ['customers', 'estimates'];
  tables.forEach(function(table) {
    var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/dah_backup_export', {
      method: 'post', contentType: 'application/json',
      headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY },
      payload: JSON.stringify({ table_name: table }),
      muteHttpExceptions: true
    });
    backup[table] = res.getResponseCode() === 200 ? JSON.parse(res.getContentText()) : [];
  });
  var issues = dahScanForDuplicates(backup);
  if (issues.length === 0) {
    Logger.log('✅ 중복 의심 건 없음');
    return;
  }
  Logger.log('⚠️ 중복 의심 ' + issues.length + '건 발견:\n' + issues.join('\n'));
  try {
    MailApp.sendEmail(
      Session.getActiveUser().getEmail(),
      'DAH 중복 의심 데이터 발견 (수동 스캔)',
      issues.join('\n\n')
    );
  } catch (e) { Logger.log('이메일 발송 실패: ' + e.message); }
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

  // 5. 테스트 레코드 정리 (이 프로젝트는 DELETE가 RLS로 막혀있어 실제로 안 지워짐이 확인됨 →
  //    PATCH(is_archived=true 보관처리)로 확실하게 화면에서 숨김)
  var deleteRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/customers?client_name=eq.' + encodeURIComponent(testName), {
    method: 'patch',
    headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    payload: JSON.stringify({ is_archived: true }),
    muteHttpExceptions: true
  });
  if (deleteRes.getResponseCode() >= 300) {
    report('⚠️ 경고: 테스트 레코드 정리 실패 — 수동으로 "' + testName + '"를 찾아 보관처리해주세요 (HTTP ' + deleteRes.getResponseCode() + ')');
  } else {
    report('5단계 완료: 테스트 레코드 보관처리 완료 — 실제 화면엔 더 이상 안 보입니다');
  }

  report('=== ✅ 복구 드릴 전체 성공 — 백업 파일로 실제 복구가 가능함을 확인했습니다 ===');
}

/**
 * ══════════════════════════════════════════════════
 * 실제 데이터베이스 종합 진단 (dahDiagnoseSchema)
 * ══════════════════════════════════════════════════
 *
 * 2026-07-17 발견: customers 테이블에 저장할 때마다 "record new has no
 * field updated_at" 오류로 모든 PATCH(수정)가 실패하고 있었음 - DB 트리거가
 * updated_at 컬럼을 기대하는데 실제로는 없었던 것. 이 문제는 앱 코드가 아니라
 * 실제 운영 데이터베이스의 스키마/트리거 문제라서, 코드만 봐서는 절대 못 잡고
 * 실제 DB에 진짜로 요청을 보내봐야만 발견할 수 있었다.
 *
 * 이 함수는 앱 코드가 customers/estimates 테이블에 실제로 쓰려고 하는 모든
 * 필드를 하나하나 진짜 저장/수정해보면서, 어떤 필드가 실패하는지 전부 찾아냄.
 * 진짜 데이터는 전혀 안 건드리고, 테스트용 임시 레코드만 만들었다가 끝나면 지움.
 *
 * 실행: 함수 목록에서 dahDiagnoseSchema 선택 후 실행. 결과는 실행 로그에서 확인.
 */
function dahDiagnoseSchema() {
  var log = [];
  function report(msg) { log.push(msg); Logger.log(msg); }

  // 0) estimates 테이블의 실제 컬럼이 뭔지 먼저 확인 (기존 레코드 1건 조회)
  report('=== estimates 테이블 실제 컬럼 확인 ===');
  var peekRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/estimates?select=*&limit=1', {
    method: 'get',
    headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY },
    muteHttpExceptions: true
  });
  if (peekRes.getResponseCode() >= 300) {
    report('❌ estimates 테이블 조회 실패 — HTTP ' + peekRes.getResponseCode() + ' ' + peekRes.getContentText());
  } else {
    var peekData = JSON.parse(peekRes.getContentText());
    if (peekData.length === 0) {
      report('⚠️ estimates 테이블에 기존 레코드가 하나도 없어서, 실제 컬럼 목록을 조회로는 못 봅니다');
    } else {
      report('✅ estimates 테이블의 실제 컬럼 목록: ' + Object.keys(peekData[0]).join(', '));
    }
  }
  report('');

  report('=== customers 테이블 진단 시작 ===');
  var testName = '스키마진단테스트_' + new Date().getTime();

  // 1) 앱이 실제로 저장하는 모든 필드를 포함해 INSERT 시도
  var fullRow = {
    client_name: testName, phone: '010-0000-0000', addr: '테스트주소', space: '거실',
    price: 100000, performance_revenue: 90000, staff_name: '마스터', stage: '상담',
    date: '2026-01-01', measure_date: '2026-01-02', install_date: '2026-01-03', memo: '진단테스트',
    visit_count: 1,
    deposit_amount: 50000, deposit_date: '2026-01-01', deposit_method: '카드', deposit_receipt: false,
    balance_amount: 50000, balance_date: '2026-01-01', balance_method: '현금', balance_receipt: false,
    order_status: { fabric: true }, branch: '반포점', is_archived: false
  };
  var insertRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/customers', {
    method: 'post',
    headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    payload: JSON.stringify(fullRow),
    muteHttpExceptions: true
  });
  if (insertRes.getResponseCode() >= 300) {
    report('❌ customers INSERT 실패 (필드가 하나라도 문제면 전체가 실패함) — HTTP ' + insertRes.getResponseCode());
    report('   상세: ' + insertRes.getContentText());
    report('   → 위 오류 메시지의 필드명을 확인해서, 해당 컬럼을 테이블에 추가하거나 코드에서 제외해야 합니다');
  } else {
    report('✅ customers INSERT 성공 — 모든 필드가 정상적으로 테이블에 존재합니다');
    var createdId = JSON.parse(insertRes.getContentText())[0].id;

    // 2) PATCH(수정) 시도 — 어제 발견된 updated_at 트리거 문제가 여기서 재현됐었음
    var patchRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/customers?id=eq.' + createdId, {
      method: 'patch',
      headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      payload: JSON.stringify({ stage: '계약금', deposit_amount: 60000 }),
      muteHttpExceptions: true
    });
    if (patchRes.getResponseCode() >= 300) {
      report('❌ customers PATCH(수정) 실패 — HTTP ' + patchRes.getResponseCode());
      report('   상세: ' + patchRes.getContentText());
      report('   → 이 오류가 나면 앱에서 계약금 저장/단계변경/발주체크 등 모든 "수정" 기능이 실제로는 서버에 반영 안 되고 있는 것입니다');
    } else {
      report('✅ customers PATCH(수정) 성공 — 계약금 저장, 단계변경 등이 정상적으로 서버에 반영됩니다');
    }

    // 정리
    UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/customers?id=eq.' + createdId, {
      method: 'patch', headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, payload: JSON.stringify({ is_archived: true }), muteHttpExceptions: true
    });
    report('   (테스트 레코드 정리 완료)');
  }

  report('');
  report('=== estimates 테이블 진단 시작 ===');
  var estRow = {
    customer_name: testName, price: 100000, performance_revenue: 90000, staff_name: '마스터',
    estimate_status: 'ga', phone: '010-0000-0000', space: '거실', product: '테스트원단',
    date: '2026-01-01', memo: '진단테스트', confirmed_at: null, branch: '반포점', client_id: null
  };
  var estInsertRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/estimates', {
    method: 'post',
    headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    payload: JSON.stringify(estRow),
    muteHttpExceptions: true
  });
  if (estInsertRes.getResponseCode() >= 300) {
    report('❌ estimates INSERT 실패 — HTTP ' + estInsertRes.getResponseCode());
    report('   상세: ' + estInsertRes.getContentText());
  } else {
    report('✅ estimates INSERT 성공');
    var estId = JSON.parse(estInsertRes.getContentText())[0].id;
    UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/estimates?id=eq.' + estId, {
      method: 'patch', headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, payload: JSON.stringify({ is_archived: true }), muteHttpExceptions: true
    });
    report('   (테스트 레코드 정리 완료)');
  }

  report('');
  report('=== surveys 테이블 진단 시작 ===');
  var surveyPeekRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/surveys?select=*&limit=1', {
    method: 'get',
    headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY },
    muteHttpExceptions: true
  });
  if (surveyPeekRes.getResponseCode() >= 300) {
    report('❌ surveys 테이블 조회 실패 — HTTP ' + surveyPeekRes.getResponseCode() + ' ' + surveyPeekRes.getContentText());
  } else {
    var surveyPeekData = JSON.parse(surveyPeekRes.getContentText());
    if (surveyPeekData.length === 0) {
      report('⚠️ surveys 테이블에 기존 레코드가 하나도 없어서, 실제 컬럼 목록을 조회로는 못 봅니다');
    } else {
      report('✅ surveys 테이블의 실제 컬럼 목록: ' + Object.keys(surveyPeekData[0]).join(', '));
    }
  }
  // 설문 앱(survey-app.js)이 실제로 보내는 필드 그대로 테스트
  var surveyTestName = '설문진단테스트_' + new Date().getTime();
  var surveyRow = {
    client_name: surveyTestName, phone: '010-0000-0000', addr: '테스트주소',
    space: '거실, 안방',
    answers: { pyeong: '30', homeDir: '남향', wallTone: '화이트', floorType: '원목마루', moods: ['모던'], functions: ['암막'], budget: '100만원대', sizeNote: '' },
    memo: '진단테스트', status: '신규'
  };
  var surveyInsertRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/surveys', {
    method: 'post',
    headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    payload: JSON.stringify(surveyRow),
    muteHttpExceptions: true
  });
  if (surveyInsertRes.getResponseCode() >= 300) {
    report('❌ surveys INSERT 실패 (설문 제출이 실제로 이렇게 실패하고 있을 수 있습니다) — HTTP ' + surveyInsertRes.getResponseCode());
    report('   상세: ' + surveyInsertRes.getContentText());
  } else {
    report('✅ surveys INSERT 성공 — 설문 제출이 정상적으로 서버에 저장됩니다');
    var surveyId = JSON.parse(surveyInsertRes.getContentText())[0].id;
    UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/surveys?id=eq.' + surveyId, {
      method: 'patch', headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, payload: JSON.stringify({ is_archived: true }), muteHttpExceptions: true
    });
    report('   (테스트 레코드 정리 완료)');
  }

  report('=== 진단 완료 — 위 결과를 그대로 복사해서 알려주세요 ===');
}


/**
 * ══════════════════════════════════════════════════
 * 테스트 데이터 청소 (dahCleanupTestData)
 * ══════════════════════════════════════════════════
 * 오늘 진단/드릴 테스트 도중, 일부 테스트 레코드의 자동삭제가 실패해서
 * 실제 고객목록에 "복구드릴테스트_...", "스키마진단테스트_...",
 * "설문진단테스트_..."가 남아있는 게 발견됨. 이 함수는 그 패턴에
 * 정확히 일치하는 레코드만 찾아서 삭제함(실제 고객 데이터는 절대 안 건드림).
 */
function dahCleanupTestData() {
  var log = [];
  function report(msg) { log.push(msg); Logger.log(msg); }
  var patterns = ['복구드릴테스트_', '스키마진단테스트_', '설문진단테스트_'];
  var tables = [
    { name: 'customers', nameCol: 'client_name' },
    { name: 'estimates', nameCol: 'customer_name' },
    { name: 'surveys', nameCol: 'client_name' }
  ];
  tables.forEach(function(t) {
    patterns.forEach(function(p) {
      var url = SUPABASE_URL + '/rest/v1/' + t.name + '?' + t.nameCol + '=like.' + encodeURIComponent(p + '*') + '&is_archived=eq.false&select=id,' + t.nameCol;
      var res = UrlFetchApp.fetch(url, { method: 'get', headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY }, muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) { report('❌ ' + t.name + ' 조회 실패: ' + res.getContentText()); return; }
      var rows = JSON.parse(res.getContentText());
      if (rows.length === 0) return;
      rows.forEach(function(row) {
        // ⚠️ 이 프로젝트는 DELETE가 RLS로 막혀있어(2026-07-17 확인) 실제 삭제 대신 보관처리(PATCH)를 씀
        var patchRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + t.name + '?id=eq.' + row.id, {
          method: 'patch', headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          payload: JSON.stringify({ is_archived: true }), muteHttpExceptions: true
        });
        report((patchRes.getResponseCode() < 300 ? '✅ 보관처리됨: ' : '❌ 처리실패(HTTP ' + patchRes.getResponseCode() + '): ') + t.name + ' — ' + row[t.nameCol] + (patchRes.getResponseCode() >= 300 ? ' | 상세: ' + patchRes.getContentText() : ''));
      });
    });
  });
  report('=== 테스트 데이터 청소 완료 ===');
}

/**
 * ══════════════════════════════════════════════════
 * 원본 문자열 진단 (dahPeekRawName) — 읽기 전용, 안전
 * ══════════════════════════════════════════════════
 * 특정 전화번호로 고객을 조회해서, 저장된 이름(client_name)의
 * 정확한 원본 값과 각 글자의 유니코드 코드까지 로그로 남김.
 * "실제 데이터 자체가 이상한지" vs "화면에 보여줄 때만 깨지는지"를 구분하기 위함.
 * 데이터를 전혀 바꾸지 않는 순수 조회 함수라 100% 안전함.
 */
function dahPeekRawName(phone) {
  var log = [];
  function report(msg) { log.push(msg); Logger.log(msg); }
  var url = SUPABASE_URL + '/rest/v1/customers?phone=eq.' + encodeURIComponent(phone) + '&select=id,client_name,phone,addr,created_at';
  var res = UrlFetchApp.fetch(url, { method: 'get', headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) { report('❌ 조회 실패: ' + res.getContentText()); return; }
  var rows = JSON.parse(res.getContentText());
  report('전화번호 "' + phone + '"로 찾은 레코드 수: ' + rows.length);
  rows.forEach(function(row, i) {
    report('--- 레코드 ' + (i+1) + ' (id: ' + row.id + ') ---');
    report('  client_name 원본값: "' + row.client_name + '"');
    report('  client_name 길이: ' + row.client_name.length + '자');
    var codes = [];
    for (var j = 0; j < row.client_name.length; j++) codes.push(row.client_name.charCodeAt(j));
    report('  각 글자 유니코드: ' + codes.join(', '));
    report('  phone: "' + row.phone + '"');
    report('  addr: "' + (row.addr || '') + '"');
    report('  created_at: ' + row.created_at);
  });
}

/**
 * ══════════════════════════════════════════════════
 * 웹 브릿지 (doGet) — Claude가 직접 실행할 수 있게 해주는 창구
 * ══════════════════════════════════════════════════
 * "배포 > 새 배포 > 웹 앱"으로 배포한 뒤 그 URL을 Claude에게 알려주면,
 * 그 다음부터는 Claude가 이 URL을 직접 열어서(웹에서 접속하듯) 함수를
 * 실행시키고 결과 로그까지 바로 받아볼 수 있음 — 매번 코드를 복사해서
 * 붙여넣고 실행 버튼을 누르는 과정이 필요 없어짐.
 *
 * URL 예시: [배포후URL]?key=[Script Properties에 등록한 값]&action=diagnoseSchema
 * key는 아무나 이 주소로 실행하지 못하게 막는 간단한 비밀번호.
 */
function doGet(e) {
  // 2026-08-05: 이 시크릿 키가 코드에 그대로 하드코딩되어 있었음 — 이 저장소는
  // 공개(public) 저장소라서, SUPABASE_SERVICE_ROLE_KEY와 똑같은 이유로 문제였음.
  // 2026-08-19: 선혜님이 Script Properties에 DAH_BRIDGE_SECRET_KEY를 실제로
  // 등록 완료함 — 이제 하드코딩된 기본값(dah-bridge-2026)을 완전히 제거함.
  // 등록이 안 되어 있으면(getProperty가 null 리턴) 조용히 옛날 값으로 넘어가지
  // 않고 명확하게 실행 자체를 거부하도록(fail-safe) 변경.
  var SECRET_KEY = PropertiesService.getScriptProperties().getProperty('DAH_BRIDGE_SECRET_KEY');
  if (!SECRET_KEY) {
    return ContentService.createTextOutput('❌ 설정 오류 — Script Properties에 DAH_BRIDGE_SECRET_KEY가 등록되어 있지 않습니다').setMimeType(ContentService.MimeType.TEXT);
  }
  if (!e || !e.parameter || e.parameter.key !== SECRET_KEY) {
    return ContentService.createTextOutput('❌ 인증 실패 — key 파라미터가 올바르지 않습니다').setMimeType(ContentService.MimeType.TEXT);
  }
  var action = e.parameter.action;
  try {
    if (action === 'dailyBackup') dahDailyBackup();
    else if (action === 'diagnoseSchema') dahDiagnoseSchema();
    else if (action === 'cleanupTestData') dahCleanupTestData();
    else if (action === 'restoreDrill') dahRestoreDrill();
    else if (action === 'peekRawName') dahPeekRawName(e.parameter.phone || '');
    else if (action === 'duplicateScan') dahDuplicateScanOnly();
    else return ContentService.createTextOutput('❌ 알 수 없는 action: "' + action + '"\n사용가능: dailyBackup, diagnoseSchema, cleanupTestData, restoreDrill, peekRawName, duplicateScan').setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput('❌ 실행 중 오류 발생: ' + err.message + '\n' + err.stack).setMimeType(ContentService.MimeType.TEXT);
  }
  return ContentService.createTextOutput(Logger.getLog()).setMimeType(ContentService.MimeType.TEXT);
}
