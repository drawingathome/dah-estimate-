#!/usr/bin/env node
// tests/scroll-check.js
// 모바일 뷰포트(390px)에서 가로 스크롤이 발생하는지, 그리고 뷰포트 폭을 벗어나는
// 요소가 있는지 검사

const path = require('path');
const { launchBrowser, startServer } = require('./_helpers');

async function run() {
  const filePath = process.argv[2];
  const viewportWidth = parseInt(process.argv[3] || '390', 10);
  if (!filePath) {
    console.error('사용법: node scroll-check.js <html파일경로> [뷰포트너비]');
    process.exit(1);
  }

  const dir = path.dirname(path.resolve(filePath));
  const file = path.basename(filePath);
  const port = 9001 + Math.floor(Math.random() * 500);
  const server = await startServer(dir, port);

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: viewportWidth, height: 844, isMobile: viewportWidth < 500, hasTouch: viewportWidth < 500 });
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'networkidle0', timeout: 20000 });
    await new Promise(r => setTimeout(r, 800));

    const result = await page.evaluate((vw) => {
      const scrollWidth = document.documentElement.scrollWidth;
      const hasHScroll = scrollWidth > vw + 1; // 1px 오차 허용
      const offenders = [];
      if (hasHScroll) {
        document.querySelectorAll('*').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.right > vw + 1 || rect.left < -1) {
            offenders.push({
              tag: el.tagName,
              id: el.id || '',
              class: el.className && el.className.toString ? el.className.toString().slice(0, 60) : '',
              right: Math.round(rect.right),
              left: Math.round(rect.left)
            });
          }
        });
      }
      return { scrollWidth, viewportWidth: vw, hasHScroll, offenders: offenders.slice(0, 15) };
    }, viewportWidth);

    console.log(`\n[가로스크롤 검사] ${file} @ ${viewportWidth}px`);
    console.log(`  문서 전체 폭: ${result.scrollWidth}px / 뷰포트: ${result.viewportWidth}px`);
    if (!result.hasHScroll) {
      console.log('✅ 통과 — 가로 스크롤 없음');
    } else {
      console.log(`❌ 가로 스크롤 발생 (초과 ${result.scrollWidth - result.viewportWidth}px)`);
      console.log('  뷰포트를 벗어난 요소:');
      result.offenders.forEach(o => {
        console.log(`  - <${o.tag}> id="${o.id}" class="${o.class}" left=${o.left} right=${o.right}`);
      });
    }
    process.exitCode = result.hasHScroll ? 1 : 0;
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
