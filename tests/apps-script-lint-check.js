#!/usr/bin/env node
// tests/apps-script-lint-check.js
// ══════════════════════════════════════════════════
// 2026-10-04(선혜님 - "니 자료는 진짜... 모두 전수검수 해!!" / "오류 없는거 확실해???
// 전수검사!!" 요청으로 추가): Apps Script 파일(브라우저 테스트 대상이 아니라 CI
// 회귀망에서 완전히 벗어나 있었음)에서 실제 운영 장애가 두 번 발생함 -
// dahScanForDataIntegrity()의 issues, dahCheckCustomerPaymentMismatch()의 report가
// 둘 다 선언 없이 쓰이다가, "조건이 맞아서 그 줄이 실행될 때"만 조용히 터지는
// ReferenceError였음(코드 리뷰나 평소 실행으로는 안 드러나고, 실제 그 상황이
// 닥쳐야만 드러나는 유형). node --check(구문 검사)로는 절대 못 잡음 - 실제로 그
// 경로를 실행하거나, 정적 스코프 분석(린터)을 돌려야만 잡힘.
//
// ESLint의 no-undef 규칙으로 apps-script-*.js 전체를 전수 검사 - Google Apps
// Script 전역객체(SpreadsheetApp, DriveApp 등)는 .eslintrc.apps-script.json에
// 미리 등록해둬서 오탐 없이, 실제로 선언되지 않은 변수만 걸러냄. 부가로
// no-redeclare, no-dupe-keys 등도 함께 감시(이번에 Authorization 헤더 키 중복도
// 같이 발견됨).
//
// 사용법: node tests/apps-script-lint-check.js
// ══════════════════════════════════════════════════
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const eslintBin = path.join(root, 'node_modules', '.bin', 'eslint');
const configPath = path.join(root, '.eslintrc.apps-script.json');
const targets = ['apps-script-automation-hub.js', 'apps-script-daily-backup.js', 'apps-script-survey-to-customer.js'];

let allOk = true;
targets.forEach(function (file) {
  const filePath = path.join(root, file);
  try {
    execFileSync(eslintBin, [filePath, '--no-eslintrc', '--config', configPath], { encoding: 'utf-8', stdio: 'pipe' });
    console.log('✅ ' + file + ' — 전수검사 통과(선언 안 된 변수, 중복 키 등 없음)');
  } catch (e) {
    allOk = false;
    console.log('❌ ' + file + ' — 문제 발견:');
    console.log(e.stdout || e.message);
  }
});

console.log('\n' + (allOk ? '✅ Apps Script 파일 전체 전수검사 통과' : '❌ Apps Script 파일에서 문제 발견 — 위 내용 확인 필요'));
process.exit(allOk ? 0 : 1);
