-- N-73 1단계(가림 모드): 오래된 리드 후보를 '읽기만' 하는 함수. 고객 데이터는 전혀 바꾸지 않음.
-- 마지막 활동 = 보관 안 된 견적서의 최근 수정일 (없으면 고객 등록일). 고객 카드 수정은 자동 작업도 갱신하므로 제외.
-- 제외: 선금 있음 / 플러그 이관 / 보관·이미 대기 리드 / 미래 실측일·시공일 / 방문예약·상담·가견적 이외 단계
create or replace function public.dah_stale_lead_candidates(p_days int default 30)
 returns table(customer_id bigint, stage text, last_activity timestamptz, idle_days int)
 language sql stable
 set search_path to 'public', 'pg_temp'
as $function$
  select c.id, c.stage, a.last_act, floor(extract(epoch from (now() - a.last_act)) / 86400)::int
  from public.customers c
  cross join lateral (
    select greatest(c.created_at, coalesce(max(e.updated_at), c.created_at)) as last_act
    from public.estimates e where e.client_id = c.id and not coalesce(e.is_archived, false)
  ) a
  where c.stage in ('방문예약','상담','가견적')
    and not coalesce(c.is_archived, false) and not coalesce(c.lead_parked, false)
    and coalesce(c.deposit_amount, 0) = 0
    and coalesce(c.memo, '') !~ '플러그|Pluuug'
    and coalesce(nullif(c.measure_date, ''), '0000-00-00') < to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD')
    and coalesce(nullif(c.install_date, ''), '0000-00-00') < to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD')
    and now() - a.last_act >= make_interval(days => p_days)
$function$;
