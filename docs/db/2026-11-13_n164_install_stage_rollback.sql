-- N-164 되돌리기: N-141(11-07) 본문으로 복원(원단·제작·자재·블라인드·시공 발주를 전부 체크해야 시공준비중). 이미 시공준비중으로 간 고객 단계는 되돌리지 않음(자동으로 뒤로 가지 않는 규칙) — 필요하면 별도 승인으로 수동 정정.
begin;
create or replace function public.dah_target_stage(c customers)
 returns text language plpgsql stable
 set search_path to 'public', 'pg_temp'
as $function$
declare s text := c.stage;
declare os jsonb;
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
  -- N-141: 시공 발주 = 시공일 지정. 시공일이 있고 '미정' 표시가 아니면 '시공' 항목은 완료로 본다.
  os := case when coalesce(c.install_date, '') <> '' and not coalesce(c.install_date_tbd, false)
             then coalesce(c.order_status, '{}'::jsonb) || '{"install":{"done":true}}'::jsonb
             else c.order_status end;
  if s = '잔금결제' and public.dah_order_complete(c.id, os) then s := '시공준비중'; end if;
  return s;
end $function$;
commit;
