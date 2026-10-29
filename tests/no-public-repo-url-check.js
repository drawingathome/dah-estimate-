// tests/no-public-repo-url-check.js (N-39, 2026-10-29)
// 화면·인쇄물이 쓰는 파일이 공개 저장소 주소(raw.githubusercontent.com/drawingathome/...)에서 이미지·파일을 불러오지 않는지 확인한다.
// 이유: 저장소를 비공개로 바꾸면(N-38) 그 주소는 열리지 않아 고객용 견적서의 로고가 사라진다. 로고는 우리 배포 주소(/logo.png)에서 불러온다.
// 한계: 파일 글자 검사다(실제 접속 확인 아님). backup/ 폴더와 tests/는 제외. 배포 주소에서 logo.png가 열리는 것은 배포 후 검사(운영 확인)가 따로 필요.
const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..');
let failed = 0; const ok = (l, c, d) => { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; };
const files = fs.readdirSync(root).filter(f => /\.(html|js|json|css)$/.test(f) && f !== 'package-lock.json');
const bad = [];
files.forEach(f => { const s = fs.readFileSync(path.join(root, f), 'utf8'); if (/raw\.githubusercontent\.com\/drawingathome|drawingathome\.github\.io/.test(s)) bad.push(f); });
ok('최상위 화면·스크립트 파일 ' + files.length + '개가 공개 저장소 주소를 쓰지 않음', bad.length === 0, bad.join(', '));
const utils = fs.readFileSync(path.join(root, 'est-utils.js'), 'utf8');
ok('견적서 로고(DAH_LOGO_B64)가 배포 주소의 /logo.png를 가리킴', /var DAH_LOGO_B64 = 'https:\/\/dah-dashboard\.vercel\.app\/logo\.png(\?v=\d+)?'/.test(utils));
ok('logo.png 파일이 저장소 루트에 있어 함께 배포됨', fs.existsSync(path.join(root, 'logo.png')) && fs.statSync(path.join(root, 'logo.png')).size > 1000);
const vj = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
ok('vercel.json에 /logo.png 규칙이 있음', vj.indexOf('"/logo.png"') >= 0);
console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 모두 통과'); process.exit(failed ? 1 : 0);
