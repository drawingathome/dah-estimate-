# 백업 복구 시험 (시험용 PostgreSQL 전용 · 운영 DB 접속 없음)
실행: postgres 사용자로 `bash run.sh` → `restore.sh dst_safe safe` → `compare.sh dst_safe` → `seqtest.sh`.
(`restore.sh dst_naive naive`는 "트리거 켠 채 복구하면 실패한다"는 증명용)
전제: /tmp/pgw 시험 서버(포트 55432)와 prod_like DB. 절대경로가 /tmp/pgw/drill 고정이라 CI 편입 전 정리 필요.
핵심 규칙: 복구는 session_replication_role=replica로, 끝나면 setval로 번호표 맞춤.
