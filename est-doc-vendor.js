/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 거래처별 발주서 문서 생성
   (buildVendorDocForOne, getVendorInfoIssues,
    applyVendorArrivalDefaults, collectVendorGroups,
    buildVendorHTML, openVendorOrderPicker, printForVendor,
    wireVendorNameEdit)
   2026-09-16: est-documents.js에서 분리됨(위 est-doc-customer.js
   상단 설명 참고).
   ══════════════════════════════════════════════════ */

function buildVendorDocForOne(vendor, groupItems, cName, cStaff, extraNote, today, arrivalDate, arrivalLocation) {
  // 2026-09-14("코드 모두 정리해" 중 발견): 원단/레일/블라인드 드롭다운
  // 칸을 만드는 코드가 3곳에 거의 똑같이 복사돼 있었음 - 바로 오늘
  // 하루 종일 반복됐던 "한 카테고리만 고치고 나머지를 깜빡하는" 사고의
  // 구조적 원인이 될 수 있는 패턴이라, 공용 함수 하나로 합침. 이제
  // 드롭다운 스타일/옵션 구성을 바꾸려면 이 함수 한 곳만 고치면 3개
  // 카테고리에 전부 반영됨(체크리스트 35번 - 카테고리는 항상 세트).
  function buildVendorSelectCell(it, idx, vendorOptions) {
    if (!it.sourceRow || !it.vendorField) return escHtml(it.vendor||'—');
    var opts = '<option value="">선택</option>' + vendorOptions.map(function(name){
      return '<option value="'+escHtml(name)+'"'+(name===it.vendor?' selected':'')+'>'+escHtml(name)+'</option>';
    }).join('') + '<option value="__custom__">+ 직접 입력</option>';
    return '<select class="pv-item-vendor-select" data-item-idx="'+idx+'" style="font-size:12px;padding:2px;border:1px solid '+(it.vendor?'#EEE6DC':'#E4483A')+';border-radius:4px;color:'+(it.vendor?'#282828':'#C0392B')+'">'+opts+'</select>';
  }
  function vendorOptionsFor(category) {
    return (Array.isArray(window._dahVendorListRaw) ? window._dahVendorListRaw : [])
      .filter(function(v){ return v && Array.isArray(v.categories) && v.categories.indexOf(category) >= 0; })
      .map(function(v){ return v.name; });
  }
  // 2026-09-09(선혜님 지시 - "모든 발주서에는 하단에 비고 칸을 만들어서
  // 코멘트 남길 수 있게 하자" + "발주 페이지 자체를 수정할 수 있게":
  // data-vendor로 이 문서가 어느 거래처 것인지 표시해서, 인쇄 버튼을
  // 눌러 최종 저장할 때 화면에서 이 블록을 다시 찾아 수정된 내용
  // 그대로(비고 포함) 저장할 수 있게 함 - 실측/시공 의뢰서가 이미 쓰던
  // "미리보기에서 고친 뒤 인쇄 버튼 눌러야 최종 저장" 방식과 동일.
  var out = '<div class="pv-wrap" data-vendor="'+escHtml(vendor)+'" style="max-width:720px;margin:0 auto;background:#fff;padding:36px 32px">';

  out += '<div style="text-align:center;margin-bottom:6px">'
      // 2026-09-11(선혜님 지적 - "모든 작지서의 상단에 우리 로고
      // 이미지 가지고 있잖아 그걸로 바꿔줘 그냥 폰트 영어로 치지
      // 말고"): 고객용 견적서는 이미 실제 로고 이미지(DAH_LOGO_B64)를
      // 쓰고 있었는데, 발주서/실측시공의뢰서는 텍스트로 흉내만 내고
      // 있었음 - 동일한 이미지로 통일.
      +'<img class="pv-logo" style="height:36px;display:block;object-fit:contain;margin:0 auto" src="'+DAH_LOGO_B64+'" alt="드로잉엣홈">'
      +'<div style="font-size:11px;color:#B0A99F;letter-spacing:3px;margin-top:6px">발 주 서</div>'
      +'</div>';

  // 2026-09-11(선혜님 지적 - "발주서 포멧이 마음에 안들어 그냥 길게
  // 하지 말고 표를 만든상태서 수정을 하게 하는건 어때??"): 세로로 6줄
  // 쌓이던 flexbox 나열 방식을 실제 테두리 있는 표(3행 2열)로 재구성 -
  // 훨씬 컴팩트하고, 처음 참고로 보여주신 실제 발주서 양식과도 더
  // 비슷한 형태. 각 값 칸은 여전히 클릭해서 직접 수정 가능(contenteditable).
  function infoTableRow(label1, val1, editable1, label2, val2, editable2, emphasize, extraClass2) {
    var cellStyle = 'padding:8px 10px;border:1px solid #EEE6DC;font-size:13px';
    var labelStyle = cellStyle + ';background:#FAF7F5;color:#8E8078;white-space:nowrap;width:1%';
    // 2026-09-11(선혜님 지적 - "도착일과 도착장소는 굵은 폰트를 사용해주고"):
    // 실제로 가장 중요한 정보(언제·어디로 보내야 하는지)만 굵게 강조하고
    // 나머지(요청일/발주처/업체명/담당자)는 일반 굵기로 낮춰서 대비를 줌.
    var valStyle = cellStyle + (emphasize ? ';font-weight:700' : ';font-weight:400');
    return '<tr>'
      + '<td style="'+labelStyle+'">'+label1+'</td>'
      + '<td style="'+valStyle+'"'+(editable1?' contenteditable="true" class="pv-editable-field"':'')+'>'+val1+'</td>'
      + '<td style="'+labelStyle+'">'+label2+'</td>'
      + '<td style="'+valStyle+'"'+(editable2?' contenteditable="true" class="pv-editable-field'+(extraClass2?' '+extraClass2:'')+'"':'')+'>'+val2+'</td>'
      + '</tr>';
  }
  out += '<table style="width:100%;border-collapse:collapse;margin-top:var(--sp-6);padding-top:16px">'
      // 2026-09-11(선혜님 지시 - "모든 발주서 요청일자나 도착일자 도착
      // 장소는 기본적으로 수정할 수 있게 해줘"): 요청일만 유일하게 고정
      // 값(editable=false)이었음 - 도착일/도착장소/발주처와 동일하게
      // 수정 가능하도록 통일.
      // 2026-09-11(선혜님 지적 - "미지정을 고쳐도 원본엔 저장이 안 된다"):
      // "발주처" 칸에 pv-vendor-name-field 클래스를 붙여서, 이 칸을 고치면
      // 실제 견적서 행(원단/레일/블라인드 거래처 칸)까지 값이 반영되도록 함
      // (printForVendor의 wireVendorNameEdit 참고).
      // 2026-09-14(선혜님이 발주서 캡처 보여주심 - "요청일/발주처" 칸이
      // 통째로 두 번 겹쳐 나옴): 리베이스 도중 이 표를 여는 out += 문이
      // 두 개로 잘못 쪼개져서, 앞쪽(클래스 붙은 버전)은 닫는 태그 없이
      // 끊기고 뒤쪽(클래스 없는 버전)이 나머지를 이어받고 있었음 -
      // 화면엔 표가 두 개로 보이는 것도 문제였지만, 더 심각한 건 실제로
      // 보이는(살아남은) 표의 "발주처" 칸엔 pv-vendor-name-field 클래스가
      // 없어서 발주처를 고쳐도 원본 견적서에 반영 안 되는 기능이 조용히
      // 먹통이었다는 것 - 하나로 합치고 클래스도 살아남은 쪽에 되살림.
      + infoTableRow('요청일', today, true, '발주처', escHtml(vendor), true, false, 'pv-vendor-name-field')
      // 2026-09-10(선혜님 지적 - "도착일 / 도착 장소가 없어" → "수정이
      // 되게" → "거래처마다 달라야"): 발주정보 팝업에서 거래처별로
      // 입력받은 값을 여기 표시(입력 안 하면 "협의" 표시), 클릭해서도
      // 직접 수정 가능.
      + infoTableRow('도착일', arrivalDate||'협의', true,
        // 2026-09-10(선혜님 지적 - "받는곳이라고 하면 헷갈릴꺼 같은데"):
        // "발주처"(위 칸)와 나란히 두면 둘 다 "어디로 가는지"처럼 헷갈릴
        // 수 있어 "도착 장소"로 구분.
        // 2026-09-10(선혜님 지적 - "가공소로 도착되게 해야 해"): 원단은
        // 저희 회사가 아니라 가공소로 바로 배송되는 경우가 있는 등,
        // 발주 종류/거래처에 따라 실제 도착지가 달라질 수 있어 고정
        // 값이 아니라 직접 클릭해서 고칠 수 있게 함.
        '도착 장소', escHtml(arrivalLocation||'서울 서초구 사평대로 53길 64 1층 드로잉엣홈'), true, true)
      + infoTableRow('업체명', '드로잉엣홈', false, '담당자', cStaff||'—', false, false)
      + '</table>';

  out += '<div style="margin-top:10px;font-size:11px;color:#B0A99F">*아래와 같이 발주 합니다.</div>';
  // 2026-09-14(선혜님 - "아래 항목의 거래처를 정해달라는데 어떻게
  // 정하는데??"로 발견): 이 문서(발주서) 전체에 "클릭하면 고칠 수
  // 있어요" 안내가 아예 없었음 - 실측/시공 의뢰서엔 있던 게 여기만
  // 빠져있었음. 위쪽(요청일/발주처 등)과 아래쪽(품목표) 전부 눌러서
  // 고칠 수 있다는 걸 문서 전체 기준으로 한 번 안내.
  out += '<div class="print-hide" style="text-align:center;font-size:11px;color:#B0A99F;margin-top:4px">✏️ 위·아래 내용 전부 클릭하면 직접 고칠 수 있어요</div>';

  // 2026-09-11(선혜님 지시 - "화면 자체를 없애고 최종 발주서에서 바로
  // 수정"): 거래처를 아직 안 정한 항목("미지정")을 화면 전환 없이도
  // 바로 알아챌 수 있도록 경고 색으로 눈에 띄게 표시.
  var isUnassigned = (!vendor || vendor.indexOf('미지정') === 0);
  out += '<div class="pv-unassigned-banner" style="margin-top:var(--sp-5);padding:8px 14px;background:'+(isUnassigned?'#FBEAE7':'#F5F2EE')+';font-size:13px;font-weight:700;color:'+(isUnassigned?'#C0392B':'#282828')+'">'+(isUnassigned?'⚠️ '+escHtml(vendor||'거래처 미지정')+' — 아래 항목의 거래처를 정해주세요':'거래처: '+escHtml(vendor))+'</div>';
  // 2026-09-14(선혜님 - "아래 항목의 거래처를 정해달라는데 어떻게
  // 정하는데??"로 발견): 경고 문구는 "정해주세요"라고만 하지, 실제로
  // 어떻게(클릭해서 직접 타이핑) 정하는 건지 이 문서 어디에도 안내가
  // 없었음 - 발주서(printForVendor) 문서엔 실측/시공 의뢰서에 있는
  // "클릭하면 고칠 수 있어요" 안내 자체가 애초에 없었음. "미지정" 상태일
  // 때는 특히 구체적으로 안내.
  if (isUnassigned) {
    out += '<div class="print-hide" style="font-size:11px;color:#C0392B;margin-top:4px">✏️ 아래 표의 "거래처" 칸(빨간 글씨나 드롭다운)을 눌러서 직접 정하면 돼요</div>';
  }
  // 2026-09-11(선혜님이 실제 캔가공소 발주서 양식 확인해주심): 원단/
  // 부자재/블라인드는 공통 테이블(위치·품명·제품정보·사이즈·내용·수량·
  // 고객명)로 충분한데, 캔가공소(제작) 발주는 완전히 다른 정보(제작
  // 사이즈, 형상가공 여부, 하단시접, 원단정보-거래처+코드+마수)가
  // 필요해서 별도 테이블 구조로 분기.
  var isProduction = groupItems.length > 0 && groupItems[0].orderCategory === 'production';
  // 2026-09-11(선혜님 지시 - "목성은 제품정도 / 사이즈 / 내용 빼도
  // 될꺼 같은데??"): 레일(material) 항목은 product 칸에 이미 "N자
  // 조절레일(타공형)"로 필요한 정보가 다 들어있고, 제품정보/사이즈/
  // 내용은 항상 "—"(빈 값)만 나오는 무의미한 칸이었음 - 위치/품명/
  // 수량/고객명만 남긴 축소된 테이블로 분기.
  var isMaterial = groupItems.length > 0 && groupItems[0].orderCategory === 'material';
  var isBlind = groupItems.length > 0 && groupItems[0].orderCategory === 'blind';
  if (isProduction) {
    // 2026-09-11(발주서 하나하나 점검하다 발견 - 8개 칸짜리 캔가공소 표가
    // 모바일 실사용 폭(390px)보다 넓어서 "고객"/"원단정보" 칸이 화면
    // 밖으로 밀려 안 보이던 문제): 칸 안쪽 여백/글자크기를 살짝 줄이고,
    // 그래도 안 들어가는 경우를 대비해 표만 좌우로 스크롤되는 감싸는 칸을
    // 추가(제목·비고 등 나머지 화면은 그대로 고정).
    out += '<div class="pv-order-table-scroll" style="overflow-x:auto;-webkit-overflow-scrolling:touch">';
    out += '<table style="width:100%;border-collapse:collapse;font-size:11px">'
        +'<thead><tr style="border-bottom:1.5px solid #282828;background:#FAF7F5">'
        +'<th style="text-align:left;padding:6px 4px">공간</th>'
        +'<th style="text-align:left;padding:6px 4px">원단(품명)</th>'
        +'<th style="text-align:center;padding:6px 4px">제작사이즈</th>'
        +'<th style="text-align:center;padding:6px 4px">형상가공</th>'
        +'<th style="text-align:center;padding:6px 4px">하단시접</th>'
        +'<th style="text-align:left;padding:6px 4px">내용</th>'
        +'<th style="text-align:left;padding:6px 4px">고객</th>'
        +'<th style="text-align:left;padding:6px 4px">원단정보</th>'
        +'</tr></thead><tbody>';
    groupItems.forEach(function(it){
      out += '<tr style="border-bottom:1px solid #EEE6DC">'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.space)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.product)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:center;font-weight:700">'+escHtml(it.fabSize||it.size)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:center">'+(it.shapeProcess?'O':'X')+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:center">'+escHtml(it.hemType||'—')+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.content)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;font-weight:700;color:#E4483A">'+(cName||'—')+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.fabricInfo||'—')+'</td>'
          +'</tr>';
    });
    out += '</tbody></table></div>';
    out += '<div class="print-hide" style="font-size:11px;color:#B0A99F;margin-top:2px">← 표를 옆으로 밀면 나머지 항목(고객/원단정보)이 보입니다</div>';
  } else if (isMaterial) {
    // 2026-09-14(선혜님 지적 - "발주처를 직접 안쓰고 선택하게 해야지"):
    // 원단은 거래처가 매번 다양해서 자유 텍스트로 남겼지만, 레일/자재는
    // 이미 거래처 관리에 "자재" 카테고리로 등록해두는 시스템이 있음
    // (목성/솜피 등) - 블라인드와 똑같이 실제 등록된 거래처 중에서
    // 드롭다운으로 바로 고르게 함. 목록에 없는 곳이면 "+ 직접 입력"으로
    // 예외 처리.
    var materialVendorOptions = vendorOptionsFor('material');
    out += '<table style="width:100%;border-collapse:collapse;font-size:12px">'
        +'<thead><tr style="border-bottom:1.5px solid #282828;background:#FAF7F5">'
        +'<th style="text-align:left;padding:8px 6px">위치</th>'
        +'<th style="text-align:left;padding:8px 6px">품명</th>'
        +'<th style="text-align:left;padding:8px 6px">거래처</th>'
        +'<th style="text-align:right;padding:8px 6px">수량</th>'
        +'<th style="text-align:left;padding:8px 6px">고객명</th>'
        +'</tr></thead><tbody>';
    groupItems.forEach(function(it, idx){
      var vendorCellHtml = buildVendorSelectCell(it, idx, materialVendorOptions);
      out += '<tr style="border-bottom:1px solid #EEE6DC">'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:8px 6px">'+escHtml(it.space)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:8px 6px">'+escHtml(it.product)+'</td>'
          +'<td style="padding:8px 6px">'+vendorCellHtml+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:8px 6px;text-align:right;font-weight:700">'+escHtml(it.qty)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:8px 6px;font-weight:700;color:#E4483A">'+(cName||'—')+'</td>'
          +'</tr>';
    });
    out += '</tbody></table>';
  } else if (isBlind) {
    // 2026-09-11(선혜님이 실제 윈텍/덱스터 발주서 양식 보여주심 - "넣을
    // 부분이 보이지??"): 실제 거래처 발주서엔 시스템(블라인드 종류)/
    // 손잡이방향/끈길이/하단바/코멘트가 각자 칸으로 나뉘어 있는데, 지금까진
    // 원단(커튼) 표를 그대로 재사용해서 "제품정보"(색상)만 있고 저 다섯
    // 정보는 "내용" 한 칸에 뭉쳐서 나가거나 아예 빠져있었음 - 블라인드
    // 전용 표로 분리해서 실제 양식과 동일한 칸 구성으로 재구성.
    // 2026-09-14(선혜님이 레일 발주서 캡처로 "된거니????" 확인해주심 -
    // 원단/레일과 똑같이 블라인드도 항목별 거래처 칸이 빠져있었음): 다만
    // 블라인드 거래처는 <select>라 자유 텍스트로는 등록 안 된 이름이면
    // 거부되므로(다른 곳과 동일 규칙), 문서 안에 실제 드롭다운을 그대로
    // 넣어서 등록된 거래처 중에서 바로 고를 수 있게 함.
    var blindVendorOptions = vendorOptionsFor('blind');
    out += '<div class="pv-order-table-scroll" style="overflow-x:auto;-webkit-overflow-scrolling:touch">';
    out += '<table style="width:100%;border-collapse:collapse;font-size:11px">'
        +'<thead><tr style="border-bottom:1.5px solid #282828;background:#FAF7F5">'
        +'<th style="text-align:left;padding:6px 4px">위치</th>'
        +'<th style="text-align:left;padding:6px 4px">원단명</th>'
        +'<th style="text-align:left;padding:6px 4px">거래처</th>'
        +'<th style="text-align:left;padding:6px 4px">시스템</th>'
        +'<th style="text-align:center;padding:6px 4px">사이즈</th>'
        +'<th style="text-align:center;padding:6px 4px">손잡이방향</th>'
        +'<th style="text-align:center;padding:6px 4px">끈길이</th>'
        +'<th style="text-align:center;padding:6px 4px">하단바</th>'
        +'<th style="text-align:left;padding:6px 4px">코멘트</th>'
        +'<th style="text-align:right;padding:6px 4px">수량</th>'
        +'<th style="text-align:left;padding:6px 4px">고객명</th>'
        +'</tr></thead><tbody>';
    groupItems.forEach(function(it, idx){
      var vendorCellHtml = buildVendorSelectCell(it, idx, blindVendorOptions);
      out += '<tr style="border-bottom:1px solid #EEE6DC">'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.space)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.product)+'</td>'
          +'<td style="padding:6px 4px">'+vendorCellHtml+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.kind)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:center">'+escHtml(it.size)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:center">'+escHtml(it.handle)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:center">'+escHtml(it.cordLength)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:center">'+escHtml(it.bottomBar)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px">'+escHtml(it.comment)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;text-align:right;font-weight:700">'+escHtml(it.qty)+'</td>'
          +'<td class="pv-editable-field" contenteditable="true" style="padding:6px 4px;font-weight:700;color:#E4483A">'+(cName||'—')+'</td>'
          +'</tr>';
    });
    out += '</tbody></table></div>';
    out += '<div class="print-hide" style="font-size:11px;color:#B0A99F;margin-top:2px">← 표를 옆으로 밀면 나머지 항목(끈길이/하단바/코멘트/수량/고객명)이 보입니다</div>';
  } else {
  // 2026-09-12(선혜님 지적 - "원단명 / 몇 마 정도만 나오면 돼, 품명 사이즈
  // 내용 등이 필요한게 아니야 공간도 필요없어"): 원단 발주서는 material
  // (레일)이 이미 그랬던 것처럼 실제로 필요한 칸(원단명/수량/고객명)만
  // 남기고, 공간·제품정보·사이즈·내용처럼 원단 발주에는 의미 없는 칸
  // (전부 "—"만 찍히던 칸)은 제거. it.product가 이미 원단명(fabric 코드
  // 또는 없으면 고객용 제품명)이고, it.qty에 마수+예상금액이 이미 포함돼
  // 있어 그대로 씀.
  // 2026-09-14(선혜님 지적 - "원단이 업체마다 다 다를 수 있어 이렇게
  // 만들면 안될꺼 같은데?"): "미지정(원단)" 한 그룹 안에 서로 다른
  // 원단(예: 이븐/시소코/에센셜/클라우디오)이 섞여 있는데, 지금까지는
  // 표 위쪽 "발주처" 칸 하나만 고칠 수 있어서 전부 같은 거래처로
  // 몰아넣게 되는 구조였음(방금 확인 팝업으로 실수는 막았지만,애초에
  // 각기 다른 원단마다 실제로 다른 업체에서 사입하는 게 정상인데 표에서
  // 그걸 표현할 방법 자체가 없었음). 항목별로 거래처를 각자 지정할 수
  // 있게 "거래처" 칸을 새로 추가 - 여기서 고치면 그 항목의 원본 커튼
  // 행에만 반영되고(전체 일괄 확인창 없이), 원단명이 같은 항목은 값이
  // 자동으로 같이 채워지지 않고 각자 따로 입력해야 함(의도적).
  // 2026-09-14(선혜님 지시 - "원단도 드롭다운되게끔 해~ 블라인드처럼"):
  // 자유 텍스트 대신 레일/블라인드와 동일하게 등록된 원단(fabric)
  // 카테고리 거래처 드롭다운으로 통일. 목록에 없으면 "+ 직접 입력".
  var fabricVendorOptions = vendorOptionsFor('fabric');
  out += '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      +'<thead><tr style="border-bottom:1.5px solid #282828;background:#FAF7F5">'
      +'<th style="text-align:left;padding:8px 6px">원단명</th>'
      +'<th style="text-align:left;padding:8px 6px">거래처</th>'
      +'<th style="text-align:right;padding:8px 6px">수량</th>'
      +'<th style="text-align:left;padding:8px 6px">고객명</th>'
      +'</tr></thead><tbody>';
  groupItems.forEach(function(it, idx){
    var vendorCellHtml = buildVendorSelectCell(it, idx, fabricVendorOptions);
    out += '<tr style="border-bottom:1px solid #EEE6DC">'
        +'<td class="pv-editable-field" contenteditable="true" style="padding:8px 6px">'+escHtml(it.product)+'</td>'
        +'<td style="padding:8px 6px">'+vendorCellHtml+'</td>'
        +'<td class="pv-editable-field" contenteditable="true" style="padding:8px 6px;text-align:right;font-weight:700">'+escHtml(it.qty)+'</td>'
        +'<td class="pv-editable-field" contenteditable="true" style="padding:8px 6px;font-weight:700;color:#E4483A">'+(cName||'—')+'</td>'
        +'</tr>';
  });
  out += '</tbody></table>';
  }

  out += '<div class="pv-vendor-note-editable" contenteditable="true" style="margin-top:var(--sp-6);text-align:center;font-size:13px;color:#E4483A;font-weight:600;line-height:1.7;white-space:pre-wrap;outline:none;border:1px dashed #F0C9C4;border-radius:8px;padding:8px" data-placeholder="비고(클릭해서 직접 입력)">'+escHtml(extraNote||'')+'</div>';

  out += '</div>';
  return out;
}

// 2026-09-09(선혜님 지시 - "발주서 버튼 누르고 발주정보 입력하는건 좋아"로
// 확정된 설계): 지금까지 원단명/거래처/컬러 칸이 커튼 행마다 작고 촘촘하게
// 우겨넣어져 있어서(inner-fields, 클릭해서 펼쳐야 보임) 실제로 아무도
// 안 채우고 있었음(오늘 하루 여러 번 재현·확인된 문제) - "발주서" 버튼을
// 누르면 이 별도의 큰 팝업이 먼저 뜨고, 시공요청서와 같은 표 형태로
// 위치/사이즈/제품명을 보여주면서 원단·블라인드 거래처만 크고 편하게
// 입력받음. 핵심 설계 원칙: 이 팝업은 별도 데이터 구조가 아니라, 견적서
// 화면(같은 DOM)의 실제 입력창(.c-vendor, .b-vendor)에 직접 연결된
// "창구"일 뿐 - 여기서 입력하는 즉시 원본 값이 갱신되므로, 발주서를
// 실제로 만드는 코드(collectVendorGroups 등)는 전혀 안 건드려도 그대로
// 작동함.
// 2026-09-11(선혜님 지시 - "화면 자체를 없애고 최종 발주서에서 바로
// 수정"): "발주 정보 입력"/"거래처별 희망 도착일" 두 중간 화면을 완전히
// 없앰 - 이미 발주서 문서 자체가 전부 클릭해서 바로 수정 가능(요청일/
// 도착일/도착장소/품목/비고 전부)하기 때문에, 확인 화면을 거치지 않고
// 발주서 버튼을 누르면 바로 최종 문서로 이동. 거래처 미지정 항목은
// 문서에서 빨간색으로 눈에 띄게 표시되고, 원단거래처 오입력은 문서 상단
// 배너로 알려줌(printForVendor 참고) - 화면 전환이 없어졌다고 확인 기능
// 자체가 없어진 게 아니라, 확인을 "가로막는 별도 화면"에서 "결과물 위에
// 바로 보이는 표시"로 옮긴 것.
function getVendorInfoIssues() {
  var missingVendorSpaces = [];
  document.querySelectorAll('#blind-body tr').forEach(function(tr){
    var vendorSel = tr.querySelector('.b-vendor');
    var fabric = tr.querySelector('.b-fabric')?.value || '';
    if (vendorSel && !vendorSel.value && fabric) {
      missingVendorSpaces.push(tr.querySelector('.space-inp')?.value || '(위치 미입력)');
    }
  });
  var confusedFabricSpaces = [];
  if (Array.isArray(window._dahVendorListRaw)) {
    var productionNames = window._dahVendorListRaw.filter(function(v){
      return v && Array.isArray(v.categories) && v.categories.indexOf('production') >= 0;
    }).map(function(v){ return v.name; });
    document.querySelectorAll('#curtain-body tr').forEach(function(tr){
      var vendorVal = tr.querySelector('.c-vendor')?.value || '';
      if (vendorVal && productionNames.indexOf(vendorVal) >= 0) {
        confusedFabricSpaces.push(tr.querySelector('.space-inp')?.value || '(위치 미입력)');
      }
    });
  }
  return { missingVendorSpaces: missingVendorSpaces, confusedFabricSpaces: confusedFabricSpaces };
}

// 거래처별 기본 도착 소요일수/기본 도착장소(거래처 관리 화면에서 등록)를
// 자동으로 채움 - 원래 "거래처별 희망 도착일" 화면이 열릴 때 하던 일을
// 화면 없이 그대로 수행. 이미 이번 발주에서 값이 있으면(직접 수정했으면)
// 그 값을 우선시함.
// 2026-09-11(선혜님 지시 - "주소는 기본적으로 캔가공소야"): 원단(fabric)
// 발주는 어느 원단업체에서 사입하든 실제로는 항상 캔가공소로 바로
// 배송돼야 함(DAH 사무실이 아니라 제작하는 곳으로) - 원단 그룹은 그
// 원단업체 자신의 기본주소가 아니라 캔가공소의 등록된 주소를 기본값으로 씀.
// 2026-09-12(선혜님 지적 - "레일, 블라인드도 마찬가지로 도착지 캔가공소로
// 수정하라고 했을껀데 누락된거야??"): 실제로 이 로직이 fabric에만 걸려
// 있었고 material(레일)/blind는 각자 거래처 자신의 주소로 빠지고 있던
// 진짜 누락이었음 — 세 카테고리 다 캔가공소 도착으로 통일.
function applyVendorArrivalDefaults(groups) {
  window._vendorArrivalDates = window._vendorArrivalDates || {};
  window._vendorArrivalLocations = window._vendorArrivalLocations || {};
  var DEFAULT_LOCATION = '서울 서초구 사평대로 53길 64 1층 드로잉엣홈';
  function findVendorMeta(name) {
    if (!Array.isArray(window._dahVendorListRaw)) return null;
    return window._dahVendorListRaw.find(function(v){ return v && v.name === name; }) || null;
  }
  Object.keys(groups || {}).forEach(function(vendor){
    var groupItems = groups[vendor] || [];
    var cat = groupItems.length > 0 ? groupItems[0].orderCategory : null;
    var goesToProduction = cat === 'fabric' || cat === 'material' || cat === 'blind';
    var meta = findVendorMeta(vendor);
    var productionMeta = goesToProduction ? findVendorMeta(getAutoProductionVendorName()) : null;
    if (!window._vendorArrivalDates[vendor] && meta && meta.defaultArrivalDays) {
      var d = new Date();
      d.setDate(d.getDate() + parseInt(meta.defaultArrivalDays, 10));
      window._vendorArrivalDates[vendor] = d.toISOString().slice(0, 10);
    }
    if (!window._vendorArrivalLocations[vendor]) {
      // 2026-09-12(선혜님 지시 - "캔가공소의 도착장소는: 시공팀 시공
      // (유지철 팀장님)으로 표시해줘" 이어서 "디테라 등 원단 8곳→캔가공소,
      // 윈텍/덱스터/헌터더글라스/목성/솜피(레일·블라인드)→캔가공소 유지철
      // 팀장님"): production 카테고리 자신(완성품이 나가는 곳)/원단이
      // 들어가는 곳/레일·블라인드가 들어가는 곳, 이렇게 세 가지가 전부
      // 서로 다른 표시라 별개 필드 3개로 분리(defaultLocation 하나를
      // 공유하면 지난번처럼 서로 덮어써버리는 문제가 재발함).
      var isProductionGroup = cat === 'production';
      var isFabricGroup = cat === 'fabric';
      var isRailOrBlindGroup = cat === 'material' || cat === 'blind';
      // 2026-09-12(선혜님 지시 - "캔가공소에서 제작을 해서 도착장소가
      // 바뀔 수도 있어 다른 시공팀장님이 시공할 수 있음"): "시공팀 시공
      // (유지철 팀장님)"을 거래처 설정에 고정값으로 박아두면, 다른
      // 시공팀장이 맡는 건에서도 항상 유지철 팀장님으로 잘못 나감.
      // 마침 견적서에 이미 건별로 시공팀장 이름을 넣는 칸(#c-installer-name,
      // 시공 의뢰서에 쓰는 것과 동일한 값)이 있어서, 그 값을 그대로
      // 가져다 써서 건마다 실제 담당 팀장 이름이 반영되게 함. 아직 시공팀장을
      // 안 정한 이른 단계면 이름 없이 "시공팀 시공"만 표시.
      var installerNameEl = (typeof document !== 'undefined') ? document.getElementById('c-installer-name') : null;
      var installerName = installerNameEl ? installerNameEl.value.trim() : '';
      window._vendorArrivalLocations[vendor] = (isProductionGroup && (installerName ? ('시공팀 시공 (' + installerName + ')') : '시공팀 시공'))
        || (isFabricGroup && productionMeta && productionMeta.fabricArrivalLabel)
        || (isRailOrBlindGroup && productionMeta && productionMeta.railBlindArrivalLabel)
        || (meta && meta.defaultLocation)
        || DEFAULT_LOCATION;
    }
  });
}

function collectVendorGroups(categoryFilter) {
  var cName  = escHtml(document.getElementById('c-name')?.value||'');
  var cStaff = escHtml(document.getElementById('c-staff')?.value||'장선혜');

  var items = [];
  document.querySelectorAll('#curtain-body tr').forEach(function(tr){
    var fabric = tr.querySelector('.c-fabric')?.value || '';
    var vendor = tr.querySelector('.c-vendor')?.value || '';
    var color  = tr.querySelector('.c-color')?.value || '';
    var railVendorCheck = tr.querySelector('.c-rail-vendor')?.value || '';
    var space  = tr.querySelector('.space-inp')?.value || '';
    var mw     = tr.querySelector('.mw')?.value || '';
    var mh     = tr.querySelector('.mh')?.value || '';
    var pnum   = tr.querySelector('.pnum')?.value || '';
    var displayNameCheck = tr.querySelector('.c-display-name')?.value || '';
    // 2026-09-01(선혜님 지적 — "발주서(거래처별) 클릭하고 목성을 적으니
    // '거래처 또는 원단명이 입력된 항목이 없습니다'가 뜬다"로 발견, 실제
    // 프로덕션 재현): 목성은 실제로 원단(fabric)이 아니라 레일/부자재
    // 거래처라 "레일 거래처" 칸에 입력하는 게 자연스러운데, 이 조기 return
    // 조건이 fabric/vendor(원단쪽)만 확인해서, 원단은 안 채우고 레일거래처만
    // 채운 행은 이 시점에 통째로 걸러져(return) 그 아래(611번대)에 이미
    // 있던 railVendor 처리 코드에 도달하지도 못하고 있었음 - 조건에
    // railVendor도 포함해서 이 행이 계속 처리되게 함.
    // 2026-09-11(선혜님 발견 - 손현영님 사례: "왜 발주서에는 거실 2개
    // 안방 2개 되지??" 확인 과정에서 실제로는 정반대의 더 심각한 문제를
    // 발견함): 원단거래처를 아직 안 정했거나 고객이 직접 원단을 대는
    // 경우(fabric/vendor 둘 다 빈값), 캔가공소 제작 발주는 원단거래처와
    // 무관하게 항상 필요한데도 이 조건 때문에 행 자체가 통째로 걸러져서
    // 캔가공소 발주서에서 완전히 빠지고 있었음 - "커튼은 무조건 제작을
    // 해야 한다"는 원래 설계 의도(위 2026-09-09 참고)와 어긋남. 실제
    // 커튼이 입력된 행인지(제품명/사이즈 존재)까지 조건에 포함해서, 원단
    // 거래처가 비어있어도 제작 발주는 정상적으로 생성되게 함.
    if(!fabric && !vendor && !railVendorCheck && !displayNameCheck && !mw && !mh) return;
    var pleat  = (tr.querySelector('.pleat-type')?.value || '').replace('형','');
    var open   = (tr.querySelector('.open-type')?.value || '').replace('형','');
    var heightAdjust = parseFloat(tr.querySelector('.height-adjust')?.value);
    if (isNaN(heightAdjust)) heightAdjust = -3;
    var fh = (mh && parseFloat(mh) > 0) ? (parseFloat(mh) + heightAdjust) : null;
    // 2026-09-09(선혜님 지시 - "커튼은 무조건 제작을 해애해 담만 가공소는
    // 차 후에 바꿀 수 있어"): 예전엔 "가공소" 체크박스로 이 항목이
    // 원단(fabric) 발주인지 제작(production) 발주인지 양자택일로
    // 나눴는데, 실제로는 커튼 하나가 원단 매입 + 제작 의뢰 둘 다 항상
    // 필요한 별개의 두 발주임 - 체크박스 없이, 원단거래처가 있으면
    // 원단 발주를, 등록된 가공소가 있으면 제작 발주를 각각 독립적으로 생성.
    var displayName = displayNameCheck;
    var hemType = tr.querySelector('.hem-type')?.value || '';
    var yardage = tr.querySelector('.c-yardage')?.value || '';
    var shapeProcess = tr.querySelector('.c-shape-process')?.checked || false;
    var fabricUnitPrice = tr.querySelector('.c-fabric-unit-price')?.value || '';
    // 2026-09-11(선혜님 확인 - "원단도 레일처럼 항상 DAH가 사입해서
    // 발주하지"): 캔가공소(제작)/레일과 동일하게, 원단도 거래처를 아직
    // 안 정했어도 실제 커튼이면 항상 발주가 나가야 함 - 예전엔 원단
    // 거래처를 입력해야만 이 블록 자체가 실행됐는데, 이제 항상 실행하고
    // 거래처가 없으면 "미지정(원단)"으로 표시.
    // 2026-09-11(선혜님 지시 - "관련되게 원단 발주서까지도 그 가격이
    // 뜨게 해야 하는데"): 원단량(마수)에 단가를 곱한 총액을 수량 칸에
    // 함께 표시 - 원단업체 발주서에서 바로 예상 금액을 확인할 수 있게.
    var yardageNum = parseFloat(String(yardage).replace(/[^0-9.]/g, ''));
    var unitPriceNum = parseFloat(String(fabricUnitPrice).replace(/[^0-9.]/g, ''));
    var fabricTotal = (yardageNum && unitPriceNum) ? Math.round(yardageNum * unitPriceNum) : null;
    var qtyDisplay = yardage || (pnum?(pnum+'폭'):'—');
    if (fabricTotal !== null) qtyDisplay += ' (' + fabricTotal.toLocaleString() + '원)';
    items.push({
      space: space||'—', product: fabric||displayName||'—', color: color||'—',
      size: '—', fabSize: null,
      content:[pleat, open].filter(Boolean).join(' ')||'—',
      qty: qtyDisplay,
      vendor: vendor,
      orderCategory: 'fabric',
      sourceRow: tr, vendorField: '.c-vendor'
    });
    var autoProductionVendor = getAutoProductionVendorName();
    if (autoProductionVendor) {
      // 2026-09-11(선혜님이 실제 캔가공소 발주서 양식 확인해주심): 지금까지
      // "품명" 자리에 원단코드(fabric)를 넣고 있었는데, 실제 양식은 제품명
      // (displayName)이 들어가야 함 - 원단코드는 거래처+마수와 함께 별도
      // "원단정보" 칸으로 빠짐(fabricInfo). 하단시접(hemType)/형상가공
      // (shapeProcess)도 실제 양식에 필요한 정보라 추가.
      items.push({
        space: space||'—', product: displayName||'—', color: color||'—',
        size: (mw&&mh)?(mw+'×'+mh):'—',
        fabSize: (mw && fh!==null) ? (mw+'×'+fh.toFixed(1).replace(/\.0$/,'')) : null,
        content:[pleat, open].filter(Boolean).join(' ')||'—',
        qty: pnum?(pnum+'폭'):'—',
        vendor: autoProductionVendor,
        orderCategory: 'production',
        hemType: hemType || '—',
        shapeProcess: shapeProcess,
        fabricInfo: [vendor||'캔', fabric, yardage].filter(Boolean).join(' ') || '—'
        // 2026-09-11: 캔가공소(제작) 거래처는 견적서 행마다 고르는 게 아니라
        // 거래처 설정에서 등록한 전역 값(getAutoProductionVendorName)이라
        // sourceRow를 안 붙임 - 문서에서 편집해도 어느 행을 고쳐야 할지
        // 알 수 없고, 설정에서 고치는 게 맞는 값이라 편집 대상에서 제외.
      });
    }
    // 2026-08-10: 레일(전동 등) 거래처가 매번 다를 수 있어 견적서마다 입력
    // 가능하게 함 - 원단과 별개 항목으로 발주서에 반영(선혜님 확인).
    // 2026-09-11(선혜님 지적 - "우리 실측시공할때 그 부분 넣는데?? 견적서에
    // 이미 떠있잖아 레일이 얼마나 필요한지"): 레일거래처를 직접 입력해야만
    // 발주가 뜨던 기존 방식은 캔가공소(제작)와 똑같은 문제였음 - 레일도
    // 커튼을 달려면 항상 필요한데, 거래처를 아직 안 정했다고 발주서에서
    // 아예 빠지고 있었음. 다만 "시공 안함(배송)"을 선택한 경우(지역
    // 미선택)엔 원래도 레일/레일시공비 자체를 계산에서 뺐던 기존 규칙이
    // 있어(est-product-calc.js 참고 - 배송만 하는 건은 레일도 DAH가
    // 사는 게 아니라서) 이 경우는 그대로 제외. 지역이 선택돼 있으면
    // (시공 서비스 있음) 레일거래처가 비어있어도 "미지정"으로 발주서에
    // 나오게 해서, 캔가공소/블라인드와 동일하게 눈에 띄게 함.
    var hasInstallService = (document.getElementById('c-region')?.value || '') !== '';
    var railVendor = tr.querySelector('.c-rail-vendor')?.value || '';
    if (hasInstallService) {
      // 2026-09-11(선혜님 - "우리가 레일 계산할때 -자 조절레일로 적는거
      // 아니야? 그 내용을 적으면 되잖아"): 발주서에 "레일"이라고만 막연히
      // 적던 것을, 실제로 시공비 계산에 이미 쓰던 것과 정확히 같은 방식
      // (자 단위 환산 + "조절레일(타공형)")으로 통일.
      var railJa = mw ? calcRailJa(parseFloat(mw)) : null;
      items.push({
        space: space||'—', product: (railJa ? railJa+'자 ' : '') + '조절레일(타공형)' + (heightAdjust <= -5 ? ' (전동)' : ''), color: '—',
        size: '—', fabSize: null,
        content: '—', qty: '1개', vendor: railVendor,
        orderCategory: 'material',
        sourceRow: tr, vendorField: '.c-rail-vendor'
      });
    }
  });

  document.querySelectorAll('#blind-body tr').forEach(function(tr){
    var fabric = tr.querySelector('.b-fabric')?.value || '';
    var vendor = tr.querySelector('.b-vendor')?.value || '';
    var color  = tr.querySelector('.b-color')?.value || '';
    var cordLength = tr.querySelector('.b-cord-length')?.value || '';
    // 2026-09-11(선혜님이 실제 윈텍/덱스터 발주서 양식 보여주심 - "넣을
    // 부분이 보이지??"): 실제 발주서엔 시스템(종류)/손잡이방향/끈길이/
    // 하단바/코멘트가 전부 각자 칸으로 나뉘어 있는데, 지금까지는 "내용"
    // 한 칸에 뭉쳐서 표시하고 있었음 - 각 칸을 그대로 살려서 전달.
    var bottomBar = tr.querySelector('.b-bottom-bar')?.value || '';
    var comment = tr.querySelector('.b-comment')?.value || '';
    var bmw   = tr.querySelector('.bmw')?.value || '';
    var bmh   = tr.querySelector('.bmh')?.value || '';
    var displayNameCheck = tr.querySelector('.b-display-name')?.value || '';
    // 2026-09-11(선혜님 발견 - "지금은 캔가공소만 뜨잖아": 커튼과 완전히
    // 같은 모양의 문제가 블라인드에도 있었음. 손현영님 실제 데이터로
    // 재확인 - 블라인드 4개 항목 전부 fabric/vendor가 비어있어서
    // (제품명/사이즈는 있는데) 이 조기 return에 걸려 발주서에서 통째로
    // 빠지고 있었음. 커튼의 "제작은 원단거래처와 무관하게 항상 필요"와는
    // 다른 이유지만 결과는 같음 - 거래처를 아직 안 정했어도 실제 블라인드
    // 항목(제품명/사이즈 존재)이면 일단 "미지정" 그룹으로 발주서에 나오게
    // 해서, 방금 만든 "⚠️ 거래처 미지정" 경고로 눈에 띄게 하고 그 자리에서
    // 거래처를 채워 넣을 수 있게 함(지금까진 아예 안 보여서 채울 기회조차
    // 없었음).
    if(!fabric && !vendor && !displayNameCheck && !bmw && !bmh) return;
    var space = tr.querySelector('.space-inp')?.value || '';
    var handle= tr.querySelector('.handle-dir')?.value || '';
    var kind  = tr.querySelector('.blind-kind')?.value || '';
    var opt   = tr.querySelector('.blind-opt')?.value || '';
    items.push({
      // 2026-09-11(선혜님 발견 - "지금은 캔가공소만 뜨잖아" 확인 과정에서
      // 함께 발견): 원단명(fabric) 칸이 비어있으면 품명 자체가 "—"로만
      // 나와서 뭘 주문해야 하는지조차 안 보였음 - 캔가공소 표가 이미
      // displayName(고객용 제품명)으로 이 문제를 해결했던 것과 동일하게,
      // fabric이 비어있으면 displayName으로 대신 보여줌.
      space: space||'—', product: fabric||displayNameCheck||'—', color: color||'—',
      size:(bmw&&bmh)?(bmw+'×'+bmh):'—',
      kind: kind||'—',
      handle: handle ? ((handle==='기타'||handle==='노코드')?handle:handle+'잡이') : '—',
      cordLength: cordLength||'—',
      bottomBar: bottomBar||'—',
      comment: [opt, comment].filter(Boolean).join(' / ')||'—',
      qty: '1개',
      vendor: vendor,
      orderCategory: 'blind',
      sourceRow: tr, vendorField: '.b-vendor', vendorIsSelect: true
    });
  });

  var groups = {};
  // 2026-09-11(선혜님 지적으로 발견 - 레일도 캔가공소처럼 거래처 없어도
  // "미지정"으로 뜨게 하면서 생긴 문제): 블라인드와 레일이 동시에 거래처
  // 미지정이면 둘 다 같은 "미지정" 그룹에 섞여 들어가는데, buildVendorDocForOne이
  // 그룹의 첫 항목 orderCategory 하나로만 표 형태를 정하기 때문에 섞이면
  // 한쪽 항목이 엉뚱한 칸 구성으로 깨져 보임 - 카테고리별로 별도의
  // "미지정(카테고리)" 그룹으로 분리.
  var CATEGORY_LABEL = { production: '제작', material: '레일', blind: '블라인드', fabric: '원단' };
  // 2026-09-11(선혜님 지시 - "발주 하는 이 부분이 정말 신경이 많이 쓰이는데
  // 이 방법이 최선인지는 모르겠어" + 대시보드 "발주 현황" 체크리스트 캡처
  // 보여주심): 원단/제작/블라인드/자재(레일)를 한 번에 다 쏟아내는 대신,
  // 체크리스트 항목 하나를 눌러 그 카테고리만 볼 수 있도록 필터 지원.
  // categoryFilter가 없으면(기존 "발주서" 버튼) 전부 다 보여주는 기존 동작 유지.
  var filteredItems = categoryFilter ? items.filter(function(it){ return it.orderCategory === categoryFilter; }) : items;
  filteredItems.forEach(function(it){
    var key = it.vendor || ('미지정(' + (CATEGORY_LABEL[it.orderCategory] || '기타') + ')');
    if(!groups[key]) groups[key] = [];
    groups[key].push(it);
  });
  // 2026-09-04(선혜님 지시 - "공간별로 나오게 해줘"): 화면에 입력한 순서
  // 그대로 나열되고 있었는데, 같은 공간(거실/안방 등) 품목끼리 모여서
  // 보이는 게 실무에서 훨씬 보기 편함 - 각 거래처 그룹 안에서 공간 기준
  // 정렬(같은 공간끼리는 원래 입력 순서 그대로 유지되도록 안정 정렬).
  Object.keys(groups).forEach(function(key){
    groups[key].sort(function(a, b){
      return (a.space||'').localeCompare(b.space||'', 'ko');
    });
  });

  return { groups: groups, cName: cName, cStaff: cStaff, itemCount: filteredItems.length };
}

function buildVendorHTML(extraNote, arrivalDatesByVendor, arrivalLocationsByVendor, categoryFilter) {
  function today(){
    return formatKoreanDate();
  }
  var collected = collectVendorGroups(categoryFilter);

  if(collected.itemCount === 0) {
    var emptyMsgByCategory = { fabric: '원단', production: '캔가공소(제작)', material: '레일', blind: '블라인드' };
    var emptyMsg = categoryFilter ? (emptyMsgByCategory[categoryFilter] || '해당') + ' 발주가 필요한 항목이 없어요.' : '거래처 또는 원단명이 입력된 항목이 없습니다.<br>커튼/블라인드 입력창의 "거래처" 필드를 채운 후 다시 시도해주세요.';
    return '<div class="pv-wrap" style="max-width:720px;margin:0 auto;padding:60px 20px;text-align:center;color:#B0A99F;font-size:13px">'+emptyMsg+'</div>';
  }

  var todayStr = today();
  var vendors = Object.keys(collected.groups);
  var out = '';
  vendors.forEach(function(vendor, i){
    var vendorArrivalRaw = arrivalDatesByVendor ? arrivalDatesByVendor[vendor] : '';
    var vendorArrivalStr = vendorArrivalRaw ? formatKoreanDate(new Date(vendorArrivalRaw+'T00:00:00')) : '';
    var vendorLocation = arrivalLocationsByVendor ? arrivalLocationsByVendor[vendor] : '';
    out += '<div style="' + (i > 0 ? 'page-break-before:always;margin-top:40px;' : '') + '">';
    out += buildVendorDocForOne(vendor, collected.groups[vendor], collected.cName, collected.cStaff, i === vendors.length - 1 ? extraNote : null, todayStr, vendorArrivalStr, vendorLocation);
    out += '</div>';
  });
  return out;
}

// 2026-09-11(선혜님 지적 - "견적서 앱에서 하단에 발주서를 누르면 똑같애
// 위에 이미지랑 루트가 완전히 다른데 둘 중 하나만 살리던가 연결되게
// 하던가"): 대시보드 "발주 현황"에서는 카테고리 하나씩 골라 상세 발주서로
// 들어가는데, 견적서 앱 안의 이 버튼만 예전처럼 전부 다 한 번에 보여주는
// 별개 경로로 남아있었음 - 서로 다른 두 입구가 서로 다른 결과를 주는
// 상태였음. 이 버튼도 똑같이 "어떤 발주서를 볼지" 먼저 고르게 해서
// 대시보드 체크리스트와 똑같은 사고방식으로 통일 - 다만 "전체 보기"
// 선택지는 남겨서, 정말 한 번에 다 보고 싶을 때(급한 발주 등)는 여전히
// 가능하게 함.
function openVendorOrderPicker() {
  var existing = document.getElementById('vendor-order-picker');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'vendor-order-picker';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:9998;display:flex;align-items:flex-end;justify-content:center';
  ov.onclick = function(e){ if (e.target === ov) ov.remove(); };
  var sheet = document.createElement('div');
  sheet.style.cssText = 'background:#fff;border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px;box-sizing:border-box';
  sheet.innerHTML = '<div style="font-size:15px;font-weight:700;margin-bottom:14px">어떤 발주서를 보시겠어요?</div>';
  var options = [
    { key: 'fabric', label: '원단 발주서' },
    { key: 'production', label: '캔가공소(제작) 발주서' },
    { key: 'material', label: '레일·자재 발주서' },
    { key: 'blind', label: '블라인드 발주서' },
    { key: null, label: '전체 보기 (다 같이)' }
  ];
  options.forEach(function(opt){
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.label;
    btn.style.cssText = 'display:block;width:100%;text-align:left;padding:14px 12px;background:none;border:none;border-bottom:1px solid #EEE6DC;font-size:14px;font-family:inherit;cursor:pointer;color:#282828';
    btn.onclick = function(){ ov.remove(); printForVendor(opt.key || undefined); };
    sheet.appendChild(btn);
  });
  var cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = '취소';
  cancelBtn.style.cssText = 'display:block;width:100%;text-align:center;padding:14px 12px;background:none;border:none;font-size:14px;font-family:inherit;cursor:pointer;color:#B0A99F;margin-top:6px';
  cancelBtn.onclick = function(){ ov.remove(); };
  sheet.appendChild(cancelBtn);
  ov.appendChild(sheet);
  document.body.appendChild(ov);
}

function printForVendor(categoryFilter) {
  calcTotal();
  // 2026-09-09(선혜님 지적 - "이거는 왜 이렇게 미리 알림으로 띄우는거야??
  // ... 니가 디테일하게 보지 않은거 같애!!"): 실측/시공(printRequest)은
  // 큰 팝업으로 개선했으면서, 발주서(printForVendor)는 예전 window.prompt()
  // 방식이 그대로 남아있었음 - 게다가 이미 각 거래처 문서마다 직접 수정
  // 가능한 비고 칸(.pv-vendor-note-editable, 발주서 페이지 자체 수정
  // 개선 때 만듦)이 있어서 이 prompt는 완전히 중복이었음. 미리보기가
  // 뜨기도 전에 불쑥 끼어드는 것도 방금 만든 팝업→미리보기 흐름을
  // 방해했음 - 완전 제거.
  var extraNote = '';
  // 2026-09-11(선혜님 지시 - "화면 자체를 없애고 최종 발주서에서 바로
  // 수정"): 예전엔 "거래처별 희망 도착일" 화면에서 사람이 확인 버튼을
  // 눌러야 기본값이 채워졌는데, 이제 그 화면이 없어졌으니 문서를 만들기
  // 직전에 여기서 바로 기본값을 채움.
  // 2026-09-11(선혜님 지시 - "발주 하는 이 부분이 정말 신경이 많이
  // 쓰이는데 이 방법이 최선인지는 모르겠어" + 대시보드 "발주 현황"
  // 체크리스트와 연결하기로 결정): categoryFilter가 있으면(체크리스트에서
  // "원단 발주"처럼 카테고리 하나를 눌러서 들어온 경우) 그 카테고리만
  // 걸러서 보여줌 - 없으면(견적서 앱 안의 기존 "발주서" 버튼) 전부 다 보여주는
  // 기존 동작 그대로 유지.
  var precollected = collectVendorGroups(categoryFilter);
  applyVendorArrivalDefaults(precollected.groups);
  var html = buildVendorHTML(extraNote, window._vendorArrivalDates || {}, window._vendorArrivalLocations || {}, categoryFilter);
  // 2026-09-09(선혜님 지시 - "발주 페이지 자체를 수정할 수 있게도
  // 적용이 되어있니??" → "이제 발주서도 보기 화면에서 직접 고칠 수
  // 있게(실측/시공과 동일하게)"): 예전엔 미리보기가 뜨기도 전에 이
  // 시점(함수 시작 직후)에 구글드라이브 저장 + order_status 갱신이
  // 이미 끝나버려서, 미리보기에서 비고를 고쳐도 이미 저장된 파일엔
  // 반영이 안 됐음(고칠 수도 없었음 - contenteditable 자체가 없었음).
  // 실측/시공 의뢰서가 이미 8/26에 이렇게 개선됐던 것과 동일하게,
  // 저장을 "인쇄/PDF저장" 버튼을 실제로 눌러 최종 확정하는 시점으로
  // 미룸(아래 printBtn.onclick 참고) - 그때 화면에 떠 있는(수정됐을
  // 수 있는) 최신 내용을 그대로 저장.

  var existing = document.getElementById('pv-overlay');
  if(existing) existing.remove();

  var ov = document.createElement('div');
  ov.id = 'pv-overlay';
  ov.style.cssText = [
    'position:fixed;top:0;left:0;width:100%;height:100%',
    'background:#F5F2EE;z-index:9999;overflow-y:auto;overflow-x:auto',
    'display:flex;flex-direction:column'
  ].join(';');

  var nav = document.createElement('div');
  nav.className = 'print-hide';
  nav.style.cssText = [
    'position:sticky;top:0;z-index:10001',
    'background:#282828;padding:0 24px',
    'display:flex;align-items:center;justify-content:space-between',
    'height:52px;flex-shrink:0'
  ].join(';');
  var navLabel = document.createElement('span');
  var CATEGORY_TITLE = { fabric: '원단 발주서', production: '캔가공소(제작) 발주서', material: '레일·자재 발주서', blind: '블라인드 발주서' };
  navLabel.textContent = categoryFilter ? (CATEGORY_TITLE[categoryFilter] || '발주서') : '발주서 — 거래처별 원단 발주 목록';
  navLabel.style.cssText = 'color:rgba(255,255,255,0.6);font-size:11px;font-weight:600;letter-spacing:0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1 1 auto;margin-right:8px';
  var navBtns = document.createElement('div');
  navBtns.style.cssText = 'display:flex;gap:var(--sp-2);flex-shrink:0';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 닫기';
  closeBtn.onclick = function(){
    document.getElementById('pv-overlay').remove();
    document.body.style.overflow = '';
    document.body.classList.remove('preview-open');
  };
  closeBtn.style.cssText = 'padding:7px 16px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit;white-space:nowrap;flex-shrink:0';
  var printBtn = document.createElement('button');
  printBtn.textContent = '인쇄 / PDF 저장';
  printBtn.onclick = function() {
    try {
      var collected2 = collectVendorGroups(categoryFilter);
      if (collected2.itemCount > 0) {
        inner.querySelectorAll('[data-vendor]').forEach(function(vendorBlock){
          var vendor = vendorBlock.getAttribute('data-vendor');
          saveDocumentToDrive(vendorCategory(vendor), collected2.cName || '미지정고객', vendor, vendorBlock.outerHTML, collected2.cStaff);
        });
        updateOrderStatusFromVendorGroups(collected2.groups);
        // 2026-09-10(선혜님 - "예상되는 부분을 좀 더 파볼까??"로 발견):
        // 발주를 실제로 완료해도 화면의 "업무처리" 카드가 페이지를
        // 새로고침하기 전까지 "아직 없음"으로 그대로 남아있었음 -
        // renderWorkStatusCards()가 페이지 로드시 딱 한 번만 실행되고
        // 있었음. 서버 저장이 비동기라 살짝 지연 후 다시 그림.
        if (typeof renderWorkStatusCards === 'function') setTimeout(renderWorkStatusCards, 800);
      }
    } catch (eSaveVendor) { console.warn('발주서 드라이브 저장 실패:', eSaveVendor); typeof reportClientError==='function' && reportClientError('발주서 드라이브 저장 실패: ' + (eSaveVendor && eSaveVendor.message || eSaveVendor), eSaveVendor && eSaveVendor.stack); }
    openPdfModal();
  };
  printBtn.style.cssText = 'padding:7px 18px;background:#282828;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;white-space:nowrap;flex-shrink:0';
  // 2026-09-11(선혜님 - "근데 발주는 바로 캡쳐해서 처리하는데"로 발견):
  // 방금 "완료 표시는 인쇄/PDF저장 눌렀을 때만 자동으로"라고 통일했는데,
  // 실제로는 이 화면을 캡쳐(스크린샷)해서 카톡 등으로 바로 보내는 게
  // 실제 업무 방식이라 "인쇄/PDF저장" 버튼 자체를 거의 안 쓰는 경우가
  // 많았음 - 그러면 체크박스를 손으로 못 누르게 막아놓은 상태에서
  // 완료 표시할 방법이 아예 없어짐. "인쇄/PDF저장"과 똑같이 완료 처리만
  // 해주는 별도 버튼을 추가 - 캡쳐로 보내고 나서 이 버튼 하나만 누르면 됨.
  var doneBtn = document.createElement('button');
  doneBtn.textContent = '✓ 발주완료 표시';
  doneBtn.onclick = function() {
    var collected3 = collectVendorGroups(categoryFilter);
    if (collected3.itemCount === 0) { if (typeof showToast === 'function') showToast('완료 처리할 항목이 없어요'); return; }
    updateOrderStatusFromVendorGroups(collected3.groups);
    if (typeof renderWorkStatusCards === 'function') setTimeout(renderWorkStatusCards, 800);
    doneBtn.textContent = '✓ 완료 처리됨';
    doneBtn.disabled = true;
    doneBtn.style.opacity = '0.6';
  };
  doneBtn.style.cssText = 'padding:7px 14px;background:none;color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;white-space:nowrap;flex-shrink:0';
  navBtns.appendChild(closeBtn);
  navBtns.appendChild(doneBtn);
  navBtns.appendChild(printBtn);
  nav.appendChild(navLabel);
  nav.appendChild(navBtns);

  var content = document.createElement('div');
  content.style.cssText = 'flex:1;padding:32px 20px 60px;display:flex;flex-direction:column;align-items:center';
  // 2026-09-11(선혜님 지시 - "화면 자체를 없애고 최종 발주서에서 바로
  // 수정"): 예전엔 "원단 거래처 칸에 가공소 이름을 넣었다" 같은 실수를
  // 별도 확인화면에서 confirm()으로 막았는데, 그 화면을 없앤 대신 문서
  // 맨 위에 눈에 띄는 배너로 알려줌 - 막지는 않되(발주서는 그대로 보임)
  // 바로 알아채고 고칠 수 있게.
  var issues = getVendorInfoIssues();
  if (issues.confusedFabricSpaces.length > 0) {
    var warnBanner = document.createElement('div');
    warnBanner.className = 'print-hide';
    warnBanner.style.cssText = 'width:100%;max-width:640px;background:#FBEAE7;border:1px solid #E4483A;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:#C0392B;line-height:1.6';
    warnBanner.textContent = '⚠️ 원단 거래처 칸에 가공소 이름이 들어간 항목이 있어요: ' + issues.confusedFabricSpaces.join(', ') + ' — 가공소는 자동으로 처리되니, 원단 거래처 칸에는 실제 원단 매입처를 입력해주세요.';
    content.appendChild(warnBanner);
  }
  var inner = document.createElement('div');
  inner.style.cssText = 'width:100%;max-width:640px';
  inner.innerHTML = html;
  content.appendChild(inner);
  // 2026-09-11(선혜님 지적 - "미지정을 고쳐도 원본엔 저장이 안 된다" +
  // "이게 베스트니?? 전문업체 기준으로" 평가 후 1순위로 확정): 발주서
  // 문서의 "발주처" 칸을 고치면, 화면(인쇄용)만 바뀌는 게 아니라 그
  // 항목들이 나온 실제 견적서 행(원단/레일 거래처 입력칸, 블라인드
  // 거래처 선택칸)까지 값이 반영되도록 연결. 이래야 다음에 다시 열어도
  // "미지정"으로 되돌아가지 않음.
  wireVendorNameEdit(inner, precollected.groups);

  ov.appendChild(nav);
  ov.appendChild(content);
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  document.body.classList.add('preview-open');
}

// 2026-09-11(선혜님 지적 - "미지정을 고쳐도 원본엔 저장이 안 된다" +
// "전문업체 기준으로 업무효율성 평가해봐" 후 1순위 개선사항으로 확정):
// 발주서 문서의 "발주처" 칸은 지금까지 contenteditable이긴 해도 화면
// 표시만 바뀌고 실제 데이터(견적서의 원단/레일 거래처 입력칸, 블라인드
// 거래처 선택칸)에는 반영이 안 됐음 - 다음에 다시 열면 도로 "미지정"으로
// 나오는 원인이었음. groups(collectVendorGroups가 만든, 각 항목의
// 원본 행(sourceRow)까지 담고 있는 객체)를 받아서, "발주처" 칸을 실제로
// 고치면 그 그룹에 속한 모든 항목의 원본 행까지 값을 밀어넣어줌.
function wireVendorNameEdit(container, groups) {
  // 2026-09-14(선혜님 - "블라인드는 한번 수정해도 다시 초기화 해버리네"로
  // 발견): 재현해보니 편집 자체는 문제없이 반영되고 있었음 - 진짜 원인은
  // 이 편집이 "지금 열려있는 견적서 화면"에만 반영되고, 실제 저장
  // (saveEstimate)은 완전히 별도 단계였다는 것. 저장을 깜빡하고 창을
  // 닫거나 나중에 다시 열면(특히 대시보드 "상세보기"로 새로 열 때마다
  // 서버에서 새로 불러오므로) 당연히 저장 안 된 예전 값(미지정)으로
  // "초기화된 것처럼" 보임 - 이 토스트에 "지금 저장" 버튼을 바로 붙여서
  // 그 자리에서 바로 저장까지 끝낼 수 있게 함.
  function showVendorSavedToast(msg) {
    var toast = document.createElement('div');
    toast.className = 'print-hide';
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#282828;color:#fff;padding:10px 16px;border-radius:20px;font-size:12px;z-index:10001;display:flex;align-items:center;gap:10px';
    var msgSpan = document.createElement('span');
    msgSpan.textContent = msg;
    var saveBtn = document.createElement('button');
    saveBtn.textContent = '지금 저장';
    saveBtn.style.cssText = 'background:#fff;color:#282828;border:none;border-radius:14px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap';
    saveBtn.onclick = function(){
      toast.remove();
      if (typeof saveEstimate === 'function') saveEstimate();
    };
    toast.appendChild(msgSpan);
    toast.appendChild(saveBtn);
    document.body.appendChild(toast);
    setTimeout(function(){ toast.remove(); }, 6000);
  }
  // 2026-09-15(선혜님 - "미지정을 지정해도 계속 뜨잖아... 다단다에서는
  // 블라인드 업체명이 보이는데" 로 발견 — 실제로는 데이터는 정확히
  // 저장되고 있었음(시공의뢰서엔 이미 정확히 나오고 있었던 게 그 증거).
  // 진짜 문제는 발주서 화면 위쪽의 "⚠️ 미지정" 경고 배너가 정적으로
  // 한 번만 그려지고, 그 뒤로 항목을 하나씩 고쳐도 전혀 다시 계산이
  // 안 되고 있었다는 것 - 데이터는 맞는데 화면(배너)만 계속 옛날 상태를
  // 보여주고 있었음. 항목을 고칠 때마다 그 그룹의 배너/헤더를 지금
  // 상태 기준으로 다시 그림.
  function refreshBlockBanner(block, groupItems) {
    var banner = block.querySelector('.pv-unassigned-banner');
    if (!banner) return;
    var vendors = groupItems.map(function(it){ return it.vendor || ''; });
    var allAssigned = vendors.length > 0 && vendors.every(function(v){ return !!v; });
    if (allAssigned) {
      var uniqueVendors = vendors.filter(function(v, i, arr){ return arr.indexOf(v) === i; });
      var label = uniqueVendors.length === 1 ? uniqueVendors[0] : '여러 거래처';
      banner.style.background = '#F5F2EE';
      banner.style.color = '#282828';
      banner.textContent = '거래처: ' + label;
      var headerField = block.querySelector('.pv-vendor-name-field');
      if (headerField) headerField.textContent = label;
    } else {
      banner.style.background = '#FBEAE7';
      banner.style.color = '#C0392B';
      banner.textContent = '⚠️ 일부 항목의 거래처가 아직 안 정해졌어요 — 빨간 글씨나 드롭다운을 확인해주세요';
    }
  }
  // 2026-09-14(선혜님 지적 - "된거니????": 레일/블라인드도 원단과 같은
  // 문제가 있었음 발견): 블라인드는 거래처가 <select>라 직접 타이핑하는
  // 방식(.pv-item-vendor-field)이 아니라 문서 안에 진짜 드롭다운
  // (.pv-item-vendor-select)을 넣었음 - 그 값을 고르면 바로 그 항목의
  // 원본 블라인드 행에 반영.
  container.querySelectorAll('.pv-item-vendor-select').forEach(function(sel){
    var block = sel.closest('[data-vendor]');
    if (!block) return;
    var vendorKey = block.getAttribute('data-vendor');
    var groupItems = groups[vendorKey];
    var idx = parseInt(sel.getAttribute('data-item-idx'), 10);
    var item = groupItems && groupItems[idx];
    if (!item || !item.sourceRow || !item.vendorField) return;
    sel.addEventListener('change', function(){
      var input = item.sourceRow.querySelector(item.vendorField);
      if (!input) return;
      var val = sel.value;
      if (val === '__custom__') {
        // 2026-09-14(선혜님 지적 - "발주처를 직접 안쓰고 선택하게 해야지"
        // 로 material도 드롭다운화 - 다만 등록 안 된 새 거래처를 써야
        // 하는 예외 상황도 있어서 "+ 직접 입력"으로 탈출구를 남김).
        val = prompt('거래처 이름을 입력해주세요:', '') || '';
        if (!val) { sel.value = item.vendor || ''; return; }
        var customOpt = document.createElement('option');
        customOpt.value = val; customOpt.textContent = val; customOpt.selected = true;
        sel.insertBefore(customOpt, sel.lastElementChild);
        // 2026-09-14("코드 모두 정리해" 중 공용 함수로 합치면서 발견):
        // 블라인드의 실제 원본 필드(.b-vendor)는 진짜 <select>라서, 여기
        // 등록 안 된 새 이름을 .value로 바로 넣으면 일치하는 <option>이
        // 없어 조용히 빈 값으로 되돌아감(값이 안 들어간 채 성공한 것처럼
        // 보임) - 원본이 실제 <select>일 때는 그쪽에도 같은 옵션을 먼저
        // 추가해야 함. 원단/레일의 원본 필드(<input>)는 이 문제가 없음.
        if (input.tagName === 'SELECT' && !Array.from(input.options).some(function(o){ return o.value === val; })) {
          var srcCustomOpt = document.createElement('option');
          srcCustomOpt.value = val; srcCustomOpt.textContent = val;
          input.appendChild(srcCustomOpt);
        }
      }
      input.value = val;
      item.vendor = val;
      sel.style.borderColor = val ? '#EEE6DC' : '#E4483A';
      sel.style.color = val ? '#282828' : '#C0392B';
      refreshBlockBanner(block, groupItems);
      showVendorSavedToast('✅ "' + (item.space||'') + '" 항목의 거래처를 반영했어요.');
    });
  });

  // 2026-09-14(선혜님 지시 - "원단도 드롭다운되게끔 해~ 블라인드처럼"):
  // 원단도 드롭다운(.pv-item-vendor-select)으로 바뀌면서 이 자유텍스트
  // 입력칸(.pv-item-vendor-field)을 만드는 코드가 더 이상 없음 - 이걸
  // 연결하던 아래 블록은 이제 아무 대상도 못 찾는 죽은 코드라 제거
  // (체크리스트 29번 - 죽은 코드 삭제 시 재스캔).

  var fields = container.querySelectorAll('.pv-vendor-name-field');
  fields.forEach(function(field){
    var block = field.closest('[data-vendor]');
    if (!block) return;
    var vendorKey = block.getAttribute('data-vendor');
    var groupItems = groups[vendorKey];
    if (!groupItems || !groupItems.length) return;
    // 캔가공소(제작)처럼 거래처가 견적서 행이 아니라 설정에서 오는
    // 항목은 여기서 고쳐도 반영할 곳이 없음 - 편집 자체를 막고 안내.
    var editableItems = groupItems.filter(function(it){ return it.sourceRow && it.vendorField; });
    if (editableItems.length === 0) {
      field.setAttribute('contenteditable', 'false');
      field.style.cursor = 'not-allowed';
      field.title = '이 거래처는 [설정 > 거래처 관리]에서 등록된 값이라 여기서는 못 고쳐요.';
      return;
    }
    field.addEventListener('blur', function(){
      var newVal = field.textContent.trim();
      if (newVal === vendorKey || (vendorKey.indexOf('미지정') === 0 && newVal === '')) return;
      // 2026-09-13(선혜님 - "전문업체 기준으로... 직접 다 확인" 요청 중
      // 직접 재현하다 발견): "미지정(원단)"은 실제로 같은 거래처라서
      // 묶인 게 아니라, 그냥 다들 거래처를 아직 안 정해서 우연히 같은
      // 이름표 아래 묶인 것뿐임 - 예를 들어 거실 커튼은 A업체, 안방
      // 커튼은 B업체로 각각 다르게 정해야 하는데, 여기서 한 번에 이름을
      // 바꾸면 서로 무관한 커튼들에 전부 같은 거래처가 조용히 들어가
      // 버림. 실제 거래처(이미 이름이 있던 경우)를 고칠 때는 상관없지만
      // (원래도 같은 거래처였으니), "미지정"에서 시작해서 여러 항목이
      // 걸려있을 땐 몇 개나 바뀌는지 미리 보여주고 확인받음.
      var distinctRows = editableItems.filter(function(it, i, arr){ return arr.indexOf(it) === arr.findIndex(function(x){ return x.sourceRow === it.sourceRow; }); });
      if (vendorKey.indexOf('미지정') === 0 && distinctRows.length > 1) {
        var spaces = distinctRows.map(function(it){ return it.space; }).join(', ');
        if (!confirm('"' + newVal + '"을(를) ' + distinctRows.length + '개 항목(' + spaces + ')에 한꺼번에 적용할까요?\n각자 다른 거래처라면 여기서 한 번에 바꾸지 말고, 견적서 행마다 따로 입력해주세요.')) {
          field.textContent = '';
          return;
        }
      }
      var applied = 0, rejected = 0;
      editableItems.forEach(function(it){
        var input = it.sourceRow.querySelector(it.vendorField);
        if (!input) return;
        if (it.vendorIsSelect) {
          // 2026-09-11: <select>는 등록된 거래처 중 하나로만 값을 바꿀 수
          // 있음 - 목록에 없는 이름을 적으면 선택이 풀려버려서(빈 값)
          // 오히려 원본을 망칠 수 있으므로, 등록된 옵션과 정확히 일치할
          // 때만 반영하고 아니면 거부.
          var matched = Array.from(input.options).some(function(opt){ return opt.value === newVal; });
          if (matched) { input.value = newVal; it.vendor = newVal; applied++; } else { rejected++; }
        } else {
          input.value = newVal;
          it.vendor = newVal;
          applied++;
        }
      });
      if (rejected > 0 && applied === 0) {
        alert('"' + newVal + '"은(는) 등록된 블라인드 거래처가 아니에요.\n거래처 관리에 먼저 등록하거나, 등록된 이름 그대로 입력해주세요.');
        field.textContent = vendorKey.indexOf('미지정') === 0 ? '' : vendorKey;
        return;
      }
      // 2026-09-11: 여기서 값을 바꾸는 건 "지금 열려있는 견적서 화면"까지만
      // 이고, Supabase 저장은 아직 안 된 상태 - 저장을 깜빡하면 다음에
      // 다시 열었을 때 이전 값으로 보임(2026-09-14 "다시 초기화" 지적으로
      // "지금 저장" 버튼을 토스트에 바로 붙임 - showVendorSavedToast 참고).
      // 2026-09-15(선혜님 - "미지정을 지정해도 계속 뜨잖아"로 발견): 값은
      // 정확히 반영되고 있었는데 경고 배너를 다시 계산 안 해서 계속
      // "미지정"으로 보이고 있었음 - 배너/헤더도 지금 상태로 갱신.
      refreshBlockBanner(block, groupItems);
      showVendorSavedToast('✅ 이 견적서의 거래처 칸에 "' + newVal + '"(으)로 반영했어요.');
    });
  });
}


// 이미 선언되어 있는데(실제 로직도 거기서 관리됨) 여기서도 동일하게
// 중복 선언되고 있었음 - 두 파일이 같은 페이지에서 함께 로드되므로
// 전역 변수가 두 곳에서 따로 초기화되는 혼란스러운 구조였음. 중복 제거.

