-- 운영 DB 함수·트리거 복제 (2026-10-21 읽기 전용 추출, pg_get_functiondef 원문)
create or replace function public.update_updated_at() returns trigger language plpgsql set search_path to 'public' as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.adjust_customer_amounts_on_estimate_delete() returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $function$
begin
  if OLD.client_id is not null then
    update public.customers
       set price = greatest(0, coalesce(price, 0) - coalesce(OLD.price, 0))::bigint,
           performance_revenue = greatest(0, coalesce(performance_revenue, 0) - coalesce(OLD.performance_revenue, 0))::bigint
     where id = OLD.client_id;
  end if;
  return OLD;
end;
$function$;

create or replace function public.customers_auto_stage_on_deposit() returns trigger language plpgsql set search_path to '' as $function$
begin
  if TG_OP = 'UPDATE' and NEW.deposit_amount is distinct from OLD.deposit_amount
     and NEW.stage in ('방문예약','상담','가견적')
     and coalesce(NEW.deposit_amount, 0) > 0 then
    NEW.stage := '선금결제';
  end if;
  return NEW;
end $function$;

create or replace function public.dah_received_amount(p_customer_id bigint) returns numeric language sql stable set search_path to 'public', 'pg_temp' as $function$
  select (case when coalesce(e.paid, 0) > 0 then e.paid else coalesce(c.deposit_amount, 0) + coalesce(c.balance_amount, 0) end)
       + coalesce(x.extra, 0)
  from public.customers c
  left join lateral (
    select sum(coalesce(y.deposit_amount, 0) + coalesce(y.balance_amount, 0)) as paid
    from public.estimates y where y.client_id = c.id and not coalesce(y.is_archived, false)
  ) e on true
  left join lateral (
    select sum(p.amount) as extra
    from public.estimate_extra_payments p
    join public.estimates y on y.id = p.estimate_id
    where y.client_id = c.id and not coalesce(y.is_archived, false)
  ) x on true
  where c.id = p_customer_id
$function$;

create or replace function public.dah_is_contracted(p_customer_id bigint) returns boolean language sql stable set search_path to 'public', 'pg_temp' as $function$
  select coalesce(public.dah_received_amount(p_customer_id), 0) > 0
$function$;

create or replace function public.enforce_estimate_status_from_confirmed_at() returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $function$
begin
  new.estimate_status := case when new.confirmed_at is not null then 'final' else 'ga' end;
  return new;
end;
$function$;

create or replace function public.guard_archived_estimate_payment() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if auth.uid() is null then return NEW; end if;
  if coalesce(NEW.is_archived, false) = true and coalesce(OLD.is_archived, false) = true then
    if coalesce(NEW.deposit_amount,0) is distinct from coalesce(OLD.deposit_amount,0)
       or coalesce(NEW.balance_amount,0) is distinct from coalesce(OLD.balance_amount,0) then
      raise exception '보관 처리된 견적서에는 입금을 기록할 수 없습니다. 보관을 먼저 해제해 주세요.' using errcode = '42501';
    end if;
  end if;
  return NEW;
end $function$;

create or replace function public.guard_payment_reduction() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_role text;
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then return NEW; end if;
  select role into v_role from public.staff_profiles where id = auth.uid();
  if v_role = 'master' then return NEW; end if;
  if coalesce(NEW.deposit_amount,0) < coalesce(OLD.deposit_amount,0) or coalesce(NEW.balance_amount,0) < coalesce(OLD.balance_amount,0) then
    raise exception '이미 기록된 입금액은 줄이거나 지울 수 없습니다. 환불·정정은 마스터에게 요청해 주세요.' using errcode='42501'; end if;
  if TG_TABLE_NAME = 'estimates' then
    if coalesce(OLD.deposit_amount,0) > 0 and coalesce(OLD.deposit_date,'') <> '' and NEW.deposit_date is distinct from OLD.deposit_date
       or coalesce(OLD.balance_amount,0) > 0 and coalesce(OLD.balance_date,'') <> '' and NEW.balance_date is distinct from OLD.balance_date then
      raise exception '이미 기록된 입금의 입금일은 바꿀 수 없습니다. 정정은 마스터에게 요청해 주세요.' using errcode='42501'; end if;
  end if;
  return NEW;
end $function$;

create or replace function public.guard_payment_requires_date() returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $function$
begin
  if coalesce(NEW.balance_amount,0) > 0 and coalesce(NEW.balance_date,'') = ''
     and (TG_OP = 'INSERT' or NEW.balance_amount is distinct from OLD.balance_amount or NEW.balance_date is distinct from OLD.balance_date) then
    raise exception '잔금 입금일이 비어 있습니다. 입금일을 입력해 주세요.' using errcode = '23514';
  end if;
  if coalesce(NEW.deposit_amount,0) > 0 and coalesce(NEW.deposit_date,'') = ''
     and (TG_OP = 'INSERT' or NEW.deposit_amount is distinct from OLD.deposit_amount or NEW.deposit_date is distinct from OLD.deposit_date) then
    raise exception '선금 입금일이 비어 있습니다. 입금일을 입력해 주세요.' using errcode = '23514';
  end if;
  return NEW;
end $function$;

create or replace function public.guard_staff_name_change() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_role text; v_name text;
begin
  if auth.uid() is null then return NEW; end if;
  select role, display_name into v_role, v_name from public.staff_profiles where id = auth.uid();
  if v_role = 'master' then return NEW; end if;
  if TG_OP = 'INSERT' then
    if NEW.staff_name is distinct from v_name and NEW.staff_name is distinct from '미배정' then
      raise exception '담당자는 본인 이름 또는 미배정으로만 등록할 수 있습니다.' using errcode = '42501';
    end if;
  elsif NEW.staff_name is distinct from OLD.staff_name then
    if not (OLD.staff_name = '미배정' and NEW.staff_name = v_name) then
      raise exception '담당자 변경은 마스터만 할 수 있습니다. (미배정 고객을 본인이 가져가는 것만 가능)' using errcode = '42501';
    end if;
  end if;
  return NEW;
end $function$;

create or replace function public.log_customer_history() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if (TG_OP = 'UPDATE') then
    insert into customer_history (customer_id, snapshot, change_type) values (OLD.id, to_jsonb(OLD), 'before_update');
  elsif (TG_OP = 'DELETE') then
    insert into customer_history (customer_id, snapshot, change_type) values (OLD.id, to_jsonb(OLD), 'before_delete');
  end if;
  return null;
end;
$function$;

create or replace function public.log_estimate_history() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    INSERT INTO estimate_history (estimate_id, snapshot, change_type) VALUES (OLD.id, to_jsonb(OLD), 'before_update');
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO estimate_history (estimate_id, snapshot, change_type) VALUES (OLD.id, to_jsonb(OLD), 'before_delete');
  END IF;
  RETURN NULL;
END;
$function$;

create or replace function public.payment_refunds_append_only() returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $function$
begin raise exception '환불 기록은 수정·삭제할 수 없습니다. 잘못 등록했다면 "환불 취소"로 되돌려 주세요.' using errcode='42501'; end $function$;

create or replace function public.sync_customer_payment_from_estimates() returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $function$
DECLARE
  target_id BIGINT;
  new_dep NUMERIC; new_bal NUMERIC;
  rep_dep_date TEXT; rep_dep_method TEXT; rep_dep_receipt BOOLEAN;
  rep_bal_date TEXT; rep_bal_method TEXT; rep_bal_receipt BOOLEAN;
  pay_edited BOOLEAN := false;
BEGIN
  IF TG_OP = 'DELETE' THEN target_id := OLD.client_id; ELSE target_id := NEW.client_id; END IF;
  IF TG_OP = 'UPDATE' THEN
    pay_edited := (OLD.deposit_amount IS DISTINCT FROM NEW.deposit_amount) OR (OLD.balance_amount IS DISTINCT FROM NEW.balance_amount);
  END IF;

  IF target_id IS NOT NULL THEN
    SELECT COALESCE(SUM(deposit_amount), 0), COALESCE(SUM(balance_amount), 0)
      INTO new_dep, new_bal FROM estimates WHERE client_id = target_id AND is_archived = false;
    SELECT deposit_date, deposit_method, deposit_receipt INTO rep_dep_date, rep_dep_method, rep_dep_receipt
      FROM estimates WHERE client_id = target_id AND is_archived = false AND deposit_date IS NOT NULL AND deposit_date <> ''
      ORDER BY deposit_date DESC LIMIT 1;
    SELECT balance_date, balance_method, balance_receipt INTO rep_bal_date, rep_bal_method, rep_bal_receipt
      FROM estimates WHERE client_id = target_id AND is_archived = false AND balance_date IS NOT NULL AND balance_date <> ''
      ORDER BY balance_date DESC LIMIT 1;

    UPDATE customers
      SET deposit_amount = CASE WHEN pay_edited THEN new_dep ELSE GREATEST(new_dep, COALESCE(deposit_amount, 0)) END,
          balance_amount = CASE WHEN pay_edited THEN new_bal ELSE GREATEST(new_bal, COALESCE(balance_amount, 0)) END,
          deposit_date = COALESCE(rep_dep_date, deposit_date),
          deposit_method = COALESCE(rep_dep_method, deposit_method),
          deposit_receipt = COALESCE(rep_dep_receipt, deposit_receipt),
          balance_date = COALESCE(rep_bal_date, balance_date),
          balance_method = COALESCE(rep_bal_method, balance_method),
          balance_receipt = COALESCE(rep_bal_receipt, balance_receipt)
      WHERE id = target_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.client_id IS DISTINCT FROM NEW.client_id AND OLD.client_id IS NOT NULL THEN
    SELECT COALESCE(SUM(deposit_amount), 0), COALESCE(SUM(balance_amount), 0)
      INTO new_dep, new_bal FROM estimates WHERE client_id = OLD.client_id AND is_archived = false;
    SELECT deposit_date, deposit_method, deposit_receipt INTO rep_dep_date, rep_dep_method, rep_dep_receipt
      FROM estimates WHERE client_id = OLD.client_id AND is_archived = false AND deposit_date IS NOT NULL AND deposit_date <> ''
      ORDER BY deposit_date DESC LIMIT 1;
    SELECT balance_date, balance_method, balance_receipt INTO rep_bal_date, rep_bal_method, rep_bal_receipt
      FROM estimates WHERE client_id = OLD.client_id AND is_archived = false AND balance_date IS NOT NULL AND balance_date <> ''
      ORDER BY balance_date DESC LIMIT 1;

    UPDATE customers
      SET deposit_amount = GREATEST(new_dep, COALESCE(deposit_amount, 0)),
          balance_amount = GREATEST(new_bal, COALESCE(balance_amount, 0)),
          deposit_date = COALESCE(rep_dep_date, deposit_date),
          deposit_method = COALESCE(rep_dep_method, deposit_method),
          deposit_receipt = COALESCE(rep_dep_receipt, deposit_receipt),
          balance_date = COALESCE(rep_bal_date, balance_date),
          balance_method = COALESCE(rep_bal_method, balance_method),
          balance_receipt = COALESCE(rep_bal_receipt, balance_receipt)
      WHERE id = OLD.client_id;
  END IF;

  RETURN NULL;
END;
$function$;

-- 트리거
create trigger trg_customer_history after delete or update on public.customers for each row execute function log_customer_history();
create trigger trg_customers_auto_stage before update of deposit_amount on public.customers for each row execute function customers_auto_stage_on_deposit();
create trigger trg_customers_updated before update on public.customers for each row execute function update_updated_at();
create trigger trg_guard_payment_date before insert or update on public.customers for each row execute function guard_payment_requires_date();
create trigger trg_guard_payment_reduction_customers before update of deposit_amount, balance_amount on public.customers for each row execute function guard_payment_reduction();
create trigger trg_guard_staff_name_customers before insert or update of staff_name on public.customers for each row execute function guard_staff_name_change();
create trigger trg_adjust_customer_amounts_on_estimate_delete after delete on public.estimates for each row execute function adjust_customer_amounts_on_estimate_delete();
create trigger trg_enforce_estimate_status before insert or update on public.estimates for each row execute function enforce_estimate_status_from_confirmed_at();
create trigger trg_estimate_history after delete or update on public.estimates for each row execute function log_estimate_history();
create trigger trg_estimates_updated before update on public.estimates for each row execute function update_updated_at();
create trigger trg_guard_archived_estimate_payment before update of deposit_amount, balance_amount on public.estimates for each row execute function guard_archived_estimate_payment();
create trigger trg_guard_payment_date before insert or update on public.estimates for each row execute function guard_payment_requires_date();
create trigger trg_guard_payment_reduction_estimates before update of deposit_amount, balance_amount, deposit_date, balance_date on public.estimates for each row execute function guard_payment_reduction();
create trigger trg_guard_staff_name_estimates before insert or update of staff_name on public.estimates for each row execute function guard_staff_name_change();
create trigger trg_sync_customer_payment after insert or delete or update of deposit_amount, balance_amount, is_archived, client_id, deposit_date, balance_date, deposit_method, balance_method, deposit_receipt, balance_receipt on public.estimates for each row execute function sync_customer_payment_from_estimates();
create trigger trg_payment_refunds_append_only before delete or update on public.payment_refunds for each row execute function payment_refunds_append_only();
