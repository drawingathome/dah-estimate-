#!/usr/bin/env node
// scripts/bump-cache-versions.js
// ══════════════════════════════════════════════════
// 2026-09-17(선혜님 - "1번(자동 캐시버스팅) 우리도 전문업체처럼 바꿀
// 수 있니?"): 지금까지 캐시버전(?v=날짜시각)을 사람이 손으로 넣다가
// 오늘만 2번 깜빡했음(dash-api.js, shared-staging-guard.js) - 실제
// 코드는 고쳐 배포됐는데 브라우저 캐시 때문에 사용자에게는 예전
// 버전이 계속 보였을 위험. 빌드 시스템(웹팩 등) 없이도, 각 JS 파일의
// "내용 자체"로 해시를 계산해서 버전 문자열로 쓰면 이 문제가 구조적으로
// 사라짐 - 내용이 안 바뀌면 버전도 안 바뀌고(불필요한 diff 없음),
// 단 한 글자라도 바뀌면 해시가 달라져서 자동으로 캐시가 무효화됨.
// 사람이 "버전을 올려야 하나?"를 판단할 필요 자체가 없어짐. JS뿐
// 아니라 CSS 파일(est-styles.css/dash-styles.css)도 동일하게 처리함
// (2026-09-17 저녁 CSS까지 확장 - 처음엔 JS만 다뤄서, 바로 그날 CSS를
// 고치고도 이 스크립트가 못 잡을 뻔했음).
//
// 사용법:
//   node scripts/bump-cache-versions.js          # 실제로 HTML 파일을 고침
//   node scripts/bump-cache-versions.js --check  # 고치지 않고, 이미
//     최신 상태인지만 확인(0=최신, 1=고칠 게 있음) - CI에서 사용
// ══════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const HTML_FILES = ['dah-dashboard.html', 'dah-estimate.html'];
const isCheckMode = process.argv.includes('--check');

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 12);
}

let anyMismatch = false;
let anyChanged = false;

for (const htmlFile of HTML_FILES) {
  const htmlPath = path.join(ROOT, htmlFile);
  let html = fs.readFileSync(htmlPath, 'utf-8');
  let changedInThisFile = false;

  // <script src="/파일명.js?v=아무값"></script> 와
  // <link rel="stylesheet" href="/파일명.css?v=아무값"> 패턴을 전부 찾아서,
  // 그 파일명이 실제로 저장소에 존재하면 현재 내용의 해시로 교체.
  const patterns = [
    /<script src="\/([a-zA-Z0-9_-]+\.js)\?v=[^"]*"><\/script>/g,
    /<link rel="stylesheet" href="\/([a-zA-Z0-9_-]+\.css)\?v=[^"]*">/g,
  ];
  for (const scriptTagPattern of patterns) {
    html = html.replace(scriptTagPattern, (match, fileName) => {
      const jsPath = path.join(ROOT, fileName);
      if (!fs.existsSync(jsPath)) return match; // 로컬에 없는 외부 스크립트는 그대로 둠
      const newHash = hashFile(jsPath);
      const isCss = fileName.endsWith('.css');
      const newTag = isCss
        ? `<link rel="stylesheet" href="/${fileName}?v=${newHash}">`
        : `<script src="/${fileName}?v=${newHash}"></script>`;
      if (newTag !== match) {
        changedInThisFile = true;
        console.log(`  ${htmlFile}: ${fileName} → v=${newHash}`);
      }
      return newTag;
    });
  }

  if (changedInThisFile) {
    anyMismatch = true;
    if (!isCheckMode) {
      fs.writeFileSync(htmlPath, html, 'utf-8');
      anyChanged = true;
    }
  }
}

if (isCheckMode) {
  if (anyMismatch) {
    console.log('\n❌ 캐시버전이 실제 파일 내용과 안 맞는 곳이 있어요 — node scripts/bump-cache-versions.js 를 실행하세요.');
    process.exit(1);
  } else {
    console.log('✅ 모든 캐시버전이 실제 파일 내용과 일치해요.');
    process.exit(0);
  }
} else {
  if (anyChanged) {
    console.log('\n✅ 캐시버전을 갱신했어요. git diff로 확인 후 커밋하세요.');
  } else {
    console.log('✅ 이미 모든 캐시버전이 최신 상태예요 - 바꿀 게 없어요.');
  }
}
