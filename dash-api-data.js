/* ══════════════════════════════════════════════════
   DAH 대시보드 — 데이터 변환·로딩 (DB행↔화면 객체, 고객/견적 불러오기)
   2026-09-24(선혜님 - "나눌수 있는건 다 나눠보자" - 큰 파일 쪼개기 4차): dbRowToCustomer,
   customerToDbRow, estimateDbRowToLocal, loadCustomers/loadEstimatesAsync/loadCustomersAsync 등
   "읽기·변환" 함수들만 분리함. 코드 내용은 한 줄도 안 바꾸고 위치만 옮김.
   ══════════════════════════════════════════════════ */



function dbRowToCustomer(row) {
  return {
    id:                 row.id,
    clientName:         row.client_name||'',
    phone:              row.phone||'',
    addr:               row.addr||'',
    addrDetail:         row.addr_detail||'',
    space:              row.space||'',
    price:              Number(row.price)||0,
    performanceRevenue: Number(row.performance_revenue)||0,
    staffName:          row.staff_name||'마스터',
    stage:              row.stage||'상담',
    date:               row.date||'',
    memo:               row.memo||'',
    visitCount:         Number(row.visit_count)||1,
    measureDate:        row.measure_date||'',
    installDate:        row.install_date||'',
    // 2026-09-21(선혜님 - 전보현/민소아 고객 실제 발생 확인, 데이터는
    // Supabase에서 직접 고침): 대시보드 고객상세에서 실측/시공 예정일을
    // 클릭해서 실제 날짜를 입력해도, customers.measure_date_tbd/
    // install_date_tbd(견적서 "미정" 체크박스가 켜져 있으면 저장되는
    // 플래그)를 대시보드 쪽 서버↔로컬 매핑 함수 둘 다 전혀 모르고
    // 있었음 - 그래서 이 값을 서버에서 읽어오지도, 대시보드에서 고친
    // 값을 서버로 보내지도 못했음. 이 두 필드를 양방향 매핑에 추가.
    measureDateTbd:     row.measure_date_tbd||false,
    installDateTbd:     row.install_date_tbd||false,
    createdAt:          row.created_at||new Date().toISOString(),
    // 2026-08-31(선혜님 지시 - "만들어줘", 견적서에 이미 있는 동시편집
    // 충돌감지를 고객 레코드에도 적용하기 위해 추가): 이 값을 잠금
    // 기준으로 써서, 저장 직전에 "그 사이 다른 곳에서 먼저 저장했는지"
    // 확인할 수 있게 함.
    updatedAt:          row.updated_at||null,
    is_archived:        row.is_archived === true,
    // 결제 필드
    depositAmount:      Number(row.deposit_amount)||0,
    depositDate:        row.deposit_date||'',
    depositMethod:      row.deposit_method||'',
    depositReceipt:     row.deposit_receipt||false,
    balanceAmount:      Number(row.balance_amount)||0,
    balanceDate:        row.balance_date||'',
    balanceMethod:      row.balance_method||'',
    balanceReceipt:     row.balance_receipt||false,
    orderStatus:        row.order_status||{},
    branch:             row.branch||'반포점',
    leadParked:         row.lead_parked||false,
    confirmDate:        row.confirm_date||'',
    // 2026-08-29: 카카오 알림톡 v3 재작성 시 추가 — #{결제링크} 변수용 저장란.
    // DB에 payment_link 컬럼은 이미 존재했으나(원인 불명, 마이그레이션 파일엔 없음)
    // 코드에서 쓰인 적은 없었음 — 이번에 처음 실제 연결함.
    paymentLink:        row.payment_link||''
  };
}

function customerToDbRow(c) {
  return {
    client_name:         c.clientName||'',
    phone:               c.phone||'',
    addr:                c.addr||'',
    addr_detail:         (c.addrDetail === undefined ? undefined : (c.addrDetail || null)), // 2026-10-06: 앱 객체에 상세주소 정보가 없을 땐(옛 캐시) 키 자체를 안 보내 기존 값을 지우지 않음
    space:               c.space||'',
    price:               Number(c.price)||0,
    performance_revenue: Number(c.performanceRevenue)||0,
    staff_name:          c.staffName||'마스터',
    stage:               c.stage||'상담',
    date:                c.date||'',
    measure_date:        c.measureDate||'',
    install_date:        c.installDate||'',
    measure_date_tbd:    c.measureDateTbd||false,
    install_date_tbd:    c.installDateTbd||false,
    memo:                c.memo||'',
    visit_count:         Number(c.visitCount)||1,
    // 결제 필드
    deposit_amount:      Number(c.depositAmount)||0,
    deposit_date:        c.depositDate||'',
    deposit_method:      c.depositMethod||'',
    deposit_receipt:     c.depositReceipt||false,
    balance_amount:      Number(c.balanceAmount)||0,
    balance_date:        c.balanceDate||'',
    balance_method:      c.balanceMethod||'',
    balance_receipt:     c.balanceReceipt||false,
    order_status:        c.orderStatus||{},
    branch:              c.branch||'반포점',
    confirm_date:        c.confirmDate||null,
    payment_link:        c.paymentLink||''
  };
}

function loadCustomers() {
  if (_customerCache.length > 0) return _customerCache;
  try { return JSON.parse(localStorage.getItem('dah_customers') || '[]'); } catch(e) { return []; }
}

// 클라우드(estimates 테이블)에서 견적서를 가져와 로컬(dah_saved) 형식으로 변환 후
// 병합 (2026-08-04 신규) — 예전엔 견적서 목록 화면이 로컬저장소만 보고 있어서,
// 다른 기기에서 저장했거나 관리자가 직접 넣은 견적서가 전혀 안 보이는 문제가 있었음
function estimateDbRowToLocal(row) {
  // 2026-08-05: itemCount/curtainCount/blindCount/거래처목록이 전부 하드코딩(0, [])
  // 되어 있어서, 다른 기기에서 저장돼 클라우드로 동기화된 견적서는 발주현황이
  // "저장된 견적서 없음"으로 뜨고 거래처 자동완성도 안 되던 버그 — line_items가
  // 있으면 실제로 세서 정확한 값을 넣도록 수정
  var liArr = row.line_items || [];
  var curtainItems = liArr.filter(function(li){ return li && li.type === 'curtain'; });
  var blindItems = liArr.filter(function(li){ return li && li.type === 'blind'; });
  var curtainVendors = curtainItems.map(function(li){ return li.vendor; }).filter(Boolean);
  var blindVendors = blindItems.map(function(li){ return li.vendor; }).filter(Boolean);
  return {
    id: row.id,
    dbId: row.id,
    // 2026-08-31(선혜님 지적 — "신화정 견적서를 확인해봐", 실제로는
    // 신화경 오타 - 동명이인 2명 중 한 명(오지은 실장 담당, id=165)이
    // 다른 한 명(마스터 담당, id=150)의 견적서를 이력탭에서 잘못 보고
    // 확정을 시도했다가 권한 없음으로 조용히 실패했던 사건으로 발견):
    // clientId를 매핑하는 줄 자체가 이 함수에 통째로 빠져있었음! 그래서
    // 클라우드에서 동기화된 모든 견적서는 로컬 객체에 clientId가 항상
    // undefined였음 - renderDetailEstTab의 매칭 로직(var mine = ... e.clientId
    // ? id매칭 : 이름매칭)이 이 경우 무조건 "이름매칭"으로 폴백하니까,
    // 동명이인이 있는 모든 고객에게서 서로 다른 사람의 견적서가 섞여
    // 보이고 있었음 - 오늘 하루 종일 발견한 것 중 가장 심각한 버그.
    // 2026-09-16(선혜님 - "4번 하자"로 시작한 가벼운 타입체크에서 발견):
    // clientId가 이 객체 리터럴에 두 번 정의돼 있었음(여기 한 번, 아래
    // "전수재검사" 블록에서 한 번 더) - 자바스크립트 객체 리터럴은 나중
    // 선언이 이긴다는 원칙 때문에 실제로는 아래쪽(row.client_id || null)
    // 값만 적용되고 있었고, 이 줄은 완전히 죽은 코드였음. 다행히 실제
    // 동작에는 문제가 없었던 것으로 보이나(둘 다 같은 값을 가리킴), 나중에
    // "중복이니 지우자"고 아래쪽을 지웠다면 위 주석에 적힌 "가장 심각한
    // 버그" 수정이 조용히 원복될 뻔했음 - 죽은 줄을 지우고 아래쪽 하나로
    // 통일.
    // 2026-08-24(전수재검사 발견): renderEstimateHistory()(고객상세 "정보" 탭)는
    // "열어서 수정"/"복사해서 새로 만들기" 버튼을 e.dbId 존재 여부로 띄우는데,
    // 클라우드에서 동기화된 항목은 .id만 있고 .dbId가 없어서 이 버튼들이 실제
    // 고객 대부분(클라우드 동기화된 진짜 견적)에게는 안 뜨고 있었을 것.
    no: row.id ? String(row.id).slice(0,8) : '',
    clientName: row.customer_name || '',
    phone: row.phone || '',
    addr: '',
    space: row.space || '',
    fabric: row.product || '',
    itemCount: liArr.length, curtainCount: curtainItems.length, blindCount: blindItems.length,
    curtainVendors: curtainVendors, blindVendors: blindVendors,
    price: Number(row.price) || 0,
    performanceRevenue: Number(row.performance_revenue) || 0,
    staffName: row.staff_name || '',
    status: row.estimate_status || 'ga',
    // 2026-08-24(선혜님 질문 — 계약 안 하는 경우 처리): 서버에 실제로 저장된
    // contract_status가 있으면 그대로 쓰고("미계약"이 새로고침해도 유지됨),
    // 없는(예전) 레코드만 estimate_status로 추정하는 기존 방식으로 폴백.
    contractStatus: row.contract_status || (row.estimate_status === 'final' ? 'contracted' : 'pending'),
    savedAt: row.date || row.created_at || '',
    date: row.date || '',
    installDate: '',
    memo: row.memo || '',
    confirmedAt: row.confirmed_at || null,
    branch: row.branch || '반포점',
    clientId: row.client_id || null,
    lineItems: row.line_items || [],
    custType: row.cust_type || 'new',
    region: row.region || '',
    asFeeType: row.as_fee_type || 'free',
    // 2026-08-24: isArchived 하나만 빠진 게 아니라, 컬럼 전체를 다시 대조해보니
    // 6개가 더 빠져있었음(같은 종류의 실수가 더 있는지 전수 재검사 — 선혜님
    // 프로젝트 원칙). A/S 관련 4개는 A/S 항목이 클라우드 동기화되면 증상/사진
    // 메모가 통째로 사라져 보였을 것이고, price_breakdown 누락은 "저장 당시
    // 금액 고정" 기능이 dah_saved 캐시 경유 화면에서는 안 먹혔을 수 있음.
    asInstallDate: row.as_install_date || null,
    asType: row.as_type || null,
    asSymptom: row.as_symptom || null,
    asPhotoMemo: row.as_photo_memo || null,
    appliedDiscounts: row.applied_discounts || null,
    priceBreakdown: row.price_breakdown || null,
    updatedAt: row.updated_at || null,
    isArchived: !!row.is_archived,
    // 2026-09-21(선혜님 - "그럼 언제 하라는거지??????" → 견적서별 결제
    // 관리로 구조 전환): 결제(선금/잔금)를 이 견적서 자체에 저장하도록
    // 바꾸면서 estimates 테이블에 새로 추가한 8개 컬럼 - 다른 필드들과
    // 똑같이 여기서 매핑을 빠뜨리면(위 "전수재검사" 코멘트에서 이미
    // 한 번 겪은 실수 패턴) 클라우드 동기화된 견적서에서만 결제 정보가
    // 안 보이는 조용한 회귀가 될 뻔했음 - 처음부터 함께 추가.
    depositAmount:  Number(row.deposit_amount)||0,
    depositDate:    row.deposit_date||'',
    depositMethod:  row.deposit_method||'',
    depositReceipt: row.deposit_receipt||false,
    balanceAmount:  Number(row.balance_amount)||0,
    balanceDate:    row.balance_date||'',
    balanceMethod:  row.balance_method||'',
    balanceReceipt: row.balance_receipt||false,
    _fromCloud: true
  };
}

function loadEstimatesAsync(callback, force) {
  var now = Date.now();
  if (!force && _estimateCacheTime > 0 && (now - _estimateCacheTime) < CACHE_FRESH_MS) {
    var cached = [];
    try { cached = JSON.parse(localStorage.getItem('dah_saved') || '[]'); } catch(e) {}
    if (callback) callback(cached);
    return;
  }
  sbXHR('GET', 'estimates?select=*&order=date.desc.nullslast', null, function(err, data) {
    var local = [];
    try { local = JSON.parse(localStorage.getItem('dah_saved') || '[]'); } catch(e) {}
    if (err) { if (callback) callback(local); return; }
    var cloudLocalFormat = (data || []).map(estimateDbRowToLocal);
    var cloudIds = cloudLocalFormat.map(function(e){ return e.id; });
    // 클라우드에서 온 항목은 매번 최신값으로 덮어씀(예전엔 이미 로컬에 캐시된
    // id가 있으면 무시해서, 클라우드에서 나중에 수정해도 브라우저엔 예전 캐시가
    // 계속 남아있는 버그가 있었음). 이 브라우저에서 직접 만든(클라우드기원이
    // 아닌) 로컬전용 항목만 그대로 유지.
    // 2026-08-24(선혜님 요청 — "니가 정리해", 매번 삭제버튼 누르게 하지 말고
    // 자동으로 처리하라는 지적): 오늘 여러 버그로 이미 만들어진 "로컬전용
    // 유령"들(서버 id를 한 번도 못 받은 채 남은 것)을 매번 손으로 지우게
    // 하는 대신, 같은 고객(clientId)+같은 금액(price)의 진짜 클라우드 기록이
    // 이미 있으면 그 유령은 100% 예전 버그의 잔재로 보고 동기화 시점에
    // 자동으로 제거함(사용자에게 보이지도 않고 조용히 정리됨).
    var cloudSig = {};
    cloudLocalFormat.forEach(function(e){ if(e.clientId) cloudSig[e.clientId+'|'+e.price] = true; });
    var localOnly = local.filter(function(e){
      if (e._fromCloud) return false;
      if (cloudIds.indexOf(e.id) !== -1) return false;
      if (!e.dbId && e.clientId && cloudSig[e.clientId+'|'+e.price]) return false; // 자동 정리 대상
      return true;
    });
    var merged = localOnly.concat(cloudLocalFormat);
    _estimateCacheTime = Date.now();
    try { localStorage.setItem('dah_saved', JSON.stringify(merged)); } catch(e) {}
    if (callback) callback(merged);
  });
}

function loadCustomersAsync(callback, force) {
  var now = Date.now();
  if (!force && _customerCache.length > 0 && (now - _customerCacheTime) < CACHE_FRESH_MS) {
    if (callback) callback(_customerCache);
    return;
  }
  // 2026-08-04: is_archived 서버필터 제거 — 삭제된(보관) 고객까지 가져와야
  // "보관 고객 포함" 체크박스로 복구할 수 있음. 예전엔 서버에서부터 삭제된
  // 고객을 걸러서 안 가져오니, 화면에서 "보관 고객 포함"을 켜도 실수로
  // 삭제한 고객이 영영 안 보이는(사실상 복구 불가능한) 심각한 문제였음.
  // 화면단에서는 isSoftDeleted()로 여전히 기본은 숨김 처리됨.
  sbXHR('GET', 'customers?select=*&order=created_at.desc', null, function(err, data) {
    hideLoading();
    if (err) { try { _customerCache = JSON.parse(localStorage.getItem('dah_customers') || '[]'); } catch(e) {} }
    else {
      // 2026-10-08: "필드별 저장"(메모/결제링크/단계/날짜/발주)이 서버에 못 가고 재시도 큐에 쌓여 있으면(이름표 '고객id:fields:...'),
      // 서버에서 새로 받은 행 위에 그 대기 중인 필드만 얹어서 보여줌 - 화면이 서버의 옛 값으로 되돌아가 다시 입력하게 만들지 않고,
      // 나머지 필드(계약금 등)는 서버 최신값을 그대로 씀(아래 통째 유지 방식은 낡은 값을 같이 붙들기 때문에 필드별 저장에는 쓰지 않음).
      var queuedFieldOverlays = {};
      try {
        if (typeof getPendingSyncQueue === 'function') {
          getPendingSyncQueue().forEach(function(p) {
            var m = /^(\d+):fields:/.exec(String(p.customerKey));
            if (m && p.payload && typeof p.payload === 'object') queuedFieldOverlays[m[1]] = Object.assign(queuedFieldOverlays[m[1]] || {}, p.payload);
          });
        }
      } catch (eOverlay) { /* 얹기 실패는 무시 - 서버값 그대로 */ }
      var fresh = (data || []).map(function(row) {
        var o = row && queuedFieldOverlays[String(row.id)];
        return dbRowToCustomer(o ? Object.assign({}, row, o) : row);
      });
      // 2026-08-05: 오프라인 동기화 큐 — 서버 저장이 아직 안 된(대기중인) 고객은
      // 서버의 옛날 데이터로 덮어쓰지 않고 로컬 버전을 그대로 유지.
      // 이게 없으면 오프라인에서 바꾼 내용이 네트워크 복구 후 재조회 한 번에
      // 조용히 사라지는 문제가 있었음(실제로 발견된 버그).
      if (typeof getPendingSyncQueue === 'function') {
        var pendingKeys = getPendingSyncQueue().map(function(p){ return p.customerKey; });
        if (pendingKeys.length > 0) {
          var localMap = {};
          _customerCache.forEach(function(c){ localMap[c.id || c.clientName] = c; });
          fresh = fresh.map(function(c) {
            var key = c.id || c.clientName;
            return (pendingKeys.indexOf(key) >= 0 && localMap[key]) ? localMap[key] : c;
          });
        }
      }
      _customerCache = fresh; _customerCacheTime = Date.now();
      try { localStorage.setItem('dah_customers', JSON.stringify(_customerCache)); } catch(e) {}
    }
    if (callback) callback(_customerCache);
  });
}

function saveCustomers(arr) { _customerCache = arr; try { localStorage.setItem('dah_customers', JSON.stringify(arr)); } catch(e) {} }
