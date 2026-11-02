-- N-74 되돌리기 1) 옛 함수로 복원(앞으로의 자동 이동 중단)
create or replace function public.dah_target_stage(c customers)
 returns text language plpgsql stable
 set search_path to 'public', 'pg_temp'
as $function$
declare s text := c.stage;
begin
  if coalesce(c.is_archived, false) or coalesce(c.memo, '') ~ '플러그|Pluuug' then return s; end if;
  if s = '선금결제' and coalesce(c.deposit_amount, 0) > 0
     and coalesce(c.measure_date, '') <> '' and not coalesce(c.measure_date_tbd, false) then s := '실측준비중'; end if;
  if s in ('선금결제','실측준비중','확정견적') and public.dah_customer_fully_paid(c.id) then s := '잔금결제'; end if;
  if s = '잔금결제' and public.dah_order_complete(c.id, c.order_status) then s := '시공준비중'; end if;
  return s;
end $function$;
-- 2) 이미 옮겨진 고객 단계 복원이 필요하면(승인 후): 
-- update public.customers c set stage = s.value->>c.id::text from (select value from public.app_settings where key like 'n74_stage_snapshot_%' order by key desc limit 1) s where s.value ? c.id::text and c.stage = '가견적';
