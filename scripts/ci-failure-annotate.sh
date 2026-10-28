#!/bin/bash
# H-32: 서버 검사(Run Tests)가 실패하면, 실패한 줄(❌)·마지막 줄을 GitHub 주석(annotation)과 요약으로 남긴다.
# 이유: 실패 로그 파일(artifact)은 이 작업 환경에서 내려받을 수 없어, REST API(check-runs annotations)로 읽을 수 있게 한다.
# 사용: bash scripts/ci-failure-annotate.sh [로그폴더(기본 ci-logs)]
D="${1:-ci-logs}"
n=0
for f in "$D"/*.log; do
  [ -f "$f" ] || continue
  b=$(basename "$f" .log)
  while IFS= read -r line; do
    n=$((n+1)); [ $n -gt 9 ] && break
    msg=$(printf '%s' "$line" | tr -d '\r' | cut -c1-400)
    echo "::error title=실패(${b})::${msg}"
  done < <(grep -a '❌' "$f" | head -9)
  tl=$(tail -n 5 "$f" | tr -d '\r' | tr '\n' ' ' | cut -c1-500)
  echo "::error title=마지막줄(${b})::${tl}"
  if [ -n "$GITHUB_STEP_SUMMARY" ]; then
    { echo "### ${b} 로그 끝 40줄"; echo '```'; tail -n 40 "$f"; echo '```'; } >> "$GITHUB_STEP_SUMMARY"
  fi
done
exit 0
