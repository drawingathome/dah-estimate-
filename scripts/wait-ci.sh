#!/usr/bin/env bash
# N-114⑤: 푸시한 커밋의 CI 3단계(Run Tests → Deploy to Vercel → Post-deploy verify)가 '모두' 끝날 때까지 기다린다.
# 사용: scripts/wait-ci.sh <커밋 앞 7자리> [최대분(기본 60)]   종료코드: 0=3단계 모두 success, 1=하나라도 실패, 2=시간 초과
# 2026-11-05: 조건이 느슨해 단계가 안 끝났는데 '완료'로 오판한 일이 2번 있어 고정함(3단계 이름을 전부 확인).
sha="$1"; max=${2:-60}; [ -z "$sha" ] && { echo "사용: $0 <sha7> [분]"; exit 2; }
need=("Run Tests" "Deploy to Vercel" "Post-deploy verify (production)")
for i in $(seq 1 $((max*2))); do
  out=$(gh run list --limit 20 --json name,status,conclusion,headSha --jq ".[]|select(.headSha[0:7]==\"$sha\")|\"\(.name)|\(.status)|\(.conclusion)\"")
  allok=1
  for n in "${need[@]}"; do
    line=$(echo "$out" | grep -F "$n|" | head -1)
    if echo "$line" | grep -q "|completed|failure\|cancelled\|timed_out"; then echo "❌ 실패: $line"; echo "$out"; exit 1; fi
    echo "$line" | grep -q "|completed|success" || allok=0
  done
  [ $allok = 1 ] && { echo "✅ 3단계 모두 초록"; echo "$out"; exit 0; }
  sleep 30
done
echo "⏱ 시간 초과"; echo "$out"; exit 2
