-- 2026-10-14 (1-11 / G7): 보관(is_archived) 처리된 견적서에는 입금(선금·잔금)을 새로 기록하거나 바꿀 수 없게 막음.
-- 보관된 견적서는 화면에서 안 보이는데 입금이 쌓이면 매출 계산과 점검에서 "유령 돈"이 될 수 있기 때문.
-- 허용: 로그인 없는 서버 작업(점검 SQL·Apps Script)은 그대로. 필요하면 먼저 보관을 해제한 뒤 입력.
create or replace function public.guard_archived_estimate_payment() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
begin
  if auth.uid() is null then return NEW; end if;
  if coalesce(NEW.is_archived, false) = true and coalesce(OLD.is_archived, false) = true then
    if coalesce(NEW.deposit_amount,0) is distinct from coalesce(OLD.deposit_amount,0)
       or coalesce(NEW.balance_amount,0) is distinct from coalesce(OLD.balance_amount,0) then
      raise exception '보관 처리된 견적서에는 입금을 기록할 수 없습니다. 보관을 먼저 해제해 주세요.' using errcode = '42501';
    end if;
  end if;
  return NEW;
end $fn$;
create or replace trigger trg_guard_archived_estimate_payment
  before update of deposit_amount, balance_amount on public.estimates
  for each row execute function public.guard_archived_estimate_payment();
