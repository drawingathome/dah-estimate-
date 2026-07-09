// tests/_helpers.js
// DAH 프로젝트 공통 테스트 유틸리티
// 사용법: 각 테스트 스크립트에서 require('./_helpers')

const path = require('path');
const { spawn } = require('child_process');

const PUPPETEER_PATH = process.env.DAH_PUPPETEER_PATH ||
  '/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer';
const CHROME_PATH = process.env.DAH_CHROME_PATH ||
  '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome';

const puppeteer = require(PUPPETEER_PATH);

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
