#!/usr/bin/env bash
# N-155(2026-11-12): '배포 단계 초록'이 실제 운영 배포를 뜻하게 한다.
# 배포 훅은 not_found 오류인데도 단계가 성공으로 표시되던 문제(최근 5회) → 훅 결과와 무관하게,
# Vercel이 이 커밋(SHA)을 운영 두 곳(대시보드·견적서)에 배포 완료(success)할 때까지 GitHub 배포 기록으로 기다린다.
# 사용: scripts/wait-vercel-deploy.sh <전체 SHA> [최대 대기 분=60]   (환경변수 GH_REPO 기본 drawingathome/dah-estimate-)
# 종료 코드: 0 = 두 곳 모두 success / 1 = 한 곳이라도 failure·error / 2 = 시간 초과
set -u
SHA="${1:?SHA 필요}"; MAX_MIN="${2:-60}"; REPO="${GH_REPO:-drawingathome/dah-estimate-}"
WANT=("Production – dah-dashboard" "Production – dah-estimate")
end=$(( $(date +%s) + MAX_MIN*60 ))
state_of() {  # $1=환경 이름 → 가장 최근 배포의 최신 상태(없으면 none)
  local id
  id=$(gh api "repos/$REPO/deployments?sha=$SHA&per_page=30" --jq "[.[]|select(.environment==\"$1\")]|sort_by(.created_at)|last|.id // empty" 2>/dev/null)
  [ -z "$id" ] && { echo none; return; }
  gh api "repos/$REPO/deployments/$id/statuses?per_page=5" --jq '.[0].state // "none"' 2>/dev/null || echo none
}
while :; do
  all_ok=1; line=""
  for env in "${WANT[@]}"; do
    s=$(state_of "$env"); line="$line [$env=$s]"
    case "$s" in success) ;; failure|error) echo "❌ $env 배포 $s —$line"; exit 1 ;; *) all_ok=0 ;; esac
  done
  echo "$(date -u +%H:%M:%S) ${SHA:0:7}$line"
  [ "$all_ok" = 1 ] && { echo "✅ 운영 두 곳 모두 배포 완료(${SHA:0:7})"; exit 0; }
  [ "$(date +%s)" -ge "$end" ] && { echo "❌ ${MAX_MIN}분 안에 운영 배포가 끝나지 않음 —$line"; exit 2; }
  sleep 30
done
