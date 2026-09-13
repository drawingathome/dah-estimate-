#!/bin/bash
# 2026-09-11(선혜님 지시 — CI가 테스트 실패해도 배포를 안 막고 있던 문제):
# .github/workflows/deploy.yml을 test.yml 성공에 의존하게 바꾸는 게 정공법인데,
# 그 파일은 GitHub의 workflow scope 권한이 있어야 수정 가능해서(지금 토큰엔
# 없음) 여기서는 못 건드림. 대신 workflows 폴더 밖에 있는 vercel.json의
# "Ignored Build Step" 기능을 활용 — 이 스크립트가 0을 반환하면 그 배포를
# Vercel이 건너뜀(스킵), 0이 아니면 그대로 배포함.
#
# ⚠️ 1단계(지금): 아직 "확인 전용" 모드임. Vercel 빌드 환경에서 Puppeteer
# (가상 브라우저)가 실제로 정상 동작하는지 이 코드 작성 시점엔 검증할
# 방법이 없어서(Vercel 빌드 로그를 직접 볼 수 없음), 일단 테스트 결과와
# 무관하게 항상 "배포 진행"(exit 1)으로 두고, 로그에만 결과를 남김.
# 몇 번의 배포 후 Vercel 빌드 로그에서 "테스트 결과" 부분이 정상적으로
# 찍히는 게 확인되면, 아래 exit 1을 조건부(실패시 exit 0)로 바꿔서
# 진짜로 막는 2단계로 넘어가면 됨.

echo "=== [배포전 검사] 회귀테스트 실행 (현재는 결과와 무관하게 배포 진행) ==="
npm install puppeteer@22 --no-save 2>&1 | tail -5
TEST_EXIT=0
node tests/run-all.js dah-dashboard.html || TEST_EXIT=1
node tests/run-all.js dah-estimate.html || TEST_EXIT=1

if [ "$TEST_EXIT" -eq 0 ]; then
  echo "=== ✅ 회귀테스트 전체 통과 — 이 로그가 안정적으로 찍히면 다음 단계(실제 차단)로 전환 가능 ==="
else
  echo "=== ❌ 회귀테스트 실패 감지 — 아직은 확인전용 모드라 배포는 그대로 진행됨 ==="
fi

exit 1
