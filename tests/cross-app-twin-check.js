// tests/cross-app-twin-check.js
// ══════════════════════════════════════════════════
// 2026-09-16(선혜님 - "링크 너가 나한테 준거잖아"로 재확인 후 재작성):
// 예전엔 "대시보드와 견적서 앱은 완전히 다른 도메인이라 코드를 공유할
// 수 없다"는 잘못된 전제로, 같은 목적의 함수(escHtml/openKakaoAddr/
// syncCustomerToSheet/showToast/getRegionFees)를 양쪽에 "따로" 복사해
// 두고 텍스트 비교로만 동기화를 감시했음. 실제로는 shared-optimistic-
// lock.js/shared-staging-guard.js가 이미 몇 주째 두 앱에 동일 파일로
// 로드되며 검증된 패턴이었고, README에도 "향후 같은 방식으로 정리할
// 여지가 있음"이라고 이미 적혀있었음 - 이번에 그 정리를 실제로 함.
//
// 이제 이 함수들은 shared-common-utils.js 하나에만 존재하고, 두 앱
// HTML이 그 파일을 그대로 로드한다. 따라서 "따로 구현된 두 버전이
// 일치하는지"를 매번 감시할 필요 자체가 없어졌다(애초에 같은 파일이라
// 어긋날 방법이 없음) - 대신 이 테스트는 (1) 두 앱이 실제로 이 공용
// 파일을 로드하고 있는지, (2) 각 앱에 예전 중복 정의가 실수로 다시
// 생기지 않았는지, (3) fmtPhone/formatPhone처럼 파라미터 형태가 달라
// 여전히 각자 얇은 래퍼로 남아있는 함수는 실제 동작이 일치하는지를
// 확인한다.
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

async function main() {
  console.log('\n[대시보드↔견적서 공용파일 감시] cross-app-twin-check.js');

  const dashHtml = readFile('dah-dashboard.html');
  const estHtml = readFile('dah-estimate.html');
  const sharedContent = readFile('shared-common-utils.js');

  check('대시보드가 shared-common-utils.js를 로드함', /shared-common-utils\.js/.test(dashHtml));
  check('견적서 앱이 shared-common-utils.js를 로드함', /shared-common-utils\.js/.test(estHtml));

  const SHARED_FUNCTIONS = ['escHtml', 'openKakaoAddr', 'syncCustomerToSheet', 'showToast', 'getRegionFees', 'formatPhoneDigits'];
  SHARED_FUNCTIONS.forEach(fn => {
    check(`${fn}()가 shared-common-utils.js에 정의됨`, new RegExp('function\\s+' + fn + '\\s*\\(').test(sharedContent));
  });
  check('DEFAULT_REGION_FEES가 shared-common-utils.js에 정의됨', /var DEFAULT_REGION_FEES\s*=/.test(sharedContent));

  const dashFiles = fs.readdirSync(path.join(__dirname, '..')).filter(f => /^dash-.*\.js$/.test(f) && f !== 'shared-common-utils.js');
  const estFiles = fs.readdirSync(path.join(__dirname, '..')).filter(f => /^est-.*\.js$/.test(f));
  const dashContent = dashFiles.map(readFile).join('\n');
  const estContent = estFiles.map(readFile).join('\n');
  SHARED_FUNCTIONS.forEach(fn => {
    const dashDup = new RegExp('function\\s+' + fn + '\\s*\\(').test(dashContent);
    const estDup = new RegExp('function\\s+' + fn + '\\s*\\(').test(estContent);
    check(`${fn}()가 대시보드 개별 파일에 중복 정의되지 않음`, !dashDup);
    check(`${fn}()가 견적서 개별 파일에 중복 정의되지 않음`, !estDup);
  });

  const port = 27300 + Math.floor(Math.random()*500);
  const server = await startServer(path.join(__dirname, '..'), port);
  const browser = await launchBrowser();
  try {
    const testNumbers = [
      { input: '01012345678', label: '서울 아닌 휴대폰' },
      { input: '0212345678', label: '서울 지역번호(02)' },
      { input: '025551234', label: '서울 지역번호(02) 7자리 국번' },
      { input: '010', label: '3자리 이하(하이픈 없어야 함)' },
    ];
    for (const t of testNumbers) {
      const dashPage = await browser.newPage();
      await dashPage.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const dashResult = await dashPage.evaluate((v) => (typeof fmtPhone === 'function' ? fmtPhone(v) : null), t.input);
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

    const dashPage2 = await browser.newPage();
    await dashPage2.goto(`http://localhost:${port}/dah-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const dashFees = await dashPage2.evaluate(() => JSON.stringify(getRegionFees()));
    await dashPage2.close();
    const estPage2 = await browser.newPage();
    await estPage2.goto(`http://localhost:${port}/dah-estimate.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const estFees = await estPage2.evaluate(() => JSON.stringify(getRegionFees()));
    await estPage2.close();
    check('getRegionFees() 대시보드/견적서 같은 값 반환', dashFees === estFees, `대시보드=${dashFees}, 견적서=${estFees}`);
  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n========================================');
  if (failCount === 0) console.log('✅ 전체 검사 통과 (공용파일 검증 ' + passCount + '건)');
  else console.log('❌ 어긋남 ' + failCount + '건 발견 — 위 로그에서 어느 파일을 고쳐야 하는지 확인');
  console.log('========================================');
  process.exitCode = failCount === 0 ? 0 : 1;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
