// 저장↔복원 필드 목록 자동 대조 (정적 분석, 브라우저 불필요)
// 2026-09-08(선혜님 지시 - "다시 이런 오류가 안생기려면 뭘해야하지??"):
// "저장할 때 모으는 필드"와 "불러올 때 채우는 필드"가 시간이 지나면서
// 어긋나는 게 반복 재발했음(8/29 hemType 누락, 9/8 pnum 누락 - 정확히
// 같은 유형). 사람이 매번 수동으로 grep 대조하는 대신, collectLineItems
// (저장)/restoreLineItemsToForm(견적서 다시열기)/loadDraft(임시저장 복원)
// 세 함수의 querySelector('.클래스명') 목록을 소스코드에서 직접 추출해
// 자동으로 비교 - 새 필드를 한쪽에만 추가하면 이 테스트가 즉시 실패한다.
//
// 이 테스트가 잡는 것: "필드가 빠졌다"만 잡는다. 값이 실제로 올바르게
// 복원되는지(예: calcCurtainRow 부수효과로 덮어써지는지)는 별도
// curtain-select-value-integrity-check.js가 담당한다 - 두 테스트는
// 서로 다른 종류의 실수를 잡으므로 하나로 합치지 않는다.
const fs = require('fs');
const path = require('path');

// 저장은 하지만 복원할 필요가 없는 필드(계산 결과 표시용, 값 자체는
// mw/mh/price 등 원본 필드로부터 매번 재계산되므로 복원 대상이 아님).
const SAVE_ONLY_OK = new Set(['.bamt', '.camt']);

function extractFieldClasses(filePath, startMarker, endMarker) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) throw new Error(`${startMarker} 를 ${filePath} 에서 찾을 수 없음`);
  const endIdx = endMarker ? content.indexOf(endMarker, startIdx) : content.length;
  const body = content.slice(startIdx, endIdx === -1 ? undefined : endIdx);
  const matches = body.match(/querySelector\('\.[a-zA-Z-]+'\)/g) || [];
  const classes = matches.map(m => m.match(/'\.([a-zA-Z-]+)'/)[1]);
  return new Set(classes.map(c => '.' + c));
}

function run() {
  const dir = path.resolve(__dirname, '..');
  let anyFail = false;

  const saveFields = extractFieldClasses(
    path.join(dir, 'est-misc.js'),
    'function collectLineItems()',
    '\nfunction autoSave()'
  );
  const restoreFields = extractFieldClasses(
    path.join(dir, 'est-customer-load.js'),
    'function restoreLineItemsToForm(',
    null
  );
  const draftFields = extractFieldClasses(
    path.join(dir, 'est-misc.js'),
    'function loadDraft()',
    '\nfunction clearDraft()'
  );

  console.log('[field-parity-check] 저장 필드:', [...saveFields].sort().join(', '));

  function compare(name, targetFields) {
    const missing = [...saveFields].filter(f => !targetFields.has(f) && !SAVE_ONLY_OK.has(f));
    const ok = missing.length === 0;
    console.log(ok ? '✅' : '❌', `[${name}] 저장 필드가 전부 복원 로직에도 있음`,
      ok ? '' : `— 누락: ${missing.join(', ')}`);
    return ok;
  }

  if (!compare('restoreLineItemsToForm', restoreFields)) anyFail = true;
  if (!compare('loadDraft', draftFields)) anyFail = true;

  process.exit(anyFail ? 1 : 0);
}

run();
