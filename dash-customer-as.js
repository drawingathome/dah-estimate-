/* ══════════════════════════════════════════════════
   고객상세 - AS 탭 렌더링 (React 전환 1호)
   ⚠️ 2026-09-29(선혜님 최종 결정): React 전환은 이 파일과 dash-customer-add.js 2곳에서 중단됨 -
   앞으로 다른 화면을 이 방식(React.createElement)으로 새로 바꾸지 말 것. 이 프로젝트는 빌드
   도구(JSX/번들러) 없이 <script> 태그로 바로 실행되는 구조라, React를 쓰면 JSX 없이 손으로
   React.createElement를 써야 해서 장점은 못 살리고 실수(컨트롤드 인풋 함정 등)만 늘어남 -
   실제로 이 2개 파일을 만드는 과정에서 같은 유형의 실수가 반복돼 신뢰 문제가 생김. 이 2개
   파일은 이미 배포되고 검증됐으니 안정성을 위해 그대로 유지(되돌리지 않음) - 앞으로 다른
   화면은 React 없이 "로직 통합 + 기록 테스트"만 함.
   2026-09-29(선혜님 - "React 전환부터" 선택): 이 파일이 첫 React 전환 대상 - 완전히 독립된 화면
   (88줄, 함수 1개, 버그 이력 0회)이라 연습으로 안전함. 바깥 인터페이스(renderASSection(c, asBody))는
   기존과 동일하게 유지해서, 이 함수를 부르는 dash-customer-detail.js는 한 글자도 안 바꿔도 됨 -
   안에서만 React를 씀.

   전환 전 동작은 tests/as-section-golden-master-check.js(6개 시나리오)에 기록해뒀고, 이 파일은 그
   기록과 "사람이 보는 내용"(화면 텍스트, 폼 상태, 서버로 나가는 요청)이 같도록 만들어짐 - DOM 태그
   구조 자체는 React가 다르게 그릴 수 있어 비교 기준으로 삼지 않음.

   원본과 동일하게 지킨 동작들:
   - AS 탭을 열 때마다(같은 고객이라도) 매번 서버에서 새로 목록을 불러옴 - React가 "값이 안 바뀌면
     다시 안 부른다"는 습관을 그대로 두면 이 동작이 깨지므로, renderASSection이 호출될 때마다
     컴포넌트에 새 key를 줘서 완전히 새로 마운트되게 함(강제 재조회).
   - 증상 미입력시 등록 막고 토스트, 등록 중 버튼 비활성화+문구 변경, 등록/상태변경 성공시 로그 기록.
   ══════════════════════════════════════════════════ */

var AS_STATUS_STEPS = ['접수', '방문예정', '완료'];
var _asRenderSeq = 0; // 탭을 열 때마다 새 key를 줘서 강제로 새로 마운트(=강제 재조회)되게 함

function renderASSection(c, asBody) {
  if (!asBody || !c) return;
  if (!asBody._reactRoot) asBody._reactRoot = ReactDOM.createRoot(asBody);
  _asRenderSeq++;
  asBody._reactRoot.render(React.createElement(ASSection, { key: _asRenderSeq, customer: c }));
}

function ASSection({ customer }) {
  const e = React.createElement;
  const c = customer;
  const [symptom, setSymptom] = React.useState('');
  const [visitDate, setVisitDate] = React.useState('');
  const [feeType, setFeeType] = React.useState('무상');
  const [feeAmount, setFeeAmount] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [records, setRecords] = React.useState(null); // null=로딩중, []=빈목록, 배열=목록, 'error'=오류
  const [reloadTick, setReloadTick] = React.useState(0);

  React.useEffect(function () {
    let cancelled = false;
    setRecords(null);
    sbXHR('GET', 'as_records?customer_id=eq.' + encodeURIComponent(c.id) + '&is_archived=eq.false&order=created_at.desc', null, function (err, rows) {
      if (cancelled) return;
      if (err || !Array.isArray(rows)) { setRecords('error'); return; }
      setRecords(rows);
    });
    return function () { cancelled = true; };
  }, [reloadTick]);

  function handleAdd() {
    var s = symptom.trim();
    if (!s) { showToast('증상을 입력해주세요'); return; }
    var payload = {
      customer_id: c.id || null,
      customer_name: c.clientName || '',
      install_date: c.installDate || '',
      receipt_date: todayStr(),
      symptom: s,
      visit_date: visitDate || null,
      fee_type: feeType,
      fee_amount: feeType === '유상' ? (Number(feeAmount) || 0) : 0,
      staff_name: (currentUser && currentUser.role === 'staff') ? currentUser.name : '마스터',
      status: '접수',
      // 2026-09-30(선혜님 - "이 문제의 쌍둥이함수도 찾아봤니" - est-save-stages.js에서 발견한
      // 것과 같은 클래스의 위험으로 보여 전수검색으로 여기도 함께 고쳤음): 당시 "DB 기본값이
      // NULL일 수 있다"는 이론이었으나, 같은 날 dahDiagnoseSchema로 as_records.is_archived의
      // 실제 기본값을 확인해보니 false였음(이론은 틀렸음). 즉 이 필드 생략이 실제 사고로
      // 이어진 적은 확인되지 않았고 예방 차원의 수정이었음 - 다만 명시적으로 false를 보내는
      // 것 자체는 DB 기본값이 무엇이든 옳은 방어적 습관이라 그대로 둠.
      is_archived: false
    };
    setSubmitting(true);
    sbXHR('POST', 'as_records', payload, function (err) {
      setSubmitting(false);
      if (err) { showToast('등록 실패, 다시 시도해주세요'); return; }
      if (typeof logEvent === 'function') logEvent('as_receipt', { customerId: c.id, customerName: c.clientName, symptom: s });
      showToast('AS 접수가 등록됐어요');
      setSymptom(''); setVisitDate(''); setFeeType('무상'); setFeeAmount('');
      setReloadTick(function (n) { return n + 1; });
    });
  }

  function handleAdvance(rec, nextStatus) {
    sbXHR('PATCH', 'as_records?id=eq.' + encodeURIComponent(rec.id), { status: nextStatus }, function (err2) {
      if (err2) { showToast('상태 변경 실패'); return; }
      if (typeof logEvent === 'function') logEvent('as_status_change', { customerId: c.id, customerName: c.clientName, from: rec.status, to: nextStatus });
      setReloadTick(function (n) { return n + 1; });
    });
  }

  const form = e('div', { style: { background: 'var(--ivory1)', borderRadius: 'var(--r-card)', padding: '10px 12px', marginBottom: '12px' } },
    e('div', { style: { fontSize: '11px', fontWeight: 700, color: 'var(--terra)', letterSpacing: '0.05em', marginBottom: '8px' } }, '📋 AS 접수'),
    e('textarea', {
      placeholder: '증상/요청 내용', value: symptom, onChange: function (ev) { setSymptom(ev.target.value); },
      style: { width: '100%', minHeight: '56px', padding: '8px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', marginBottom: '6px' }
    }),
    e('input', {
      type: 'date', value: visitDate, onChange: function (ev) { setVisitDate(ev.target.value); },
      style: { width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '6px' }
    }),
    e('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px' } },
      e('select', {
        value: feeType, onChange: function (ev) { setFeeType(ev.target.value); },
        style: { flex: 1, padding: '8px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontFamily: 'inherit' }
      }, e('option', { value: '무상' }, '무상'), e('option', { value: '유상' }, '유상')),
      e('input', {
        type: 'number', placeholder: '금액(유상일 때만)', value: feeAmount, onChange: function (ev) { setFeeAmount(ev.target.value); },
        style: { flex: 1, padding: '8px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box', display: feeType === '유상' ? '' : 'none' }
      })
    ),
    e('button', {
      disabled: submitting, onClick: handleAdd,
      style: { width: '100%', padding: '9px', background: 'var(--dark)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '12px', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }
    }, submitting ? '등록 중...' : '접수 등록')
  );

  let list;
  if (records === null) {
    list = e('div', { style: { fontSize: '12px', color: 'var(--sub)' } }, '불러오는 중...');
  } else if (records === 'error') {
    list = e('div', { style: { fontSize: '12px', color: 'var(--sub)' } }, 'AS 이력을 불러오지 못했어요');
  } else if (records.length === 0) {
    list = e('div', { style: { fontSize: '12px', color: 'var(--sub)', padding: '8px 0' } }, '등록된 AS 이력이 없어요');
  } else {
    list = e('div', {}, records.map(function (rec) {
      var statusColor = rec.status === '완료' ? '#2F6690' : (rec.status === '방문예정' ? 'var(--terra)' : '#8A8378');
      var metaLine = (rec.fee_type || '무상') + (rec.fee_type === '유상' ? (' · ' + Number(rec.fee_amount || 0).toLocaleString('ko-KR') + '원') : '') + (rec.visit_date ? (' · 방문예정: ' + rec.visit_date) : '');
      var nextIdx = AS_STATUS_STEPS.indexOf(rec.status) + 1;
      var nextStatus = (nextIdx > 0 && nextIdx < AS_STATUS_STEPS.length) ? AS_STATUS_STEPS[nextIdx] : null;
      return e('div', { key: rec.id, style: { padding: '10px 0', borderBottom: '1px solid var(--ivory1)' } },
        e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' } },
          e('span', { style: { fontSize: '11px', color: 'var(--sub)' } }, rec.receipt_date || ''),
          e('span', { style: { fontSize: '11px', fontWeight: 700, color: statusColor, background: 'var(--ivory1)', padding: '2px 8px', borderRadius: '10px' } }, rec.status)
        ),
        e('div', { style: { fontSize: '12px', color: 'var(--dark)', marginBottom: '4px' } }, rec.symptom || ''),
        e('div', { style: { fontSize: '11px', color: 'var(--sub)', marginBottom: '6px' } }, metaLine),
        nextStatus ? e('button', {
          onClick: function () { handleAdvance(rec, nextStatus); },
          style: { fontSize: '11px', fontWeight: 700, color: 'var(--dark)', background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer' }
        }, nextStatus + '로 변경') : null
      );
    }));
  }

  return e(React.Fragment, {}, form, list);
}
