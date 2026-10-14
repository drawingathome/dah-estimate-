-- 2026-10-15 실장 권한 자동 시험 (운영 DB 적용 완료)
-- 매일 06:55(한국시간) staff_permission_selftest()가 실장 계정으로 가장해 아래를 확인하고 permission_selftest_log에 기록:
--   본인 고객은 보임(대조군) / 마스터 고객 보기·수정·삭제·담당 가져가기 차단 / 일일 점검 기록·시험 기록·환불표 접근 차단 / 점검 뷰 security_invoker 유지.
-- 모든 시험 문장은 실행 직후 예외로 되돌려 실데이터가 바뀌지 않음(운영 확인: 시험 후 삭제 기록 0건).
-- 07:00 run_integrity_daily_check()가 최근 시험 실패(또는 36시간 넘게 기록 없음)면 by_code에 SELFTEST_FAIL을 넣고, 대시보드 점검 카드에 빨간 경고가 뜸.
-- 검증: 점검 뷰 옵션을 풀거나 모든 고객 조회 정책을 추가하면 ok=false로 감지(롤백 모의 실행).
-- 되돌리기: select cron.unschedule('staff-permission-selftest'); run_integrity_daily_check를 SELFTEST 블록 없이 재정의.

create table if not exists public.permission_selftest_log (
  id bigserial primary key,
  run_at timestamptz not null default now(),
  ok boolean not null,
  detail jsonb not null default '{}'::jsonb
);
alter table public.permission_selftest_log enable row level security;
revoke all on public.permission_selftest_log from anon, authenticated;

create or replace function public._selftest_run(p_uid uuid, p_sql text)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare n int;
begin
  begin
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute p_sql;
    get diagnostics n = row_count;
    raise exception 'SELFTEST_R:%', n;
  exception when others then
    if sqlerrm like 'SELFTEST_R:%' then return nullif(substr(sqlerrm, 12), '')::int; end if;
    return -1; -- 오류(권한 없음 등)
  end;
end $$;
revoke all on function public._selftest_run(uuid, text) from public, anon, authenticated;

create or replace function public.staff_permission_selftest()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
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
end $$;
revoke all on function public.staff_permission_selftest() from public, anon, authenticated;

select cron.schedule('staff-permission-selftest', '55 21 * * *', 'select public.staff_permission_selftest()');

create or replace function public.run_integrity_daily_check()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_total int; v_warn int; v_by jsonb; v_self boolean;
begin
  select count(*), count(*) filter (where severity = 'warn') into v_total, v_warn from public.data_integrity_issues;
  select coalesce(jsonb_object_agg(code, n), '{}'::jsonb) into v_by from (select code, count(*) n from public.data_integrity_issues group by code) t;
  select ok into v_self from public.permission_selftest_log where run_at > now() - interval '36 hours' order by id desc limit 1;
  if v_self is distinct from true then
    v_by := v_by || jsonb_build_object('SELFTEST_FAIL', 1);
    v_total := v_total + 1; v_warn := v_warn + 1;
  end if;
  insert into public.integrity_daily_log(total_count, warn_count, by_code) values (v_total, v_warn, v_by);
end $function$;
