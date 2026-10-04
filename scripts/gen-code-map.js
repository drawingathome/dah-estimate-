// scripts/gen-code-map.js
// ══════════════════════════════════════════════════
// 코드 지도(CODE_MAP.md) 자동 생성 / 검사
//
// 2026-09-24(선혜님 - "이렇게 나누면 나중에 내가 힘들어지니? 안힘들게 하는 법도
// 찾아"): 큰 파일을 여러 개로 나누면 "이 기능이 어느 파일에 있지?"를 찾기 어려워짐.
// 사람이 표를 손으로 관리하면 금방 낡으므로(오늘 여러 번 겪은 유형), 코드에서
// 직접 뽑아서 자동으로 만들고, 낡으면 검사가 실패해서 알려줌.
//
// 사용법
//   node scripts/gen-code-map.js           → CODE_MAP.md 새로 만들기
//   node scripts/gen-code-map.js --check   → CODE_MAP.md가 코드와 맞는지 검사(틀리면 종료코드 1)
//
// 지도에는 줄 수/날짜처럼 자주 바뀌는 값은 넣지 않음 - 함수를 추가/삭제/이동할 때만
// 바뀌도록 해서, 평소 수정 때 매번 갱신하라는 잔소리가 나오지 않게 함.
// ══════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const OUT = path.join(root, 'CODE_MAP.md');
const PAGES = [
  { html: 'dah-dashboard.html', title: '대시보드 앱' },
  { html: 'dah-estimate.html', title: '견적서 앱' },
  { html: 'survey.html', title: '설문지' }
];

function read(f) { return fs.readFileSync(path.join(root, f), 'utf-8'); }

// 파일 맨 위 설명 주석에서 "역할" 한 줄 뽑기
function purposeOf(src) {
  const m = src.match(/^\s*\/\*([\s\S]*?)\*\//);
  let text = m ? m[1] : (src.match(/^\s*((?:\/\/.*\n?)+)/) || [, ''])[1].replace(/^\s*\/\/ ?/gm, '');
  const line = text.split('\n').map(l => l.replace(/[═─]+/g, '').replace(/^\s*\*?\s*/, '').trim()).find(l => l.length > 0);
  return (line || '(설명 없음)').replace(/\|/g, '/').slice(0, 90);
}

// 최상위 function 선언 이름들
function functionsOf(file, src) {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2019, true, ts.ScriptKind.JS);
  return sf.statements.filter(s => ts.isFunctionDeclaration(s) && s.name).map(s => s.name.text);
}

function build() {
  const allJs = fs.readdirSync(root).filter(f => f.endsWith('.js')).sort();
  const info = {};
  allJs.forEach(f => {
    const src = read(f);
    info[f] = { purpose: purposeOf(src), fns: f.includes('.min.') ? [] : functionsOf(f, src) };
  });

  const usedByPage = new Set();
  let md = '# 코드 지도 (자동 생성 — 직접 고치지 마세요)\n\n';
  md += '"이 기능이 어느 파일에 있지?"를 찾는 지도예요. 코드에서 자동으로 뽑아서 만들어요.\n';
  md += '함수를 추가/삭제/이동했다면 `node scripts/gen-code-map.js` 를 실행해서 갱신하세요 ';
  md += '(안 하면 자동 검사가 알려줘요).\n\n';
  md += '함수 이름으로 찾으려면 아래 **"함수 찾기"** 표에서 검색하세요.\n\n';

  PAGES.forEach(p => {
    const html = read(p.html);
    const srcs = [...html.matchAll(/<script[^>]+src="\/([^"?]+\.js)/g)].map(m => m[1]).filter(f => info[f]);
    md += `## ${p.title} (${p.html}) — 브라우저가 불러오는 순서대로\n\n| # | 파일 | 역할 | 함수 수 |\n|---|---|---|---|\n`;
    srcs.forEach((f, i) => {
      usedByPage.add(f);
      md += `| ${i + 1} | \`${f}\` | ${info[f].purpose} | ${info[f].fns.length} |\n`;
    });
    md += '\n';
  });

  const others = allJs.filter(f => !usedByPage.has(f));
  md += '## 그 밖의 파일 (앱 화면이 직접 불러오지 않는 것들)\n\n| 파일 | 역할 |\n|---|---|\n';
  others.forEach(f => { md += `| \`${f}\` | ${info[f].purpose} |\n`; });
  md += '\n> `apps-script-*.js` 는 구글 Apps Script 편집기에 **직접 붙여넣어야** 실제로 반영돼요(GitHub에 올리는 것만으론 안 바뀜).\n\n';

  const byFn = {};
  allJs.forEach(f => info[f].fns.forEach(fn => { (byFn[fn] = byFn[fn] || []).push(f); }));
  md += '## 함수 찾기 (알파벳순)\n\n| 함수 | 파일 |\n|---|---|\n';
  Object.keys(byFn).sort((a, b) => a.localeCompare(b)).forEach(fn => {
    md += `| \`${fn}\` | ${byFn[fn].map(f => '`' + f + '`').join(', ')} |\n`;
  });
  return md;
}

const map = build();
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf-8') : '';
  if (cur === map) { console.log('✅ CODE_MAP.md가 현재 코드와 일치해요.'); process.exit(0); }
  console.log('❌ CODE_MAP.md가 현재 코드와 안 맞아요(함수/파일을 추가·삭제·이동한 뒤 갱신을 깜빡함).');
  console.log('   → node scripts/gen-code-map.js 를 실행하고 CODE_MAP.md를 함께 커밋하세요.');
  process.exit(1);
}
fs.writeFileSync(OUT, map);
console.log('✅ CODE_MAP.md를 만들었어요 (' + map.split('\n').length + '줄)');
