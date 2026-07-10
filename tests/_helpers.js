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
  if (role === 'master') {
    await page.evaluate(() => document.getElementById('btn-master-login') && document.getElementById('btn-master-login').onclick());
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((pw) => {
      const el = document.getElementById('master-pw-input');
      if (el) el.value = pw;
    }, masterPw || 'dah2012');
    await page.evaluate(() => document.getElementById('btn-master-confirm') && document.getElementById('btn-master-confirm').onclick());
    await new Promise(r => setTimeout(r, 1200));
  } else {
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [onclick]'));
      const staffBtn = btns.find(b => /스태프|실장|staff/i.test(b.textContent || ''));
      if (staffBtn) staffBtn.click();
    });
    await new Promise(r => setTimeout(r, 1200));
  }
}

module.exports = {
  launchBrowser,
  startServer,
  loginAs,
  SKIP_TAGS,
  ALLOWED_FONT_SIZES,
  MIN_TOUCH_TARGET
};
