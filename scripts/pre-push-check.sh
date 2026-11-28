#!/usr/bin/env bash
# N-235: 푸시 직전 점검(F-28 재발 방지) — CI의 빠른 3단계를 로컬에서 먼저 돌려 '?v= 누락' 같은 실패를 푸시 전에 잡는다.
# 사용: bash scripts/pre-push-check.sh   (실패하면 0이 아닌 값으로 끝나 푸시를 막는다)
set -e
cd "$(dirname "$0")/.."
echo "1/3 캐시버전 정합성";  node scripts/bump-cache-versions.js --check
echo "2/3 시험 등록 확인";   node tests/registration-check.js
echo "3/3 코드 지도 최신 여부"; node scripts/gen-code-map.js >/dev/null && git diff --quiet CODE_MAP.md || { echo "❌ CODE_MAP.md가 최신이 아니에요 — 커밋에 포함하세요"; exit 1; }
echo "✅ 푸시 전 점검 통과 (타입검사·전체 시험은 CI에서)"
