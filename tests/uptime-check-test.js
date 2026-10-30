// tests/uptime-check-test.js (N-64 ①) — 다운 감시 스크립트가 정상/오류/빈 화면/서버 끊김을 정확히 구분하는지, 일시 오류는 재시도로 넘기는지 확인(가짜 서버 사용).
const http = require('http'), path = require('path'), { execFile } = require('child_process');
let failed = 0; function ok(l, c, d) { console.log((c ? '✅ ' : '❌ ') + l + (c ? '' : ' — ' + JSON.stringify(d))); if (!c) failed++; }
const script = path.resolve(__dirname, '..', 'scripts', 'uptime-check.js');
let flaky = 0;
const srv = http.createServer((req, res) => {
  if (req.url === '/ok') { res.end('<html>DAH 대시보드</html>'); }
  else if (req.url === '/blank') { res.end('<html></html>'); }
  else if (req.url === '/err') { res.statusCode = 500; res.end('boom'); }
  else if (req.url === '/flaky') { flaky++; if (flaky < 2) { res.statusCode = 503; res.end('x'); } else res.end('DAH ok'); }
  else if (req.url === '/rest/v1/rpc/get_public_estimate') { res.setHeader('content-type', 'application/json'); res.end('[]'); }
  else if (req.url === '/dbbad/rest/v1/rpc/get_public_estimate') { res.statusCode = 502; res.end('bad'); }
  else { res.statusCode = 404; res.end('no'); }
});
srv.listen(0, async () => {
  const port = srv.address().port, base = 'http://127.0.0.1:' + port;
  function run(targets, extra) {
    // 가짜 서버가 이 프로세스 안에 있으므로 반드시 비동기로 실행(동기 실행은 서버가 응답을 못 해 시험이 멈춘다)
    return new Promise(res => execFile('node', [script], { encoding: 'utf8', env: Object.assign({}, process.env, { UPTIME_TARGETS: targets, UPTIME_DB_URL: base, UPTIME_DB_KEY: 'k', UPTIME_TRIES: '2', UPTIME_WAIT_MS: '50', UPTIME_TIMEOUT_MS: '2000' }, extra || {}) }, (err, stdout) => res({ status: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout })));
  }
  let r = await run(`${base}/ok|DAH`); ok('정상: 종료코드 0', r.status === 0, r.stdout);
  r = await run(`${base}/ok|DAH,${base}/err|DAH`); ok('한 곳이 500: 종료코드 1', r.status === 1 && /HTTP 500/.test(r.stdout), r.stdout);
  r = await run(`${base}/blank|DAH`); ok('빈 화면(내용 글자 없음): 종료코드 1', r.status === 1 && /글자가 없음/.test(r.stdout), r.stdout);
  r = await run(`${base}/flaky|DAH`); ok('일시 오류 후 성공(재시도): 종료코드 0 + "시도 2번째" 표시', r.status === 0 && /시도 2번째/.test(r.stdout), r.stdout);
  r = await run(`http://127.0.0.1:1/ok|DAH`); ok('접속 불가(서버 꺼짐): 종료코드 1', r.status === 1, r.stdout);
  r = await run(`${base}/ok|DAH`, { UPTIME_DB_URL: base + '/dbbad' }); ok('DB가 502: 종료코드 1', r.status === 1 && /HTTP 502/.test(r.stdout), r.stdout);
  r = await run(`${base}/ok|DAH`, { UPTIME_SKIP_DB: '1', UPTIME_DB_URL: 'http://127.0.0.1:1' }); ok('DB 확인 건너뛰기 옵션', r.status === 0, r.stdout);
  srv.close(); console.log(failed ? '\n❌ 실패 ' + failed + '건' : '\n✅ 전부 통과'); process.exit(failed ? 1 : 0);
});
