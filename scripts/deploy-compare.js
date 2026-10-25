// scripts/deploy-compare.js
// F-5(2026-10-26): 배포 후 검사의 "운영 파일 = 커밋 파일" 비교를 따로 떼어, 가짜 서버로 "낡은 파일을 실제로 잡아내는지" 시험할 수 있게 함.
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12);

function listRootJs(root) {
  return fs.readdirSync(root).filter(f => /\.js$/.test(f) && !/\.config\.js$/.test(f) && fs.statSync(path.join(root, f)).isFile());
}

// fetchBuf(url) → { status, buf }. 반환: 어긋난 파일 설명 목록(빈 배열이면 전부 동일)
async function compareFiles({ base, root, files, fetchBuf }) {
  const diffs = [];
  for (const f of files) {
    let live = { status: 0, buf: Buffer.alloc(0) };
    try { live = await fetchBuf(`${base}/${f}`); } catch (e) {}
    const local = fs.readFileSync(path.join(root, f));
    if (live.status !== 200 || sha(live.buf) !== sha(local)) diffs.push(`${f}(HTTP ${live.status}, 운영 ${sha(live.buf)} ≠ 커밋 ${sha(local)})`);
  }
  return diffs;
}
module.exports = { listRootJs, compareFiles, sha };
