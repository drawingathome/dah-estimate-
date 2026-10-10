// 테스트용 서버 포트가 리눅스 임시포트 범위(32768~60999)에 들어가면 가끔 EADDRINUSE로 CI가 우연히 실패함(2026-10-09, 2회 발생).
// 포트를 직접 지정하는 모든 테스트가 32768 미만을 쓰는지 검사.
const fs = require('fs'), path = require('path');
const re = /(port ?= ?|open[A-Za-z]*\(|startServer\([a-zA-Z_.]+, ?|listen\()(\d{5})\b/g;
const bad = [];
for (const f of fs.readdirSync(__dirname).filter(n => n.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8'); let m;
  while ((m = re.exec(src))) { if (Number(m[2]) >= 32768) bad.push(f + ': ' + m[2]); }
}
if (bad.length) { console.log('❌ 임시포트 범위(32768~)와 겹치는 테스트 포트 ' + bad.length + '건:\n' + [...new Set(bad)].join('\n')); process.exit(1); }
console.log('✅ 전체 통과 — 모든 테스트 포트가 32768 미만');
