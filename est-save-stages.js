/* ══════════════════════════════════════════════════
   DAH 견적서 앱 — 저장 단계 함수 4개 (고객 저장 → 견적서 저장 → 로컬 저장)
   2026-09-28(선혜님 - "전문업체서 잡으면 어떻게 하겠니"): est-save.js의 _saveEstimateInner(763줄)
   안에 들어 있던 내부 함수 4개를 꺼낸 파일. 예전엔 바깥 함수의 변수를 몰래 공유했지만,
   이제 필요한 값은 ctx(값 묶음)로 명시해서 받음. 각 함수 맨 위 "var x = ctx.x" 줄이 그 목록.
     _saveStage_customers        고객(customers) 저장 후 견적서 저장으로 이어짐
     _saveStage_estimates        오늘 이미 저장된 견적이 있는지 확인 후 POST/PATCH 결정
     _saveStage_estimatesActual  견적서(estimates) 실제 저장(POST/PATCH, 오류/충돌 처리)
     _saveStage_localStorage     로컬 저장(오프라인/서버 저장 실패 대비)
   호출 시작점은 est-save.js의 _saveEstimateInner. 로직은 한 줄도 안 바꾸고 옮김 - 검증은
   tests/save-golden-master-check.js(저장 동작 기록이 글자 단위로 동일한지 비교).
   ══════════════════════════════════════════════════ */

// 2026-09-19(선혜님 - "노지경님 견적서가 1개였는데 내가 한개를 더
// 넣었어" - 재구매/여러 견적서 고객 시나리오로 발견): customers.price/
// performance_revenue가 "이번에 저장하는 견적서 하나"의 금액으로 매번
// 통째로 덮어써지고 있었음 - 한 고객에게 견적서가 2개 이상이면, 나중에
// 저장한 것의 금액만 남고 이전 견적서 금액은 사라짐(결제 확인/완납
// 판정의 기준 총액이 틀어짐). 기존 고객(수정 모드)이면 저장 직전에
// 이 고객의 다른 견적서들(현재 편집 중인 이 건 제외)을 먼저 조회해서
// 합계를 구한 뒤, 그 합계 + 이번 견적서 금액을 최종 총액으로 반영.
// 신규 고객은 다른 견적서가 있을 수 없으니 조회 없이 바로 진행.
function _saveStage_customers(ctx) {
  // ctx에서 꺼낸 값들 - 예전엔 바깥 함수(_saveEstimateInner)의 변수를 몰래 같이 쓰던 것들
  var name = ctx.name, phone = ctx.phone, addr = ctx.addr, addr2 = ctx.addr2, staffName = ctx.staffName, custMemo = ctx.custMemo, grand = ctx.grand, perf = ctx.perf;
  var existingCustIdForSum = window._estEditState.estSaveCustomerId;
  var excludeEstIdForSum = window._estEditState.editingEstDbId;
  if (existingCustIdForSum && typeof SUPABASE_URL !== 'undefined') {
    var sumXhr = new XMLHttpRequest();
    sumXhr.open('GET', SUPABASE_URL+'/rest/v1/estimates?client_id=eq.'+existingCustIdForSum+'&select=id,price,performance_revenue', true);
    sumXhr.setRequestHeader('apikey', SUPABASE_KEY);
    sumXhr.setRequestHeader('Authorization', 'Bearer '+(typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
    sumXhr.onload = function() {
      var otherGrand = 0, otherPerf = 0;
      try {
        if (sumXhr.status >= 200 && sumXhr.status < 300) {
          var rows = JSON.parse(sumXhr.responseText || '[]');
          rows.forEach(function(r) {
            if (excludeEstIdForSum && String(r.id) === String(excludeEstIdForSum)) return;
            otherGrand += Number(r.price) || 0;
            otherPerf += Number(r.performance_revenue) || 0;
          });
        }
      } catch (eSum) { console.warn('다른 견적서 합계 조회 파싱 실패:', eSum); }
      proceed(otherGrand, otherPerf);
    };
    sumXhr.onerror = function() { console.warn('다른 견적서 합계 조회 실패(네트워크) - 이번 견적서 금액만으로 진행'); proceed(0, 0); };
    sumXhr.send();
  } else {
    proceed(0, 0);
  }
function proceed(otherEstGrand, otherEstPerf) {
  
  _saveStage_localStorage(ctx);

  // 고객명단 구글시트 동기화 (항상 — 가견적/확정 상관없이 현재 상태 반영)
  // 2026-09-22(선혜님 - "비슷하게 예상되는 다른 오류들에 대해 찾아봐"로
  // 발견 - estimate_status 버그와 정확히 같은 계열): 여기도 확정
  // 버튼(estimateConfirmedAt)이 아니라 탭 상태(currentTab)만 보고
  // "확정견적"/"가견적" 라벨을 구글시트에 보내고 있었음 - 구글시트가
  // 실제 DB 확정 상태와 다르게 보일 위험이 있었음.
  var isFinalForDrive = !!window._estEditState.estimateConfirmedAt;
  syncCustomerToSheet({
    clientName: name, phone: phone, addr: addr+(addr2?' '+addr2:''),
    staffName: staffName, stage: isFinalForDrive ? '확정견적' : '가견적',
    price: grand, performanceRevenue: perf,
    date: document.getElementById('c-measure')?.value||'',
    measureDate: document.getElementById('c-measure')?.value||'',
    installDate: document.getElementById('c-install')?.value||'',
    memo: custMemo
  });

  // 견적서는 확정(최종) 견적서일 때만 구글드라이브에 저장 (가견적서는 저장 안 함)
  if (isFinalForDrive && typeof buildCustomerHTML === 'function') {
    try {
      var custDocHtml = buildCustomerHTML();
      saveDocumentToDrive('견적서', name || '미지정고객', phone, custDocHtml);
    } catch(e) { console.warn('견적서 드라이브 저장용 HTML 생성 실패:', e); }
  }
  
  try {
    var xhr=new XMLHttpRequest();
    var existingCustId = window._estEditState.estSaveCustomerId;
    var isUpdate = !!existingCustId;
    xhr.open(isUpdate ? 'PATCH' : 'POST', SUPABASE_URL+'/rest/v1/customers'+(isUpdate ? '?id=eq.'+existingCustId : ''), true);
    // 2026-09-21(선혜님 - "니가 한 자료 계속 똑같은 문제가 생기지
    // 무조건 원인 찾아!!" - 민소아 견적서, 서버 이력엔 그날 기록이
    // 전혀 없던 두 번째 재발로 원인 조사 중 발견): xhr.onload/onerror
    // 콜백이 브라우저 사정으로(탭이 백그라운드로 전환되며 요청이
    // 멈추는 등, 오지은 실장님 태블릿 사례와 같은 유형) 영원히 한
    // 번도 안 불리면, 저장 버튼이 disabled 상태로 영구히 남아 그
    // 이후의 모든 저장 시도가 "if (btn.disabled) return;"에서 로그도
    // 없이 조용히 씹히는 치명적인 경로가 있었음 - 타임아웃을 걸어
    // 일정 시간 안에 응답이 없으면 강제로 실패 처리해서 버튼이 절대
    // 영구히 잠기지 않게 함.
    xhr.timeout = 15000;
    xhr.ontimeout = function(){ logSaveStage('고객저장-타임아웃', null); console.warn('Supabase 고객 저장 타임아웃'); showToast('⚠️ 서버 응답이 없어요(시간초과) — 다시 저장해주세요'); _saveStage_estimates(ctx); };
    xhr.setRequestHeader('apikey',SUPABASE_KEY);
    xhr.setRequestHeader('Authorization','Bearer '+(typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
    xhr.setRequestHeader('Content-Type','application/json');
    // 2026-08-25(선혜님 발견 — "이름을 이라리로 바꿔도 오지은으로 뜬다",
    // 진짜 원인): 여기가 sbXHR(dash-api.js)이랑 완전히 별개인 견적서 앱만의
    // 고객 저장 코드라, 오늘 낮에 sbXHR에 넣은 "0건 반영 감지" 수정이 전혀
    // 적용 안 되고 있었음. 게다가 실패해도 console.warn만 찍고 화면엔
    // 아무 표시도 안 해서, 이름 수정이 서버에 반영이 안 됐는데도 사용자는
    // 전혀 알 방법이 없었음. PATCH도 return=representation으로 받아서
    // 실제 반영 건수를 확인하고, 실패시 화면에 명확히 알림.
    xhr.setRequestHeader('Prefer', 'return=representation');
    xhr.onload=function(){
      logSaveStage('고객저장-응답', { status: xhr.status, isUpdate: isUpdate, bodyLen: (xhr.responseText||'').length });
      if (xhr.status < 200 || xhr.status >= 300) {
        console.warn('Supabase 고객 저장 실패 (status='+xhr.status+'):', xhr.responseText);
        showToast('⚠️ 고객정보가 서버에 저장되지 않았어요(오류 '+xhr.status+') — 새로고침해서 확인해주세요');
      } else {
        var resData = null;
        try { resData = xhr.responseText ? JSON.parse(xhr.responseText) : []; } catch(eP) { resData = null; }
        if (isUpdate && Array.isArray(resData) && resData.length === 0) {
          // 0건 반영 = 권한(RLS) 문제 등으로 서버에 실제로는 아무것도 안 바뀐 것
          showToast('⚠️ 고객정보 수정이 서버에 반영되지 않았어요(권한 문제일 수 있어요) — 새로고침해서 확인해주세요');
        } else if (!isUpdate) {
        // 신규 생성 성공 — 응답으로 받은 진짜 id를 로컬 customer 레코드와 견적이력에도 반영
        try {
          if (resData && resData[0] && resData[0].id) {
            var newId = resData[0].id;
            var arr = JSON.parse(localStorage.getItem('dah_customers')||'[]');
            var idx = arr.findIndex(function(c){ return c.clientName === name && !c.id; });
            if (idx >= 0) { arr[idx].id = newId; localStorage.setItem('dah_customers', JSON.stringify(arr)); }
            var savedArr = JSON.parse(localStorage.getItem('dah_saved')||'[]');
            var sIdx = savedArr.findIndex(function(e){ return e.no === document.getElementById('c-no')?.value.trim() && !e.clientId; });
            if (sIdx >= 0) { savedArr[sIdx].clientId = newId; localStorage.setItem('dah_saved', JSON.stringify(savedArr)); }
            window._estEditState.estSaveCustomerId = newId;
          }
        } catch(e3) { /* 무시 — 로컬 id는 다음 저장시 이름+전화번호로 다시 매칭됨 */ }
        }
      }
      _saveStage_estimates(ctx);
    };
    xhr.onerror=function(){ logSaveStage('고객저장-네트워크오류', null); console.warn('Supabase 고객 저장 실패 (localStorage는 완료)'); showToast('⚠️ 고객정보 저장 실패(네트워크) — 로컬엔 저장됨'); _saveStage_estimates(ctx); };
    var custPayload = {
      client_name:name, phone:phone
    };
    // 2026-08-12: 기존 고객이면 staff_name을 payload에서 제외 - 예전엔
    // 무조건 포함시켜서, 다른 담당자가 이름 검색으로 견적서를 저장하기만
    // 해도 그 고객의 담당자가 조용히 바뀌어버렸음. 담당자가 바뀌면 매출/
    // 실적 귀속도 같이 바뀌므로 이건 부수효과로 조용히 일어나면 절대 안
    // 됨(선혜님 확인) - 담당자 변경은 고객상세 등 명시적 화면에서만.
    // addr과 동일한 패턴: 신규 고객일 때만 포함.
    if (!isUpdate) custPayload.staff_name = staffName;
    // 2026-08-12: 예전엔 여기에 memo:custMemo+' | 커튼:'+grand+'원' 로
    // customers.memo를 덮어쓰고 있었음 — customers.memo(고객상세 메모,
    // 오늘 임시저장 기능까지 붙인 별개 필드)와 estimates.memo(견적서
    // 내부메모)는 서로 다른 용도인데, 이 코드가 매번 견적서 저장할 때마다
    // 고객이 직접 남긴 중요 메모("이 고객 성격 예민함" 등)를 " | 커튼:
    // 200000원" 같은 값으로 통째로 지워버리는 실제 데이터 손실 위험이
    // 있었음(재현 확인함). customers.memo는 절대 여기서 건드리지 않음.
    // 2026-08-05: 기존 고객을 PATCH(업데이트)할 때, 이번 화면에 주소를 안 채웠다고 해서
    // 서버에 저장돼있던 기존 주소까지 빈 값으로 덮어써지면 안 됨. PATCH는 payload에 있는
    // 필드만 갱신하므로, 주소가 비어있을 땐 아예 payload에서 빼서 기존 값이 유지되게 함.
    // (신규 고객이면 addr가 비어있어도 그냥 빈 값으로 시작하는 게 맞아서 그대로 포함)
    var addrCombined = addr+(addr2?' '+addr2:'');
    if (addrCombined || !isUpdate) custPayload.addr = addrCombined;
    // 2026-09-08(선혜님 지시 - "날짜 단일화" 논의 중 "각자 다 다르잖아"로
    // 발견: 재구매 고객은 견적서마다 실측일/시공일이 다름(실제 사례:
    // 김명석 고객이 8/4·8/22에 서로 다른 프로젝트로 2건 견적) - 그래서
    // "고객 레코드에 날짜 하나만"으로 단일화하면 재구매시 이전 견적의
    // 날짜 정보가 사라지는 데이터 손실 위험이 있어 그 방향은 폐기함.
    // 대신: 각 견적서는 그대로 자기만의 날짜를 유지하되(estimates 테이블,
    // 이미 저장되고 있음), 이 견적서를 저장하는 시점에 customers 테이블
    // 에도 "최신 상태"로 함께 반영 - 대시보드가 항상 가장 최근 견적
    // 기준의 실측/시공 일정을 보여주게 됨. addr와 동일한 패턴(이 화면에서
    // 값을 안 건드렸으면(빈 값) payload에서 아예 빼서 기존 값 유지,
    // 값이 있으면 갱신)으로 안전하게 처리 - 실수로 날짜를 지우는 걸 방지.
    var measureDateVal = document.getElementById('c-measure')?.value || '';
    var installDateVal = document.getElementById('c-install')?.value || '';
    var measureTbdVal = document.getElementById('c-measure-tbd')?.checked || false;
    var installTbdVal = document.getElementById('c-install-tbd')?.checked || false;
    if (measureDateVal || measureTbdVal) {
      custPayload.measure_date = measureDateVal || null;
      custPayload.measure_date_tbd = measureTbdVal;
    }
    if (installDateVal || installTbdVal) {
      custPayload.install_date = installDateVal || null;
      custPayload.install_date_tbd = installTbdVal;
    }
    // 확정견적일 때만 고객 실적에 금액 동기화 (2026-08-04 신규) — 예전엔
    // 견적서를 아무리 저장해도 customers.price/performance_revenue가
    // 영구히 0으로 남아서, 신규로 발생하는 모든 고객이 매출탭 계산에
    // 절대 안 잡히는 구조적 결함이었음(이관 데이터만 수동으로 채워놔서
    // 우연히 정상으로 보였을 뿐). 가견적 단계에선 그대로 0으로 둬서,
    // 혹시 오래 방치돼도 하위호환 폴백에 잘못 걸리지 않도록 안전하게 둠.
    //
    // 2026-08-28(선혜님 지적 — "결제도 대시보드쪽에 적으면 견적서에
    // 같이 적어지게 해줘", 최시내 사례로 발견: 선금 200만원을 실제
    // 받았는데도 칸반카드엔 금액이 하나도 안 보였음): 위 gate가
    // "확정견적일 때만"이라 가견적 단계인 고객은 견적을 몇 번을 다시
    // 저장해도 customers.price가 계속 0으로 남아서, 칸반카드의 금액
    // 표시(c.price 기준)와 "선금결제 처리" 필요항목 판단 등이 전부
    // 어긋나고 있었음. price(매출계산 기준금액=화면표시용)는 가견적
    // 단계에서도 항상 최신 견적금액으로 동기화하도록 분리했었음.
    //
    // 2026-08-28(선혜님 재확인 — "실장의 매출은 제품비용만으로 들어가는건데
    // 50%선금 50%잔금으로 진행하면 계산이 안맞지 않니?"): 위에서
    // performance_revenue만 "확정일 때만"으로 남겨뒀던 게 오히려 문제를
    // 만들었음 - 미확정(가견적/실측준비중/선금결제 등) 고객은 performance_
    // revenue가 계속 0으로 남아서, splitCustomerPayments()가 어쩔 수 없이
    // c.price(전체 100%, 레일·시공비 포함)로 폴백해서 매출을 계산하고
    // 있었음(오늘 아침 그 폴백 자체를 도입한 게 부작용을 만든 것).
    // perf 변수 자체가 이미 "커튼·블라인드 총액-할인"(레일·시공비는
    // 애초에 안 들어감, 순수 제품비용)이라 확정 여부와 무관하게 항상
    // 동기화해도 실적 왜곡 위험이 없음 - price와 동일하게 gate 제거.
    custPayload.price = grand + otherEstGrand;
    custPayload.performance_revenue = perf + otherEstPerf;
    xhr.send(JSON.stringify(custPayload));
  } catch(e) { logSaveStage('고객저장-예외', { message: e && e.message, stack: e && e.stack }); console.warn('Supabase 연결 오류:', e); _saveStage_estimates(ctx); }
}
}
function _saveStage_estimates(ctx) {
  // 2026-09-30(선혜님 - "하자" - "둘 다 안 맞는거 같은데 전문업체서는 어떻게 하니" 요청으로
  // 제거): 여기 있던 "오늘 이미 저장된 견적 찾기" 안전장치(2026-08-26 도입, 08-31 한 번 더
  // 보강)를 완전히 제거함. 실제로 "노지경 고객에게 견적서를 4개 연속으로 만들면 몇 개가
  // 남는가"를 직접 재현해서 확인한 결과, 이 안전장치가 매번 오늘 만든 이전 견적서를 찾아
  // PATCH로 계속 덮어써서 4개를 만들어도 서버엔 항상 1개만 남는 것을 확인함 - "실수로
  // 중복 저장"과 "의도적으로 두 번째 견적서를 만드는 것"을 이 로직(같은 날 + 같은 고객
  // 이라는 조건만 봄)은 구분할 방법이 없어서, 후자를 전자로 착각해 데이터를 조용히
  // 합쳐버리고 있었음.
  //
  // "실수로 중복 저장"을 막는 진짜 안전장치는 이미 따로 있음 - 이 저장 시도(재시도 포함)
  // 전체에서 동일하게 유지되는 client_idempotency_key + DB의
  // estimates_idempotency_key_uniq 유니크 제약. 같은 저장 시도가 반복되면(네트워크 재시도,
  // 따닥 클릭) 이 키가 정확히 막아주고, 다른 저장 시도(사용자가 의도적으로 새로 만든 것)는
  // 항상 새 키를 받으므로 절대 안 걸림 - "날짜+고객"이라는 이 안전장치보다 훨씬 정확한
  // 판단 기준. est-sync-queue.js가 이미 밝힌 원칙("데이터 유실보다 가끔 중복행이 훨씬
  // 나은 선택")을 여기에도 동일하게 적용 - 아주 드물게 진짜 중복행이 생기더라도(이미
  // dahScanForDuplicates가 매일 스캔해서 알려줌), 서로 다른 두 견적서를 조용히 하나로
  // 합쳐 데이터를 잃는 것보다 훨씬 안전함.
  _saveStage_estimatesActual(ctx);
}
function _saveStage_estimatesActual(ctx) {
  // ctx에서 꺼낸 값들 - 예전엔 바깥 함수(_saveEstimateInner)의 변수를 몰래 같이 쓰던 것들
  var onDone = ctx.onDone, name = ctx.name, phone = ctx.phone, staffName = ctx.staffName, custMemo = ctx.custMemo, grand = ctx.grand, perf = ctx.perf, spaceStr = ctx.spaceStr, fabricStr = ctx.fabricStr, lineItems = ctx.lineItems;
  // 2026-08-05: 재시도 큐에서도 그대로 재사용할 수 있도록 payload를 변수로 분리
  // 2026-08-05: 중복행 방지용 idempotency key — 이 저장 시도(재시도 포함) 전체에서
  // 동일한 값을 유지. "서버는 실제로 성공했는데 응답을 못 받아 실패로 오판"해서
  // 재시도했을 때, DB의 유니크 제약(estimates_idempotency_key_uniq)이 중복 삽입을
  // 막아주고, 그 409 응답을 "이미 저장됨"으로 해석해서 정상 처리함.
  // 2026-09-30(선혜님 - "전문업체 기준으로 봤을때 맞아?" 지적으로 발견한 구조적 결함 수정):
  // 이 키는 원래 resetEstEditingState()가 편집 세션 시작 시점에 한 번만 만들어 두는
  // 전제였는데, 실제로 그 함수를 부르는 진입경로가 "고객 불러오기"와 "새 견적서" 버튼
  // 단 둘뿐이었음 - 빈 화면으로 새로 열기/mode=edit/mode=copy로 들어오면 이 함수 자체가
  // 안 불려서 키가 계속 비어있었고, 그러면 매번 여기서 즉석으로 새 키를 만들기만 하고
  // 어디에도 저장을 안 해서(다음 저장 시도 때 또 새 키) idempotency가 사실상 무력화돼
  // 있었음. 진입경로를 하나씩 찾아 고치는 대신(똑같은 클래스의 "깜빡함"이 나중에 또
  // 재발할 수 있음), 저장이 실제로 실행되는 이 한 지점 자체가 "키가 없으면 지금 만들고
  // 앞으로 계속 재사용"하도록 스스로 보장하게 함 - 어떤 새 진입경로가 생기더라도 구조적으로
  // 안전.
  if (!window._estEditState.currentEstIdempotencyKey) {
    window._estEditState.currentEstIdempotencyKey = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('est-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  }
  var estPayloadForRetry = Object.assign({
    client_idempotency_key: window._estEditState.currentEstIdempotencyKey,
    customer_name:name, price:grand,
    performance_revenue:perf, staff_name:staffName,
    // 2026-09-22(선혜님 지적 - "PC에서 확정을 하고 핸드폰에서 보면
    // 확정이 풀려있어" - 최금희 실사례로 발견): estimate_status가
    // "확정" 버튼(estimateConfirmedAt)과 무관하게, 그 순간 "가견적서/
    // 최종견적서" 탭이 뭐였는지(currentTab)만 보고 정해지고 있었음 -
    // 확정 버튼을 안 눌러도 "최종견적서" 탭만 보고 있다가 저장하면
    // estimate_status='final'로 저장되고, 반대로 확정 버튼을 눌러도
    // "가견적서" 탭이면 'ga'로 저장돼서, 대시보드(estimate_status
    // 기준으로 "확정견적" 표시)와 견적서 앱 자체(estimateConfirmedAt
    // 기준으로 잠금 표시)가 서로 다른 걸 보여주는 근본 원인이었음.
    // "확정"이라는 하나의 진짜 기준(확정 버튼)에서만 파생되게 통일 -
    // 탭 선택은 순전히 화면에 어떤 스타일로 보여줄지 정하는 것일 뿐,
    // 저장되는 확정 여부와는 무관해야 함.
    estimate_status: window._estEditState.estimateConfirmedAt ? 'final' : 'ga',
    phone:phone, space:spaceStr, product:fabricStr,
    date: document.getElementById('c-measure')?.value || '',
    // 2026-08-28(선혜님 지적 — "견적서에 시공일을 적어놔도 없어져"):
    // 시공일(c-install)이 지금까지 구글시트 동기화(syncCustomerToSheet)
    // 에만 보내지고, 정작 견적서 DB(estimates 테이블)엔 저장할 컬럼
    // 자체가 없었음 - 그래서 적어도 저장할 곳이 없어 사라진 것처럼
    // 보였음. install_date 컬럼을 새로 추가하고 여기서 함께 저장.
    install_date: document.getElementById('c-install')?.value || '',
    // 2026-09-04(선혜님 요청 - "실측일 시공일은 <날짜미정>도 체크될 수
    // 있게 해줘"): "날짜미정" 체크박스 상태도 저장 - 저장/복원 시
    // 이 값을 기준으로 체크박스와 날짜입력 비활성화 상태를 되살림.
    measure_date_tbd: document.getElementById('c-measure-tbd')?.checked || false,
    install_date_tbd: document.getElementById('c-install-tbd')?.checked || false,
    memo: custMemo,
    confirmed_at: window._estEditState.estimateConfirmedAt || null,
    branch: '반포점',
    client_id: window._estEditState.estSaveCustomerId || null,
    line_items: lineItems,
    cust_type: currentCustType || 'new',
    // 2026-09-30(선혜님 - "복사해서 견적서 하나를 더 만들었는데 없어졌어"로 발견): 당시
    // "신규 저장 payload에 is_archived가 없으면 DB 기본값(NULL로 추정)에 의존하게 되고,
    // PostgREST의 IS FALSE가 NULL을 걸러내서 목록에서 빠질 수 있다"는 이론으로 이 수정을
    // 넣었음 - 그런데 같은 날 dahDiagnoseSchema로 실제 DB를 열어 직접 확인해보니, estimates.
    // is_archived의 실제 기본값은 NULL이 아니라 false였음(이론이 틀렸음을 인정). 즉 그 "사라짐"
    // 증상의 진짜 원인은 이 필드와 무관하게, 같은 날 함께 발견·제거한 "오늘 이미 저장된 견적
    // 찾기" 병합 로직(아래 _saveStage_estimates 참고)이었음. 이 explicit false 자체는 틀린
    // 진단에서 나온 수정이지만 해롭지는 않으므로 그대로 둠 - 신규 레코드가 항상 명시적으로
    // 보관 안 된 상태로 시작하는 건 DB 기본값이 무엇이든 옳은 방어적 습관임. PATCH(수정저장)
    // 때는 이 필드를 아예 안 보내서(undefined는 JSON.stringify에서 키째 빠짐) 이미 보관
    // 처리된 견적서가 열어서 저장만 해도 조용히 보관 해제되는 부작용은 계속 방지함.
    is_archived: window._estEditState.editingEstDbId ? undefined : false,
    region: document.getElementById('c-region')?.value || '',
    // 2026-08-14: 할인 정보 자체가 지금까지 저장 안 되고 있던 필드누락을
    // 쿠폰 다중선택 기능 만들면서 같이 발견/해결 - 재구매/열어서수정시
    // 어떤 쿠폰이 선택돼있었는지 정확히 복원하기 위해 저장.
    applied_discounts: window._estEditState.lastAppliedDiscounts || { coupons: [], manual: null },
    // 2026-08-24(선혜님 확인 — "다시 열어도 저장 당시 금액 그대로"): 제품소계/
    // 시공자재/할인/최종금액/계약금/잔금 스냅샷을 같이 저장. 안 하면 견적을
    // 나중에 다시 열었을 때 그 사이 바뀐 할인쿠폰/설정으로 재계산되어 금액이
    // 달라지는 문제가 있었음(최시내님 사례로 발견 — 저장시 482만원이었는데
    // 나중에 다시 여니 490.9만원으로 나옴).
    price_breakdown: window._estEditState.lastCalcBreakdown || null
  }, currentCustType === 'as' ? {
    as_install_date: document.getElementById('as-install-date')?.value || null,
    as_type: document.getElementById('as-type-sel')?.value || null,
    as_symptom: document.getElementById('as-symptom')?.value || null,
    as_photo_memo: document.getElementById('as-photo-memo')?.value || null,
    as_fee_type: (document.querySelector('input[name="as-fee"]:checked')?.value) || 'free'
  } : {});
  try {
    var xhr2=new XMLHttpRequest();
    // 2026-08-12: "견적서 이력에서 특정 견적서를 열어 수정" 기능 추가를 위한
    // 기반 작업 — 예전엔 항상 POST(신규)만 해서, 같은 견적서를 다시 저장해도
    // 서버엔 계속 새 레코드가 쌓였음(로컬만 no기준으로 덮어써짐, 서버는 중복
    // 축적). window._estEditState.editingEstDbId가 있으면(견적서이력의 "열어서 수정"으로
    // 진입한 경우) PATCH로 그 레코드 자체를 갱신, 없으면(신규작성/"복사해서
    // 새로만들기") 기존처럼 POST — 이 경우 응답에서 생성된 id를 받아 로컬에
    // dbId로 저장해둬야 다음번에 "열어서 수정"이 가능해짐.
    var isEditMode = !!window._estEditState.editingEstDbId;
    // 2026-08-13: 동시편집 충돌 방지(낙관적 잠금) - PATCH할 때 "내가 불러온
    // 시점의 updated_at"도 조건에 포함시켜서, 그 사이 다른 사람(다른 탭/다른
    // 스태프)이 먼저 저장했으면(=updated_at이 달라졌으면) 이번 PATCH가 0건
    // 매칭되어 아무것도 안 바뀜 - 이걸로 "덮어쓰기 충돌"을 감지해서 조용히
    // 데이터를 잃지 않고 사용자에게 알림.
    var lockUpdatedAt = window._estEditState.editingEstUpdatedAt || null;
    if (isEditMode) {
      var patchUrl = SUPABASE_URL+'/rest/v1/estimates?id=eq.'+encodeURIComponent(window._estEditState.editingEstDbId);
      if (lockUpdatedAt) patchUrl += '&updated_at=eq.'+encodeURIComponent(lockUpdatedAt);
      xhr2.open('PATCH', patchUrl, true);
    } else {
      xhr2.open('POST', SUPABASE_URL+'/rest/v1/estimates', true);
    }
    xhr2.setRequestHeader('apikey',SUPABASE_KEY);
    xhr2.setRequestHeader('Authorization','Bearer '+(typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
    xhr2.setRequestHeader('Content-Type','application/json');
    // 2026-09-21: 고객저장(xhr)과 동일한 이유로 견적서 저장(xhr2)에도
    // 타임아웃 추가 - 응답 콜백이 영원히 안 불리면 버튼이 영구히
    // 잠긴 채 남는 것을 방지.
    xhr2.timeout = 15000;
    xhr2.ontimeout = function(){
      logSaveStage('견적서저장-타임아웃', null);
      console.warn('Supabase 견적서 저장 타임아웃');
      showToast('⚠️ 서버 응답이 없어요(시간초과) — 저장이 안 됐을 수 있어요, 다시 저장해주세요');
      if (typeof addToEstPendingQueue === 'function') addToEstPendingQueue(estPayloadForRetry, isEditMode, window._estEditState.editingEstDbId);
      onDone();
    };
    // 2026-08-25(선혜님 발견 — "저장했는데 나중에 수정이 안 됨", 진짜
    // 원인): 수정(PATCH) 저장인데 updated_at 잠금값이 없는 경우엔
    // return=minimal을 써서, 서버가 실제로 몇 건을 바꿨는지 전혀 확인을
    // 안 하고 있었음. 최근 적용된 보안규칙(담당자 이름이 안 맞으면 그
    // 견적 수정 자체가 조용히 0건 처리됨) 때문에, 이 경우 실제로는 아무것도
    // 안 바뀌었는데도 무조건 "저장 완료!"가 떠서 대표님이 데이터가 사라진
    // 걸 전혀 알 방법이 없었음. 수정 저장은 항상 return=representation으로
    // 받아서 실제 몇 건이 바뀌었는지 확인하도록 수정.
    // 2026-09-22(선혜님 - "버그를 고쳐도 왜 같은 버그가 생기지, 쌍둥이
    // 함수까지 찾아" 지시로 끝까지 추적해서 발견한 진짜 근본원인 -
    // 최금희 견적서 매출기준금액 2배 부풀림 사건): 이 줄이 완전히
    // 거꾸로였음 - isEditMode(수정)일 때 return=representation을 쓰는
    // 건 맞지만, 신규 저장(!isEditMode, POST)일 때 정확히 그 반대
    // (return=minimal, 빈 응답)를 쓰고 있었음. 근데 바로 아래 코드가
    // "신규 저장이면(!isEditMode) 응답에서 새로 생성된 id를 파싱해
    // editingEstDbId에 저장"하는 로직이라, 이 두 부분이 정확히 서로
    // 모순됐음: 신규 저장 성공 직후 응답 바디가 항상 비어있어서
    // JSON.parse('')가 예외를 던지고, editingEstDbId가 설정되지
    // 않은 채로 남음. 그 상태에서 같은 화면을 재저장하면(최금희님처럼
    // 확인창이 뜨는 사이 다시 눌러서), saveToCustomers()의 "다른
    // 견적서 합계" 조회가 자기 자신(방금 만든 그 견적서)을 editingEstDbId
    // 로 제외해야 하는데 그 값이 비어있으니 제외를 못 하고 그대로 세어서,
    // 매출기준금액이 정확히 2배로 부풀려짐(재현 테스트로 20,000→40,000
    // 확정). saveToEstimates() 시작부의 "오늘 이미 저장된 것 찾기"
    // 서버 조회가 나중에 editingEstDbId를 복구하긴 하지만, 그건
    // saveToCustomers()보다 항상 나중에 실행되어 이미 늦음. 신규
    // 저장도 언제나 return=representation으로 통일해서 생성된 id를
    // 확실히 받도록 수정 - 이게 근본적인 해결책(늦게 복구하는 방식에
    // 의존하지 않음).
    xhr2.setRequestHeader('Prefer', 'return=representation');
    xhr2.onload=function(){
      logSaveStage('견적서저장-응답', { status: xhr2.status, isEditMode: isEditMode, bodyLen: (xhr2.responseText||'').length });
      if (xhr2.status >= 200 && xhr2.status < 300) {
        // 수정 저장인데 응답이 빈 배열이면 = 0건 매칭 = 실제로 아무것도
        // 안 바뀐 것(담당자 불일치로 보안규칙에 막혔거나, updated_at
        // 잠금이 걸려있었다면 그 사이 다른 곳에서 먼저 저장한 것).
        if (isEditMode) {
          try {
            var lockCheckRows = JSON.parse(xhr2.responseText);
            if (Array.isArray(lockCheckRows) && lockCheckRows.length === 0) {
              showToast(lockUpdatedAt
                ? '⚠️ 이 견적서가 방금 다른 곳에서 먼저 저장됐어요 — 새로고침해서 최신 내용을 확인해주세요 (내 변경사항은 안전하게 백업됐어요)'
                : '⚠️ 저장이 서버에 반영되지 않았어요 (권한 문제일 수 있어요) — 마스터님께 알려주세요. 내 변경사항은 안전하게 백업됐어요');
              // 2026-08-31(선혜님 지적 — "앞으로 다른 견적서도 확정을
              // 누르면 지워진다는 말이니, 복구 못하는게 말이 되니"로
              // 발견·수정): 저장이 서버에 막혔을 때(권한 문제 등) "강제
              // 재시도는 위험하니 큐에 안 넣는다"는 판단까지는 맞지만,
              // 그럼 그 내용 자체를 아예 어디에도 안 남기고 있었음 -
              // 유일한 백업이던 자동저장 초안(dah_estimate_draft)도
              // 60분 지나면 지워지는 임시용이라, 신화경 사례처럼 며칠
              // 뒤엔 이미 사라지고 없었음. 재시도는 안 하되(위험 방지는
              // 유지), 이 payload 자체는 기한 없이 별도 보관해서 절대
              // 사라지지 않게 함 - 나중에 마스터가 이 백업을 보고 수동
              // 으로 확인/재저장할 수 있음.
              try {
                var failedSaves = JSON.parse(localStorage.getItem('dah_failed_saves')||'[]');
                failedSaves.push({
                  savedAt: new Date().toISOString(),
                  reason: lockUpdatedAt ? '동시저장충돌' : '권한문제(담당자불일치 추정)',
                  editingEstDbId: window._estEditState.editingEstDbId,
                  payload: estPayloadForRetry
                });
                if (failedSaves.length > 50) failedSaves = failedSaves.slice(-50); // 무한정 쌓이지 않게 최근 50건만
                localStorage.setItem('dah_failed_saves', JSON.stringify(failedSaves));
              } catch(eBackup) { /* 백업 자체가 실패해도 저장 흐름엔 영향 안 줌 */ }
              // 로컬 백업은 "이 브라우저/이 기기"에서만 확인 가능한 한계가
              // 있어서, 어느 기기에서든 마스터가 확인할 수 있게 서버
              // (client_error_logs, 이미 있던 자동 에러수집 채널)에도
              // 같은 내용을 함께 남김.
              if (typeof reportClientError === 'function') {
                reportClientError(
                  '견적서 저장 실패(권한문제 또는 동시저장충돌) - 내용 백업됨',
                  null,
                  { estPayload: estPayloadForRetry, reason: lockUpdatedAt ? '동시저장충돌' : '권한문제' }
                );
              }
              // 2026-09-05(선혜님 지시 - "더 파자"로 발견, 실제 DB
              // 로그로 재현 확인): 동시저장충돌 감지 후에도 window.
              // window._estEditState.editingEstUpdatedAt(락값)을 갱신하는 코드가 없어서,
              // 사용자가 재시도해도 계속 예전(불일치) 락값 그대로
              // 재시도하게 되어 매번 같은 이유로 또 실패하는 반복이
              // 있었음(실제 client_error_logs에서 6분 사이 5번, 1분
              // 사이 3번 연속 같은 견적서 저장 실패 패턴으로 확인) -
              // 최신 updated_at을 자동으로 다시 조회해서 락값을 갱신함.
              // 이건 "자동으로 덮어쓰기 허용"이 아니라 - 다음 저장
              // 시도가 최소한 최신 상태 기준으로 이루어지게 해서,
              // 진짜 내용 충돌이면 사용자가 새로고침해서 직접 확인하고,
              // 아니라면(예: 다른 창에서 사소한 값만 갱신됐던 경우)
              // 재시도가 무의미하게 반복되지 않도록 함.
              // 2026-09-05(선혜님 지적 - "전문업체라면 이 경우 어떻게
              // 처리할까"로 발견한 구조적 문제): 이 로직을 est-save.js와
              // dash-api.js에 각각 복사해뒀던 걸 shared-optimistic-lock.js
              // 공용 함수로 뽑아냄 - 조회 로직 자체의 버그는 이제 고칠
              // 곳이 한 곳뿐이라, 한쪽만 고치고 깜빡하는 실수가 구조적
              // 으로 불가능해짐.
              if (lockUpdatedAt && window._estEditState.editingEstDbId && typeof fetchLatestUpdatedAt === 'function') {
                fetchLatestUpdatedAt('estimates', window._estEditState.editingEstDbId, function(freshUpdatedAt) {
                  if (freshUpdatedAt) window._estEditState.editingEstUpdatedAt = freshUpdatedAt;
                });
              }
              onDone();
              return;
            }
            // 성공 - 다음 저장을 위해 최신 updated_at 갱신
            if (lockCheckRows[0] && lockCheckRows[0].updated_at) window._estEditState.editingEstUpdatedAt = lockCheckRows[0].updated_at;
          } catch(eLock) {
            // 응답 파싱 실패 = 실제로 뭐가 바뀌었는지 확인 불가 상태 —
            // 조용히 "성공"으로 넘어가지 않고 확인 필요하다고 알림
            showToast('⚠️ 저장 결과를 확인할 수 없어요 — 새로고침해서 반영됐는지 꼭 확인해주세요');
            onDone();
            return;
          }
        }
        showToast('저장 완료! (DB+로컬)');
        if (!isEditMode) {
          try {
            var createdRows = JSON.parse(xhr2.responseText);
            var newDbId = createdRows && createdRows[0] && createdRows[0].id;
            if (newDbId) {
              window._estEditState.editingEstDbId = newDbId; // 이후 같은 화면에서 재저장하면 이제부터 수정모드
              window._estEditState.editingEstUpdatedAt = createdRows[0].updated_at || null;
              var localArr = JSON.parse(localStorage.getItem('dah_saved')||'[]');
              var lastIdx = localArr.length - 1;
              // 2026-08-24: 여기서도 .dbId만 갱신하고 .id는 그대로 둬서, 첫 저장
              // 직후부터 이미 로컬 항목과 클라우드 항목이 서로 다른 id로 갈라져
              // 있었음(위 idx 매칭 로직 수정과 같은 원인). .id도 같이 서버 UUID로
              // 맞춰서 이후 클라우드 동기화시 정확히 같은 레코드로 병합되게 함.
              if (lastIdx >= 0) { localArr[lastIdx].dbId = newDbId; localArr[lastIdx].id = newDbId; localStorage.setItem('dah_saved', JSON.stringify(localArr)); }
            }
          } catch(eParse) {}
        }
      } else if (xhr2.status === 409) {
        // 2026-08-05: idempotency key 중복 = 이전 시도가 실제로는 이미 성공했었다는 뜻
        // (응답만 유실됐던 것) — 실패가 아니라 정상 처리
        console.log('견적서 이미 저장됨(idempotency key 중복, 정상):', xhr2.responseText);
        showToast('저장 완료! (DB+로컬)');
      } else {
        console.warn('Supabase 견적서 저장 실패 (status='+xhr2.status+'):', xhr2.responseText);
        showToast('⚠️ 서버 저장 실패 — 이 기기에만 임시 저장됐어요, 자동 재시도할게요');
        // 2026-08-05: 실패하면 그걸로 끝이라 나중에 수동으로 다시 저장해야 했음 —
        // 재시도 큐에 등록해서 네트워크 복구시 자동으로 다시 시도되도록 함
        if (typeof addToEstPendingQueue === 'function') addToEstPendingQueue(estPayloadForRetry, isEditMode, window._estEditState.editingEstDbId);
      }
      onDone(); // 2026-08-24: 성공/409/실패 모든 경우에 버튼 다시 눌러도 되게 원상복구
    };
    xhr2.onerror=function(){
      logSaveStage('견적서저장-네트워크오류', null);
      console.warn('Supabase 견적서 저장 실패 (localStorage는 완료)');
      showToast('⚠️ 서버 저장 실패 — 이 기기에만 임시 저장됐어요, 자동 재시도할게요');
      if (typeof addToEstPendingQueue === 'function') addToEstPendingQueue(estPayloadForRetry, isEditMode, window._estEditState.editingEstDbId);
      onDone();
    };
    xhr2.send(JSON.stringify(estPayloadForRetry));
  } catch(e) {
    logSaveStage('견적서저장-예외', { message: e && e.message, stack: e && e.stack });
    console.warn('Supabase 연결 오류:', e);
    showToast('⚠️ 서버 저장 실패 — 이 기기에만 임시 저장됐어요, 자동 재시도할게요');
    if (typeof addToEstPendingQueue === 'function') addToEstPendingQueue(estPayloadForRetry, isEditMode, window._estEditState.editingEstDbId);
    onDone();
  }
}
function _saveStage_localStorage(ctx) {
  // ctx에서 꺼낸 값들 - 예전엔 바깥 함수(_saveEstimateInner)의 변수를 몰래 같이 쓰던 것들
  var name = ctx.name, phone = ctx.phone, addr = ctx.addr, addr2 = ctx.addr2, staffName = ctx.staffName, custMemo = ctx.custMemo, grand = ctx.grand, perf = ctx.perf, spaceStr = ctx.spaceStr, fabricStr = ctx.fabricStr, lineItems = ctx.lineItems;
  try {
    var saved = JSON.parse(localStorage.getItem('dah_saved')||'[]');
    var noStr = document.getElementById('c-no').value.trim();
    // 2026-09-22(선혜님 - "비슷하게 예상되는 다른 오류들에 대해
    // 찾아봐"로 발견 - estimate_status 버그와 정확히 같은 계열): 로컬
    // 캐시에 저장되는 이 값도 탭 상태가 아니라 확정 버튼 기준으로
    // 통일 - 이 캐시를 읽는 여러 화면(견적서 목록, 대시보드 이력 등)
    // 이 전부 실제 확정 여부와 다른 걸 보여줄 위험이 있었음.
    var isFinal = !!window._estEditState.estimateConfirmedAt;
    var curtainCount = document.querySelectorAll('#curtain-body tr').length;
    var blindCount = document.querySelectorAll('#blind-body tr').length;
    var itemCount = curtainCount + blindCount;

    // 품목별 거래처 정보 수집 (2026-07-21 신규) — 대시보드 발주현황에서
    // 자동으로 채워쓸 수 있도록, 커튼/블라인드 각각의 거래처를 중복없이 저장
    var curtainVendors = Array.from(document.querySelectorAll('#curtain-body tr .c-vendor'))
      .map(function(el){ return el.value.trim(); }).filter(Boolean);
    var blindVendors = Array.from(document.querySelectorAll('#blind-body tr .c-vendor'))
      .map(function(el){ return el.value.trim(); }).filter(Boolean);
    var uniqCurtainVendors = curtainVendors.filter(function(v,i){ return curtainVendors.indexOf(v)===i; });
    var uniqBlindVendors = blindVendors.filter(function(v,i){ return blindVendors.indexOf(v)===i; });

    var editingDbId = window._estEditState.editingEstDbId || null;
    var idx = saved.findIndex(function(e){ return (editingDbId && (e.dbId === editingDbId || e.id === editingDbId)) || e.no === noStr; });
    var entry = {
      // 2026-08-24(선혜님 발견 — "이 두개의 견적번호가 다른 이유는?": 같은 저장인데
      // 로컬 목록엔 실제 서버 UUID(56ab6596...)랑 로컬 표시번호(DAH-20260824-03)
      // 둘로 쪼개져서 영원히 안 합쳐지고 있었음): 클라우드에서 동기화해온 항목은
      // .id에 항상 서버 UUID를 쓰는데(estimateDbRowToLocal 참고), 로컬 저장
      // 항목은 .id에 표시번호(noStr)를 쓰고 있어서 서로 다른 값으로 취급되어
      // loadEstimatesAsync의 병합 로직(cloudIds.indexOf(e.id)===-1이면 "로컬전용"
      // 으로 간주해 계속 보존)이 절대 같은 레코드로 인식을 못 했음. 이미 서버
      // id를 아는 경우(수정 모드)엔 .id를 서버 UUID로 맞춰서 클라우드 동기화때
      // 정확히 같은 레코드로 병합/치환되도록 함.
      id: editingDbId || noStr || ('local-'+Date.now()),
      no: noStr,
      dbId: editingDbId || (idx >= 0 ? saved[idx].dbId : null) || null,
      clientName: name,
      phone: phone,
      addr: addr+(addr2?' '+addr2:''),
      space: spaceStr,
      fabric: fabricStr,
      itemCount: itemCount,
      curtainCount: curtainCount,
      blindCount: blindCount,
      curtainVendors: uniqCurtainVendors,
      blindVendors: uniqBlindVendors,
      price: grand,
      performanceRevenue: perf,
      staffName: staffName,
      status: isFinal ? 'final' : 'ga',   
      contractStatus: isFinal ? 'contracted' : 'pending', // 2026-08-04: 최종견적서로 저장하면 계약상태도 자동 동기화(예전엔 별개로 남아 "최종견적서"인데 "가견적"으로 모순되게 보이던 문제)
      savedAt: new Date().toISOString(),
      expiryAt: new Date(Date.now()+7*24*60*60*1000).toISOString(),
      date: document.getElementById('c-measure')?.value || '',
      installDate: document.getElementById('c-install')?.value || '',
      memo: custMemo,
      confirmedAt: window._estEditState.estimateConfirmedAt || null,
      branch: '반포점',
      lineItems: lineItems,
      custType: currentCustType || 'new',
      region: document.getElementById('c-region')?.value || '',
      appliedDiscounts: window._estEditState.lastAppliedDiscounts || { coupons: [], manual: null }
    };
    if (currentCustType === 'as') {
      entry.asInstallDate = document.getElementById('as-install-date')?.value || null;
      entry.asType = document.getElementById('as-type-sel')?.value || null;
      entry.asSymptom = document.getElementById('as-symptom')?.value || null;
      entry.asPhotoMemo = document.getElementById('as-photo-memo')?.value || null;
      entry.asFeeType = (document.querySelector('input[name="as-fee"]:checked')?.value) || 'free';
    }
    if (idx >= 0) saved[idx] = entry;
    else saved.unshift(entry);
    
    if (saved.length > 500) saved = saved.slice(0, 500);
    localStorage.setItem('dah_saved', JSON.stringify(saved));

    
    try {
      var customers = JSON.parse(localStorage.getItem('dah_customers')||'[]');
      // ⚠️ 예전엔 cidx를 entry.id(견적서번호, 저장마다 값이 다름)로 찾아서, 같은 고객이
      // 여러 번 저장할 때마다(가견적→확정견적 등) 매번 새 레코드가 로컬에 쌓이는 버그가 있었음.
      // 이제 "이름+전화번호"로 기존 고객을 찾아서, 있으면 그 고객의 진짜 id(Supabase UUID)를
      // 유지한 채 갱신하고, 없을 때만 새로 만든다.
      var normPhone = function(p){ return (p||'').replace(/\D/g,''); };
      // 2026-08-25(선혜님 발견 — "이름을 이라리로 바꿔도 오지은으로 뜬다",
      // 진짜 원인): 이름+전화번호로만 기존 고객을 찾다 보니, "이름을 바꾸는"
      // 상황 자체에서 항상 매칭에 실패했음(바뀐 새 이름은 로컬에 없으니 당연히
      // 못 찾음) — 그래서 수정이 아니라 매번 완전히 새 고객으로 만들어지고
      // 있었음. 이미 "이 견적은 이 고객 것"이라고 알고 있는 id(고객 불러오기로
      // 로드했거나 이전에 이미 저장해서 알고 있는 경우 window._estEditState.estSaveCustomerId
      // 에 남아있음)가 있으면 이름이 바뀌었어도 그 id를 최우선으로 써서 정확히
      // "수정"으로 처리되게 함 — 이름+전화번호 매칭은 그 id를 모를 때(진짜
      // 신규/다른 고객 가능성)만 보조적으로 사용.
      var knownId = window._estEditState.estSaveCustomerId || null;
      var cidx = knownId
        ? customers.findIndex(function(c){ return String(c.id) === String(knownId); })
        : customers.findIndex(function(c){
            return c.clientName === entry.clientName && normPhone(c.phone) === normPhone(entry.phone);
          });
      var existingId = cidx >= 0 ? customers[cidx].id : null;
      entry.clientId = existingId; // dah_saved(견적이력)에도 고객 고유번호 반영
      localStorage.setItem('dah_saved', JSON.stringify(saved));
      var custEntry = {
        id: existingId, // 기존 고객이면 진짜 id 유지, 신규면 null(Supabase 저장 응답으로 채워짐)
        clientName: entry.clientName,
        phone: entry.phone,
        addr: entry.addr,
        space: entry.space,
        price: entry.price,
        performanceRevenue: entry.performanceRevenue,
        staffName: entry.staffName,
        stage: entry.contractStatus === 'contracted' ? '확정견적' : '가견적',
        date: entry.date || new Date().toISOString().slice(0,10),
        measureDate: document.getElementById('c-measure')?.value || '',
        installDate: entry.installDate || '',
        memo: entry.memo || '',
        visitCount: 1,
        estimateNo: entry.no,
        estimateStatus: entry.status,
        createdAt: entry.savedAt
      };
      if (cidx >= 0) {
        // 2026-08-05: stage/visitCount는 이미 "새 값이 없으면 기존값 유지"로 안전하게
        // 처리돼 있었는데, addr/space/memo는 이 보호가 빠져있었음 — 그래서 예전에
        // 주소를 입력해뒀어도, 나중에 주소칸이 빈 상태로 다른 견적서를 저장하면
        // (예: 빠른 가격 확인용으로 새 견적서 폼을 열었을 때) 조용히 지워지는 버그가
        // 있었음. 같은 방식으로 보호.
        custEntry.stage = customers[cidx].stage || custEntry.stage;
        custEntry.visitCount = customers[cidx].visitCount || 1;
        custEntry.addr = custEntry.addr || customers[cidx].addr;
        custEntry.space = custEntry.space || customers[cidx].space;
        custEntry.memo = custEntry.memo || customers[cidx].memo;
        customers[cidx] = Object.assign(customers[cidx], custEntry);
      } else {
        customers.unshift(custEntry);
      }
      localStorage.setItem('dah_customers', JSON.stringify(customers));
      window._estEditState.estSaveCustomerId = existingId; // saveToCustomers/saveToEstimates에서 사용
    } catch(e2) { console.warn('dah_customers 동기화 실패', e2); }

  } catch(e) { console.warn('localStorage 저장 실패', e); }
}
