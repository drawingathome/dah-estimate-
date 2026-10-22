#!/usr/bin/env bash
# DB 규칙 시험. 접속 정보는 PGHOST/PGPORT/PGUSER/PGPASSWORD 환경변수. 시험용 DB 2개를 만들고 지운다(운영과 무관).
set -uo pipefail
cd "$(dirname "$0")"
R=..
P="psql -v ON_ERROR_STOP=1 -q -X -P pager=off"
fail=0
mk(){ $P -d postgres -c "drop database if exists $1" -c "create database $1"; }

echo "=== A. 규칙 시험 (새 규칙이 들어간 DB) ==="
mk dah_rules_test
for f in test/01_schema.sql test/02_functions.sql test/03_stub_views.sql \
         $R/migration_stage_price_autosync.sql $R/migration_2026_10_22_extra_payment_touch_customer.sql $R/migration_2026_10_22_estimate_confirm_guard.sql \
         test/assertions.sql w1/95_backfill_lagging_stage.sql test/after_backfill.sql; do
  echo "-- $f"; out=$($P -d dah_rules_test -f $f 2>&1) || { echo "$out" | grep -E "FAIL|ERROR" | head -5; echo "A 실패: $f"; fail=1; break; }
  echo "$out" | grep -c "PASS" | sed 's/^/   통과 항목: /' | grep -v ": 0"
done

echo "=== B. 적용 세트 연습 (운영과 같은 옛 상태 DB) ==="
tmp=$(mktemp); bash w1/build-apply.sh "$tmp"
if ! diff -q "$tmp" w1/apply_w1.sql >/dev/null; then echo "FAIL: apply_w1.sql 이 마이그레이션 조각과 다름 → bash db/w1/build-apply.sh 실행 필요"; fail=1; fi
mk dah_prodlike_test
$P -d dah_prodlike_test -f test/01_schema.sql -f test/02_functions.sql -f test/03_stub_views.sql -f test/seed_pre.sql >/dev/null || fail=1
snap(){ $P -d dah_prodlike_test -Atc "select (select string_agg(tgname,',' order by tgname) from pg_trigger where not tgisinternal) || '|' || md5(pg_get_functiondef('public.customers_auto_stage_on_deposit'::regproc)) || '|' || md5(pg_get_viewdef('public.data_integrity_issues'::regclass))"; }
BEFORE=$(snap); [ -n "$BEFORE" ] || { echo "FAIL: 적용 전 스냅샷 비어있음"; fail=1; }
$P -d dah_prodlike_test -f w1/apply_w1.sql >/dev/null 2>&1 && echo "PASS 적용(검증 포함)" || { echo "FAIL 적용"; fail=1; }
N=$($P -d dah_prodlike_test -Atc "select count(*) from pg_trigger where tgname in ('trg_sync_customer_price','trg_extra_payment_touch_customer','trg_estimates_confirm_guard')")
[ "$N" = "3" ] && echo "PASS 새 트리거 3개" || { echo "FAIL 새 트리거 수=$N"; fail=1; }
$P -d dah_prodlike_test -f w1/95_backfill_lagging_stage.sql >/dev/null 2>&1
S=$($P -d dah_prodlike_test -Atc "select string_agg(id||':'||stage, ',' order by id) from customers")
[ "$S" = "7:가견적,63:시공완료,244:시공준비중" ] && echo "PASS 정리 스크립트(244만 이동)" || { echo "FAIL 정리 결과: $S"; fail=1; }
$P -d dah_prodlike_test -f w1/rollback_w1.sql >/dev/null 2>&1 || { echo "FAIL 되돌리기 실행"; fail=1; }
AFTER=$(snap); [ "$BEFORE" = "$AFTER" ] && echo "PASS 되돌린 뒤 트리거·함수·뷰 동일" || { echo "FAIL 되돌린 뒤 차이"; fail=1; }
# 중간 실패 시 전부 취소
$P -d dah_prodlike_test -c "drop schema if exists backup_w1_20261022 cascade" -c "drop table if exists public.estimate_confirm_log" -c "alter table public.estimates drop column if exists unconfirm_reason" >/dev/null 2>&1
sed '$d' w1/apply_w1.sql > "$tmp"; printf 'select 1/0;\ncommit;\n' >> "$tmp"
$P -d dah_prodlike_test -f "$tmp" >/dev/null 2>&1
LEFT=$($P -d dah_prodlike_test -Atc "select (select count(*) from pg_trigger where tgname in ('trg_sync_customer_price','trg_extra_payment_touch_customer','trg_estimates_confirm_guard')) + (select count(*) from information_schema.schemata where schema_name='backup_w1_20261022') + (select count(*) from information_schema.tables where table_name='estimate_confirm_log')")
[ "$LEFT" = "0" ] && echo "PASS 중간 실패 시 전부 취소" || { echo "FAIL 중간 실패 뒤 잔여=$LEFT"; fail=1; }
rm -f "$tmp"
$P -d postgres -c "drop database if exists dah_rules_test" -c "drop database if exists dah_prodlike_test" >/dev/null 2>&1
[ $fail = 0 ] && echo "=== 전체 통과 ===" || echo "=== 실패 있음 ==="
exit $fail
