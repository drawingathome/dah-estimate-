/* ══════════════════════════════════════════════════
   DAH 대시보드 — 고객 DB 쓰기 (저장/선점/보관/삭제/복구/리드보류)
   2026-09-24(선혜님 - "나눌수 있는건 다 나눠보자" - 큰 파일 쪼개기 4차): claimCustomer,
   saveCustomerToDb, patchCustomerFieldsToDb, saveCustomerFieldsToDb, archiveEstimate, permanentlyDeleteCustomerFromDb, restoreCustomerFromDb,
   parkLead, unparkLead 등 "쓰기" 함수들만 분리함. 코드 내용은 한 줄도 안 바꾸고 위치만 옮김.
   ══════════════════════════════════════════════════ */


// 2026-09-15("전문업체면 어떻게 하는게 나을까"로 결정): "고객을 담당으로
// 가져가기"가 두 곳(홈화면 미배정 선착순, 고객상세 담당변경)에 각자
// 다른 안전장치로 따로 구현돼 있던 걸 발견 - 서버에 "지금 담당자가
// 내가 예상한 사람과 같을 때만 저장"하는 조건부 PATCH(선착순 로직의
// 핵심 안전장치)를 범용화해서 하나로 합침. expectedCurrentStaff에
// '미배정'을 넘기면 기존 "선착순 배정"과 동일하게 동작하고, 실제
// 담당자 이름을 넘기면 "지금 이 사람이 담당인 게 맞을 때만 나에게로
// 변경"이 되어 고객상세의 "본인 지정" 용도로도 그대로 쓸 수 있음.
function claimCustomer(customerId, expectedCurrentStaff, newStaffName, callback) {
  sbXHR('PATCH', 'customers?id=eq.' + encodeURIComponent(customerId) + '&staff_name=eq.' + encodeURIComponent(expectedCurrentStaff || '미배정'),
    { staff_name: newStaffName },
    function (err, rows) {
      if (err) { callback(err); return; }
      var all = loadCustomers();
      var target = all.find(function (c) { return String(c.id) === String(customerId); });
      if (target) { target.staffName = newStaffName; saveCustomers(all); }
      if (typeof logEvent === 'function') logEvent('claim_customer', { customerId: customerId, from: expectedCurrentStaff, to: newStaffName });
      callback(null, target);
    });
}

function saveCustomerToDb(customer, callback) {
  // 2026-08-31(선혜님 지적 — "본인이 쓴것도 인지하는거야??"로 발견): 방금
  // 만든 동시편집 충돌감지(updated_at 잠금)가, 같은 사람이 같은 고객을
  // 빠르게 연달아 두 번 저장(예: 단계변경 changeStage처럼 중복클릭
  // 방지가 없는 저장 버튼들)하면 오히려 자기 자신과 충돌한 것으로
  // 오판할 위험이 있었음 - 1차 저장이 서버 응답을 받아 최신 updated_at을
  // 반영하기 전에 2차 저장이 이미 낡은 잠금값으로 시작하면, 2차 저장이
  // "누군가 먼저 저장했다"고 잘못 판단함. 6곳(메모/결제링크/날짜/단계변경
  // 등) 저장버튼 하나하나에 중복클릭 방지를 붙이는 대신, 이 함수 한 곳
  // 에서 같은 고객(id)에 대한 저장을 직렬화(진행중이면 대기했다가 최신
  // updated_at으로 이어서 실행)해서 근본적으로 막음.
  if (customer && customer.id) {
    if (!window._custSaveInFlight) window._custSaveInFlight = {};
    if (window._custSaveInFlight[customer.id]) {
      // 이미 이 고객에 대한 저장이 진행 중 - 그 저장이 끝난 뒤(최신
      // updated_at 반영된 뒤) 이어서 실행되도록 대기열에 추가.
      if (!window._custSaveQueue) window._custSaveQueue = {};
      window._custSaveQueue[customer.id] = { customer: customer, callback: callback };
      return;
    }
    window._custSaveInFlight[customer.id] = true;
  }
  var _origCallback = callback;
  callback = function(err, data) {
    if (customer && customer.id) {
      window._custSaveInFlight[customer.id] = false;
      var queued = window._custSaveQueue && window._custSaveQueue[customer.id];
      if (queued) {
        window._custSaveQueue[customer.id] = null;
        // 대기하던 요청은 이제 최신 customer.updatedAt(방금 갱신됨)을
        // 가진 객체로 이어서 실행 - queued.customer가 같은 참조라면
        // 이미 최신값을 갖고 있고, 다른 참조라도 갱신된 값을 넘겨줌.
        queued.customer.updatedAt = customer.updatedAt;
        saveCustomerToDb(queued.customer, queued.callback);
      }
    }
    if (_origCallback) _origCallback(err, data);
  };
  // 2026-08-28(선혜님 지적 — "이 문구는 왜 또 뜨지??", 배재연을 방금 등록한
  // 직후 본인 화면에서 "다른 곳에서 방금 업데이트됐어요" 배너가 뜬 사례):
  // Realtime 구독은 "누가" 바꿨는지 구분 안 하고 이 브라우저 자신의 저장도
  // 그대로 되돌아와서 알려줌 - 그래서 본인이 방금 한 행동인데도 "다른 곳에서"
  // 바꾼 것처럼 잘못 알림. 이 탭에서 방금 저장 중인 고객 id+시각을 표시해두고,
  // 실시간 이벤트 쪽(dash-realtime.js)에서 "방금 나 자신이 한 것"이면
  // 배너를 건너뛰도록 함.
  if (customer && customer.id) {
    window._lastSelfCustomerWriteId = customer.id;
    window._lastSelfCustomerWriteTime = Date.now();
  }
  var row = customerToDbRow(customer);
  syncCustomerToSheet(customer);
  var key = customer.id || customer.clientName;
  var method = customer.id ? 'PATCH' : 'POST';
  var path = customer.id ? ('customers?id=eq.' + customer.id) : 'customers';
  // 2026-08-31(선혜님 지시 - "만들어줘", 견적서엔 이미 있는 "동시편집
  // 충돌감지"가 고객 레코드엔 없다는 걸 발견해 추가): 수정(PATCH)일 때,
  // 이 화면을 열었던 시점의 updated_at을 잠금조건으로 함께 보내서,
  // 그 사이 다른 사람이 먼저 저장했으면(=updated_at이 달라졌으면)
  // 이번 PATCH가 0건 매칭되어 조용히 실패함 - sbXHR이 이미 감지하는
  // err.zeroRows로 구분해서 사용자에게 명확히 알림.
  var lockUpdatedAt = (method === 'PATCH' && customer.updatedAt) ? customer.updatedAt : null;
  if (lockUpdatedAt) path += '&updated_at=eq.' + encodeURIComponent(lockUpdatedAt);
  sbXHR(method, path, row, function(err, data) {
    if (err) {
      if (err.zeroRows) {
        // 견적서 저장실패 백업(est-save.js)과 정확히 같은 안전망 - 재시도는
        // 위험하니 안 하되, 그 내용은 로컬(기한없이)+서버(다른 기기에서도
        // 확인 가능) 이중으로 백업해서 절대 사라지지 않게 함.
        showToast(lockUpdatedAt
          ? '⚠️ 이 고객 정보가 방금 다른 곳에서 먼저 저장됐어요 — 새로고침해서 최신 내용을 확인해주세요 (내 변경사항은 안전하게 백업됐어요)'
          : '⚠️ 저장이 서버에 반영되지 않았어요 (권한 문제일 수 있어요) — 마스터님께 알려주세요. 내 변경사항은 안전하게 백업됐어요');
        try {
          var failedCustSaves = JSON.parse(localStorage.getItem('dah_failed_customer_saves')||'[]');
          failedCustSaves.push({
            savedAt: new Date().toISOString(),
            reason: lockUpdatedAt ? '동시저장충돌' : '권한문제(담당자불일치 추정)',
            customerId: customer.id,
            payload: row
          });
          if (failedCustSaves.length > 50) failedCustSaves = failedCustSaves.slice(-50);
          localStorage.setItem('dah_failed_customer_saves', JSON.stringify(failedCustSaves));
        } catch(eBackup) { /* 백업 실패해도 저장 흐름엔 영향 안 줌 */ }
        if (typeof reportClientError === 'function') {
          reportClientError('고객정보 저장 실패(권한문제 또는 동시저장충돌) - 내용 백업됨', null,
            { customerPayload: row, reason: lockUpdatedAt ? '동시저장충돌' : '권한문제' });
        }
        // 2026-09-05(선혜님 지시 - "쌍둥이함수"로 발견, 실제 client_error_logs
        // 데이터에서 "김 은"/"유경진" 고객정보가 짧은 간격으로 반복 저장
        // 실패한 패턴 확인): est-save.js에 방금 고친 것과 정확히 같은
        // 쌍둥이 버그 - 동시저장충돌 감지 후 락값(customer.updatedAt)을
        // 갱신하는 코드가 없어서, 재시도해도 계속 예전(불일치) 락값 그대로
        // 재시도해 매번 같은 이유로 반복 실패하고 있었음. 최신 updated_at을
        // 자동으로 다시 조회해서, 로컬스토리지의 해당 고객 레코드에 반영 -
        // 다음 저장 시도(loadCustomers()로 다시 불러온 데이터 기준)가
        // 최신 락값을 쓰게 되어 무의미한 반복 실패를 막음.
        // 2026-09-05(선혜님 지적 - "전문업체라면 이 경우 어떻게 처리할까"):
        // est-save.js와 이 파일에 각각 복사돼 있던 로직을
        // shared-optimistic-lock.js 공용 함수로 뽑아냄.
        if (lockUpdatedAt && customer && customer.id && typeof fetchLatestUpdatedAt === 'function') {
          fetchLatestUpdatedAt('customers', customer.id, function(freshUpdatedAt) {
            if (freshUpdatedAt && typeof loadCustomers === 'function' && typeof saveCustomers === 'function') {
              var arr = loadCustomers();
              var target = arr.find(function(c){ return c.id === customer.id; });
              if (target) {
                target.updatedAt = freshUpdatedAt;
                saveCustomers(arr);
              }
            }
          });
        }
        if (callback) callback(err, data);
        return;
      }
      console.error((customer.id?'수정':'추가') + ' 오류:', err.text);
      // 2026-08-05: 실패를 콘솔에만 남기고 조용히 무시하던 것 수정 —
      // 대기 큐에 기록해서 화면에 경고 배너가 뜨고, 네트워크 복구시 자동 재시도됨
      if (typeof addToPendingSyncQueue === 'function') addToPendingSyncQueue(key, method, path, row);
    } else if (typeof removeFromPendingSyncQueue === 'function') {
      removeFromPendingSyncQueue(key);
    }
    // 저장 성공시, 다음 저장을 위해 최신 updated_at을 반영해둠 - 이걸
    // 안 하면 이 화면을 안 벗어나고 연속으로 두 번 저장할 때, 두 번째
    // 저장이 (이미 낡은) 첫 저장 이전 잠금값을 써서 스스로와 충돌하는
    // 오탐이 날 수 있음.
    if (!err && data && data[0] && data[0].updated_at) {
      customer.updatedAt = data[0].updated_at;
    }
    // 신규 생성(POST)이면 저장 전엔 id를 몰라서 위에서 못 찍었음 - 서버가
    // 응답으로 준 진짜 id로 지금 찍어야 방금 만든 신규 고객도 배너에서 제외됨.
    if (!err && !customer.id && data && data[0] && data[0].id) {
      window._lastSelfCustomerWriteId = data[0].id;
      window._lastSelfCustomerWriteTime = Date.now();
    }
    if (callback) callback(err, data);
  });
}

// 2026-10-08(선혜님 - "완납되었는데 상담으로 뜬다", 조유정 사례 / client_error_logs 서버 기록으로 확정):
// 계약금 저장 1초 뒤 단계 변경이 "동시저장충돌"로 실패. 9/6·9/8에 같은 이유로 고쳤지만 "락값을 맞추는" 증상 수정이었음.
// 진짜 문제는 단계만 바꾸는데 saveCustomerToDb가 이 기기에 있던 고객 전체(낡은 계약금 0원 포함)를 통째로 PATCH한다는 점 -
// 락이 맞아떨어지면 방금 저장된 계약금이 0원으로 되돌아가고, 락이 안 맞으면 단계 변경이 실패함(둘 다 사고).
// 그래서 "바꾸려는 필드만" 보내는 저장을 따로 둠: 다른 필드를 건드릴 수 없으니 낡은 값으로 덮어쓰는 일이 구조적으로 불가능하고, 락도 필요 없음.
// 성공하면 서버가 돌려준 최신 행을 로컬에 그대로 반영(낡은 값이 로컬에 남아 다음 저장에서 되살아나지 않게).
function patchCustomerFieldsToDb(customer, fields, callback) {
  if (!customer || !customer.id) { if (callback) callback({ noId: true }); return; }
  window._lastSelfCustomerWriteId = customer.id;
  window._lastSelfCustomerWriteTime = Date.now();
  var path = 'customers?id=eq.' + customer.id;
  // 2026-10-08: 큐 이름표를 "바꾼 필드 조합"별로 나눔 - 모두 같은 이름표(id:fields)면 오프라인에서 메모 저장이 실패한 뒤 결제 링크
  // 저장도 실패할 때 먼저 실패한 메모가 큐에서 덮여 사라짐(같은 필드를 다시 저장하면 최신 값으로 대체되는 것은 의도).
  var queueKey = customer.id + ':fields:' + Object.keys(fields || {}).sort().join(',');
  sbXHR('PATCH', path, fields, function(err, data) {
    if (err) {
      if (err.zeroRows) {
        if (typeof showToast === 'function') showToast('⚠️ 서버에 반영되지 않았어요 (권한 문제일 수 있어요) — 마스터님께 알려주세요');
        if (typeof reportClientError === 'function') reportClientError('고객 필드 저장 실패(0건 반영)', null, { customerId: customer.id, fields: fields });
      } else {
        console.error('고객 필드 저장 오류:', err.text);
        if (typeof addToPendingSyncQueue === 'function') addToPendingSyncQueue(queueKey, 'PATCH', path, fields);
        // 예전 saveCustomerToDb도 서버 결과와 무관하게 시트 동기화를 했음(시트는 DB의 사본일 뿐이라 로컬 값 기준으로도 보냄)
        try { syncCustomerToSheet(customer); } catch (eSheet) { /* 시트 동기화 실패는 저장에 영향 없음 */ }
      }
      if (callback) callback(err, data);
      return;
    }
    if (typeof removeFromPendingSyncQueue === 'function') removeFromPendingSyncQueue(queueKey);
    if (data && data[0]) {
      try {
        var fresh = dbRowToCustomer(data[0]);
        var arr = loadCustomers();
        var idx = arr.findIndex(function(x){ return String(x.id) === String(customer.id); });
        if (idx >= 0) { arr[idx] = Object.assign({}, arr[idx], fresh); saveCustomers(arr); }
        Object.assign(customer, fresh);
      } catch (eFresh) { if (data[0].updated_at) customer.updatedAt = data[0].updated_at; }
    }
    // 2026-10-08: 예전 saveCustomerToDb가 저장하면서 같이 하던 구글 시트(고객명단) 동기화 - 부분 저장으로 바꾸면서 빠졌던 것을 복구.
    // 서버가 돌려준 최신 값이 반영된 customer로 보냄.
    try { syncCustomerToSheet(customer); } catch (eSheet) { /* 시트 동기화 실패는 저장에 영향 없음 */ }
    if (callback) callback(null, data);
  });
}

// 2026-10-08: 고객 정보 중 "필드 몇 개만" 바꾸는 저장(메모/결제링크/실측·시공일/발주체크)의 공용 입구.
// 서버 id가 있으면 그 필드만 보내고(patchCustomerFieldsToDb), 아직 서버에 없는 고객(id 없음)이면 예전처럼 전체 저장(생성)으로 보냄.
function saveCustomerFieldsToDb(customer, fields, callback) {
  if (customer && customer.id) { patchCustomerFieldsToDb(customer, fields, callback); return; }
  saveCustomerToDb(customer, callback);
}

// 견적서 삭제 — 2026-08-05: 예전엔 견적서를 삭제/숨길 방법이
// 앱 어디에도 없었음(estimates.is_archived 컬럼은 있는데 쓰는 코드가 없었음)
//
// 2026-08-28(선혜님 지시 — "한번 삭제를 하면 보관하지 않아도 돼 괜히 다
// 있으니 헷갈리잖아"): 보관처리(소프트삭제) 방식은 고객상세 화면의
// "견적서" 목록에 지운 것까지 계속 쌓여서 오히려 헷갈리게 만든다는
// 지적으로, 진짜 완전삭제(DB에서 실제로 지움)로 변경. DB쪽
// estimates_delete RLS도 실장이 본인 담당 견적을 지울 수 있게 함께 확장함
// (예전엔 마스터 전용이라 "오지은 실장으로 삭제가 안 된다"는 문제의
// 실제 원인이었을 가능성이 있음 - 8/25엔 "서버가 거부해도 성공했다고
// 뜨는" 거짓성공 증상만 고쳐졌고 근본 권한 문제는 안 고쳐져 있었음).
function archiveEstimate(est, callback) {
  var all = [];
  try { all = JSON.parse(localStorage.getItem('dah_saved')||'[]'); } catch(e) {}
  // 2026-08-24(선혜님 발견 — "DAH-20260824-02 눌러도 없다고 나온다"): est.id가
  // null/undefined인 로컬 전용 유령 견적(서버에 한 번도 저장 안 된 것)은
  // x.id===est.id로 찾으면 null끼리 매칭돼서 엉뚱한 것이 지워지거나, 배열에
  // id:null 항목이 여러개면 어느 것도 정확히 못 찾는 문제가 있었음. id가 없으면
  // 대신 no(견적번호, 로컬에서 고유하게 발급됨)로 정확히 찾도록 보강.
  var idx = est.id
    ? all.findIndex(function(x){ return x.id === est.id; })
    : all.findIndex(function(x){ return !x.id && x.no === est.no; });
  if (idx >= 0) all.splice(idx, 1); // 완전삭제 - 로컬 캐시에서도 그냥 제거(보관 플래그 대신)
  localStorage.setItem('dah_saved', JSON.stringify(all));
  if (typeof est.id === 'string' && est.id.length > 20) { // UUID면 서버(client_id 있는 정식 견적서)에도 반영
    sbXHR('DELETE', 'estimates?id=eq.' + est.id, null, function(err){ if(callback) callback(err); });
  } else if (callback) callback(null);
}

// 2026-08-28(선혜님 요청 - "코드 정리, 제대로 하자"로 발견): 이 함수(보관
// 처리용 소프트삭제)는 오늘 삭제 정책을 완전삭제로 전환하면서
// permanentlyDeleteCustomerFromDb로 대체됐고, 더 이상 어디서도 호출되지
// 않는 죽은 코드였음 - 제거함.
// 2026-08-05: 진짜 완전 삭제(되돌릴 수 없음) — 이미 보관(소프트삭제) 처리된
// 고객에게만 노출됨(2단계 안전장치). RLS의 customers_delete 정책상 master
// 역할만 실제로 성공함.
// 2026-08-28(선혜님 지시 - "삭제하면 보관처리 하지마"): 고객을 완전삭제하기
// 전에, 연결된 견적서를 먼저 지워야 함 - estimates.client_id가 customers.id를
// 참조하는 외래키 제약(NO ACTION)이 있어서, 견적서가 남아있으면 고객
// 삭제 자체가 서버에서 거부됨. 순서를 지켜서 삭제.
function permanentlyDeleteCustomerFromDb(customer, callback) {
  var filter = customer && customer.id
    ? 'id=eq.' + customer.id
    : 'client_name=eq.' + encodeURIComponent(typeof customer === 'string' ? customer : (customer && customer.clientName) || '');
  var doDeleteCustomer = function() {
    sbXHR('DELETE', 'customers?' + filter, null, function(err, data) { if(err) console.error('완전삭제 오류:', err.text); if(callback) callback(err, data); });
  };
  if (customer && customer.id) {
    sbXHR('DELETE', 'estimates?client_id=eq.' + customer.id, null, function(estErr) {
      if (estErr) console.warn('연결된 견적서 삭제 중 오류(계속 진행):', estErr.text);
      doDeleteCustomer();
    });
  } else {
    doDeleteCustomer(); // id가 없는 예전 데이터는 이름 매칭이라 견적서 client_id와 못 엮음 - 그대로 진행
  }
}

// 소프트 삭제(보관 처리)된 고객을 다시 되돌림 (동일하게 id 우선, 없으면 이름 폴백)
function restoreCustomerFromDb(customer, callback) {
  var filter = customer && customer.id
    ? 'id=eq.' + customer.id
    : 'client_name=eq.' + encodeURIComponent(typeof customer === 'string' ? customer : (customer && customer.clientName) || '');
  sbXHR('PATCH', 'customers?' + filter, { is_archived: false }, function(err, data) { if(err) console.error('복구 오류:', err.text); if(callback) callback(err, data); });
}

// 놓친 리드(상담 후 오래 진행없음)를 "대기 중인 리드"로 보관 처리 (2026-08-02 신규)
// — is_archived(고객목록에서 삭제)와는 완전히 다른 개념. 삭제가 아니라, 홈 화면
// "처리 필요" 목록에서만 안 보이게 하되 고객목록에서는 계속 찾아볼 수 있게 함.
function parkLead(customer, callback) {
  var filter = customer && customer.id
    ? 'id=eq.' + customer.id
    : 'client_name=eq.' + encodeURIComponent(typeof customer === 'string' ? customer : (customer && customer.clientName) || '');
  sbXHR('PATCH', 'customers?' + filter, { lead_parked: true }, function(err, data) { if(err) console.error('리드 보관 오류:', err.text); if(callback) callback(err, data); });
}

// 대기 중이던 리드가 다시 연락이 와서 활성 상태로 복귀
function unparkLead(customer, callback) {
  var filter = customer && customer.id
    ? 'id=eq.' + customer.id
    : 'client_name=eq.' + encodeURIComponent(typeof customer === 'string' ? customer : (customer && customer.clientName) || '');
  sbXHR('PATCH', 'customers?' + filter, { lead_parked: false }, function(err, data) { if(err) console.error('리드 복귀 오류:', err.text); if(callback) callback(err, data); });
}
