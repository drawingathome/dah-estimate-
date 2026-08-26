#!/usr/bin/env bash
# tests/pre-deploy-check.sh
# 2026-08-26: "배포 전 체크리스트 습관화" — 스테이징 브랜치(dev) 도입에 이어
# 두 번째 단계. main이든 dev든 push하기 전에는 항상 이 스크립트 하나만
# 실행하면, 아래 항목이 전부 자동으로 확인됨:
#   1) 대시보드 회귀 테스트 전체 (run-all.js) - 로그인/권한/데이터/반응형 등
#   2) 견적서 앱 회귀 테스트 전체 (run-all.js) - 계산/저장/중복방지 등
#   3) 대시보드 실장 전체화면 탐색 (staff-full-sweep.js) - PC/모바일
#   4) 견적서 앱 실장 전체화면 탐색 (staff-full-sweep-estimate.js) - PC/모바일
#
# 사용법 (레포 루트에서):
#   bash tests/pre-deploy-check.sh
#
# 하나라도 실패하면 0이 아닌 코드로 즉시 종료 - "일단 push하고 나중에
# 문제 알게 되는" 상황을 배포 전에 미리 막기 위함.

set -e
cd "$(dirname "$0")/.."

echo "════════════════════════════════════════"
echo "  배포 전 체크 시작 (main/dev push 전 항상 이걸 먼저)"
echo "════════════════════════════════════════"

echo ""
echo "── 1/4: 대시보드 회귀 테스트 ──"
node tests/run-all.js dah-dashboard.html

echo ""
echo "── 2/4: 견적서 앱 회귀 테스트 ──"
node tests/run-all.js dah-estimate.html

echo ""
echo "── 3/4: 대시보드 실장 전체화면 탐색 (PC+모바일) ──"
node tests/staff-full-sweep.js

echo ""
echo "── 4/4: 견적서 앱 실장 전체화면 탐색 (PC+모바일) ──"
node tests/staff-full-sweep-estimate.js

echo ""
echo "════════════════════════════════════════"
echo "  ✅ 배포 전 체크 전부 통과 — push해도 안전"
echo "════════════════════════════════════════"
