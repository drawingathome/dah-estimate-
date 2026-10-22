-- 2026-10-22 추가결제가 입력·수정·삭제되면 고객 단계·기준금액 규칙을 다시 돌린다 (추가결제로 완납돼도 단계가 안 움직이던 허점 보완)
-- 선행: migration_stage_price_autosync.sql (dah_estimate_paid 함수 필요)
-- 추가결제가 입력·수정·삭제되면 고객 단계/기준금액 규칙을 다시 돌린다 (S5 보완)
create or replace function public.extra_payment_touch_customer() returns trigger
language plpgsql set search_path to 'public','pg_temp' as $$
declare cid bigint;
begin
  cid := coalesce(case when TG_OP='DELETE' then OLD.client_id else NEW.client_id end,
                  (select client_id from public.estimates where id = case when TG_OP='DELETE' then OLD.estimate_id else NEW.estimate_id end));
  if cid is not null then
    -- 기준금액 재계산(입금 있는 견적서 합계) 후, price를 SET 목록에 넣어 단계 규칙 트리거를 깨운다
    update public.customers c set price = coalesce((
        select sum(e.price)::bigint from public.estimates e
         where e.client_id = cid and not coalesce(e.is_archived,false) and public.dah_estimate_paid(e.id) > 0), c.price),
      performance_revenue = coalesce((
        select sum(e.performance_revenue)::bigint from public.estimates e
         where e.client_id = cid and not coalesce(e.is_archived,false) and public.dah_estimate_paid(e.id) > 0), c.performance_revenue)
    where c.id = cid;
  end if;
  return null;
end $$;
drop trigger if exists trg_extra_payment_touch_customer on public.estimate_extra_payments;
create trigger trg_extra_payment_touch_customer after insert or update or delete on public.estimate_extra_payments
  for each row execute function public.extra_payment_touch_customer();
