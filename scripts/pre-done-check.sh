#!/bin/bash
# ══════════════════════════════════════════════════
# 2026-10-04(선혜님 - "전문업체 기준으로 평가해봐" → "QA가 선혜님이 되묻는 것으로
# 대체되고 있다"는 지적에 대한 해결책): "완료됐다"고 말하기 전에 매번 똑같이
# 돌려야 하는 고정 점검. 지금까지는 "어디까지 확인할지"를 그때그때 판단해서
# 결정했는데, 그 판단 자체가 매번 빠지는 게 있었음(16건 중 4건 미답변 방치,
# 핵심 트리거 감시 목록 누락, report() 선언누락 등 - 전부 "이번엔 충분히
# 확인했다"고 여긴 순간 놓친 것들). 판단에 맡기지 않고, 이 스크립트 하나를
# 끝까지 돌려서 전부 통과해야만 "완료"라고 말할 자격이 생기는 구조로 바꿈.
#
# 사용법: bash scripts/pre-done-check.sh
# 통과하지 못하면 "완료"라고 말하지 않는다 - 이게 이 스크립트의 유일한 규칙.
# ══════════════════════════════════════════════════
cd "$(dirname "$0")/.." || exit 1
fail=0

echo "▶ 1/6 dev-main 동기화 상태"
AHEAD=$(git rev-list --count origin/dev..origin/main 2>/dev/null || echo "?")
if [ "$AHEAD" != "0" ]; then
  echo "  ❌ dev가 main보다 ${AHEAD}커밋 뒤쳐짐 - 'git push origin main:dev'로 동기화 필요"
  fail=1
else
  echo "  ✅ dev-main 동기화됨"
fi

echo "▶ 2/6 CONCEPT_REGISTRY 정합성"
if node tests/concept-registry-check.js > /tmp/precheck_registry.log 2>&1; then
  echo "  ✅ 통과"
else
  echo "  ❌ 실패 - /tmp/precheck_registry.log 확인"; fail=1
fi

echo "▶ 3/6 Apps Script 전수 린트(ESLint no-undef 등)"
if node tests/apps-script-lint-check.js > /tmp/precheck_lint.log 2>&1; then
  echo "  ✅ 통과"
else
  echo "  ❌ 실패 - /tmp/precheck_lint.log 확인"; cat /tmp/precheck_lint.log; fail=1
fi

echo "▶ 4/6 캐시버전·CODE_MAP 정합성"
if node scripts/bump-cache-versions.js --check > /tmp/precheck_cache.log 2>&1 && node scripts/gen-code-map.js --check >> /tmp/precheck_cache.log 2>&1; then
  echo "  ✅ 통과"
else
  echo "  ❌ 실패 - /tmp/precheck_cache.log 확인"; fail=1
fi

echo "▶ 5/6 파일 등록·타입체크"
# 2026-10-04: 이 프로젝트는 베이스라인(ratchet) 방식이라 npm run typecheck(원시
# tsc)가 아니라 tests/typecheck-check.js(기존 오류는 베이스라인으로 묵인하고
# 새로 생긴 것만 잡음)를 써야 함 - 처음엔 이걸 모르고 원시 tsc를 넣었다가 거짓
# 실패가 났음(이 스크립트를 만들면서도 똑같은 "확인 없이 작성" 실수를 했다는
# 뜻이라 특히 신경써서 바로잡음).
if node tests/file-registration-check.js > /tmp/precheck_reg.log 2>&1 && node tests/typecheck-check.js > /tmp/precheck_tc.log 2>&1; then
  echo "  ✅ 통과"
else
  echo "  ❌ 실패 - /tmp/precheck_reg.log 또는 /tmp/precheck_tc.log 확인"; fail=1
fi

echo "▶ 6/6 전체 브라우저 회귀(대시보드+견적서) - 시간이 걸립니다"
if bash scripts/verify-all.sh > /tmp/precheck_verifyall.log 2>&1; then
  echo "  ✅ 통과"
else
  echo "  ❌ 실패 - /tmp/precheck_verifyall.log 확인"; fail=1
fi

echo ""
if [ "$fail" -eq 0 ]; then
  echo "✅ 전체 의무점검 통과 - 이제 '완료'라고 말할 수 있음"
else
  echo "❌ 의무점검 실패 - 통과할 때까지 '완료'라고 말하지 않는다"
fi
exit $fail
