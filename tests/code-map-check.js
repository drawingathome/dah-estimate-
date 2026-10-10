// tests/code-map-check.js
// CODE_MAP.md(코드 지도)가 현재 코드와 맞는지 검사 - 실제 로직은 scripts/gen-code-map.js --check.
// (CI 설정 파일은 수정 권한이 없어서, CI가 이미 돌리는 run-all.js에 실리도록 tests/ 안에 래퍼로 둠)
const { spawnSync } = require('child_process');
const path = require('path');
const r = spawnSync('node', [path.join(__dirname, '..', 'scripts', 'gen-code-map.js'), '--check'], { stdio: 'inherit' });
process.exit(r.status === 0 ? 0 : 1);
