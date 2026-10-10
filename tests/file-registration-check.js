// tests/file-registration-check.js
// ══════════════════════════════════════════════════
// 2026-09-24(선혜님 - "이렇게 나누면 나중에 내가 힘들어지니? 안힘들게 하는 법도
// 찾아"): 파일을 나누면 "새 파일을 HTML 스크립트 태그 / 타입체크 설정에 등록하는
// 걸 깜빡하는" 실수가 생길 수 있음(오늘 파일 쪼개기 5번 하는 동안 실제로 이 목록들이
// 여러 번 어긋났음). 사람이 기억하는 대신 자동으로 확인:
//   1) HTML이 불러오는 스크립트 파일이 실제로 존재하는지
//   2) 루트의 .js 파일이 어떤 HTML에서도 안 불러와지는데 예외 목록에도 없으면
//      → "새로 만들고 HTML에 등록을 깜빡한 파일" (기능이 조용히 안 돌아감)
//   3) HTML이 불러오는 내 코드가 타입체크 설정(tsconfig)에 하나도 없으면
//      → 타입체크 사각지대(survey-app.js가 이랬던 적 있음)
// ══════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

// HTML이 직접 안 불러와도 정상인 파일들 (이유를 꼭 적을 것)
const NOT_LOADED_BY_HTML = {
  'apps-script-automation-hub.js': '구글 Apps Script 편집기에 직접 붙여넣는 파일(브라우저 앱과 별개)',
  'apps-script-daily-backup.js': '구글 Apps Script 편집기에 직접 붙여넣는 파일',
  'apps-script-survey-to-customer.js': '구글 Apps Script 편집기에 직접 붙여넣는 파일',
  'html2pdf.bundle.min.js': '외부 라이브러리(필요할 때 동적으로 불러옴)',
  'sw.js': '서비스워커(navigator.serviceWorker.register로 등록)'
};

const PAGES = ['dah-dashboard.html', 'dah-estimate.html', 'survey.html'];
let failCount = 0;
function ok(m) { console.log('✅ ' + m); }
function fail(m) { console.log('❌ ' + m); failCount++; }

const loaded = new Set();
PAGES.forEach(p => {
  const html = fs.readFileSync(path.join(root, p), 'utf-8');
  [...html.matchAll(/<script[^>]+src="\/([^"?]+\.js)/g)].forEach(m => {
    loaded.add(m[1]);
    if (!fs.existsSync(path.join(root, m[1]))) fail(p + '가 불러오는 ' + m[1] + ' 파일이 실제로 없어요(이름 바꿨는데 태그를 안 고침?)');
  });
});
if (failCount === 0) ok('HTML이 불러오는 모든 스크립트 파일이 실제로 존재함(' + loaded.size + '개)');

const rootJs = fs.readdirSync(root).filter(f => f.endsWith('.js'));
const orphans = rootJs.filter(f => !loaded.has(f) && !NOT_LOADED_BY_HTML[f]);
if (orphans.length === 0) ok('어느 HTML에서도 안 불러오는 "등록 누락 의심 파일"이 없음');
else orphans.forEach(f => fail(f + ' — 루트에 있는데 어떤 HTML도 안 불러와요. 새로 만든 파일이면 HTML에 <script> 태그를 추가하세요(안 하면 그 안의 기능이 조용히 안 돌아가요). 원래 그런 파일이면 이 검사의 NOT_LOADED_BY_HTML에 이유와 함께 추가하세요.'));

const tsFiles = new Set();
fs.readdirSync(root).filter(f => /^tsconfig.*\.json$/.test(f)).forEach(f => {
  (JSON.parse(fs.readFileSync(path.join(root, f), 'utf-8')).files || []).forEach(x => tsFiles.add(x));
});
const untyped = [...loaded].filter(f => !f.includes('.min.') && !tsFiles.has(f));
if (untyped.length === 0) ok('HTML이 불러오는 모든 내 코드가 타입체크 설정에 들어 있음');
else untyped.forEach(f => fail(f + ' — HTML은 불러오는데 tsconfig.*.json 어디에도 없어요(타입체크 사각지대). 해당 앱의 tsconfig "files"에 추가하세요.'));

const stale = Object.keys(NOT_LOADED_BY_HTML).filter(f => !fs.existsSync(path.join(root, f)));
if (stale.length) stale.forEach(f => fail('예외 목록의 ' + f + ' 파일이 이제 없어요 - 이 검사의 NOT_LOADED_BY_HTML에서 지우세요'));

console.log(failCount === 0 ? '\n전체 통과' : '\n실패 ' + failCount + '건');
process.exit(failCount === 0 ? 0 : 1);
