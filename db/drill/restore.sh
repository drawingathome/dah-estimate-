#!/bin/bash
# 사용: restore.sh <DB명> <naive|safe>
B=/usr/lib/postgresql/16/bin; DB=$1; MODE=$2; cd /tmp/pgw/drill
PS="$B/psql -h /tmp/pgw -p 55432 -q -d $DB"
$B/dropdb -h /tmp/pgw -p 55432 --if-exists $DB; $B/createdb -h /tmp/pgw -p 55432 $DB
$PS -f schema.sql >/dev/null 2>&1
# 부모→자식 순서
TABLES="app_settings staff_profiles customers estimates estimate_extra_payments customer_history estimate_history integrity_acks integrity_daily_log monthly_close payment_ledger payment_refunds save_receipts analytics_events client_error_logs as_records estimate_confirm_log customer_stage_auto_log"
for t in $TABLES; do
  {
    [ "$MODE" = safe ] && echo "set session_replication_role = replica;"
    echo "\\set j \`cat $t.json\`"
    echo "insert into $t overriding system value select * from jsonb_populate_recordset(null::$t, :'j'::jsonb);"
  } > _r.sql
  out=$($PS -v ON_ERROR_STOP=1 -f _r.sql 2>&1) && echo "  복구 $t: OK" || echo "  복구 $t: 실패 → $(echo "$out" | grep -m1 ERROR)"
done
