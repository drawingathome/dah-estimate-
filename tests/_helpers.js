// tests/_helpers.js
// DAH 프로젝트 공통 테스트 유틸리티
// 사용법: 각 테스트 스크립트에서 require('./_helpers')

const { spawn, execSync } = require('child_process');
const fs = require('fs');

// puppeteer 모듈 위치: 여러 후보를 순서대로 시도 (로컬 sandbox / CI / 일반 npm install 전부 대응)
function resolvePuppeteer() {
  if (process.env.DAH_PUPPETEER_PATH) {
    return require(process.env.DAH_PUPPETEER_PATH);
  }
  const candidates = [
    'puppeteer', // 표준 node_modules 경로 (CI에서 npm install puppeteer 했을 때)
    '/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer' // 개발 sandbox
  ];
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* 다음 후보 시도 */ }
  }
  throw new Error('puppeteer 모듈을 찾을 수 없습니다. npm install puppeteer 를 실행하거나 DAH_PUPPETEER_PATH 환경변수를 설정하세요.');
}

const puppeteer = resolvePuppeteer();

// 크롬 실행파일 경로: 환경변수 > 알려진 sandbox 경로(실제 존재할 때만) > puppeteer 자체 경로
function resolveChromePath() {
  if (process.env.DAH_CHROME_PATH) return process.env.DAH_CHROME_PATH;
  const knownPath = '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome';
  try {
    if (fs.existsSync(knownPath)) return knownPath;
  } catch (e) { /* 다음으로 진행 */ }
  try {
    const p = puppeteer.executablePath();
    if (p) return p;
  } catch (e) { /* fallback으로 진행 */ }
  return knownPath;
}

const CHROME_PATH = resolveChromePath();

const SKIP_TAGS = ['HTML', 'HEAD', 'BODY', 'SCRIPT', 'STYLE', 'META', 'LINK', 'SVG', 'PATH', 'G', 'RECT', 'CIRCLE', 'CANVAS', 'TITLE'];
const ALLOWED_FONT_SIZES = [11, 12, 13, 15, 17, 22, 26, 28, 36];
const MIN_TOUCH_TARGET = 32;

async function launchBrowser() {
  return puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      // 2026-10-07(선혜님 - "오류가 이렇게 많다, 모두 확인 제대로 하라고"): 서버 로그의 401/400 26건은 사용자가 아니라 CI 테스트가 운영 Supabase에 접속한 것이었음
      // (8개 묶음이 CI 시작 2~3분 뒤와 일치). blockRealNetwork는 "각 테스트가 직접 호출해야" 작동해서 브라우저를 쓰면서 호출하지 않은 테스트가 80개였음.
      // 페이지 단위 요청 가로채기를 자동으로 걸어 보았더니, 자기만의 가로채기를 쓰는 기존 테스트와 같은 요청에 두 번 응답해("Request is already handled") 깨졌음 -
      // 가로채기가 아니라 브라우저 프로세스 수준에서 운영 서버 주소를 해석 불가로 만든다. 가로채기는 이름 해석보다 먼저 일어나므로 기존 테스트(가짜 서버 응답)에는
      // 영향이 없고, 가로채지 않고 통과시키는 요청만 실제 서버에 닿지 못한다(CI에서도 로컬과 같은 "접속 불가" 상태가 된다).
      '--host-resolver-rules=MAP *.supabase.co ~NOTFOUND, MAP script.google.com ~NOTFOUND'
    ]
  });
}

// 테스트 중 실제 운영 Supabase로 요청이 나가는 것을 차단.
// CI(GitHub Actions)는 실제 인터넷이 되기 때문에, 이걸 안 막으면
// 테스트가 만든 가짜 데이터(_테스트실장 등)가 실제 운영 DB에 저장되고,
// 실제 네트워크 왕복시간 때문에 로컬 결과와 타이밍이 달라져 테스트가
// 불안정해짐. 각 테스트에서 페이지 생성 직후 반드시 호출할 것.
//
// 단, /auth/v1/token(로그인) 요청만은 가짜 성공 응답으로 처리한다.
// Supabase Auth 도입 이후 로그인 자체가 이 엔드포인트를 거치므로,
// 이걸 완전히 막으면 마스터/스태프 로그인 테스트 자체가 불가능해진다.
// 비밀번호가 'TEST_OK_PW'일 때만 성공 처리 — 각 테스트는 이메일 등록 후
// 이 고정 비밀번호로 로그인 시도하면 됨(실제 운영 비밀번호와 무관).
async function blockRealNetwork(page) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co') || url.includes('script.google.com')) {
      if (req.method() === 'OPTIONS' && url.includes('supabase.co')) {
        req.respond({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': '*'
          }
        });
        return;
      }
      if (url.includes('/rest/v1/app_settings') && url.includes('staff_emails')) {
        // 2026-08-27 추가 — doStaffConfirm/doMasterConfirm이 로그인 시
        // "이 사람이 진짜 누구인지" 재확인하려고 staff_emails를 조회함
        // (보안수정: 조회 실패시 더 이상 마스터로 자동승격 안 됨). 이 요청을
        // 처리 안 해두면 req.abort()로 떨어져서 네트워크 에러가 되고,
        // 로그인 자체가 완료 안 됨 — 예전엔 "실패시 마스터로" 버그 덕에
        // 우연히 테스트가 통과했었음. 테스트용 스태프 목록(_테스트실장 등)을
        // 실제로 반영해서, 정상적인 "조회 성공 → 판정" 경로로 테스트가
        // 지나가게 함.
        req.respond({
          status: 200, contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify([{ value: (global.__DAH_TEST_STAFF_EMAILS__ || {}) }])
        });
        return;
      }
      if (url.includes('/auth/v1/token') && req.postData()) {
        let body;
        try { body = JSON.parse(req.postData()); } catch (e) { body = {}; }
        if (url.includes('grant_type=refresh_token') && body.refresh_token) {
          req.respond({
            status: 200, contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
              access_token: 'test-refreshed-token', refresh_token: 'test-refreshed-refresh',
              expires_in: 3600, user: { id: 'test-fake-uuid' }
            })
          });
          return;
        }
        if (body.password === 'TEST_OK_PW') {
          req.respond({
            status: 200, contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
              access_token: 'test-fake-token', refresh_token: 'test-fake-refresh',
              expires_in: 3600, user: { id: 'test-fake-uuid', email: body.email }
            })
          });
        } else {
          req.respond({
            status: 400, contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error_description: 'Invalid login credentials' })
          });
        }
        return;
      }
      if ((url.includes('/rest/v1/customers') || url.includes('/rest/v1/estimates')) && req.method() === 'DELETE') {
        // 2026-08-28 추가 — 삭제(완전삭제) 관련 테스트에서 DELETE 요청이
        // 처리 안 돼서 req.abort()로 떨어지고 있었음. permanentlyDeleteCustomer
        // 같은 흐름은 DELETE 실패시 로컬 반영을 아예 안 하도록 되어있어서
        // (안전을 위해 의도된 설계), 이 mock이 없으면 삭제 관련 테스트 자체가
        // "서버 실패"로 조용히 아무 일도 안 하고 넘어가고 있었음.
        req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
        return;
      }
      req.abort();
    } else if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      req.continue();
    } else {
      // 2026-09-04(선혜님 질문 - "위와 같은 상황이 또 안일어나는거 맞니??"로
      // 강화): supabase.co/script.google.com만 걸러내고 나머지는 전부 통과
      // 시키던 블랙리스트 구조 자체가, 앞으로 새 외부 서비스가 코드에
      // 추가되면 테스트가 또 놓칠 수 있는 근본적인 취약점이었음(실제로
      // script.google.com을 놓쳐서 실제 구글드라이브/시트가 여러 달
      // 테스트 잔재로 오염됐던 걸 발견함). 로컬호스트(테스트 서버 자기
      // 자신)만 허용하고 그 외 모든 외부 요청은 자동 차단하는 화이트리스트
      // 방식으로 전환 - "깜빡하고 안 막는" 실수 자체가 구조적으로 불가능해짐.
      req.abort();
    }
  });
}

// 2026-09-13(GitHub Actions "Run failed" 메일로 발견, 로컬에서도 하루 종일
// 겪었던 "ERR_EMPTY_RESPONSE" 간헐적 실패의 진짜 원인을 여기서 찾음):
// 지금까지 서버를 띄우고 무조건 800ms만 기다린 뒤 "준비됐다"고 넘어갔는데,
// 이건 실제로 서버가 요청을 받을 수 있는 상태인지 전혀 확인 안 하는
// 방식이었음 - 기기가 잠깐 바쁘면(CI 공유 러너, 여러 테스트 동시 실행 등)
// 800ms 안에 http.server가 완전히 준비되지 않을 수 있어서, 그 순간에
// 첫 요청(page.goto)이 날아가면 연결 자체가 거부/리셋되어 매번
// "ERR_EMPTY_RESPONSE"로 실패했음 - 신선한 클론에서 그대로 재현 확인함.
// 고정 대기시간 대신, 서버가 실제로 응답할 때까지 짧은 간격으로 직접
// 확인(polling)한 뒤에만 완료 처리 - 이게 진짜 "준비 확인"임.
function waitForServerReady(port, maxWaitMs) {
  const http = require('http');
  const deadline = Date.now() + (maxWaitMs || 5000);
  return new Promise((resolve, reject) => {
    function tryOnce() {
      const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 500 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() >= deadline) { reject(new Error('startServer: 포트 ' + port + '가 ' + (maxWaitMs || 5000) + 'ms 안에 응답하지 않음')); return; }
        setTimeout(tryOnce, 50);
      });
      req.on('timeout', () => { req.destroy(); });
    }
    tryOnce();
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf', '.wasm': 'application/wasm'
};

function startServer(dir, port) {
  // 2026-10-02(선혜님 - CI에서 "spawn python3 ENOENT"로 신규 테스트 2개가 실패하던 것을
  // 발견·해결): 이전엔(2026-09-13 주석 참고) python3 외부 프로세스를 매번 스폰하는 방식이었음 -
  // 55개 넘는 테스트 파일 중 상당수가 server.kill()을 안 불러 프로세스가 누적되는 고질적
  // 문제가 있었는데, 테스트 개수가 늘면서 CI 환경(로컬보다 자원이 빠듯함)의 한계를 넘어 특정
  // 시점 이후 테스트들의 spawn 자체가 실패하기 시작함(로컬 재현은 안 됨 - 환경 차이). 외부
  // 프로세스 의존 자체를 없애 근본적으로 해결 - Node 내장 http 모듈로 같은 프로세스 안에서
  // 정적 파일 서버를 직접 띄움(스폰 실패도, 프로세스 누적도 원천적으로 사라짐). 기존 55개+
  // 테스트가 전부 server.kill()을 호출하는 인터페이스에 의존하므로, 리턴 객체에 그대로
  // .kill()을 달아 내부적으로 서버를 닫도록 해 기존 호출부를 전혀 안 건드림.
  const http = require('http');
  const path = require('path');
  const server = http.createServer(function (req, res) {
    try {
      var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath.endsWith('/')) urlPath += 'index.html';
      var filePath = path.join(dir, urlPath);
      if (!filePath.startsWith(path.resolve(dir))) { res.writeHead(403); res.end('Forbidden'); return; }
      fs.readFile(filePath, function (err, data) {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found'); return; }
        var ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      });
    } catch (e) { try { res.writeHead(500); res.end('Internal Error'); } catch (e2) {} }
  });
  return new Promise(function (resolve, reject) {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', function () {
      server.kill = function () { try { server.close(); } catch (e) {} };
      resolve(server);
    });
  });
}

async function loginAs(page, role, masterPw, staffName) {
  // role: 'master' | 'staff'
  // staffName: staff일 때만 사용, 생략하면 기존처럼 '_테스트실장' 사용
  //   (2026-08-27 추가 — 선혜님 질문 "오지은실장으로 들어갔을때 생기는
  //   오류도 다 체크가 된거니??"에 답하려고, 실제 스태프 이름으로도
  //   테스트할 수 있게 파라미터화함. 기존 호출부들은 인자를 안 넘기니
  //   전부 그대로 '_테스트실장'으로 동작 - 하위호환 깨짐 없음.)
  var staffNameToUse = staffName || '_테스트실장';
  var staffTestEmail = 'test-staff@dah-test.local';
  if (role !== 'master') {
    // 2026-08-27 추가 — blockRealNetwork의 app_settings(staff_emails) mock이
    // 이 전역 맵을 읽어서 응답하므로, 로그인 시도 전에 먼저 등록해둬야
    // doStaffConfirm의 서버 재확인 로직이 이 이름을 정상적으로 찾아냄.
    global.__DAH_TEST_STAFF_EMAILS__ = global.__DAH_TEST_STAFF_EMAILS__ || {};
    global.__DAH_TEST_STAFF_EMAILS__[staffNameToUse] = staffTestEmail;
  }
  // Supabase Auth 도입 이후: 로그인 전에 테스트용 이메일을 등록하고,
  // blockRealNetwork가 가로채는 고정 비밀번호(TEST_OK_PW)로 로그인한다.
  if (role === 'master') {
    await page.evaluate(() => { if (typeof setMasterEmail === 'function') setMasterEmail('test-master@dah-test.local'); });
    await page.evaluate(() => document.getElementById('btn-master-login') && document.getElementById('btn-master-login').onclick());
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((pw) => {
      const el = document.getElementById('master-pw-input');
      if (el) el.value = pw;
    }, masterPw || 'TEST_OK_PW');
    await page.evaluate(() => document.getElementById('btn-master-confirm') && document.getElementById('btn-master-confirm').onclick());
    await new Promise(r => setTimeout(r, 1200));
  } else {
    // 스태프 목록에 테스트 계정을 하나 등록하고, 그 이름으로 로그인 시도
    await page.evaluate((name) => {
      if (typeof getStaffList !== 'function') return;
      var list = getStaffList();
      if (list.indexOf(name) < 0) {
        list.push(name);
        localStorage.setItem('dah_staff_list', JSON.stringify(list));
      }
      if (typeof setStaffEmail === 'function') setStaffEmail(name, 'test-staff@dah-test.local');
      if (typeof renderStaffLoginList === 'function') renderStaffLoginList();
    }, staffNameToUse);
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((name) => {
      const btns = Array.from(document.querySelectorAll('#staff-login-list button, [onclick]'));
      const staffBtn = btns.find(b => (b.textContent || '').includes(name));
      if (staffBtn) staffBtn.click();
    }, staffNameToUse);
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((pw) => {
      const el = document.getElementById('staff-pw-input');
      if (el) el.value = pw;
    }, masterPw || 'TEST_OK_PW');
    await page.evaluate(() => document.getElementById('btn-staff-confirm') && document.getElementById('btn-staff-confirm').onclick());
    await new Promise(r => setTimeout(r, 1200));
  }
}

// 2026-08-25(선혜님 발견 — CI "Run Tests" 계속 실패, 저장 관련 테스트들이
// 전부 "실제 저장건수=0"으로 실패): 오늘 세션에서 saveEstimate()에 로그인
// 세션 유효성 확인(refreshAuthSessionIfNeeded)을 저장 직전 필수로 추가했는데
// (실제 태블릿 403 반복 문제를 막기 위한 정당한 보안 수정), 이 저장관련
// 테스트들은 로그인 절차 없이 곧바로 saveEstimate()만 호출하고 있어서 새로
// 생긴 이 검사에 막혀 저장 자체가 시도조차 안 되고 있었음. 실제 로그인
// 플로우를 안 거치고도, 이미 유효한 세션이 있는 것처럼 바로 세팅해주는
// 헬퍼. 각 테스트가 saveEstimate()류를 호출하기 직전에 불러 쓰면 됨.
// 2026-10-07(선혜님 - "저장을 눌렀는데 서버에 아무 기록이 없다"): 기존 시험들은 dah_auth_session만 넣어서(dah_session 없이) 견적서 화면의 로그인 덮개(est-auth-gate)가
// 항상 떠 있는 상태로 돌았고, 덮개가 클릭을 가로채는데도 "saveEstimate()를 코드로 직접 호출"해서 통과했다 - 사람이 실제로 저장 버튼을 누르는 경로는 한 번도 검증되지 않았다.
// 앱이 말하는 "유효한 로그인"은 dah_session(loginAt)과 dah_auth_session(access_token) 둘 다 있는 상태(hasValidDashboardSession). 이 함수는 둘 다, 페이지가 열리기 전에 넣는다.
async function setupRealisticLogin(page, opts) {
  opts = opts || {};
  await page.evaluateOnNewDocument((o) => {
    try {
      localStorage.setItem('dah_session', JSON.stringify({ name: o.name || '마스터', role: o.role || 'master', loginAt: Date.now() }));
      localStorage.setItem('dah_auth_session', JSON.stringify({ access_token: 'test-fake-token', refresh_token: 'test-fake-refresh', expires_at: Date.now() + (o.ttlMs || 3600 * 1000), user_id: 'test-fake-uuid', email: o.email || 'test@drawingathome.co.kr' }));
    } catch (e) {}
  }, opts);
}
// 시험이 유효한지 먼저 검사: 로그인 덮개가 숨겨져 있고 저장 버튼이 있어야 한다(아니면 "없음=없음"으로 통과하지 않도록 시험을 중단).
async function assertEstimatePageUsable(page) {
  const st = await page.evaluate(() => {
    const g = document.getElementById('est-auth-gate'); const b = document.getElementById('btn-save-estimate');
    return { gateHidden: !g || getComputedStyle(g).display === 'none', hasBtn: !!b, saveFn: typeof saveEstimate === 'function' };
  });
  if (!st.gateHidden || !st.hasBtn || !st.saveFn) throw new Error('시험 무효: 견적서 화면이 사용 가능한 상태가 아님 ' + JSON.stringify(st));
  return st;
}
async function setupValidSession(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem('dah_auth_session', JSON.stringify({
        access_token: 'test-fake-token',
        refresh_token: 'test-fake-refresh',
        expires_at: Date.now() + 3600 * 1000,
        user_id: 'test-fake-uuid',
        email: 'test@drawingathome.co.kr'
      }));
    } catch (e) {}
  });
}

// 2026-09-29(dash-customer-add.js를 React 컴포넌트로 바꾸면서 발견): React가 관리하는 입력칸
// (controlled input)에 .value= 로 직접 값을 넣으면 화면엔 보여도 React의 내부 상태는 안 바뀜 -
// 실제 사람이 타이핑한 것처럼 input 이벤트를 같이 보내야 함(원본 바닐라 DOM에선 .value= 만으로
// 충분했음). 이 함정에 걸렸던 곳: as-section-golden-master-check.js(직접 겪음), as_management_check.js,
// customer-add-golden-master-check.js, dashboard-data-check.js, naver_paste_parse_check.js,
// race-condition-check.js(모두 이 헬퍼로 수정). 이후 React로 바뀐 입력칸에 값을 넣을 땐 항상 이 함수를 씀.
async function setReactInputValue(page, elementId, value) {
  await page.evaluate((id, v) => {
    var el = document.getElementById(id);
    var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, elementId, value);
}

module.exports = {
  launchBrowser,
  blockRealNetwork,
  startServer,
  loginAs,
  setupValidSession,
  setReactInputValue,
  SKIP_TAGS,
  ALLOWED_FONT_SIZES,
  MIN_TOUCH_TARGET, setupRealisticLogin, assertEstimatePageUsable };
