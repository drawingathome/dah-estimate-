// tests/no-master-pw-upload-check.js
// 2026-10-25 전수표 T-19: 앱이 비밀번호 종류의 값을 서버 설정표(app_settings, 로그인한 모든 사람이 읽을 수 있음)에 올리지 않는지 정적 확인
const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, '..');
const bad = [];
fs.readdirSync(dir).filter(f => /\.(js|html)$/.test(f) && !/^apps-script/.test(f)).forEach(f => {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  src.split('\n').forEach((line, i) => {
    if (/^\s*\/\//.test(line)) return;
    if (/sbSyncSetting\(\s*['"][a-z_]*(pw|pass|password|secret|token)[a-z_]*['"]/i.test(line)) bad.push(f + ':' + (i + 1));
  });
});
console.log(bad.length === 0 ? '✅ 비밀번호·토큰 종류를 서버 설정표에 올리는 코드 없음' : '❌ 발견: ' + bad.join(', '));
process.exit(bad.length === 0 ? 0 : 1);
