#!/usr/bin/env node
// tests/integrity-rule-labels-check.js
// 2026-10-14(3-3 점검 규칙 품질 검사): DB 점검 뷰(data_integrity_issues)에 규칙(code)을 추가했는데
// 대시보드 점검 카드의 한글 이름(INTEGRITY_LABELS)을 안 붙이면 영어 코드가 그대로 노출됨 → 이 테스트가 막음.
// 또 UNION 규칙마다 severity('warn'/'info')가 있어야 함. 저장소의 migration_*.sql 에서 규칙을 읽어서 비교.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
let fail = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; };

const codes = new Set();
const sevBad = [];
fs.readdirSync(root).filter(f => /^migration_.*\.sql$/.test(f)).forEach(f => {
  const sql = fs.readFileSync(path.join(root, f), 'utf8');
  const re = /'([A-Z][A-Z0-9_]+)'(?:::text)?\s+AS\s+code\s*,\s*'([a-z]+)'(?:::text)?\s+AS\s+severity/gi;
  let m;
  while ((m = re.exec(sql))) { codes.add(m[1]); if (m[2] !== 'warn' && m[2] !== 'info') sevBad.push(f + ':' + m[1] + '=' + m[2]); }
  const re2 = /select\s+'([A-Z][A-Z0-9_]+)'\s*,\s*'([a-z]+)'/gi; // 저장소 파일의 짧은 표기: select 'CODE','warn', ...
  while ((m = re2.exec(sql))) { codes.add(m[1]); if (m[2] !== 'warn' && m[2] !== 'info') sevBad.push(f + ':' + m[1] + '=' + m[2]); }
});
const watch = fs.readFileSync(path.join(root, 'dash-integrity-watch.js'), 'utf8');
const labelBlock = (watch.match(/var INTEGRITY_LABELS = \{([\s\S]*?)\};/) || [])[1] || '';
const labels = new Set((labelBlock.match(/[A-Z][A-Z0-9_]+(?=\s*:)/g) || []));

ok(codes.size >= 12, '저장소에서 읽은 점검 규칙 수: ' + codes.size + ' (' + Array.from(codes).join(', ') + ')');
const missing = Array.from(codes).filter(c => !labels.has(c));
ok(missing.length === 0, '모든 점검 규칙에 한글 이름(INTEGRITY_LABELS)이 있음' + (missing.length ? ' — 누락: ' + missing.join(', ') : ''));
const stale = Array.from(labels).filter(c => !codes.has(c));
ok(stale.length === 0, '화면 라벨 중 DB에 없는 옛 규칙이 없음' + (stale.length ? ' — ' + stale.join(', ') : ''));
ok(sevBad.length === 0, '모든 규칙의 심각도가 warn/info 중 하나' + (sevBad.length ? ' — ' + sevBad.join(', ') : ''));
console.log(fail ? '\n❌ 실패 ' + fail + '건' : '\n✅ 전체 통과');
process.exit(fail ? 1 : 0);
