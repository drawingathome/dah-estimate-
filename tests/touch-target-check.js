#!/usr/bin/env node
// tests/touch-target-check.js
// 버튼/링크/클릭가능 요소의 터치 영역이 최소 32px 이상인지 검사 (모바일 뷰포트 기준)
//
// 사용법:
//   node tests/touch-target-check.js <html파일경로>

const path = require('path');
const { launchBrowser, startServer, MIN_TOUCH_TARGET } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node touch-target-check.js <html파일경로>');
    process.exit(1);
  }

  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 8951 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'networkidle0', timeout: 20000 });
    await new Promise(r => setTimeout(r, 800));

    const violations = await page.evaluate((MIN) => {
      const results = [];
      const selector = 'button, a, [onclick], input[type="button"], input[type="submit"], .btn, [role="button"]';
      document.querySelectorAll(selector).forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return; // 숨겨진 요소 제외
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        if (rect.width < MIN || rect.height < MIN) {
          results.push({
            tag: el.tagName,
            id: el.id || '',
            class: el.className && el.className.toString ? el.className.toString().slice(0, 60) : '',
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            text: (el.textContent || '').trim().slice(0, 20)
          });
        }
      });
      return results;
    }, MIN_TOUCH_TARGET);

    console.log(`\n[터치타겟 검사] ${file} (모바일 390px, 최소 ${MIN_TOUCH_TARGET}px 기준)`);
    if (violations.length === 0) {
      console.log('✅ 통과 — 최소 크기 미달 터치타겟 없음');
    } else {
      console.log(`❌ 위반 ${violations.length}건:`);
      violations.slice(0, 30).forEach(v => {
        console.log(`  - <${v.tag}> ${v.width}x${v.height}px  id="${v.id}" class="${v.class}"  "${v.text}"`);
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
