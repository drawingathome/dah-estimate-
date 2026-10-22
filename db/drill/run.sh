#!/bin/bash
# 백업 복구 시험: 원본DB(src) → JSON 내보내기 → 빈 DB(dst)에 복구 → 전부 비교
B=/usr/lib/postgresql/16/bin; PS="$B/psql -h /tmp/pgw -p 55432 -v ON_ERROR_STOP=1 -q"
cd /tmp/pgw/drill
$B/dropdb -h /tmp/pgw -p 55432 --if-exists src_drill; $B/dropdb -h /tmp/pgw -p 55432 --if-exists dst_drill; $B/dropdb -h /tmp/pgw -p 55432 --if-exists src_drill
$B/dropdb -h /tmp/pgw -p 55432 --if-exists base_drill; rm -f base_err.txt
$B/createdb -h /tmp/pgw -p 55432 -T prod_like base_drill
$PS -d base_drill -f extra3.sql
for f in migration_stage_price_autosync.sql migration_2026_10_22_extra_payment_touch_customer.sql migration_2026_10_22_estimate_confirm_guard.sql; do $PS -d base_drill -f /tmp/pgw/rc/$f >/dev/null 2>>base_err.txt; done
echo "base migration errors: $(grep -c ERROR base_err.txt)"
$B/createdb -h /tmp/pgw -p 55432 -T base_drill src_drill
# 구조만 복사한 빈 DB (트리거 포함)
$B/pg_dump -h /tmp/pgw -p 55432 --schema-only base_drill > schema.sql
$B/createdb -h /tmp/pgw -p 55432 dst_drill
$PS -d dst_drill -f schema.sql >/dev/null 2>schema_err.txt; echo "schema load errors: $(grep -c ERROR schema_err.txt)"
# 어려운 데이터 투입
$PS -d src_drill -f seed_hard.sql; $PS -d src_drill -f seed_more.sql
TABLES="app_settings customers estimates estimate_extra_payments customer_history estimate_history integrity_acks integrity_daily_log monthly_close payment_ledger payment_refunds save_receipts staff_profiles analytics_events client_error_logs as_records estimate_confirm_log customer_stage_auto_log"
for t in $TABLES; do
  $PS -d src_drill -Atc "select coalesce(jsonb_pretty(jsonb_agg(to_jsonb(x))),'[]') from $t x" > $t.json
  echo "export $t: $(wc -c < $t.json) bytes"
done
