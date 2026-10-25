-- 단계 규칙 되돌리기 (2026-10-25 적용 전 상태로)
drop trigger if exists trg_estimates_recheck_stage on public.estimates;
drop trigger if exists trg_extra_pay_recheck_stage on public.estimate_extra_payments;
drop function if exists public.dah_estimates_recheck_stage();
drop function if exists public.dah_extra_pay_recheck_stage();
drop function if exists public.dah_recheck_customer_stage(bigint);
drop trigger if exists trg_customers_auto_stage on public.customers;
CREATE OR REPLACE FUNCTION public.customers_auto_stage_on_deposit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare v_from text;
begin
  if TG_OP = 'UPDATE' then
    if NEW.deposit_amount is distinct from OLD.deposit_amount
       and NEW.stage in ('방문예약','상담','가견적') and coalesce(NEW.deposit_amount,0) > 0 then
      v_from := NEW.stage;
      NEW.stage := '선금결제';
      insert into public.customer_stage_auto_log(customer_id, from_stage, to_stage, reason)
        values (NEW.id, v_from, NEW.stage, '선금 입금이 기록되어 자동 이동');
    end if;
  end if;
  return NEW;
end $function$;
CREATE TRIGGER trg_customers_auto_stage BEFORE UPDATE OF deposit_amount, balance_amount, price ON public.customers FOR EACH ROW EXECUTE FUNCTION customers_auto_stage_on_deposit();
drop function if exists public.dah_target_stage(public.customers);
drop function if exists public.dah_log_stage_rule(bigint, text, text, boolean);
drop function if exists public.dah_order_complete(bigint, jsonb);
drop function if exists public.dah_stage_rule_mode();
