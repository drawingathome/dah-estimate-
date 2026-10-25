#!/bin/bash
# 2026-10-25(전수표 R-08): 푸시 직전 "빠른 의무점검"(약 1~3분). 하나라도 실패하면 비정상 종료 → git pre-push 훅이 푸시를 막음.
# 배경: 같은 날 타입체크를 빼먹고 푸시해 서버 검사가 실패한 일이 있었음(사람 기억에 의존하지 않기 위해 자동화).
# 전체 브라우저 회귀(약 25분×2)는 scripts/verify-all.sh / scripts/pre-done-check.sh 로 따로 돌린다(여기서는 빠른 것만).
cd "$(dirname "$0")/.." || exit 1
fail=0
run() {
  local name="$1"; shift
  if "$@" > "/tmp/fastcheck_${name}.log" 2>&1; then echo "  ✅ $name"; else echo "  ❌ $name 실패 → /tmp/fastcheck_${name}.log"; tail -5 "/tmp/fastcheck_${name}.log" | sed 's/^/     /'; fail=1; fi
}
echo "▶ 푸시 전 빠른 점검"
run 캐시버전 node scripts/bump-cache-versions.js --check
run 코드지도 node scripts/gen-code-map.js --check
run 파일등록 node tests/file-registration-check.js
run 개념등록 node tests/concept-registry-check.js
run 타입체크 node tests/typecheck-check.js
run 앱스크립트린트 node tests/apps-script-lint-check.js
run 앱스크립트실행 node tests/apps-script-run-check.js
run 설문스크립트 node tests/survey-to-customer-script-check.js
run 비밀번호업로드 node tests/no-master-pw-upload-check.js
run 스키마계약 node tests/schema-contract-check.js
if [ "$fail" -ne 0 ]; then echo "❌ 빠른 점검 실패 — 고친 뒤 다시 푸시하세요"; exit 1; fi
echo "✅ 빠른 점검 통과 (전체 회귀는 verify-all.sh 로 별도 확인했는지 꼭 확인)"
