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

/* ══════════════ 1) 문서 자동저장 ══════════════ */

function saveDocumentFile(data) {
  var customerName = (data.customerName || '미지정고객').replace(/[\\\/:*?"<>|]/g, '_');
  var docType = (data.category || '기타').replace(/[\\\/:*?"<>|]/g, '_');
  var vendorSuffix = data.vendor ? '_' + data.vendor.replace(/[\\\/:*?"<>|]/g, '_') : '';
  var htmlContent = data.htmlContent || '<p>내용 없음</p>';

  // 공용드라이브 안의 폴더는 이름검색보다 ID로 직접 여는 게 확실함
  var rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);

  var monthStr = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM');
  var monthFolders = rootFolder.getFoldersByName(monthStr);
  var monthFolder = monthFolders.hasNext() ? monthFolders.next() : rootFolder.createFolder(monthStr);

  var custFolders = monthFolder.getFoldersByName(customerName);
  var custFolder = custFolders.hasNext() ? custFolders.next() : monthFolder.createFolder(customerName);

  var fileName = docType + vendorSuffix + '.html';

  var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<title>' + docType + ' - ' + customerName + '</title></head><body>'
    + htmlContent + '</body></html>';

  // 같은 [연월]/[고객명]/[문서종류] 파일이 이미 있으면 덮어쓰기(최신본만 유지)
  var existingFiles = custFolder.getFilesByName(fileName);
  while (existingFiles.hasNext()) {
    existingFiles.next().setTrashed(true);
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
