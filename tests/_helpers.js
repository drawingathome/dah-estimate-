// tests/_helpers.js
// DAH 프로젝트 공통 테스트 유틸리티
// 사용법: 각 테스트 스크립트에서 require('./_helpers')

const { spawn } = require('child_process');
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

const SKIP_TAGS = ['HTML', 'HEAD', 'BODY', 'SCRIPT', 'STYLE', 'META', 'LINK', 'SVG', 'PATH', 'G', 'RECT', 'CIRCLE', 'CANVAS'];
const ALLOWED_FONT_SIZES = [11, 12, 13, 15, 17, 22, 26, 28, 36];
const MIN_TOUCH_TARGET = 32;

async function launchBrowser() {
  return puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
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
      if (url.includes('/auth/v1/token') && req.postData()) {
        let body;
        try { body = JSON.parse(req.postData()); } catch (e) { body = {}; }
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
      req.abort();
    } else {
      req.continue();
    }
  });
}

function startServer(dir, port) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', ['-m', 'http.server', String(port)], { cwd: dir });
    let started = false;
    const check = setTimeout(() => {
      if (!started) { started = true; resolve(proc); }
    }, 800);
    proc.on('error', (err) => { clearTimeout(check); reject(err); });
  });
}

async function loginAs(page, role, masterPw) {
  // role: 'master' | 'staff'
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
    await page.evaluate(() => {
      if (typeof getStaffList !== 'function') return;
      var list = getStaffList();
      if (list.indexOf('_테스트실장') < 0) {
        list.push('_테스트실장');
        localStorage.setItem('dah_staff_list', JSON.stringify(list));
      }
      if (typeof setStaffEmail === 'function') setStaffEmail('_테스트실장', 'test-staff@dah-test.local');
      if (typeof renderStaffLoginList === 'function') renderStaffLoginList();
    });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#staff-login-list button, [onclick]'));
      const staffBtn = btns.find(b => (b.textContent || '').includes('_테스트실장'));
      if (staffBtn) staffBtn.click();
    });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((pw) => {
      const el = document.getElementById('staff-pw-input');
      if (el) el.value = pw;
    }, masterPw || 'TEST_OK_PW');
    await page.evaluate(() => document.getElementById('btn-staff-confirm') && document.getElementById('btn-staff-confirm').onclick());
    await new Promise(r => setTimeout(r, 1200));
  }
}

module.exports = {
  launchBrowser,
  blockRealNetwork,
  startServer,
  loginAs,
  SKIP_TAGS,
  ALLOWED_FONT_SIZES,
  MIN_TOUCH_TARGET
};
