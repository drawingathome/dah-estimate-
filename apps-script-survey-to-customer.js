// ════════════════════════════════════════════════
// 드로잉엣홈 DAH — Apps Script
// 설문 응답(Supabase surveys 테이블) → 대시보드 고객 자동 등록
//
// ⚠️ 재작성 이력: 이 스크립트는 원래 구글폼 onFormSubmit 트리거용으로 작성되어
// 있었으나, survey.html이 구글폼이 아니라 자체 React 앱이라 실제로는 절대
// 실행될 수 없는 상태였습니다(연결할 구글폼 자체가 없음). survey.html은
// 설문 제출 시 Supabase의 surveys 테이블에 직접 저장하므로, 이 스크립트는
// "시간 기반 트리거"로 바꿔 surveys 테이블을 주기적으로 확인하는 방식으로
// 다시 작성했습니다.
//
// 【설치 방법】
// 1. Google Apps Script 편집기(script.google.com)에서 새 프로젝트 생성 후
//    이 코드를 붙여넣기
// 2. 왼쪽 메뉴 "트리거" → "트리거 추가"
//    - 실행할 함수: processNewSurveys
//    - 이벤트 소스: 시간 기반
//    - 시간 기반 트리거 유형: 분 단위 타이머 (예: 10분마다)
// 3. 처음 설치 시 반드시 testProcessSurveys()를 수동 실행해서 아래 두 가지를
//    먼저 확인하세요:
//    (a) surveys 테이블에 status='신규' 데이터가 있을 때 정상적으로
//        가져와지는지 (Logger.log 확인)
//    (b) customers 테이블에 정상 등록되고, surveys 테이블의 status가
//        '등록완료'로 바뀌는지
//    ※ surveys 테이블에 id 컬럼이 없거나 이름이 다르면 마지막 UPDATE 단계이
//       실패할 수 있습니다 — 이 경우 실패해도 고객 등록 자체(가장 중요한 부분)는
//       이미 끝난 상태이므로, marking 실패 시 다음 실행에서 같은 설문이 중복
//       등록되지 않도록 UPDATE 필터 컬럼명을 실제 스키마에 맞게 조정하세요.
// ════════════════════════════════════════════════

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

// 시간 기반 트리거로 주기 실행 — status가 '신규'인 설문을 찾아 고객으로 등록
function processNewSurveys() {
  try {
    var newSurveys = fetchNewSurveys();
    if (!newSurveys || newSurveys.length === 0) {
      Logger.log('처리할 신규 설문 없음');
      return;
    }

    newSurveys.forEach(function(survey) {
      try {
        // 이름 또는 연락처가 없으면 등록 스킵 (다음 실행에서도 계속 대기 상태로 남음)
        if (!survey.client_name || !survey.phone) {
          Logger.log('이름 또는 연락처 없음 — 스킵: id=' + survey.id);
          return;
        }

        // 2026-08-05: 중복 등록 방지 — 이 스크립트는 사람 확인 없이 10분마다 자동
        // 실행되는데, 기존엔 같은 사람이 설문을 두 번 내거나 이미 등록된 고객이
        // 다시 작성해도 무조건 새 고객으로 만들었음. 등록 전에 같은 전화번호 고객이
        // 이미 있는지 먼저 확인해서, 있으면 새로 안 만들고 스킵(+메모만 남김).
        var existing = findExistingCustomerByPhone(survey.phone);
        if (existing) {
          Logger.log('이미 등록된 고객(전화번호 일치) — 신규생성 스킵: ' + survey.client_name + ' / id=' + existing.id);
          markSurveyProcessed(survey.id);
          return;
        }

        var customer = {
          client_name: survey.client_name,
          phone: survey.phone,
          addr: survey.addr || '',
          space: survey.space || '',
          memo: '설문 자동 등록' + (survey.memo ? ' | ' + survey.memo : ''),
          stage: '상담',
          staff_name: '마스터',
          date: formatDate(new Date())
        };

        var result = insertCustomer(customer);
        Logger.log('고객 등록 완료: ' + customer.client_name + ' / ' + JSON.stringify(result));

        // 중복 등록 방지를 위해 처리 완료 표시
        markSurveyProcessed(survey.id);

      } catch (rowErr) {
        Logger.log('개별 설문 처리 오류(id=' + survey.id + '): ' + rowErr.toString());
      }
    });

  } catch (err) {
    Logger.log('전체 오류: ' + err.toString());
  }
}

// status='신규'인 설문 목록 조회
function fetchNewSurveys() {
  var url = SUPABASE_URL + '/rest/v1/surveys?status=eq.' + encodeURIComponent('신규') + '&select=*';
  var options = {
    method: 'get',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY
    },
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    Logger.log('설문 조회 실패: ' + response.getContentText());
    return [];
  }
  return JSON.parse(response.getContentText());
}

// 2026-08-05 신규: 전화번호로 기존 고객이 이미 있는지 확인 (중복등록 방지용)
function findExistingCustomerByPhone(phone) {
  if (!phone) return null;
  var url = SUPABASE_URL + '/rest/v1/customers?phone=eq.' + encodeURIComponent(phone) + '&select=id,client_name&limit=1';
  var options = {
    method: 'get',
    headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY },
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    Logger.log('기존고객 조회 실패(중복체크 스킵하고 그냥 등록 진행): ' + response.getContentText());
    return null;
  }
  var rows = JSON.parse(response.getContentText());
  return rows && rows.length > 0 ? rows[0] : null;
}

// customers 테이블에 등록
function insertCustomer(customer) {
  var url = SUPABASE_URL + '/rest/v1/customers';
  var options = {
    method: 'post',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    payload: JSON.stringify(customer),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  return JSON.parse(response.getContentText());
}

// 처리 완료된 설문의 status를 '등록완료'로 변경 (중복 등록 방지)
function markSurveyProcessed(surveyId) {
  if (surveyId === undefined || surveyId === null) {
    Logger.log('⚠️ survey id가 없어 status 업데이트를 건너뜁니다. (id 컬럼명 확인 필요)');
    return;
  }
  var url = SUPABASE_URL + '/rest/v1/surveys?id=eq.' + surveyId;
  var options = {
    method: 'patch',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    payload: JSON.stringify({ status: '등록완료' }),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() >= 300) {
    Logger.log('⚠️ status 업데이트 실패(id=' + surveyId + '): ' + response.getContentText());
  }
}

function formatDate(date) {
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

// ── 설치 후 반드시 먼저 이 함수를 수동 실행해서 정상 동작을 확인하세요 ──
function testProcessSurveys() {
  Logger.log('=== 신규 설문 조회 테스트 ===');
  var surveys = fetchNewSurveys();
  Logger.log('신규 설문 ' + surveys.length + '건 발견');
  Logger.log(JSON.stringify(surveys));

  if (surveys.length === 0) {
    Logger.log('테스트할 신규 설문이 없습니다. survey.html에서 설문을 하나 제출한 뒤 다시 실행해보세요.');
    return;
  }

  Logger.log('=== 실제 processNewSurveys() 실행 ===');
  processNewSurveys();
}

// ── 수동 테스트용 (customers 테이블 직접 등록 테스트) ──
function testInsert() {
  var testCustomer = {
    client_name: '테스트 고객',
    phone: '010-0000-0000',
    stage: '상담',
    staff_name: '마스터',
    memo: 'Apps Script 테스트'
  };
  var result = insertCustomer(testCustomer);
  Logger.log(JSON.stringify(result));
}
