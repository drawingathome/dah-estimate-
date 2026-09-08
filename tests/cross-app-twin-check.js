// tests/cross-app-twin-check.js
// ══════════════════════════════════════════════════
// 대시보드(dah-dashboard.vercel.app)와 견적서 앱(dah-estimate.vercel.app)은
// 완전히 다른 도메인이라 코드를 공유할 수 없음 - 같은 목적의 로직이
// 양쪽에 "따로" 구현돼있고, 한쪽만 고치면 조용히 어긋난다.
//
// 2026-08-29: 이 문제로 실제 발견된 사례 —
//   - fmtPhone: 대시보드는 서울 지역번호(02) 처리가 있는데 견적서 앱엔 없어서
//     실제로 잘못 포맷되고 있었음
//   - buildRequestFromLineItems(대시보드): 견적서 앱(est-documents.js)이
//     8/24·8/28에 개선한 "같은 공간 묶어서 표시" 로직을 전혀 반영 못 하고
//     2026-08-04 최초 버전 그대로 방치돼서, 대시보드에서 다시 보면 견적서
//     앱과 다른(낡은) 형식으로 보이고 있었음
//
// 둘 다 "사람이 우연히 발견"해서 알게 됐음 - 이 테스트는 그런 발견을
// 매번 사람이 하지 않아도, 회귀테스트를 돌릴 때마다 자동으로 잡아내기
// 위해 만들어짐(선혜님 제안 - "1번(구조통합)도 2번(수동주석)도 아니고,
// 자동 감시 테스트를 만들자").
//
// 실행 방식: 브라우저 없이 순수 텍스트 비교 - "완전히 똑같아야 하는"
// 함수는 소스코드 텍스트(공백 정규화 후) 일치를 확인하고, "파라미터
// 형태가 달라서 텍스트로는 비교 못 하는" 함수(fmtPhone 등)는 실제
// 두 파일을 각각 로드해서 같은 입력에 같은 출력이 나오는지 행동으로 비교한다.
// ══════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

let passCount = 0, failCount = 0;
function check(label, condition, detail) {
  if (condition) { console.log('  ✅ ' + label); passCount++; }
  else { console.log('  ❌ ' + label + (detail ? ' — ' + detail : '')); failCount++; }
}

function readFile(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

// 파일 안에서 "function 이름(...) { ... }" 전체 블록을 중괄호 짝 맞춰 추출
function extractFunctionSource(content, fnName) {
  const startPattern = new RegExp('function\\s+' + fnName + '\\s*\\([^)]*\\)\\s*\\{');
  const m = startPattern.exec(content);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  const bodyStart = i;
  while (depth > 0 && i < content.length) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }
  return content.slice(m.index, i);
}

// 비교용 정규화: 공백/줄바꿈 차이는 무시하고, 실제 토큰(코드 내용)만 비교
function normalize(src) {
  if (!src) return null;
  return src.replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log('\n[대시보드↔견적서 쌍둥이 함수 자동감시] cross-app-twin-check.js');

  const dashFiles = fs.readdirSync(path.join(__dirname, '..')).filter(f => /^dash-.*\.js$/.test(f));
  const estFiles = fs.readdirSync(path.join(__dirname, '..')).filter(f => /^est-.*\.js$/.test(f));
  const dashContent = dashFiles.map(readFile).join('\n');
  const estContent = estFiles.map(readFile).join('\n');

  // ── 1) "완전히 텍스트가 똑같아야 하는" 함수들 ──
  // (2026-08-29 감사에서 확인: escHtml/openKakaoAddr/showToast/
  //  syncCustomerToSheet는 의도적으로 완전 동일한 복사본이어야 함.
  //  showFieldError는 파라미터 타입 자체가 다르게 설계된 의도된 차이라 제외.)
  const IDENTICAL_FUNCTIONS = ['escHtml', 'openKakaoAddr', 'syncCustomerToSheet'];
  IDENTICAL_FUNCTIONS.forEach(fn => {
    const a = normalize(extractFunctionSource(dashContent, fn));
    const b = normalize(extractFunctionSource(estContent, fn));
    check(
      `${fn}() 대시보드/견적서 완전 동일`,
      a !== null && b !== null && a === b,
      a === null ? '대시보드에서 못 찾음' : b === null ? '견적서에서 못 찾음' : '내용이 서로 다름 - 한쪽만 고쳤을 가능성'
    );
  });

  // showToast는 오늘 표시시간(2200→2500ms)을 통일했음 - 계속 같은지 확인
  {
    const a = normalize(extractFunctionSource(dashContent, 'showToast'));
    const b = normalize(extractFunctionSource(estContent, 'showToast'));
    const aMs = a && a.match(/,\s*(\d+)\s*\)/);
    const bMs = b && b.match(/,\s*(\d+)\s*\)/);
    check('showToast() 표시시간 동일', aMs && bMs && aMs[1] === bMs[1], `대시보드=${aMs&&aMs[1]}ms, 견적서=${bMs&&bMs[1]}ms`);
  }

  // ── 2) 지역요금 기본값(변수명은 달라도 값은 같아야 함) ──
  {
    const dashMatch = dashContent.match(/var DEFAULT_REGION_FEES_DASH\s*=\s*(\{[^;]+\});/);
    const estMatch = estContent.match(/var DEFAULT_REGION_FEES\s*=\s*(\{[^;]+\});/);
    let same = false, detail = '';
    try {
      const dashVal = eval('(' + dashMatch[1] + ')');
      const estVal = eval('(' + estMatch[1] + ')');
      same = JSON.stringify(dashVal) === JSON.stringify(estVal);
      if (!same) detail = '값이 서로 다름: ' + JSON.stringify(dashVal) + ' vs ' + JSON.stringify(estVal);
    } catch (e) { detail = '파싱 실패: ' + e.message; }
    check('지역요금 기본값(DEFAULT_REGION_FEES) 동일', same, detail);
  }

  // 2026-09-01(선혜님 지시 - "왜 2개를 만드니"로 이 쌍둥이 문제 자체를
  // 근본 해결): buildRequestFromLineItems(대시보드가 저장된 lineItems로
  // 직접 문서를 재구성하던 로직)를 완전히 제거하고, 대시보드는 이제
  // 견적서 앱을 새 창으로 열어서(autoDoc 파라미터) 문서를 만들게 바뀜 -
  // 쌍둥이 비교 대상 자체가 없어져서 이 검사도 함께 제거. 문서 생성
  // 로직이 이제 est-documents.js 한 곳에만 있어서, 애초에 "어긋날" 방법이
  // 없어짐(가장 확실한 쌍둥이 버그 방지).


  // ── 4) fmtPhone - 파라미터 형태가 달라 텍스트 비교 불가, 실제 동작(출력값)으로 비교 ──
  const port = 27300 + Math.floor(Math.random()*500);
  const server = await startServer(path.join(__dirname, '..'), port);
  const browser = await launchBrowser();
  try {
    const testNumbers = [
      { input: '01012345678', label: '서울 아닌 휴대폰' },
      { input: '0212345678', label: '서울 지역번호(02)' },
      { input: '025551234', label: '서울 지역번호(02) 7자리 국번' },
    ];
    for (const t of testNumbers) {
      const dashPage = await browser.newPage();
      await dashPage.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const dashResult = await dashPage.evaluate((v) => (typeof fmtPhone === 'function' ? fmtPhone(v) : null), t.input);
      // 2026-08-29(선혜님 지시 - HTML 파일 전체 재검토로 발견): 대시보드
      // 안에 fmtPhone과는 완전히 별개인 세 번째 전화번호 포맷 함수
      // formatPhone(dash-ui-helpers.js, "고객추가" 폼에서 실사용중)이
      // 있었고 똑같은 서울지역번호 버그가 있었음 - fmtPhone과 계속
      // 일관되게 유지되는지 여기서 같이 확인.
      const dashFormatPhoneResult = await dashPage.evaluate((v) => (typeof formatPhone === 'function' ? formatPhone(v) : null), t.input);
      await dashPage.close();

      const estPage = await browser.newPage();
      await estPage.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const estResult = await estPage.evaluate((v) => {
        const el = document.createElement('input');
        el.value = v;
        if (typeof fmtPhone === 'function') { fmtPhone(el); return el.value; }
        return null;
      }, t.input);
      await estPage.close();

      check(`fmtPhone(${t.label}) 대시보드/견적서 같은 결과`, dashResult === estResult, `대시보드="${dashResult}", 견적서="${estResult}"`);
      check(`formatPhone(${t.label}, 세번째 별도함수) fmtPhone과 같은 결과`, dashFormatPhoneResult === dashResult, `formatPhone="${dashFormatPhoneResult}", fmtPhone="${dashResult}"`);
    }
  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n========================================');
  if (failCount === 0) console.log('✅ 전체 검사 통과 (쌍둥이 함수 ' + passCount + '건 일치 확인)');
  else console.log('❌ 어긋남 ' + failCount + '건 발견 — 위 로그에서 어느 파일을 고쳐야 하는지 확인');
  console.log('========================================');
  process.exitCode = failCount === 0 ? 0 : 1;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
