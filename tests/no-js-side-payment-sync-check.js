#!/usr/bin/env node
// tests/no-js-side-payment-sync-check.js
// ══════════════════════════════════════════════════
// 2026-10-02(선혜님 - "이민선/김현정 결제했는데 상담에 뜨니, 쌍둥이 함수도 찾고 앞으로
// 이런 버그 안생기게 하는 방향도 찾아" 요청으로 재발방지 구조 도입): customers 테이블의
// deposit/balance 금액·날짜·수단·영수확인 동기화 책임은 이제 Supabase DB 트리거
// (sync_customer_payment_from_estimates, estimates 테이블에 연결)가 전담함 - JS 코드가
// 이 값들을 재계산해서 customers에 직접 PATCH하는 코드를 다시 만들면, "select와 PATCH의
// 필드 집합이 어긋나는" 이번과 같은 유형의 버그가 똑같이 재발할 수 있음.
//
// 이 가드는 코드베이스 전체에서 "customers 테이블에 deposit_amount 또는 balance_amount를
// 직접 쓰는(PATCH/POST) JS 코드"가 없는지 정적으로 검사함 - 누군가 나중에 비슷한 동기화
// 로직을 JS에 다시 추가하려 하면 이 테스트가 잡아냄. estimates 테이블에 쓰는 것은 정상
// (그게 진짜 소스이고, 트리거가 거기서 읽어감)이므로 대상에서 제외.
//
// 사용법: node tests/no-js-side-payment-sync-check.js
// ══════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const jsFiles = fs.readdirSync(root).filter(f => f.endsWith('.js') && !f.startsWith('tests'));

const violations = [];
for (const file of jsFiles) {
  const content = fs.readFileSync(path.join(root, file), 'utf-8');
  // "customers?id=eq." 로 시작하는 PATCH/POST 요청 URL 주변 500자 안에
  // deposit_amount 또는 balance_amount를 담는 바디가 있으면 위반으로 간주.
  // (단순 읽기 select=... 는 '?select='만 있고 PATCH 바디 구성이 아니므로 안전)
  const customersWriteRegex = /['"`]customers\?id=eq\.[^'"`]*['"`]/g;
  let m;
  while ((m = customersWriteRegex.exec(content)) !== null) {
    const windowStart = m.index;
    const windowEnd = Math.min(content.length, m.index + 800);
    const surrounding = content.slice(windowStart, windowEnd);
    if (/deposit_amount\s*:|balance_amount\s*:/.test(surrounding)) {
      const lineNo = content.slice(0, m.index).split('\n').length;
      violations.push(file + ':' + lineNo);
    }
  }
}

console.log('검사한 파일:', jsFiles.length + '개');
if (violations.length > 0) {
  console.log('❌ customers 테이블에 deposit_amount/balance_amount를 직접 쓰는 JS 코드 발견:');
  violations.forEach(v => console.log('  - ' + v));
  console.log('\n이 값들의 동기화는 DB 트리거(sync_customer_payment_from_estimates)가 전담해야 합니다.');
  console.log('JS에서 estimates 테이블만 PATCH하면 트리거가 자동으로 customers를 동기화합니다.');
  process.exit(1);
} else {
  console.log('✅ customers 테이블에 deposit/balance를 직접 쓰는 JS 코드 없음 — DB 트리거가 동기화를 전담하는 구조 유지됨');
  process.exit(0);
}
