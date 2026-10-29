#!/usr/bin/env node
// tests/est-addr-detail-select-check.js
// 2026-10-20(시험가 사례 - 상세주소가 저장 때마다 비워짐): 견적서를 "수정으로 열 때" 고객 주소를 가져오는 요청이 addr_detail을 빼먹어서,
// 화면의 상세주소 칸이 비어 보이고 그 상태로 저장하면 DB의 상세주소까지 지워졌음(10/6 수정이 이 길을 빼먹은 "쌍둥이" 버그).
// 구조 검사: 견적서 앱에서 고객 주소(addr)를 골라 가져오는 요청은 전부 addr_detail도 함께 가져와야 함(select=* 은 통과).
const fs = require('fs'), path = require('path');
const dir = path.resolve(__dirname, '..');
const files = fs.readdirSync(dir).filter(f => /^(dah-estimate\.html|est-.*\.js|shared-.*\.js)$/.test(f));
let fail = 0, scanned = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const lines = src.split('\n');
  lines.forEach((ln, idx) => {
    const m = /select=([A-Za-z_,*]+)/.exec(ln);
    if (!m) return;
    const ctx = lines.slice(Math.max(0, idx - 2), idx + 1).join(' ');
    if (!/rest\/v1\/customers\?/.test(ctx)) return; // 고객 표 조회만
    const cols = m[1];
    if (/(^|,)addr(,|$)/.test(cols)) {
      scanned++;
      if (!/addr_detail/.test(cols)) { console.log('  ❌ ' + f + ':' + (idx + 1) + ' 고객 주소(addr)를 가져오면서 addr_detail을 안 가져옴 → select=' + cols); fail++; }
    }
  });
}
if (!fail) console.log('  ✅ 고객 주소를 골라 가져오는 요청 ' + scanned + '곳 모두 addr_detail 포함');
process.exit(fail ? 1 : 0);
