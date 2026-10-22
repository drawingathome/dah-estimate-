# DB 규칙 시험 (db/)

운영 DB(Supabase)의 트리거·함수 규칙을 **임시 PostgreSQL**에서 시험한다. 운영 데이터는 쓰지 않는다.

## 실행
```
PGHOST=... PGPORT=... PGUSER=... PGPASSWORD=... bash db/run.sh
```
CI: `.github/workflows/db-rules-test.yml` (db/ 또는 migration 파일이 바뀔 때 자동).

## 구성
| 경로 | 내용 |
|---|---|
| test/01_schema.sql, 02_functions.sql, 03_stub_views.sql | 운영 구조 복제(2026-10-21 읽기 전용 추출). **운영 구조가 바뀌면 같이 갱신** |
| test/assertions.sql | 규칙 시험 21항목(가상 고객): 단계 자동 이동, 추가결제, 플러그 이관 제외, 직원 권한 거부, 확정 보호 |
| test/seed_pre.sql | "규칙 도입 전 운영 상태"를 흉내 낸 연습용 데이터 |
| w1/apply_w1.sql | 운영 적용본(한 트랜잭션: 백업→규칙→자동 검증). `w1/build-apply.sh`로 조립 — 마이그레이션이 바뀌면 다시 조립(안 하면 시험이 실패함) |
| w1/rollback_w1.sql, 95_backfill_lagging_stage.sql | 되돌리기 / 뒤처진 단계 1회 정리 |

## 한계 (솔직히)
- Supabase 권한(RLS)·역할은 흉내만 낸다. 직원 계정 실제 동작은 운영 적용 직후 별도 확인.
- 동시에 두 사람이 저장하는 경우, 점검 뷰의 실제 내용은 시험하지 않는다.
- 운영 구조와 시험용 구조가 어긋나면 시험이 거짓 통과할 수 있다 → 구조 변경 시 01·02 갱신 필수.
