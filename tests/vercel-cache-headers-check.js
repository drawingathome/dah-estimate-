// N-69 ①: ?v=내용해시가 붙은 JS/CSS만 오래 캐시(immutable), 그 외(HTML·sw.js·버전 없는 JS)는 항상 새로 확인.
// 가정(Vercel 규칙): 여러 규칙이 맞으면 나중 규칙이 같은 헤더를 덮어쓴다 → 운영 헤더는 post-deploy-verify가 실제로 확인한다.
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
let failed = 0; const ok = (l, c, d) => { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; };
function cacheFor(url) {
  const [p, qs] = url.split('?'); const q = new URLSearchParams(qs || ''); let v = null;
  for (const h of cfg.headers) {
    if (!new RegExp('^' + h.source + '$').test(p)) continue;
    if (h.has && !h.has.every(x => x.type === 'query' && q.has(x.key))) continue;
    for (const kv of h.headers) if (kv.key === 'Cache-Control') v = kv.value;
  }
  return v;
}
const IMM = /immutable/;
ok('버전 붙은 JS는 오래 캐시', IMM.test(cacheFor('/dash-render.js?v=abc123')));
ok('버전 붙은 CSS는 오래 캐시', IMM.test(cacheFor('/dash-styles.css?v=abc123')));
ok('버전 없는 JS는 새로 확인(no-store)', /no-store/.test(cacheFor('/dash-render.js')));
ok('sw.js는 오래 캐시 금지', !IMM.test(cacheFor('/sw.js?v=1')) && !IMM.test(cacheFor('/sw.js')));
for (const p of ['/', '/dah-dashboard', '/dah-estimate', '/dashboard', '/estimate', '/survey', '/dah-dashboard.html'])
  ok('화면(HTML) ' + p + ' 는 no-store', /no-store/.test(cacheFor(p)), String(cacheFor(p)));
// 모든 화면 파일의 로컬 script/link 가 ?v= 를 가지는지(없으면 위 규칙 혜택 없음 = 안전한 쪽으로 실패)
for (const f of ['dah-dashboard.html', 'dah-estimate.html', 'survey.html']) {
  const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const refs = [...h.matchAll(/<(?:script[^>]+src|link[^>]+href)="(\/?[^":]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map(m => m[1]);
  const noV = refs.filter(r => !/[?&]v=/.test(r));
  ok(f + ': 로컬 JS/CSS ' + refs.length + '개 모두 ?v= 보유', noV.length === 0, noV.join(', '));
}
// 역검증: 규칙을 빼면 실패해야 한다
const saved = JSON.stringify(cfg.headers);
cfg.headers = cfg.headers.filter(h => !h.has);
ok('역검증: 새 규칙을 빼면 버전 JS도 no-store(=시험이 규칙을 실제로 봄)', /no-store/.test(cacheFor('/dash-render.js?v=abc123')));
cfg.headers = JSON.parse(saved);
console.log(failed ? '\n❌ 실패 ' + failed : '\n✅ 모두 통과'); process.exit(failed ? 1 : 0);
