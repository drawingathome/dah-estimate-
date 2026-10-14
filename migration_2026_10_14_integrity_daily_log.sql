-- 2026-10-14 (3단계 "매일 자동 점검"): DB가 매일 아침 7시(한국시간)에 data_integrity_issues 전체를 스스로 점검해 결과를 기록함.
-- 앱을 아무도 안 열어도 점검이 돌고, "언제 몇 건이었는지" 이력이 남음. 마스터만 조회 가능.
-- 점검이 멈추면(최근 기록이 36시간 넘게 없으면) 앱 상단 점검 카드에 경고가 뜸(dash-integrity-watch.js).
create extension if not exists pg_cron;

create table if not exists public.integrity_daily_log (
  id bigint generated always as identity primary key,
  run_at timestamptz not null default now(),
  total_count int not null,
  warn_count int not null,
  by_code jsonb not null default '{}'::jsonb
);
alter table public.integrity_daily_log enable row level security;
revoke all on public.integrity_daily_log from anon;
revoke all on public.integrity_daily_log from authenticated;
grant select on public.integrity_daily_log to authenticated;
create policy integrity_daily_log_select on public.integrity_daily_log for select to authenticated using (
  exists (select 1 from public.staff_profiles p where p.id = auth.uid() and p.role = 'master'));

create or replace function public.run_integrity_daily_check() returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
declare v_total int; v_warn int; v_by jsonb;
begin
  select count(*), count(*) filter (where severity = 'warn') into v_total, v_warn from public.data_integrity_issues;
  select coalesce(jsonb_object_agg(code, n), '{}'::jsonb) into v_by from (select code, count(*) n from public.data_integrity_issues group by code) t;
  insert into public.integrity_daily_log(total_count, warn_count, by_code) values (v_total, v_warn, v_by);
end $fn$;
revoke all on function public.run_integrity_daily_check() from public, anon, authenticated;

-- 매일 22:00 UTC = 한국시간 오전 7:00
select cron.schedule('integrity-daily-check', '0 22 * * *', $$select public.run_integrity_daily_check()$$);
