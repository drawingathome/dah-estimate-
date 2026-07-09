#!/usr/bin/env node
// tests/font-check.js
// 허용된 폰트 크기 목록([11,12,13,15,17,22,26,28,36]px) 외 값 사용 여부 검사
//
// 사용법:
//   node tests/font-check.js <html파일경로> [뷰포트너비]
// 예시:
//   node tests/font-check.js dah-dashboard.html 390
//   node tests/font-check.js dah-estimate.html 1280

const path = require('path');
const { launchBrowser, startServer, ALLOWED_FONT_SIZES, SKIP_TAGS } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  const viewportWidth = parseInt(process.argv[3] || '390', 10);
  if (!filePath) {
    console.error('사용법: node font-check.js <html파일경로> [뷰포트너비]');
    process.exit(1);
  }

  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 8901 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: viewportWidth, height: 844, isMobile: viewportWidth < 500, hasTouch: viewportWidth < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'networkidle0', timeout: 20000 });
    await new Promise(r => setTimeout(r, 800));

    const violations = await page.evaluate((SKIP, ALLOWED) => {
      const results = [];
      document.querySelectorAll('*').forEach(el => {
        if (SKIP.includes(el.tagName)) return;
        if (!el.textContent || !el.textContent.trim()) return;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (!size) return;
        if (!ALLOWED.includes(Math.round(size))) {
          results.push({
            tag: el.tagName,
            class: el.className && el.className.toString ? el.className.toString().slice(0, 60) : '',
            size,
            text: el.textContent.trim().slice(0, 30)
          });
        }
      });
      return results;
    }, SKIP_TAGS, ALLOWED_FONT_SIZES);

    console.log(`\n[폰트 검사] ${file} @ ${viewportWidth}px`);
    if (violations.length === 0) {
      console.log('✅ 통과 — 정책 위반 폰트 크기 없음');
    } else {
      console.log(`❌ 위반 ${violations.length}건:`);
      violations.slice(0, 30).forEach(v => {
        console.log(`  - <${v.tag}> ${v.size}px  class="${v.class}"  "${v.text}"`);
      });
      if (violations.length > 30) console.log(`  ... 외 ${violations.length - 30}건 더`);
    }
    process.exitCode = violations.length === 0 ? 0 : 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
