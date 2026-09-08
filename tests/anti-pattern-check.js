#!/usr/bin/env node
// tests/anti-pattern-check.js
// 정적분석: "로컬 저장(saveCustomers) 직후 서버 재조회(loadCustomersAsync)로 다시 그리는"
// 위험한 패턴이 코드에 남아있는지 자동으로 검사한다.
//
// 배경(2026-07-16): 이 패턴은 "방금 로컬에 반영한 변경사항이, 아직 그 변경을
// 반영 못한 서버의 예전 응답으로 덮어써지는" 경쟁조건을 유발한다. 오늘 하루에만
// 이 패턴이 서로 다른 파일 4곳에 복사되어 있었고, 하나씩 고치는 대신 이제부터는
// 이 검사가 배포 전에 자동으로 잡아낸다. 사람이 매번 기억해서 확인하지 않아도 됨.
//
// 사용법: node tests/anti-pattern-check.js <검사할 js파일 경로들...>

const fs = require('fs');

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  // 함수 경계를 대략적으로 추적 (중괄호 깊이 기반)
  let funcStack = []; // { name, startLine, depth }
  let depth = 0;
  let sawSaveAtDepth = {}; // depth -> lineNo of last saveCustomers( call at/above this function

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const funcMatch = line.match(/function\s+(\w+)\s*\(/);
    if (funcMatch) {
      funcStack.push({ name: funcMatch[1], startLine: i + 1, depth, sawSave: false });
    }

    for (const ch of line) {
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        // 함수가 끝났으면 스택에서 제거
        if (funcStack.length && depth <= funcStack[funcStack.length - 1].depth) {
          funcStack.pop();
        }
      }
    }

    if (/\bsaveCustomers\s*\(/.test(line) && funcStack.length) {
      funcStack[funcStack.length - 1].sawSave = true;
    }
    if (/\bloadCustomersAsync\s*\(/.test(line) && funcStack.length) {
      const cur = funcStack[funcStack.length - 1];
      if (cur.sawSave) {
        violations.push({
          file: filePath,
          func: cur.name,
          funcStartLine: cur.startLine,
          violationLine: i + 1,
          code: line.trim()
        });
      }
    }
  }
  return violations;
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('사용법: node anti-pattern-check.js <js파일...>');
    process.exit(1);
  }
  let allViolations = [];
  files.forEach((f) => {
    if (fs.existsSync(f)) allViolations = allViolations.concat(checkFile(f));
  });

  if (allViolations.length === 0) {
    console.log('✅ 위험패턴(로컬저장 직후 서버재조회로 덮어쓰기) 없음 — 전체 통과');
    process.exit(0);
  }

  console.log('❌ 위험패턴 발견: 같은 함수 안에서 saveCustomers() 이후 loadCustomersAsync()를 호출하고 있습니다.');
  console.log('   → 방금 로컬에 저장한 내용이, 아직 반영 안 된 서버의 예전 응답으로 덮어써질 수 있습니다.');
  console.log('   → 해결: loadCustomersAsync(render함수) 대신 render함수(loadCustomers())로 바꿔서');
  console.log('     서버 재조회 없이 이미 최신인 로컬 데이터로 바로 그리세요.\n');
  allViolations.forEach((v) => {
    console.log(`  ${v.file}:${v.violationLine} — 함수 ${v.func}() (${v.funcStartLine}번째 줄에서 시작)`);
    console.log(`    ${v.code}`);
  });
  process.exit(1);
}

main();
