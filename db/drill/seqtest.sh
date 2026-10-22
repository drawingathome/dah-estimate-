B=/usr/lib/postgresql/16/bin; P="$B/psql -h /tmp/pgw -p 55432 -d dst_safe -At"
echo "[복구 직후] 새 고객 저장:"; $P -c "insert into customers(client_name,phone) values('신규','010') returning id" 2>&1 | head -2
echo "[번호표 맞춤 후]:"
for t in customers customer_history integrity_daily_log payment_ledger save_receipts; do
 $P -c "select setval(pg_get_serial_sequence('$t','id'), greatest((select coalesce(max(id),0) from $t),1))" >/dev/null
done
$P -c "insert into customers(client_name,phone) values('신규2','010') returning id" 2>&1 | head -2
echo "[트리거 수 원본/복구]:"; for d in src_drill dst_safe; do $B/psql -h /tmp/pgw -p 55432 -d $d -Atc "select count(*) from pg_trigger where not tgisinternal"; done
