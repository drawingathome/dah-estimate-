/**
 * ══════════════════════════════════════════════════
 * DAH 문서 자동 저장 → 구글드라이브 (고객별 폴더 정리)
 * ══════════════════════════════════════════════════
 *
 * 발주서/실측 의뢰서/시공 의뢰서/견적서를 dah-estimate.html에서
 * 만들 때마다, 자동으로 구글드라이브에 고객명 폴더별로 저장합니다.
 *
 * 저장 구조:
 *   DAH_문서보관/
 *     ├─ 홍길동/
 *     │   ├─ 2026-07-10_견적서.html
 *     │   ├─ 2026-07-10_발주서.html
 *     │   └─ 2026-07-11_시공의뢰서.html
 *     └─ 김영희/
 *         └─ ...
 *
 * 파일은 HTML로 저장됩니다 (더블클릭하면 브라우저에서 바로 보기 가능,
 * 필요하면 열어서 Ctrl+P로 PDF 저장도 가능). PDF로 자동변환은
 * 안정성 문제로 뺐어요 — 원하시면 나중에 추가할 수 있어요.
 *
 * ══════════════════════════════════════════════════
 * 설치 방법
 * ══════════════════════════════════════════════════
 * 1. script.google.com → 새 프로젝트 (자동백업이랑 별도로 새로 만들기)
 * 2. 이 코드 전체 붙여넣기, 저장 (이름: "DAH 문서저장" 등)
 * 3. 우측 상단 "배포" → "새 배포" 클릭
 * 4. 유형 선택(톱니바퀴 아이콘) → "웹 앱" 선택
 * 5. 설명: 아무거나
 *    실행할 사용자: "나"
 *    액세스 권한이 있는 사용자: "모든 사용자"  ← 중요!
 * 6. "배포" 클릭 → 권한 승인
 * 7. 나오는 "웹 앱 URL"을 복사해서 개발자(Claude)에게 전달
 *    (이 URL을 dah-estimate.html에 연결해야 실제로 작동합니다)
 * ══════════════════════════════════════════════════
 */

var ROOT_FOLDER_NAME = 'DAH_문서보관';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var customerName = (data.customerName || '미지정고객').replace(/[\\\/:*?"<>|]/g, '_');
    var docType = data.docType || '문서';
    var htmlContent = data.htmlContent || '<p>내용 없음</p>';

    var rootFolders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
    var rootFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);

    var custFolders = rootFolder.getFoldersByName(customerName);
    var custFolder = custFolders.hasNext() ? custFolders.next() : rootFolder.createFolder(customerName);

    var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    var time = Utilities.formatDate(new Date(), 'Asia/Seoul', 'HHmmss');
    var fileName = today + '_' + docType + '_' + time + '.html';

    // 완전한 HTML 문서로 감싸서 저장 (한글 깨짐 방지 charset 포함)
    var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
      + '<title>' + docType + ' - ' + customerName + '</title></head><body>'
      + htmlContent + '</body></html>';

    var file = custFolder.createFile(fileName, fullHtml, MimeType.HTML);

    return ContentService.createTextOutput(JSON.stringify({
      success: true, fileUrl: file.getUrl(), fileName: fileName, folder: customerName
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false, error: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 배포 후 테스트용: 이 함수를 직접 실행해서 정상 작동하는지 확인 가능
function testSaveDocument() {
  var fakeEvent = {
    postData: {
      contents: JSON.stringify({
        customerName: '테스트고객',
        docType: '견적서',
        htmlContent: '<h1>테스트 문서입니다</h1><p>이 파일이 보이면 정상 작동입니다.</p>'
      })
    }
  };
  var result = doPost(fakeEvent);
  Logger.log(result.getContent());
}
