/**
 * ══════════════════════════════════════════════════
 * DAH 자동화 허브 — 구글드라이브 문서저장 + 고객명단 시트 동기화
 * ══════════════════════════════════════════════════
 *
 * 이 스크립트 하나로 두 가지를 처리합니다:
 *
 * 1) 문서 자동저장 (발주서/실측시공/견적서 등)
 *    DAH_문서보관/{카테고리}/{연-월}/{날짜}_{고객명}_{거래처}.html
 *    같은 날 같은 문서를 다시 저장하면 기존 파일을 덮어씁니다
 *    (그날의 최종본만 남음, 날짜가 바뀌면 새 파일로 이력이 쌓임)
 *    카테고리: 견적서 / 제작 / 원단 / 블라인드 / 레일외 부자재 / 전동 / 실측시공
 *
 * 2) 고객명단 시트 동기화 (현황판 방식 — 전화번호 기준으로
 *    같은 고객이면 그 줄만 갱신, 새 고객이면 새 줄 추가. 중복 없음)
 *    첫 실행 시 "DAH_고객명단" 스프레드시트를 자동 생성합니다.
 *
 * ══════════════════════════════════════════════════
 * 설치 방법
 * ══════════════════════════════════════════════════
 * 1. script.google.com → 새 프로젝트
 * 2. 이 코드 전체 붙여넣기, 저장 (이름: "DAH 자동화 허브" 등)
 * 3. 우측 상단 "배포" → "새 배포"
 * 4. 유형: 웹 앱
 *    실행할 사용자: 나
 *    액세스 권한이 있는 사용자: 모든 사용자  ← 중요!
 * 5. 배포 → 권한 승인
 * 6. 나오는 "웹 앱 URL"을 개발자(Claude)에게 전달
 * ══════════════════════════════════════════════════
 */

var ROOT_FOLDER_NAME = 'DAH_문서보관';
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

/* ══════════════ 1) 문서 자동저장 ══════════════ */

function saveDocumentFile(data) {
  var customerName = (data.customerName || '미지정고객').replace(/[\\\/:*?"<>|]/g, '_');
  var category = (data.category || '기타').replace(/[\\\/:*?"<>|]/g, '_');
  var vendor = data.vendor ? '_' + data.vendor.replace(/[\\\/:*?"<>|]/g, '_') : '';
  var htmlContent = data.htmlContent || '<p>내용 없음</p>';

  var rootFolders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  var rootFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);

  var catFolders = rootFolder.getFoldersByName(category);
  var catFolder = catFolders.hasNext() ? catFolders.next() : rootFolder.createFolder(category);

  var monthStr = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM');
  var monthFolders = catFolder.getFoldersByName(monthStr);
  var monthFolder = monthFolders.hasNext() ? monthFolders.next() : catFolder.createFolder(monthStr);

  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var fileName = today + '_' + customerName + vendor + '.html';

  var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<title>' + category + ' - ' + customerName + '</title></head><body>'
    + htmlContent + '</body></html>';

  // 같은 날 같은 이름의 파일이 이미 있으면 덮어쓰기 (기존 파일 삭제 후 새로 생성)
  // — 하루 안에서는 최종본만 남고, 날짜가 바뀌면 새 파일로 이력이 남음
  var existingFiles = monthFolder.getFilesByName(fileName);
  while (existingFiles.hasNext()) {
    existingFiles.next().setTrashed(true);
  }

  var file = monthFolder.createFile(fileName, fullHtml, MimeType.HTML);

  return ContentService.createTextOutput(JSON.stringify({
    success: true, fileUrl: file.getUrl(), fileName: fileName,
    path: ROOT_FOLDER_NAME + '/' + category + '/' + monthStr
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

  if (phone && lastRow > 1) {
    var phoneColumn = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    for (var i = 0; i < phoneColumn.length; i++) {
      if (phoneColumn[i][0] === phone) { foundRowIndex = i + 2; break; }
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
