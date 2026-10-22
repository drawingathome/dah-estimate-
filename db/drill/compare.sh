#!/bin/bash
B=/usr/lib/postgresql/16/bin; DB=$1; cd /tmp/pgw/drill
for t in app_settings staff_profiles customers estimates estimate_extra_payments customer_history estimate_history integrity_acks integrity_daily_log monthly_close payment_ledger payment_refunds save_receipts analytics_events client_error_logs as_records estimate_confirm_log customer_stage_auto_log; do
  a=$($B/psql -h /tmp/pgw -p 55432 -d src_drill -Atc "select count(*)||' '||coalesce(md5(string_agg(to_jsonb(x)::text, '|' order by to_jsonb(x)::text)),'-') from $t x")
  b=$($B/psql -h /tmp/pgw -p 55432 -d $DB -Atc "select count(*)||' '||coalesce(md5(string_agg(to_jsonb(x)::text, '|' order by to_jsonb(x)::text)),'-') from $t x")
  [ "$a" = "$b" ] && echo "  일치 $t (${a%% *}건)" || echo "  ❌불일치 $t 원본[$a] 복구[$b]"
done
