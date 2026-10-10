/* ══════════════════════════════════════════════════
   DAH 대시보드 — 고객상세 모달: 정보탭/할일 + 하단 버튼·단계변경·삭제·복구
   2026-09-24(선혜님 - "바꿔보자"/"나눌수 있는건 다 나눠보자" - 큰 파일 쪼개기):
   dash-customer-detail.js(1,619줄)를 나눈 뒤, 이 파일에서 견적서 관련 함수는
   dash-customer-estimates.js로 한 번 더 분리함. 이 파일엔 정보탭/할일 렌더링과
   실제 액션(닫기/단계변경/삭제/복구)이 남음. 순수 전역 스크립트라 파일 사이
   함수 호출(currentDetailId, closeDetail 등)은 자유롭게 됨 - 함수의 정확한
   위치는 CONCEPT_REGISTRY.json / grep으로 확인할 것.
   ══════════════════════════════════════════════════ */

function renderDetailTodoSection(c, body) {
  // 2026-09-14(선혜님 지적 - 문지윤 고객 실제 캡처로 발견): 여기가 소통
  // 탭과 다른 로직(단순 단계매칭)을 써서 서로 다른 개수가 나오고 있었음 -
  // 공용 함수(getDueAlimKeys)로 통일해서 두 탭이 항상 같은 답을 보여주게 함.
  var todoKeys = getDueAlimKeys(c);
  // 2026-09-24(선혜님 - "카카오 등록 전에 한번 더 파자"로 발견): 이
  // "지금 해야 할 일"도 결국 getAlimSentMap(로컬전용)에 기반해서, 다른
  // 기기에서 이미 보낸 걸 "아직 안 보냄"으로 잘못 보여줄 위험이 소통탭과
  // 똑같이 있었음 - 같은 서버재확인 안전장치 적용.
  if (typeof refreshAlimSentMapFromServer === 'function') {
    refreshAlimSentMapFromServer(c, function() {
      if (currentDetailId === c.id && typeof renderDetailTodoSection === 'function') renderDetailTodoSection(c, body);
    });
  }
  var manualKeys = todoKeys; // '선택' 태그가 있던 옛 22개 체계의 흔적 - 지금 13개엔 '선택' 태그 자체가 없어져서 그대로 사용
  if (manualKeys.length > 0) {
    var todoSec = div('margin-bottom:14px;padding:var(--sp-3);background:var(--ivory1);border:1.5px solid var(--dark);border-radius:12px', []);
    todoSec.appendChild(el('div', {style:'font-size:12px;font-weight:700;color:var(--dark);letter-spacing:1.5px;margin-bottom:var(--sp-2)', text:'지금 해야 할 일'}));
    // 가장 급한 것 1개만 크게 보여주고, 나머지는 "N건 더 남음" 뒤에 접어둠(눌러야만 펼쳐짐)
    var firstKey = manualKeys[0];
    var firstMeta = ALIM_META[firstKey];
    var primaryBtn = btn('width:100%;padding:11px;background:var(--dark);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-bottom:6px', firstMeta.label + ' 발송하기', function(){ sendAlimtalk(firstKey); });
    todoSec.appendChild(primaryBtn);
    if (manualKeys.length > 1) {
      var moreRow = div('display:flex;align-items:center;justify-content:space-between', [
        el('span', {style:'font-size:11px;color:var(--sub)', text:(manualKeys.length-1)+'건 더 남음'}),
        btn('font-size:11px;color:var(--dark);background:none;border:1px solid var(--border);padding:4px 10px;border-radius:10px;cursor:pointer;font-family:inherit;min-height:32px', '전체 보기', function(){
          var wrap = document.getElementById('todo-rest');
          if (wrap) wrap.style.display = wrap.style.display === 'none' ? '' : 'none';
        })
      ]);
      todoSec.appendChild(moreRow);
      var restWrap = div('display:none;margin-top:var(--sp-2)', []);
      restWrap.id = 'todo-rest';
      manualKeys.slice(1).forEach(function(key) {
        var meta = ALIM_META[key]; if(!meta) return;
        var row = div('display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:5px', [
          div('', [
            el('span', {style:'font-size:12px;font-weight:700;color:var(--dark);display:block', text:meta.label}),
            el('span', {style:'font-size:11px;color:var(--sub)', text:meta.desc})
          ]),
          el('span', {style:'font-size:12px;font-weight:600;color:var(--dark);background:#fff;border:1px solid var(--dark);padding:5px 12px;border-radius:12px;flex-shrink:0', text:'발송'})
        ]);
        (function(k){ row.addEventListener('click', function(){ sendAlimtalk(k); }); })(key);
        restWrap.appendChild(row);
      });
      todoSec.appendChild(restWrap);
    }
    body.appendChild(todoSec);
  }

}

function renderDetailInfoSection(c, body) {
  var infoSec = div('margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)', []);
  infoSec.appendChild(el('div', {style:'font-size:11px;font-weight:700;color:var(--sub);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px', text:'고객 정보'}));

  // 연락처/주소는 헤더에 항상 고정 표시되므로 여기선 생략 (중복 방지).
  // 단, 전화 클릭 기능은 정보바의 연락처 칸에서 그대로 사용 가능.

  // 메모 (2026-07-21: 읽기전용 표시 -> 탭하면 편집+빠른문구버튼 나오는 방식으로 개편.
  // 예전엔 메모를 실제로 입력/수정할 방법이 앱 어디에도 없었음 — 표시만 되고 편집 UI가 없었음)
  function renderMemoDisplay(memoBlock, val) {
    memoBlock.innerHTML = '';
    memoBlock.appendChild(el('div', {style:'font-size:11px;color:var(--terra);letter-spacing:0.8px;margin-bottom:3px', text:'메모 (탭해서 편집)'}));
    memoBlock.appendChild(el('div', {style:'font-size:11px;color:'+(val?'var(--dark)':'var(--light)')+';line-height:1.6', text: val || '메모를 추가하려면 눌러주세요'}));
  }
  // 2026-08-10: 메모도 blur(포커스 아웃) 전에 새로고침 등으로 중단되면
  // 타이핑 내용이 날아가던 문제 - 고객ID별 임시저장 키로 해결.
  var memoDraftKey = 'dah_memo_draft_' + c.id;
  function getMemoDraft() { try { return localStorage.getItem(memoDraftKey) || ''; } catch(e) { return ''; } }
  function saveMemoDraft(v) { try { localStorage.setItem(memoDraftKey, v); } catch(e) {} }
  function clearMemoDraft() { try { localStorage.removeItem(memoDraftKey); } catch(e) {} }

  var memoBlock = div('background:#FFFBF5;border:1px solid #FFE5CC;border-radius:12px;padding:10px 14px;margin-bottom:var(--sp-2);cursor:pointer', []);
  renderMemoDisplay(memoBlock, c.memo || '');
  memoBlock.addEventListener('click', function() {
    if (memoBlock.querySelector('textarea')) return; // 이미 편집중이면 무시
    memoBlock.innerHTML = '';
    memoBlock.appendChild(el('div', {style:'font-size:11px;color:var(--terra);letter-spacing:0.8px;margin-bottom:4px', text:'메모'}));
    var textarea = document.createElement('textarea');
    var draftVal = getMemoDraft();
    textarea.value = draftVal || c.memo || '';
    textarea.style.cssText = 'width:100%;min-height:60px;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:12px;font-family:inherit;resize:vertical;box-sizing:border-box';
    textarea.addEventListener('input', function() { saveMemoDraft(textarea.value); });
    memoBlock.appendChild(textarea);
    var quickWrap = div('display:flex;flex-wrap:wrap;gap:4px;margin-top:6px', []);
    (typeof getMempoPhrases === 'function' ? getMempoPhrases() : []).slice(0, 9).forEach(function(p) {
      var qbtn = el('button', {type: 'button', style: 'font-size:11px;padding:6px 10px;min-height:32px;background:var(--ivory1);border:1px solid var(--border);border-radius:20px;cursor:pointer;font-family:inherit'});
      qbtn.textContent = p;
      qbtn.addEventListener('click', function(e) {
        e.stopPropagation();
        textarea.value = textarea.value ? textarea.value + ' / ' + p : p;
        saveMemoDraft(textarea.value);
        textarea.focus();
      });
      quickWrap.appendChild(qbtn);
    });
    memoBlock.appendChild(quickWrap);
    textarea.focus();
    textarea.addEventListener('blur', function() {
      var newVal = textarea.value.trim();
      var arr = loadCustomers();
      var target = findCurrentDetailCustomer(arr);
      if (target) {
        target.memo = newVal;
        saveCustomers(arr);
        clearMemoDraft();
        // 2026-10-08: 메모만 서버로 보냄(고객 전체를 보내면 낡은 계약금 등이 서버를 덮어쓰거나 동시저장충돌로 실패 - 오늘 조유정 사례와 같은 뿌리)
        saveCustomerFieldsToDb(target, { memo: newVal }, function(err){
          showToast(err ? '⚠️ 메모: 로컬엔 저장됨(서버 재시도 대기)' : '메모가 저장됐습니다');
        });
      }
      renderMemoDisplay(memoBlock, newVal);
    });
  });
  infoSec.appendChild(memoBlock);

  // 2026-08-29: 카카오 알림톡 v3 재작성 시 추가 — #{결제링크} 변수용 저장란.
  // 결제선생/네이버페이 등에서 발급한 링크를 여기 한 번 저장해두면, 4-3/7-C/8-B 등
  // 카드결제 안내 알림톡 발송 때마다 다시 입력할 필요 없이 자동으로 채워짐.
  function renderPaymentLinkDisplay(block, val) {
    block.innerHTML = '';
    block.appendChild(el('div', {style:'font-size:11px;color:var(--terra);letter-spacing:0.8px;margin-bottom:3px', text:'결제 링크 (탭해서 편집 · #{결제링크} 변수로 사용)'}));
    block.appendChild(el('div', {style:'font-size:11px;color:'+(val?'var(--dark)':'var(--light)')+';line-height:1.6;word-break:break-all', text: val || '결제 링크를 추가하려면 눌러주세요'}));
  }
  var paymentLinkBlock = div('background:#FFFBF5;border:1px solid #FFE5CC;border-radius:12px;padding:10px 14px;margin-bottom:var(--sp-2);cursor:pointer', []);
  renderPaymentLinkDisplay(paymentLinkBlock, c.paymentLink || '');
  paymentLinkBlock.addEventListener('click', function() {
    if (paymentLinkBlock.querySelector('input')) return;
    paymentLinkBlock.innerHTML = '';
    paymentLinkBlock.appendChild(el('div', {style:'font-size:11px;color:var(--terra);letter-spacing:0.8px;margin-bottom:4px', text:'결제 링크'}));
    var input = document.createElement('input');
    input.type = 'text';
    input.value = c.paymentLink || '';
    input.placeholder = 'https://...';
    input.style.cssText = 'width:100%;min-height:36px;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:12px;font-family:inherit;box-sizing:border-box';
    paymentLinkBlock.appendChild(input);
    input.focus();
    input.addEventListener('blur', function() {
      var newVal = input.value.trim();
      var arr = loadCustomers();
      var target = findCurrentDetailCustomer(arr);
      if (target) {
        target.paymentLink = newVal;
        saveCustomers(arr);
        // 2026-10-08: 결제 링크만 서버로 보냄(위 메모와 같은 이유)
        saveCustomerFieldsToDb(target, { payment_link: newVal }, function(err){
          showToast(err ? '⚠️ 결제링크: 로컬엔 저장됨(서버 재시도 대기)' : '결제 링크가 저장됐습니다');
        });
      }
      renderPaymentLinkDisplay(paymentLinkBlock, newVal);
    });
  });
  infoSec.appendChild(paymentLinkBlock);

  // 날짜 3개 가로 배열 — 실측예정/시공예정은 클릭하면 바로 날짜를 고쳐 저장할 수 있음
  // (기존엔 전체 "수정" 모달을 열어야만 했음 — 선혜님 피드백으로 원클릭 편집 추가)
  var dateGrid = div('display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px', []);
  var dateFields = [
    {label:'상담일', value:c.date||'—', key:null},
    {label:'실측 예정', value:c.measureDate||'—', key:'measureDate'},
    {label:'시공 예정', value:c.installDate||'—', key:'installDate'}
  ];
  dateFields.forEach(function(item){
    var box = div('background:var(--ivory1);border:1px solid var(--border);border-radius:12px;padding:10px 8px;text-align:center;position:relative'+(item.key?';cursor:pointer':''),[
      el('div',{style:'font-size:11px;color:var(--sub);letter-spacing:0.8px;margin-bottom:var(--sp-1)',text:item.label}),
      el('div',{style:'font-size:12px;font-weight:700;color:'+(item.value==='—'?'var(--light)':'var(--dark)'),text:item.value})
    ]);
    if (item.key) {
      box.addEventListener('click', function(){
        openCustomDatePicker(box, c[item.key] || null, function(newVal){
          var valueDiv = box.children[1];
          var arr = loadCustomers();
          var target = findCurrentDetailCustomer(arr);
          if (target) {
            target[item.key] = newVal || '';
            // 2026-09-21(선혜님 - 전보현/민소아 고객 실제 발생 확인):
            // 실제 날짜를 입력하는데도 예전에 "미정"으로 체크해뒀던
            // 플래그(measureDateTbd/installDateTbd)가 그대로 남아있으면,
            // 이 값이 견적서에 동기화될 때 "미정" 상태로 잘못 복원돼서
            // 날짜칸이 자동으로 비워지고 실측/시공 의뢰서에 "미정"이
            // 뜨는 버그로 이어짐 - 실제 날짜를 입력하는 순간 그 플래그를
            // 명확히 꺼줌(dash-api.js의 customerToDbRow가 이 필드를
            // 서버로 함께 전송하도록 오늘 같이 수정함).
            if (newVal && (item.key === 'installDate' || item.key === 'measureDate')) {
              target[item.key === 'installDate' ? 'installDateTbd' : 'measureDateTbd'] = false;
            }
            saveCustomers(arr);
            // 2026-10-08: 바꾼 날짜(와 "미정" 해제 표시)만 서버로 보냄(위 메모와 같은 이유)
            var dateFields = {};
            dateFields[item.key === 'installDate' ? 'install_date' : 'measure_date'] = newVal || '';
            if (newVal) dateFields[item.key === 'installDate' ? 'install_date_tbd' : 'measure_date_tbd'] = false;
            saveCustomerFieldsToDb(target, dateFields, function(err){
              showToast(err ? '⚠️ ' + item.label + ': 로컬엔 저장됨(서버 재시도 대기)' : item.label + '이 저장됐습니다');
            });
            // 2026-09-11(선혜님 지적 - "고객이 확정된 뒤에 시공일자를
            // 바꾸면 견적서에는 수정이 또 안되네 심지어 대시보드에
            // 수정해도 변경이 안되고 반영도 안되네"): 지금까지 견적서를
            // 저장할 때 그 안의 날짜가 고객 레코드로 동기화되는 방향만
            // 있었고, 반대(대시보드에서 고객 날짜를 고치면 견적서에도
            // 반영)는 없었음 - 실제 시공일정은 계약 후에도 바뀌는 게
            // 정상인데, 대시보드에서 고쳐도 견적서를 다시 열면 예전
            // 날짜가 그대로 보이던 원인. 이 고객의 가장 최근 견적서도
            // 함께 갱신.
            if (typeof SUPABASE_URL !== 'undefined' && target.id) {
              // 2026-09-21(선혜님 - "전문업체라면 어떻게 하겠니? 제대로 좀
              // 해봐" 요청으로 전체 DB 스키마 재점검 중 발견 - 심각한
              // 회귀): estimates 테이블엔 measure_date라는 컬럼 자체가
              // 없음(실측 예정일은 이 테이블에서 'date' 컬럼에 저장됨,
              // est-save.js의 "date: document.getElementById('c-measure')
              // ?.value" 로 확인) - 오늘 아침 이 자리에 measure_date로
              // PATCH를 보내고 있었는데, 실제로 Supabase에 재현해보니
              // "column measure_date of relation estimates does not exist"
              // 로 요청 자체가 거부됨. 즉 오늘 아침 만든 tbd 수정이 실측
              // 예정일 케이스에서는 이 PATCH 자체가 실패해서 tbd 플래그도
              // 같이 반영이 안 됐을 가능성이 매우 높음(재현 테스트가
              // 네트워크를 mock해서 항상 성공 응답을 줬기 때문에 못 잡음).
              var estField = item.key === 'installDate' ? 'install_date' : 'date';
              try {
                var findXhr = new XMLHttpRequest();
                findXhr.open('GET', SUPABASE_URL + '/rest/v1/estimates?client_id=eq.' + encodeURIComponent(target.id) + '&order=created_at.desc&limit=1&select=id', true);
                findXhr.setRequestHeader('apikey', SUPABASE_KEY);
                findXhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
                findXhr.onload = function() {
                  try {
                    var rows = JSON.parse(findXhr.responseText);
                    if (rows && rows[0] && rows[0].id) {
                      var patchXhr = new XMLHttpRequest();
                      patchXhr.open('PATCH', SUPABASE_URL + '/rest/v1/estimates?id=eq.' + encodeURIComponent(rows[0].id), true);
                      patchXhr.setRequestHeader('apikey', SUPABASE_KEY);
                      patchXhr.setRequestHeader('Authorization', 'Bearer ' + (typeof getAuthToken === 'function' ? getAuthToken() : SUPABASE_KEY));
                      patchXhr.setRequestHeader('Content-Type', 'application/json');
                      var patchBody = {};
                      patchBody[estField] = newVal || null;
                      // 2026-09-21(선혜님 - 전보현/민소아 고객 실제
                      // 발생 확인 - 진짜 근본 원인): 견적서 앱이 실제로
                      // 참조하는 건 estimates.measure_date_tbd/
                      // install_date_tbd(applyScheduleAndDepositToForm이
                      // 이 견적서 레코드의 필드를 직접 읽음)인데, 지금까지
                      // 이 PATCH가 날짜(estField)만 갱신하고 그 옆의 tbd
                      // 플래그는 전혀 안 건드리고 있었음 - 실제 날짜를
                      // 입력했는데도 이 견적서에 예전 "미정" 값이 그대로
                      // 남아있으면, 다음에 견적서를 열 때 "미정" 체크가
                      // 켜진 채로 복원돼서 날짜칸이 도로 비워짐(이번
                      // 버그의 진짜 발생 지점). 날짜를 실제로 입력하는
                      // 경우에만 그 tbd도 함께 꺼줌.
                      if (newVal) {
                        var estTbdField = item.key === 'installDate' ? 'install_date_tbd' : 'measure_date_tbd';
                        patchBody[estTbdField] = false;
                      }
                      patchXhr.send(JSON.stringify(patchBody));
                    }
                  } catch (eFind) {}
                };
                findXhr.send();
              } catch (eOuter) {}
            }
          } else {
            showToast(item.label + '이 저장됐습니다');
          }
          valueDiv.textContent = newVal || '—';
          valueDiv.style.color = newVal ? 'var(--dark)' : 'var(--light)';
        });
      });
    }
    dateGrid.appendChild(box);
  });
  infoSec.appendChild(dateGrid);
  body.appendChild(infoSec);

}

function renderDetailBottomButtons(c, isMaster, body) {
  var bottomBtns = [btn('flex:2;padding:11px;background:var(--dark);color:#fff;border:none;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;border-radius:12px;letter-spacing:0.2px', '닫기', closeDetail)];
  // 2026-08-27(선혜님 지시 - "실장도 삭제 권한 줘야 할 것 같아") →
  // 2026-08-28(선혜님 지시 - "삭제하면 보관처리 하지마", "실장도 완전삭제"):
  // 이제 "삭제"는 항상 완전삭제이므로, 앞으로는 이 isSoftDeleted 분기 자체를
  // 새로 만들 일이 없음(예전에 이미 보관 처리됐던 레거시 데이터만 여기 걸림).
  // 그런 레거시 건에 대해서도 마스터+본인담당실장 둘 다 완전삭제/복구
  // 가능하게 일관되게 맞춤.
  var canActOnThis = isMaster || (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'staff' && (c.staffName||'마스터') === currentUser.name);
  if (isSoftDeleted(c)) {
    if (canActOnThis) {
      bottomBtns.unshift(btn('flex:1;padding:11px;background:#fff;border:1px solid var(--dark);font-size:11px;font-family:inherit;cursor:pointer;color:var(--dark);font-weight:700;border-radius:12px', '↩ 복구', function(){ restoreCustomer(c.clientName, c.id); }));
      bottomBtns.unshift(btn('flex:1;padding:11px;background:#fff;border:1px solid #C0392B;font-size:11px;font-family:inherit;cursor:pointer;color:#C0392B;font-weight:700;border-radius:12px', '완전 삭제', function(){ permanentlyDeleteCustomer(c); }));
    }
  } else {
    bottomBtns.unshift(btn('flex:1;padding:11px;background:#fff;border:1px solid var(--border);font-size:11px;font-family:inherit;cursor:pointer;color:var(--dark);border-radius:12px', '삭제', deleteCustomer));
  }
  body.appendChild(div('display:flex;gap:var(--sp-2)', bottomBtns));

}

function closeDetail() {
  document.getElementById('detail-overlay').className = 'overlay';
  currentDetailName = null;
  currentDetailId = null;
  // 2026-09-13: 화면을 닫으면 "나 지금 보고 있음" 상태도 같이 정리 -
  // 안 그러면 화면을 닫은 뒤에도 계속 "누가 보고 있다"고 잘못 표시됨.
  if (typeof leaveCustomerPresence === 'function') leaveCustomerPresence();
}

function changeStage(stage) {
  var arr = loadCustomers();
  var target = findCurrentDetailCustomer(arr);
  if (!target) return;
  if (currentUser && currentUser.role === 'staff') {
    if ((target.staffName||'마스터') !== currentUser.name) { alert('본인 담당 고객만 단계를 변경할 수 있습니다.'); return; }
  }
  // 2026-08-05: 옛 이름 '완료' 잔여참조 수정 — 실제 값은 '시공완료'라 이 확인창이 영원히 안 뜨고 있었음
  if (stage === '시공완료') { if (!confirm(currentDetailName + ' 고객을 "시공 완료"로 변경할까요?')) return; }
  var fromStage = target.stage;
  target.stage = stage;
  // 2026-08-10: 확정일 기록 - "확정견적" 단계로 처음 전환될 때만 기록(이미
  // confirmDate가 있으면 덮어쓰지 않음 - 나중에 단계를 왔다갔다해도 최초
  // 확정일 유지). 엑셀 다운로드에 확정일 컬럼 추가하면서 필요해진 필드.
  if (stage === '확정견적' && !target.confirmDate) {
    target.confirmDate = todayStr();
  }
  saveCustomers(arr);
  if (typeof logEvent === 'function') logEvent('stage_change', { from: fromStage, to: stage, customerId: target.id, customerName: target.clientName });
  renderHome(true); openDetail(currentDetailName, target.id);
  // 2026-10-08: 단계만 바뀌므로 단계(와 확정일)만 서버로 보냄 - 고객 전체를 통째로 보내면 낡은 값(계약금 등)이 서버를 덮어쓰거나 "동시저장충돌"로 실패함(patchCustomerFieldsToDb 설명 참고).
  var stageFields = { stage: stage };
  if (stage === '확정견적' && target.confirmDate) stageFields.confirm_date = target.confirmDate;
  patchCustomerFieldsToDb(target, stageFields, function(err){
    showToast(err ? ('⚠️ "' + stage + '"으로 변경(로컬만) — 서버 재시도 대기중') : ('"' + stage + '"으로 변경됐습니다'));
  });
}

// 2026-08-28(선혜님 지시 — "삭제하면 보관처리 하지마"): 예전엔 이 함수가
// 보관처리(is_archived=true)를 했었는데, 그게 나중에 "이미 등록된 고객"
// 오판 등 계속 혼란을 만들어서, 이제 "삭제"는 항상 완전삭제로 감. 별도
// 로직을 여기 다시 짜지 않고 permanentlyDeleteCustomer를 그대로 재사용함
// (같은 개념이 두 곳에 따로 있으면 한쪽만 고치고 잊어버리는 실수가
// 오늘 하루 계속 반복됐음 - 체크리스트 24번).
function deleteCustomer() {
  var arr = loadCustomers();
  var target = findCurrentDetailCustomer(arr);
  if (!target) { if (typeof showToast === 'function') showToast('고객 정보를 찾을 수 없어요'); return; }
  permanentlyDeleteCustomer(target);
}

// 2026-08-05: 진짜 완전 삭제 — 이중 확인(경고 문구 + 이름 재확인)을 거쳐야
// 실행됨. 되돌릴 방법이 전혀 없음.
//
// 2026-08-28(선혜님 지시 — "삭제하면 보관처리 하지마 그러면 자꾸 이런
// 헷갈리거나 중복되는 일이 생기는거 같아", 배재연 사례로 확인됨): 보관처리
// (소프트삭제)가 나중에 "이미 등록된 고객"으로 잘못 잡히는 등 계속 혼란을
// 만들어서, 이제 "삭제"는 항상 이 완전삭제 함수 하나로 통일함(deleteCustomer는
// 이 함수를 그대로 재사용 - 같은 로직을 두 번 안 짜기 위함, 체크리스트 24번).
// 마스터는 항상 가능, 실장은 본인 담당 고객만 가능(일관성 우선으로 선혜님
// 확인) - DB RLS(customers_delete)도 함께 확장해뒀음.
function permanentlyDeleteCustomer(c) {
  var isMasterUser = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'master';
  var isOwnStaffCustomer = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'staff' &&
    c && (c.staffName || '마스터') === currentUser.name;
  if (!isMasterUser && !isOwnStaffCustomer) {
    if (typeof showToast === 'function') showToast('본인 담당 고객만 삭제할 수 있어요');
    return;
  }
  var name = c.clientName || '고객';
  if (!confirm('⚠️ ' + name + '님 정보를 삭제할까요?\n\n이 작업은 절대 되돌릴 수 없어요. 견적서·결제기록 등 모든 정보가 완전히 사라져요.')) return;
  var typed = prompt('정말 삭제하려면 고객명을 정확히 입력해주세요: "' + name + '"');
  if (typed !== name) { showToast('입력한 이름이 정확하지 않아 취소됐어요'); return; }
  permanentlyDeleteCustomerFromDb(c, function(err) {
    if (err) { showToast('삭제 실패 — 다시 시도해주세요'); return; }
    var arr = loadCustomers().filter(function(x){ return String(x.id) !== String(c.id); });
    saveCustomers(arr);
    showToast(name + '님 정보가 완전히 삭제됐습니다');
    closeDetail(); renderHome(true);
  });
}

function restoreCustomer(clientName, id) {
  if (!confirm((clientName||'고객') + ' 정보를 복구할까요?')) return;
  var arr = loadCustomers();
  var target = id ? arr.find(function(c) { return String(c.id) === String(id); }) : arr.find(function(c) { return c.clientName === clientName; });
  restoreCustomerFromDb(target || clientName, null);
  if (target) target.is_archived = false;
  saveCustomers(arr);
  showToast(clientName + ' 정보가 복구됐습니다');
  closeDetail();
  if (typeof renderSearch === 'function') renderSearch();
}

var editingCustomerName = null;
var editingCustomerId = null;
