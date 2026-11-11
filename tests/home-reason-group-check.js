// 2026-11-12(N-150): 홈 '처리필요'에서 사유가 어느 그룹에도 안 맞아 '건수만 잡히고 화면엔 안 보이는' 일을 막는다.
// ① 코드의 모든 reasons.push(...) 사유가 그룹(test)에 연결돼 있는지 ② 어느 그룹에도 안 맞는 사유를 보여 주는 '기타 확인' 안전망이 마지막에 있는지.
const fs = require('fs'), path = require('path');
let failed = 0;
function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; }
const src = fs.readFileSync(path.join(__dirname, '..', 'dash-render.js'), 'utf8');
const gStart = src.indexOf('var groups = ['); const gEnd = src.indexOf('];', gStart);
const groupsSrc = src.slice(gStart, gEnd);
const lits = [...groupsSrc.matchAll(/indexOf\('([^']+)'\)/g)].map(m => m[1]);
ok('그룹 판별 문구를 읽음(5개 이상)', lits.length >= 5, String(lits.length));
// reasons.push(...) 한 줄에 들어 있는 문자열 조각을 전부 모아 한 사유로 본다(예: getDisplayStageLabel(c) + ' 후 ' + n + '일째 진행없음')
const reasons = src.split('\n').filter(l => /reasons\.push\(/.test(l)).map(l => [...l.slice(l.indexOf('reasons.push(')).matchAll(/'([^']*)'/g)].map(m => m[1]).join('~'));
ok('사유 문구를 읽음(5개 이상)', reasons.length >= 5, String(reasons.length));
reasons.forEach(r => ok('사유 "' + r.trim().slice(0, 18) + '…"가 어떤 그룹에 연결됨', lits.some(l => r.indexOf(l) >= 0), r));
const fb = src.indexOf("title: '기타 확인'"); const push = src.indexOf('groups.push(', gEnd);
ok("안전망 '기타 확인' 그룹이 있음", fb > 0);
ok('안전망이 모든 그룹 정의 뒤(마지막)에 추가됨', fb > 0 && push > 0 && push < fb + 5 && fb > gEnd);
process.exit(failed ? 1 : 0);
