-- 3-6 주 단위 오류 기준선: 매일 자동 점검 기록을 주(월요일 시작, 한국시간)별로 묶음.
-- security_invoker = true 필수 (integrity_daily_log RLS 적용 → 마스터만 조회)
create or replace view public.integrity_weekly_trend with (security_invoker = true) as
with d as (
  select (date_trunc('week', run_at at time zone 'Asia/Seoul'))::date as week_start, run_at, total_count, warn_count, by_code
  from public.integrity_daily_log
),
codes as (
  select d.week_start, e.key as code, max((e.value)::int) as mx
  from d, lateral jsonb_each_text(d.by_code) e
  group by d.week_start, e.key
),
codes_agg as (
  select week_start, jsonb_object_agg(code, mx) as max_by_code from codes group by week_start
)
select d.week_start,
       count(*) as runs,
       max(d.total_count) as max_total,
       (array_agg(d.total_count order by d.run_at desc))[1] as last_total,
       max(d.warn_count) as max_warn,
       coalesce(c.max_by_code, '{}'::jsonb) as max_by_code
from d left join codes_agg c on c.week_start = d.week_start
group by d.week_start, c.max_by_code;
alter view public.integrity_weekly_trend set (security_invoker = true);
revoke all on public.integrity_weekly_trend from anon;
grant select on public.integrity_weekly_trend to authenticated;
