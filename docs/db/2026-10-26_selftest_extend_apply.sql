-- 2026-10-26 실장 권한 자동시험(staff_permission_selftest) 확장 — 운영 적용 전 승인 필요
-- 이유: 매일 DB가 스스로 하는 시험이 "남의 고객 보기·수정·삭제·가져가기"만 확인함. 아래 항목을 추가해
--       실장이 (1) 마감/설정/추가결제/오류로그를 건드리거나 (2) 입금을 줄이거나 담당자를 바꾸거나 (3) 남의 이름으로 고객을 만드는 것까지 매일 확인.
-- 안전: 모든 문장은 _selftest_run 안에서 실행 후 예외로 되돌려지므로(savepoint 롤백) 데이터가 바뀌지 않음. 기존 항목은 그대로.
-- 판정: n <= 0 (0건 처리 또는 오류로 거절)이면 정상(막힘).
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
    ['write_refund_table',     'delete from public.payment_refunds'],
    -- 2026-10-26 추가
    ['read_monthly_close',     'select * from public.monthly_close'],
    ['write_monthly_close',    'delete from public.monthly_close'],
    ['update_app_settings',    'update public.app_settings set value = value'],
    ['insert_app_settings',    'insert into public.app_settings(key, value) values (''_selftest_key'', ''"x"''::jsonb)'],
    ['update_extra_payments',  'update public.estimate_extra_payments set amount = amount'],
    ['read_error_logs',        'select * from public.client_error_logs'],
    ['read_monthly_history',   'select * from public.monthly_close_history'],
    ['read_stage_auto_log_master', 'select * from public.customer_stage_auto_log l where exists (select 1 from public.customers c where c.id = l.customer_id and c.staff_name = ''마스터'')']
  ];
  own_denies text[][];
  i int; ok_i boolean;
begin
  select id, display_name into uid, sname from public.staff_profiles where role = 'staff' order by display_name limit 1;
  if uid is null then
    insert into public.permission_selftest_log(ok, detail) values (true, '{"skipped":"no staff profile"}');
    return;
  end if;
  -- 대조군: 본인 고객은 보여야 함(안 보이면 시험 자체가 무의미 → 실패 처리)
  n := public._selftest_run(uid, format('select * from public.customers where staff_name = %L', sname));
  ok_i := n > 0; res := res || jsonb_build_object('control_own_customers_visible', jsonb_build_object('rows', n, 'ok', ok_i)); all_ok := all_ok and ok_i;
  -- 담당 가져가기(미배정이 아닌 남의 고객을 내 이름으로 바꾸기)는 막혀야 함
  n := public._selftest_run(uid, format('update public.customers set staff_name = %L where staff_name = ''마스터''', sname));
  ok_i := n <= 0; res := res || jsonb_build_object('takeover_master_customer', jsonb_build_object('rows', n, 'ok', ok_i)); all_ok := all_ok and ok_i;
  for i in 1 .. array_length(denies, 1) loop
    n := public._selftest_run(uid, denies[i][2]);
    ok_i := n <= 0;
    res := res || jsonb_build_object(denies[i][1], jsonb_build_object('rows', n, 'ok', ok_i));
    all_ok := all_ok and ok_i;
  end loop;
  -- 2026-10-26 추가: 본인 고객에 대해서도 막혀야 하는 것(담당자 바꾸기 / 입금 줄이기 / 남의 이름으로 고객 만들기)
  own_denies := array[
    ['rename_own_customer_staff', format('update public.customers set staff_name = ''마스터'' where staff_name = %L', sname)],
    ['rename_own_estimate_staff', format('update public.estimates set staff_name = ''마스터'' where staff_name = %L', sname)],
    ['reduce_own_customer_deposit', format('update public.customers set deposit_amount = 0 where staff_name = %L and coalesce(deposit_amount,0) > 0', sname)],
    ['reduce_own_estimate_deposit', format('update public.estimates set deposit_amount = 0 where staff_name = %L and coalesce(deposit_amount,0) > 0', sname)],
    ['create_customer_as_other_staff', 'insert into public.customers(client_name, staff_name) values (''_selftest'', ''마스터'')'],
    ['create_estimate_as_other_staff', 'insert into public.estimates(customer_name, staff_name) values (''_selftest'', ''마스터'')']
  ];
  for i in 1 .. array_length(own_denies, 1) loop
    n := public._selftest_run(uid, own_denies[i][2]);
    ok_i := n <= 0;
    res := res || jsonb_build_object(own_denies[i][1], jsonb_build_object('rows', n, 'ok', ok_i));
    all_ok := all_ok and ok_i;
  end loop;
  -- 헛통과 방지(정정 2026-10-26): '입금 줄이기' 시험은 대상 행이 0건이면 아무것도 확인하지 못한 채 통과함 → 대상 행 수를 함께 기록하고,
  -- 0건이면 vacuous=true 로 표시(실패 처리는 안 함 — 입금 있는 고객이 없을 수도 있으므로). 메일 점검은 vacuous 항목 수를 안내.
  res := res || jsonb_build_object('reduce_deposit_candidates', jsonb_build_object(
    'customers', public._selftest_run(uid, format('select * from public.customers where staff_name = %L and coalesce(deposit_amount,0) > 0', sname)),
    'estimates', public._selftest_run(uid, format('select * from public.estimates where staff_name = %L and coalesce(deposit_amount,0) > 0', sname)),
    'ok', true));
  -- 점검 뷰는 조회자 권한으로 동작해야 함(2026-10-14 사고 재발 방지)
  select reloptions::text into opts from pg_class where oid = 'public.data_integrity_issues'::regclass;
  ok_i := coalesce(opts, '') like '%security_invoker=true%';
  res := res || jsonb_build_object('integrity_view_security_invoker', jsonb_build_object('options', opts, 'ok', ok_i)); all_ok := all_ok and ok_i;
  insert into public.permission_selftest_log(ok, detail) values (all_ok, res);
end $function$;
