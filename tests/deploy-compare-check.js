// tests/deploy-compare-check.js
// F-5(2026-10-26): 배포 후 검사의 파일 비교가 (1) 전부 같으면 통과 (2) 한 글자만 달라도 (3) 파일이 404여도 (4) 통신 실패여도 잡아내는지 가짜 서버로 확인.
const http = require('http'); const fs = require('fs'); const path = require('path');
const { listRootJs, compareFiles } = require('../scripts/deploy-compare');
const ROOT = path.resolve(__dirname, '..');
let failed = 0; const ok = (l, c, d) => { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + (d || ''))); if (!c) failed++; };
const files = listRootJs(ROOT);
(async () => {
  ok('비교 대상이 30개 이상', files.length >= 30, files.length);
  let mode = 'same'; const target = files[0], target2 = files[1];
  const srv = http.createServer((req, res) => {
    const f = decodeURIComponent(req.url.split('?')[0].slice(1));
    if (!files.includes(f)) { res.statusCode = 404; return res.end(); }
    let buf = fs.readFileSync(path.join(ROOT, f));
    if (mode === 'stale' && f === target) buf = Buffer.concat([buf, Buffer.from(' ')]);
    if (mode === 'missing' && f === target) { res.statusCode = 404; return res.end(); }
    if (mode === 'dead' && f === target2) return req.socket.destroy();
    res.end(buf);
  });
  await new Promise(r => srv.listen(0, r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const fetchBuf = async (u) => { const r = await fetch(u, { cache: 'no-store' }); return { status: r.status, buf: Buffer.from(await r.arrayBuffer()) }; };
  const run = () => compareFiles({ base, root: ROOT, files, fetchBuf });
  mode = 'same'; let d = await run(); ok('전부 같으면 어긋남 0건', d.length === 0, d.join('|'));
  mode = 'stale'; d = await run(); ok('공백 한 칸만 달라도 잡아냄', d.length === 1 && d[0].startsWith(target), d.join('|'));
  mode = 'missing'; d = await run(); ok('운영에 파일이 없으면(404) 잡아냄', d.length === 1 && d[0].includes('HTTP 404'), d.join('|'));
  mode = 'dead'; d = await run(); ok('통신이 끊기면 통과시키지 않음', d.length === 1 && d[0].startsWith(target2), d.join('|'));
  srv.close();
  if (failed) { console.log('\n실패 ' + failed + '건'); process.exit(1); } console.log('\n통과');
})();
