// ════════════════════════════════════════════════
// 드로잉엣홈 DAH — Apps Script
// 설문 응답 → 대시보드 고객 자동 등록
// Google Apps Script 에디터에서 실행하세요
// ════════════════════════════════════════════════

var SUPABASE_URL = 'https://sradnglutbzbyyunjyah.supabase.co';
var SUPABASE_KEY = 'sb_publishable_9nYjQBzwiyausr7-Cd-elw_S9inJlge';

// 설문 응답 시 자동 실행
function onFormSubmit(e) {
  try {
    var responses = e.values;
    var timestamp = responses[0];
    
    // 설문 컬럼 순서에 맞게 매핑 (설문 구조에 따라 수정)
    var customer = {
      client_name:  responses[1] || '',   // 고객명
      phone:        responses[2] || '',   // 연락처
      addr:         responses[3] || '',   // 주소
      space:        responses[4] || '',   // 공간 메모
      memo:         '설문 자동 등록 ' + timestamp,
      stage:        '상담',
      staff_name:   '마스터',
      visit_count:  1,
      date:         formatDate(new Date()),
    };
    
    // 빈 이름/연락처는 등록 스킵
    if (!customer.client_name || !customer.phone) {
      Logger.log('이름 또는 연락처 없음 — 스킵');
      return;
    }
    
    // Supabase에 등록
    var result = insertCustomer(customer);
    Logger.log('고객 등록 완료: ' + customer.client_name + ' / ' + JSON.stringify(result));
    
    // 스프레드시트에 처리 결과 기록
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, sheet.getLastColumn() + 1).setValue('DAH 등록 완료');
    
  } catch(err) {
    Logger.log('오류: ' + err.toString());
  }
}

function insertCustomer(customer) {
  var url = SUPABASE_URL + '/rest/v1/customers';
  var options = {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    },
    payload: JSON.stringify(customer),
    muteHttpExceptions: true,
  };
  var response = UrlFetchApp.fetch(url, options);
  return JSON.parse(response.getContentText());
}

function formatDate(date) {
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

// ── 수동 테스트용 ──
function testInsert() {
  var testCustomer = {
    client_name: '테스트 고객',
    phone: '010-0000-0000',
    stage: '상담',
    staff_name: '마스터',
    memo: 'Apps Script 테스트',
  };
  var result = insertCustomer(testCustomer);
  Logger.log(JSON.stringify(result));
}
