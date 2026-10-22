-- W1 되돌리기: 규칙만 이전 상태로. 고객/견적 데이터는 건드리지 않음(규칙이 데이터를 바꾼 경우는 backup_w1_20261022 표와 비교해 별도 복구).
begin;
drop trigger if exists trg_extra_payment_touch_customer on public.estimate_extra_payments;
drop function if exists public.extra_payment_touch_customer();
drop trigger if exists trg_estimates_confirm_guard on public.estimates;
drop function if exists public.estimates_confirm_guard();
drop trigger if exists trg_sync_customer_price on public.estimates;
drop function if exists public.sync_customer_price_from_estimates();
drop trigger if exists trg_customers_auto_stage on public.customers;
create or replace function public.customers_auto_stage_on_deposit() returns trigger language plpgsql set search_path to '' as $f$
begin
  if TG_OP = 'UPDATE' and NEW.deposit_amount is distinct from OLD.deposit_amount
     and NEW.stage in ('방문예약','상담','가견적')
     and coalesce(NEW.deposit_amount, 0) > 0 then
    NEW.stage := '선금결제';
  end if;
  return NEW;
end $f$;
create trigger trg_customers_auto_stage before update of deposit_amount on public.customers
  for each row execute function public.customers_auto_stage_on_deposit();
-- 점검 뷰: 백업해 둔 이전 정의로 복원
do $$ declare v text; begin
  select def into v from backup_w1_20261022.old_defs where kind='view' and name='data_integrity_issues';
  execute 'create or replace view public.data_integrity_issues with (security_invoker = true) as ' || rtrim(v, ';');
end $$;
drop function if exists public.dah_customer_fully_paid(bigint);
drop function if exists public.dah_estimate_paid(uuid);
commit;
-- (확정 기록표 estimate_confirm_log, 자동 이동 기록표 customer_stage_auto_log, 사유 칸 unconfirm_reason은 남겨도 무해. 지우려면 별도 승인 후.)
