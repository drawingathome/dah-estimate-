#!/bin/bash
# ══════════════════════════════════════════════════
# 전체 검증 한 번에 (캐시버전 → 타입체크 → 대시보드 회귀 → 견적서 회귀)
#
# 2026-09-24(선혜님 - 큰 파일 쪼개기 중 발견): 대시보드 회귀테스트는 끝까지
# 돌리는 데 10분 넘게 걸리는데, 예전에 `timeout 590`으로 감싸서 돌리면 중간에
# 강제 종료된 뒤 "마지막 테스트가 인프라 오류로 죽었다"고 오해하기 쉬웠음 -
# 실제로는 뒤쪽 테스트가 아예 안 돈 것. 그래서 이 스크립트는:
#   1) 시간제한 없이 끝까지 돌리고
#   2) run-all.js가 맨 끝에 찍는 "✅ 전체 검사 통과" 배너가 로그의 '마지막'
#      부분에 실제로 있을 때만 통과로 인정함(중간에 끊기면 배너가 없으므로
#      자동으로 실패 처리).
# 사용법: bash scripts/verify-all.sh
# ══════════════════════════════════════════════════
cd "$(dirname "$0")/.." || exit 1
LOG="${TMPDIR:-/tmp}/verify-all"
mkdir -p "$LOG"
fail=0

step() {
  local name="$1"; shift
  echo "▶ $name"
  if "$@" > "$LOG/$name.log" 2>&1; then
    echo "  ✅ $name 통과"
  else
    echo "  ❌ $name 실패 → $LOG/$name.log"
    fail=1
  fi
}

# run-all 로그의 마지막 3줄 안에 최종 통과 배너가 있는지(= 끝까지 돌았는지) 검사
banner_ok() {
  tail -n 3 "$1" | grep -q '^✅ 전체 검사 통과$'
}

step 캐시버전 node scripts/bump-cache-versions.js --check
step 타입체크 node tests/typecheck-check.js

for app in dah-dashboard dah-estimate; do
  echo "▶ $app 전체 회귀 (시간이 걸려요, 끝까지 기다립니다)"
  node tests/run-all.js "$app.html" > "$LOG/$app.log" 2>&1
  code=$?
  if [ $code -eq 0 ] && banner_ok "$LOG/$app.log"; then
    echo "  ✅ $app 전체 통과 (최종 배너 확인됨)"
  else
    echo "  ❌ $app 실패 또는 중간에 끊김 (종료코드 $code, 최종 배너 없음이면 끊긴 것) → $LOG/$app.log"
    fail=1
  fi
done

if [ $fail -eq 0 ]; then echo "🎉 전부 통과"; else echo "⛔ 실패 있음 — 위 로그 확인"; fi
exit $fail
