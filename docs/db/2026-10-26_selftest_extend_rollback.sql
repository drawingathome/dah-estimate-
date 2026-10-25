-- 2026-10-26 staff_permission_selftest 확장 되돌리기 — 확장 전(운영에 있던) 원본 함수로 복구
create or replace function public.staff_permission_selftest()
returns void language plpgsql set search_path to 'public','pg_temp' as $function$
declare uid uuid; sname text; res jsonb := '{}'::jsonb; all_ok boolean := true; n int; opts text;
  denies text[][] := array[
    ['see_master_customers',   'select * from public.customers where staff_name = ''마스터'''],
    ['update_master_customer', 'update public.customers set memo = memo where staff_name = ''마스터'''],
    ['update_master_estimate', 'update public.estimates set price = price where staff_name = ''마스터'''],
    ['delete_master_customer', 'delete from public.customers where staff_name = ''마스터'''],
    ['read_daily_log',         'select * from public.integrity_daily_log'],
    ['read_selftest_log',      'select * from public.permission_selftest_log'],
    ['write_refund_table',     'delete from public.payment_refunds']
  ];
  i int; ok_i boolean;
begin
  select id, display_name into uid, sname from public.staff_profiles where role = 'staff' order by display_name limit 1;
  if uid is null then
    insert into public.permission_selftest_log(ok, detail) values (true, '{"skipped":"no staff profile"}');
    return;
  end if;
  n := public._selftest_run(uid, format('select * from public.customers where staff_name = %L', sname));
  ok_i := n > 0; res := res || jsonb_build_object('control_own_customers_visible', jsonb_build_object('rows', n, 'ok', ok_i)); all_ok := all_ok and ok_i;
  n := public._selftest_run(uid, format('update public.customers set staff_name = %L where staff_name = ''마스터''', sname));
  ok_i := n <= 0; res := res || jsonb_build_object('takeover_master_customer', jsonb_build_object('rows', n, 'ok', ok_i)); all_ok := all_ok and ok_i;
  for i in 1 .. array_length(denies, 1) loop
    n := public._selftest_run(uid, denies[i][2]);
    ok_i := n <= 0;
    res := res || jsonb_build_object(denies[i][1], jsonb_build_object('rows', n, 'ok', ok_i));
    all_ok := all_ok and ok_i;
  end loop;
  select reloptions::text into opts from pg_class where oid = 'public.data_integrity_issues'::regclass;
  ok_i := coalesce(opts, '') like '%security_invoker=true%';
  res := res || jsonb_build_object('integrity_view_security_invoker', jsonb_build_object('options', opts, 'ok', ok_i)); all_ok := all_ok and ok_i;
  insert into public.permission_selftest_log(ok, detail) values (all_ok, res);
end $function$;
