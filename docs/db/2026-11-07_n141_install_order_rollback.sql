-- N-141 되돌리기: N-74 본문으로 복원 + 추가 트리거 제거
drop trigger if exists trg_customers_auto_stage_install on public.customers;
create or replace function public.dah_target_stage(c customers)
 returns text language plpgsql stable
 set search_path to 'public', 'pg_temp'
as $function$
declare s text := c.stage;
begin
  if coalesce(c.is_archived, false) or coalesce(c.memo, '') ~ '플러그|Pluuug' then return s; end if;
  -- N-74: 선금 입금이 없는 방문예약·상담 + 보관 안 된 견적서 1건 이상 → 가견적
  if s in ('방문예약','상담') and coalesce(c.deposit_amount, 0) = 0
     and exists (select 1 from public.estimates e where e.client_id = c.id and not coalesce(e.is_archived, false)) then
    s := '가견적';
  end if;
  if s = '선금결제' and coalesce(c.deposit_amount, 0) > 0
     and coalesce(c.measure_date, '') <> '' and not coalesce(c.measure_date_tbd, false) then s := '실측준비중'; end if;
  if s in ('선금결제','실측준비중','확정견적') and public.dah_customer_fully_paid(c.id) then s := '잔금결제'; end if;
  if s = '잔금결제' and public.dah_order_complete(c.id, c.order_status) then s := '시공준비중'; end if;
  return s;
end $function$;
