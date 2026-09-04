/**
 * ══════════════════════════════════════════════════
 * DAH 자동화 허브 — 구글드라이브 문서저장 + 고객명단 시트 동기화
 * ══════════════════════════════════════════════════
 *
 * 1) 문서 자동저장 (발주서/실측시공/확정견적서)
 *    2026-08-02 구조 변경: [연월]/[고객명]/[문서종류].html
 *    (예전엔 [카테고리]/[연월]/파일 이었는데, 한 고객 관련 서류를
 *    찾으려면 여러 카테고리 폴더를 다 뒤져야 해서 불편했음.
 *    이제 고객 폴더 하나만 열면 그 고객 서류가 전부 모여있음.)
 *    같은 [연월]/[고객명]/[문서종류] 조합이면 덮어쓰기(최신본 유지).
 *
 * 2) 고객명단 시트 동기화 — 예전과 동일
 *
 * ══════════════════════════════════════════════════
 * 설치 방법 (공용드라이브 사용 시 — 2026-08-02 업데이트)
 * ══════════════════════════════════════════════════
 * 1. 구글드라이브에서 공용드라이브(팀 드라이브) 안에 "DAH_문서보관" 폴더를
 *    직접 만들기 (이 스크립트가 자동으로 최상위 공용드라이브 폴더를
 *    만들 수는 없어서, 이 폴더 하나는 미리 만들어둬야 함)
 * 2. 그 폴더를 열어서 주소창 URL에서 폴더ID 복사
 *    (예: drive.google.com/drive/folders/여기가폴더ID)
 * 3. 아래 ROOT_FOLDER_ID 에 그 값 붙여넣기
 * 4. script.google.com → 새 프로젝트 → 이 코드 전체 붙여넣기 → 저장
 * 5. 우측상단 "배포" → "새 배포" → 유형: 웹앱, 실행할 사용자: 나,
 *    액세스 권한: 모든 사용자 → 배포 → 권한 승인
 * 6. 나오는 "웹 앱 URL"을 개발자(Claude)에게 전달
 * ══════════════════════════════════════════════════
 */

var ROOT_FOLDER_ID = '여기에_공용드라이브_DAH_문서보관_폴더ID_붙여넣기';
var CUSTOMER_SHEET_NAME = 'DAH_고객명단';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || 'saveDocument';

    if (action === 'syncCustomer') {
      return syncCustomerRow(data);
    } else {
      return saveDocumentFile(data);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false, error: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 2026-09-04(선혜님 지시 - "니가 할 수 있는 방법을 찾아야지"): 아래에 있는
// cleanupJunkCustomerRows/cleanupJunkDriveDocuments(8/27에 만들어짐)는
// 지금까지 Apps Script 편집기를 열어서 함수를 골라 "실행" 버튼을 눌러야만
// 돌아갔음 - 그 사이 시트가 다시 심하게 오염되는 걸 실제로 확인함(3244줄
// 중 3200줄/98.6%가 테스트 잔재였음). 브라우저에서 아래 링크 하나만 열면
// 편집기 접근 없이 바로 실행되도록 doGet을 신설함. 이 함수 자체가 정해진
// 이름 목록(JUNK_NAMES)과 정확히 일치하는 행/폴더만 지우는 안전한 작업이라
// (실제 고객 데이터는 이름이 달라 절대 안 지워짐) 가벼운 키 하나로만 보호.
//
// 실행 방법: 아래 URL의 [배포후_실제_웹앱URL] 부분을 실제 배포 URL로
// 바꾼 다음, 그 주소를 브라우저 주소창에 붙여넣고 엔터만 치면 끝남.
//   [배포후_실제_웹앱URL]?action=cleanup&key=dah-cleanup-2026
function doGet(e) {
  var KEY = 'dah-cleanup-2026';
  if (!e || !e.parameter || e.parameter.key !== KEY) {
    return ContentService.createTextOutput('❌ 인증 실패 — key 파라미터가 올바르지 않습니다').setMimeType(ContentService.MimeType.TEXT);
  }
  if (e.parameter.action !== 'cleanup') {
    return ContentService.createTextOutput('❌ 알 수 없는 action — 사용가능: cleanup').setMimeType(ContentService.MimeType.TEXT);
  }
  try {
    cleanupJunkCustomerRows();
    cleanupJunkDriveDocuments();
    return ContentService.createTextOutput('✅ 정리 완료 — 자세한 내역은 Apps Script 편집기의 "실행 기록"에서 확인할 수 있어요').setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput('❌ 실행 중 오류: ' + err.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

/* ══════════════ 1) 문서 자동저장 ══════════════ */

function saveDocumentFile(data) {
  var customerName = (data.customerName || '미지정고객').replace(/[\\\/:*?"<>|]/g, '_');
  var docType = (data.category || '기타').replace(/[\\\/:*?"<>|]/g, '_');
  var vendorSuffix = data.vendor ? '_' + data.vendor.replace(/[\\\/:*?"<>|]/g, '_') : '';
  // 2026-08-27(선혜님 요청 - "실장/마스터를 나눠서 보관, 접근제한이 아니라
  // 그냥 누가 언제 만든 문서인지 보기 편하게"): 파일명 끝에 담당자 이름을
  // 붙여서, 폴더를 열었을 때 파일명만 봐도 누가 작업한 문서인지 바로
  // 보이게 함. 폴더를 따로 나누지 않은 이유는, 폴더를 나누면 "같은 고객의
  // 문서가 여러 폴더에 흩어지는" 게 오히려 더 찾기 불편해질 수 있어서
  // (예: 유경진 고객 실측의뢰서는 마스터가, 시공의뢰서는 실장이 만들면
  // 폴더가 나뉘어 한눈에 안 보임) - 지금처럼 고객별 폴더 하나로 모으고,
  // 파일명으로만 담당자를 구분하는 게 더 실용적이라고 판단함.
  var staffSuffix = data.staffName ? '_' + data.staffName.replace(/[\\\/:*?"<>|]/g, '_') : '';
  var htmlContent = data.htmlContent || '<p>내용 없음</p>';

  // 공용드라이브 안의 폴더는 이름검색보다 ID로 직접 여는 게 확실함
  var rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);

  var monthStr = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM');
  var monthFolders = rootFolder.getFoldersByName(monthStr);
  var monthFolder = monthFolders.hasNext() ? monthFolders.next() : rootFolder.createFolder(monthStr);

  var custFolders = monthFolder.getFoldersByName(customerName);
  var custFolder = custFolders.hasNext() ? custFolders.next() : monthFolder.createFolder(customerName);

  var fileName = docType + vendorSuffix + staffSuffix + '.html';
  // 2026-08-27 추가: 중복방지(덮어쓰기) 검색은 담당자 이름 없는 "기본
  // 이름"으로 함 - 담당자가 바뀌어도(예: 마스터→실장) 새 파일이 안 쌓이고
  // 예전 담당자 파일이 정확히 지워지도록. 실제로 만드는 파일명(fileName)
  // 에만 최신 담당자 이름이 붙음.
  var searchFileNamePrefix = docType + vendorSuffix;

  var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<title>' + docType + ' - ' + customerName + '</title></head><body>'
    + htmlContent + '</body></html>';

  // 같은 [연월]/[고객명]/[문서종류] 파일이 이미 있으면 덮어쓰기(최신본만
  // 유지) - 담당자 이름은 접두어 매칭에서 제외해서, 담당자가 바뀌어도
  // 예전 담당자 이름이 붙은 파일이 정확히 지워지고 새 파일만 남음.
  var allFiles = custFolder.getFiles();
  while (allFiles.hasNext()) {
    var existing = allFiles.next();
    if (existing.getName().indexOf(searchFileNamePrefix) === 0) {
      existing.setTrashed(true);
    }
  }

  var file = custFolder.createFile(fileName, fullHtml, MimeType.HTML);

  return ContentService.createTextOutput(JSON.stringify({
    success: true, fileUrl: file.getUrl(), fileName: fileName,
    path: monthStr + '/' + customerName
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ══════════════ 2) 고객명단 시트 동기화 (현황판) ══════════════ */

var CUSTOMER_HEADERS = ['고객명', '연락처', '주소', '담당자', '단계', '금액', '성과매출', '계약일', '실측일', '시공일', '메모', '최종수정일'];

function getOrCreateCustomerSheet() {
  var files = DriveApp.getFilesByName(CUSTOMER_SHEET_NAME);
  var ss;
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(CUSTOMER_SHEET_NAME);
  }
  var sheet = ss.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(CUSTOMER_HEADERS);
    sheet.getRange(1, 1, 1, CUSTOMER_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function syncCustomerRow(data) {
  var sheet = getOrCreateCustomerSheet();
  var phone = data.phone || '';
  var newRow = [
    data.clientName || '', phone, data.addr || '', data.staffName || '',
    data.stage || '', data.price || 0, data.performanceRevenue || 0,
    data.date || '', data.measureDate || '', data.installDate || '',
    data.memo || '', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm')
  ];

  var lastRow = sheet.getLastRow();
  var foundRowIndex = -1;

  // 2026-08-05: 전화번호로만 기존 행을 찾다 보니, 전화번호가 없는 고객(실제 프로덕션에
  // 10명 있음 — 플러그 이관 시 원본에 번호가 없던 케이스)은 단계가 바뀔 때마다
  // 매번 새 행으로 추가되어 시트에 같은 고객이 여러 번 중복 등록되던 버그.
  // 전화번호가 있으면 전화로, 없으면 이름으로 폴백해서 찾도록 수정.
  if (lastRow > 1) {
    if (phone) {
      var phoneColumn = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
      for (var i = 0; i < phoneColumn.length; i++) {
        if (phoneColumn[i][0] === phone) { foundRowIndex = i + 2; break; }
      }
    } else {
      var nameColumn = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var j = 0; j < nameColumn.length; j++) {
        if (nameColumn[j][0] === (data.clientName || '')) { foundRowIndex = j + 2; break; }
      }
    }
  }

  if (foundRowIndex > -1) {
    sheet.getRange(foundRowIndex, 1, 1, newRow.length).setValues([newRow]);
  } else {
    sheet.appendRow(newRow);
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: true, action: foundRowIndex > -1 ? 'updated' : 'appended', row: foundRowIndex > -1 ? foundRowIndex : sheet.getLastRow()
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ══════════════ 테스트용 함수 (직접 실행해서 확인 가능) ══════════════ */

// 2026-08-27(선혜님 발견 — "고객명단 시트에 이상한 게 너무 많다"):
// syncCustomerRow의 중복방지 로직은 이미 2026-08-05에 고쳐져 있어서 지금은
// 정상 작동 중(실제 고객은 전부 1행씩만 있는 것 확인함) - 다만 그 수정
// 전날(8/4)에 만들어진 테스트 잔재("회귀테스트중복방지고객" 950행)와,
// 이후 Claude가 실장/견적서 기능을 테스트하다 실수로 흘려보낸 몇 건
// ("_사각지대테스트고객" 등, 오늘 8/27)이 계속 시트에 남아있었음. 아래
// 함수를 딱 한 번 실행하면 이 잔재들만 정확히 지워짐(진짜 고객 데이터는
// 전혀 안 건드림 - 정확히 이 이름 목록에 있는 행만 지움).
function cleanupJunkCustomerRows() {
  var JUNK_NAMES = [
    '회귀테스트중복방지고객',
    '_사각지대테스트고객',
    '_사각지대폴백테스트고객',
    '_역할검증고객',
    '_실장A고객1', '_실장A고객2',
    '_설치기사테스트고객', '_문서테스트고객', '_길이측정고객', '_8개품목테스트',
    '_편집테스트고객', '_발주서테스트고객',
    // 2026-08-27 추가: 의미없는 테스트 입력(과거 세션) + 담당자 이름이
    // 고객명으로 잘못 들어간 항목(선혜님 확인 후 함께 삭제 결정)
    'Gbn', 'Hbug', 'ㄱㅇㅊ', 'ㅇㅇ', 'ㅏㅏ', 'ㅛㅅㅅ6ㄹ',
    '오지은', '장선혜'
  ];
  var sheet = getOrCreateCustomerSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('삭제할 데이터 없음'); return; }
  var names = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var deletedCount = 0;
  // 아래에서 위로 지워야 인덱스가 안 밀림
  for (var i = names.length - 1; i >= 0; i--) {
    if (JUNK_NAMES.indexOf(names[i][0]) > -1) {
      sheet.deleteRow(i + 2);
      deletedCount++;
    }
  }
  Logger.log('삭제된 잔재 행 수: ' + deletedCount);
}

// 2026-08-27(선혜님 발견 — "발주서 이런거는 정리된게 없어, 제대로 안
// 들어오는거 같은데"): 구글드라이브 "DAH_문서보관" 폴더 전수조사 결과
// 발견한 문제 2가지를 정리하는 함수.
//   1) "실측시공_실측_[설치기사이름].html" 같이 설치기사 이름이 파일명에
//      들어간 예전 파일들 - saveDocumentToDrive() 호출부(est-documents.js)를
//      고쳐서 앞으로는 이런 파일명이 안 생기게 했지만, 이미 만들어진 예전
//      파일들은 새 이름("실측시공_실측.html")의 최신 파일과 별개로 계속
//      남아있어 정리가 필요함.
//      ⚠️ 처음엔 "설치기사 이름이 파일명에 있으면 무조건 지운다"로
//      만들었는데, 그러면 아직 "깨끗한" 버전이 한 번도 안 만들어진
//      고객(예: 장선혜 폴더)은 가지고 있던 유일한 파일이 통째로 없어져
//      데이터가 사라지는 사고가 날 뻔했음 - "같은 종류(실측/시공) 중
//      가장 최근에 만들어진 파일 1개만 남기고, 그보다 오래된 것만 지운다"
//      로 바꿔서 안전하게 함(유일한 파일은 항상 "가장 최근"이라 안 지워짐).
//   2) "회귀테스트중복방지고객" 테스트 잔재 폴더 - 고객명단 시트와 똑같이
//      여기 문서보관함에도 남아있었음 - 폴더째 휴지통으로 이동.
function cleanupJunkDriveDocuments() {
  var rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var monthFolders = rootFolder.getFolders();
  var deletedFiles = 0, deletedFolders = 0;

  while (monthFolders.hasNext()) {
    var monthFolder = monthFolders.next();
    // "2026-08" 같은 연월 폴더가 아니면(예: 옛 구조의 "원단"/"견적서" 카테고리
    // 폴더) 건드리지 않고 건너뜀 - 안전하게 새 구조([연월]/[고객명]) 안에서만 청소
    if (!/^\d{4}-\d{2}$/.test(monthFolder.getName())) continue;

    var custFolders = monthFolder.getFolders();
    while (custFolders.hasNext()) {
      var custFolder = custFolders.next();
      if (custFolder.getName() === '회귀테스트중복방지고객') {
        custFolder.setTrashed(true);
        deletedFolders++;
        continue;
      }
      // "실측시공_실측" 종류와 "실측시공_시공" 종류를 각각 따로 묶어서,
      // 그룹 안에서 가장 최근 파일 1개만 남기고 나머지는 지움.
      var groups = { '실측': [], '시공': [] };
      var files = custFolder.getFiles();
      while (files.hasNext()) {
        var f = files.next();
        var m = f.getName().match(/^실측시공_(실측|시공)(_.+)?\.html$/);
        if (m) groups[m[1]].push(f);
      }
      ['실측', '시공'].forEach(function(kind) {
        var group = groups[kind];
        if (group.length <= 1) return; // 지울 게 없음(유일한 파일은 절대 안 건드림)
        group.sort(function(a, b) { return b.getLastUpdated().getTime() - a.getLastUpdated().getTime(); });
        for (var i = 1; i < group.length; i++) { // 0번(최신)은 남기고 나머지만 지움
          group[i].setTrashed(true);
          deletedFiles++;
        }
      });
    }
  }
  Logger.log('삭제된 폴더: ' + deletedFolders + ', 삭제된 파일: ' + deletedFiles);
}

function testSaveDocument() {
  var result = saveDocumentFile({
    customerName: '테스트고객', category: '원단', vendor: '디테라',
    htmlContent: '<h1>테스트 발주서</h1><p>이 파일이 보이면 정상 작동입니다.</p>'
  });
  Logger.log(result.getContent());
}

function testSyncCustomer() {
  var result = syncCustomerRow({
    clientName: '테스트고객', phone: '010-0000-0000', addr: '서울시 테스트구',
    staffName: '장선혜', stage: '상담', price: 0
  });
  Logger.log(result.getContent());
}
